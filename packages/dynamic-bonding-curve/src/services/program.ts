import {
    AccountMeta,
    Commitment,
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js'
import {
    deriveDbcPoolAddress,
    deriveDbcPoolAuthority,
    deriveDbcTokenVaultAddress,
    deriveMintMetadata,
    getOrCreateATAs,
    getTokenProgram,
    getTokenBadgeRemainingAccounts,
    deriveTokenBadgeAddress,
    hasTransferFeeOrConfigAuthority,
    isSupportedQuoteMint,
    unwrapSOLInstruction,
    isNativeSol,
    validateConfigParameters,
    validateTransferHookProgramExecutable,
} from '../helpers'
import type { Program } from '@coral-xyz/anchor'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'
import {
    AccountsType,
    ConfigParameters,
    CreatePoolParams,
    FirstBuyParams,
    FirstBuyWithTransferHookParams,
    PoolConfig,
    PrepareSwapParams,
    SwapMode,
    TokenType,
    TransferFeeParameters,
    TransferHookAccountsInfo,
    VirtualPool,
} from '../types'
import { METAPLEX_PROGRAM_ID } from '../constants'
import {
    ACCOUNT_SIZE,
    addExtraAccountMetasForExecute,
    createCloseAccountInstruction,
    createInitializeAccount3Instruction,
    createTransferCheckedInstruction,
    getMinimumBalanceForRentExemptAccount,
    getTransferHook,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    unpackMint,
    type Mint,
} from '@solana/spl-token'
import { getEpochTransferFee } from '../math/transferFee'
import type { DbcClientContext } from '../client'
import { StateService } from './state'
import { prepareSwapAccounts } from '../helpers/swap'

// a transfer_checked instruction's keys are source, mint, destination,
// authority, then the transfer hook's extra accounts
const TRANSFER_CHECKED_FIXED_ACCOUNTS = 4

const WITHDRAW_MIGRATION_FEE_FLAG = { partner: 0, creator: 1 } as const

// seed of the claimer-derived wrapped SOL account a native SOL fee claim
// opens and closes in the same transaction
const CLAIM_WSOL_SEED = 'dbc-claim-wsol'

type ClaimTradingFeeAccounts = {
    poolAuthority: PublicKey
    pool: PublicKey
    tokenAAccount: PublicKey
    tokenBAccount: PublicKey
    baseVault: PublicKey
    quoteVault: PublicKey
    baseMint: PublicKey
    quoteMint: PublicKey
    tokenBaseProgram: PublicKey
    tokenQuoteProgram: PublicKey
}

type QuoteMint = {
    mint: Mint
    tokenProgram: PublicKey
    currentEpoch: number
    /** The token badge the program's instructions need, if the mint has one. */
    tokenBadge?: PublicKey
}

type CreateConfigBuildParams = {
    configParam: ConfigParameters
    config: PublicKey
    feeClaimer: PublicKey
    leftoverReceiver: PublicKey
    payer: PublicKey
    quoteMint: PublicKey
    tokenBadge?: PublicKey
}

/** A config transaction and the quote mint it resolved, for the pool transaction that follows. */
type CreateConfigBuild = { transaction: Transaction; quote: QuoteMint }

type AccountsTypeValue = (typeof AccountsType)[keyof typeof AccountsType]

export type TransferHookTransfer = {
    accountsType: AccountsTypeValue
    source: PublicKey
    destination: PublicKey
    authority: PublicKey
}

export class DynamicBondingCurveProgram {
    program: Program<DynamicBondingCurveIDL>
    protected connection: Connection
    protected poolAuthority: PublicKey
    protected commitment: Commitment
    protected state: StateService

    constructor(client: DbcClientContext) {
        this.state = client.state
        this.program = client.program
        this.connection = client.connection
        this.poolAuthority = deriveDbcPoolAuthority()
        this.commitment = client.commitment
    }

    protected async getPoolWithConfig(pool: PublicKey | string): Promise<{
        virtualPool: VirtualPool
        poolConfigState: PoolConfig
        isTransferHookPool: boolean
    }> {
        const found = await this.state.getPoolWithKind(pool)
        if (!found) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }
        const { virtualPool, isTransferHookPool } = found

        const poolConfigState = await this.state.getPoolConfig(
            virtualPool.poolState.config
        )
        if (!poolConfigState) {
            throw new Error(
                `Pool config not found: ${virtualPool.poolState.config.toBase58()}`
            )
        }

        return { virtualPool, poolConfigState, isTransferHookPool }
    }

    protected prepareSwapParams(
        swapBaseForQuote: boolean,
        virtualPoolState: { baseMint: PublicKey },
        poolConfigState: {
            quoteMint: PublicKey
            quoteTokenFlag: TokenType
            tokenType: TokenType
        }
    ): PrepareSwapParams {
        const base = {
            mint: virtualPoolState.baseMint,
            program: getTokenProgram(poolConfigState.tokenType),
        }
        const quote = {
            mint: poolConfigState.quoteMint,
            program: getTokenProgram(poolConfigState.quoteTokenFlag),
        }
        const [input, output] = swapBaseForQuote ? [base, quote] : [quote, base]
        return {
            inputMint: input.mint,
            outputMint: output.mint,
            inputTokenProgram: input.program,
            outputTokenProgram: output.program,
        }
    }

    private async getQuoteMintState(quoteMint: PublicKey): Promise<{
        mint: Mint
        tokenProgram: PublicKey
        currentEpoch: number
    }> {
        const [accountInfo, { epoch }] = await Promise.all([
            this.connection.getAccountInfo(quoteMint, this.commitment),
            this.connection.getEpochInfo(this.commitment),
        ])
        if (!accountInfo) {
            throw new Error(`Quote mint not found: ${quoteMint.toBase58()}`)
        }
        return {
            mint: unpackMint(quoteMint, accountInfo, accountInfo.owner),
            tokenProgram: accountInfo.owner,
            currentEpoch: epoch,
        }
    }

    /**
     * The token badge a config or pool instruction needs for its quote mint:
     * none for a permissionless mint, otherwise the mint's initialized badge.
     * Mirrors the program's get_mint_score.
     */
    private async resolveQuoteMintTokenBadge(
        quoteMint: Mint,
        currentEpoch: number,
        tokenBadge?: PublicKey,
        allowQuoteTransferFee = true
    ): Promise<PublicKey | undefined> {
        if (isSupportedQuoteMint(quoteMint, currentEpoch)) {
            return tokenBadge
        }

        if (
            !allowQuoteTransferFee &&
            hasTransferFeeOrConfigAuthority(quoteMint, currentEpoch)
        ) {
            throw new Error(
                `Quote mint ${quoteMint.address.toBase58()} has a non-zero transfer fee or a live transfer fee config authority`
            )
        }

        const expectedTokenBadge = deriveTokenBadgeAddress(quoteMint.address)
        if (tokenBadge && !tokenBadge.equals(expectedTokenBadge)) {
            throw new Error(
                `Invalid token badge for quote mint ${quoteMint.address.toBase58()}`
            )
        }
        const tokenBadgeAccount = await this.connection.getAccountInfo(
            expectedTokenBadge,
            this.commitment
        )
        if (
            !tokenBadgeAccount ||
            !tokenBadgeAccount.owner.equals(this.program.programId)
        ) {
            throw new Error(
                `Quote mint ${quoteMint.address.toBase58()} requires an initialized token badge`
            )
        }
        return expectedTokenBadge
    }

    private async withTokenBadge(
        state: Omit<QuoteMint, 'tokenBadge'>,
        tokenBadge?: PublicKey,
        allowQuoteTransferFee = true
    ): Promise<QuoteMint> {
        return {
            ...state,
            tokenBadge: await this.resolveQuoteMintTokenBadge(
                state.mint,
                state.currentEpoch,
                tokenBadge,
                allowQuoteTransferFee
            ),
        }
    }

    /** The quote mint's state and token badge, fetched once for a whole transaction build. */
    protected async resolveQuoteMint(
        quoteMint: PublicKey,
        tokenBadge?: PublicKey,
        allowQuoteTransferFee = true
    ): Promise<QuoteMint> {
        return this.withTokenBadge(
            await this.getQuoteMintState(quoteMint),
            tokenBadge,
            allowQuoteTransferFee
        )
    }

    protected async buildCreateConfigTx(
        params: CreateConfigBuildParams
    ): Promise<CreateConfigBuild> {
        const { configParam, config, feeClaimer, leftoverReceiver, payer } =
            params
        validateConfigParameters(
            { ...configParam, leftoverReceiver },
            { feeClaimer }
        )
        const state = await this.getQuoteMintState(params.quoteMint)
        if (hasTransferFeeOrConfigAuthority(state.mint, state.currentEpoch)) {
            throw new Error(
                'Quote mint has a non-zero transfer fee or a live transfer fee config authority, use createConfig2'
            )
        }
        const quote = await this.withTokenBadge(state, params.tokenBadge)

        const transaction = await this.program.methods
            .createConfig(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint: quote.mint.address,
                payer,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(quote.tokenBadge))
            .transaction()
        return { transaction, quote }
    }

    protected async buildCreateConfig2Tx(
        params: CreateConfigBuildParams & {
            transferFeeParameters: TransferFeeParameters | null
        }
    ): Promise<CreateConfigBuild> {
        const {
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            payer,
            transferFeeParameters,
        } = params
        const state = await this.getQuoteMintState(params.quoteMint)
        validateConfigParameters(
            { ...configParam, leftoverReceiver },
            {
                transferFeeParameters,
                quoteMintHasTransferFee: hasTransferFeeOrConfigAuthority(
                    state.mint,
                    state.currentEpoch
                ),
                quoteEpochTransferFee: getEpochTransferFee(
                    state.mint,
                    state.currentEpoch
                ),
                feeClaimer,
            }
        )
        const quote = await this.withTokenBadge(state, params.tokenBadge)

        const transaction = await this.program.methods
            .createConfig2(configParam, transferFeeParameters)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint: quote.mint.address,
                payer,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(quote.tokenBadge))
            .transaction()
        return { transaction, quote }
    }

    protected async buildCreateConfigWithTransferHookTx(
        params: CreateConfigBuildParams & { transferHookProgram: PublicKey }
    ): Promise<CreateConfigBuild> {
        const {
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            payer,
            transferHookProgram,
        } = params
        validateConfigParameters(
            { ...configParam, leftoverReceiver },
            { isTransferHook: true, transferHookProgram, feeClaimer }
        )
        const state = await this.getQuoteMintState(params.quoteMint)
        if (hasTransferFeeOrConfigAuthority(state.mint, state.currentEpoch)) {
            throw new Error(
                'Quote mint has a non-zero transfer fee or a live transfer fee config authority'
            )
        }
        if (
            !(await validateTransferHookProgramExecutable(
                this.connection,
                transferHookProgram
            ))
        ) {
            throw new Error(
                `Transfer hook program ${transferHookProgram.toBase58()} is not an executable account`
            )
        }
        const quote = await this.withTokenBadge(state, params.tokenBadge)

        const transaction = await this.program.methods
            .createConfigWithTransferHook(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint: quote.mint.address,
                transferHookProgram,
                payer,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(quote.tokenBadge))
            .transaction()
        return { transaction, quote }
    }

    protected async buildCreatePoolTx(
        createPoolParam: CreatePoolParams,
        tokenType: TokenType,
        quote: QuoteMint
    ): Promise<Transaction> {
        const { baseMint, name, symbol, uri, poolCreator, config, payer } =
            createPoolParam

        const quoteMint = quote.mint.address
        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const accounts = {
            pool,
            config,
            payer,
            creator: poolCreator,
            baseMint,
            baseVault: deriveDbcTokenVaultAddress(pool, baseMint),
            quoteVault: deriveDbcTokenVaultAddress(pool, quoteMint),
            quoteMint,
            tokenQuoteProgram: quote.tokenProgram,
            poolAuthority: this.poolAuthority,
        }
        const badgeAccounts = getTokenBadgeRemainingAccounts(quote.tokenBadge)

        if (tokenType === TokenType.SPLToken) {
            return this.program.methods
                .initializeVirtualPoolWithSplToken({ name, symbol, uri })
                .accountsPartial({
                    ...accounts,
                    mintMetadata: deriveMintMetadata(baseMint),
                    metadataProgram: METAPLEX_PROGRAM_ID,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .remainingAccounts(badgeAccounts)
                .transaction()
        }
        return this.program.methods
            .initializeVirtualPoolWithToken2022({ name, symbol, uri })
            .accountsPartial({
                ...accounts,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(badgeAccounts)
            .transaction()
    }

    protected async buildCreatePoolWithTransferHookTx(
        createPoolParam: CreatePoolParams,
        transferHookProgram: PublicKey,
        quote: QuoteMint
    ): Promise<Transaction> {
        const { baseMint, name, symbol, uri, poolCreator, config, payer } =
            createPoolParam

        const quoteMint = quote.mint.address
        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)

        return this.program.methods
            .initializeVirtualPoolWithToken2022TransferHook({
                name,
                symbol,
                uri,
            })
            .accountsPartial({
                pool,
                config,
                payer,
                creator: poolCreator,
                baseMint,
                baseVault: deriveDbcTokenVaultAddress(pool, baseMint),
                quoteVault: deriveDbcTokenVaultAddress(pool, quoteMint),
                quoteMint,
                transferHookProgram,
                tokenQuoteProgram: quote.tokenProgram,
                poolAuthority: this.poolAuthority,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(quote.tokenBadge))
            .transaction()
    }

    /** Accounts and SOL handling shared by the first-buy swap builders. */
    private async prepareFirstBuy(
        firstBuyParam: FirstBuyParams,
        baseMint: PublicKey,
        config: PublicKey,
        tokenType: TokenType,
        quote: QuoteMint,
        enableFirstSwapWithMinFee: boolean
    ) {
        const { buyer, receiver, buyAmount } = firstBuyParam

        const quoteMint = quote.mint.address
        const inputTokenProgram = quote.tokenProgram
        const outputTokenProgram = getTokenProgram(tokenType)
        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const swapAccounts = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: buyer,
            inputOwner: buyer,
            outputOwner: receiver ?? buyer,
            unwrapAuthority: buyer,
            inputMint: quoteMint,
            outputMint: baseMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount: buyAmount,
            // a pool created in this transaction has no rate limiter window to check
            includeInstructionSysvar: enableFirstSwapWithMinFee,
        })

        return {
            ...swapAccounts,
            accounts: {
                baseMint,
                quoteMint,
                pool,
                baseVault: deriveDbcTokenVaultAddress(pool, baseMint),
                quoteVault: deriveDbcTokenVaultAddress(pool, quoteMint),
                config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount: firstBuyParam.referralTokenAccount,
                inputTokenAccount: swapAccounts.inputTokenAccount,
                outputTokenAccount: swapAccounts.outputTokenAccount,
                payer: buyer,
                tokenBaseProgram: outputTokenProgram,
                tokenQuoteProgram: inputTokenProgram,
            },
        }
    }

    protected async buildSwapBuyTx(
        firstBuyParam: FirstBuyParams,
        baseMint: PublicKey,
        config: PublicKey,
        tokenType: TokenType,
        quote: QuoteMint,
        enableFirstSwapWithMinFee: boolean
    ): Promise<Transaction> {
        const {
            accounts,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await this.prepareFirstBuy(
            firstBuyParam,
            baseMint,
            config,
            tokenType,
            quote,
            enableFirstSwapWithMinFee
        )

        return this.program.methods
            .swap({
                amountIn: firstBuyParam.buyAmount,
                minimumAmountOut: firstBuyParam.minimumAmountOut,
            })
            .accountsPartial(accounts)
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    protected async buildSwap2WithTransferHookBuyTx(
        firstBuyParam: FirstBuyWithTransferHookParams,
        baseMint: PublicKey,
        config: PublicKey,
        quote: QuoteMint,
        enableFirstSwapWithMinFee: boolean
    ): Promise<Transaction> {
        const { transferHookAccountsInfo, transferHookAccounts } = firstBuyParam
        // the base mint does not exist before the pool is created, so its hook
        // accounts cannot be resolved here
        if (!transferHookAccountsInfo || !transferHookAccounts?.length) {
            throw new Error(
                'transferHookAccountsInfo and transferHookAccounts are required for a first buy bundled with pool creation'
            )
        }

        const {
            accounts,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await this.prepareFirstBuy(
            firstBuyParam,
            baseMint,
            config,
            TokenType.Token2022,
            quote,
            enableFirstSwapWithMinFee
        )
        remainingAccounts.push(...transferHookAccounts)

        return this.program.methods
            .swap2WithTransferHook(
                {
                    amount0: firstBuyParam.buyAmount,
                    amount1: firstBuyParam.minimumAmountOut,
                    swapMode: SwapMode.ExactIn,
                },
                transferHookAccountsInfo
            )
            .accountsPartial(accounts)
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * The shared steps of a trading fee claim. A native SOL fee goes through
     * a wrapped SOL account derived from the claimer that is closed to
     * feeReceiver in the same transaction, so the fee arrives as SOL and the
     * claimer's own wrapped SOL account is never touched. `hook` is set for
     * the transfer-hook claim variant.
     */
    protected async prepareTradingFeeClaim(params: {
        payer: PublicKey
        feeReceiver: PublicKey
        claimer: PublicKey
        pool: PublicKey
        transferHook: boolean
        /** The method that claims from a transfer-hook pool, named in the error. */
        transferHookMethod: string
    }): Promise<{
        accounts: ClaimTradingFeeAccounts
        config: PublicKey
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
        hook?: { info: TransferHookAccountsInfo; accounts: AccountMeta[] }
    }> {
        const { payer, feeReceiver, claimer, pool, transferHook } = params
        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool && !transferHook) {
            throw new Error(
                `Pool uses a transfer hook, use ${params.transferHookMethod}`
            )
        }

        const { poolState } = virtualPool
        const { quoteMint, tokenType, quoteTokenFlag } = poolConfigState
        const tokenBaseProgram = getTokenProgram(tokenType)
        const tokenQuoteProgram = getTokenProgram(quoteTokenFlag)
        const quoteIsSol = isNativeSol(quoteMint)

        const {
            addresses: [tokenAAccount, quoteAta],
            instructions: preInstructions,
        } = await getOrCreateATAs(
            this.connection,
            payer,
            [
                {
                    mint: poolState.baseMint,
                    owner: feeReceiver,
                    tokenProgram: tokenBaseProgram,
                },
                ...(quoteIsSol
                    ? []
                    : [
                          {
                              mint: quoteMint,
                              owner: feeReceiver,
                              tokenProgram: tokenQuoteProgram,
                          },
                      ]),
            ],
            this.commitment
        )
        const tokenBAccount = quoteIsSol
            ? await PublicKey.createWithSeed(
                  claimer,
                  CLAIM_WSOL_SEED,
                  tokenQuoteProgram
              )
            : quoteAta
        const postInstructions: TransactionInstruction[] = []
        if (quoteIsSol) {
            preInstructions.push(
                SystemProgram.createAccountWithSeed({
                    fromPubkey: payer,
                    basePubkey: claimer,
                    seed: CLAIM_WSOL_SEED,
                    newAccountPubkey: tokenBAccount,
                    lamports: await getMinimumBalanceForRentExemptAccount(
                        this.connection,
                        this.commitment
                    ),
                    space: ACCOUNT_SIZE,
                    programId: tokenQuoteProgram,
                }),
                createInitializeAccount3Instruction(
                    tokenBAccount,
                    NATIVE_MINT,
                    claimer,
                    tokenQuoteProgram
                )
            )
            postInstructions.push(
                createCloseAccountInstruction(
                    tokenBAccount,
                    feeReceiver,
                    claimer,
                    [],
                    tokenQuoteProgram
                )
            )
        }
        const accounts = {
            poolAuthority: this.poolAuthority,
            pool,
            tokenAAccount,
            tokenBAccount,
            baseVault: poolState.baseVault,
            quoteVault: poolState.quoteVault,
            baseMint: poolState.baseMint,
            quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return {
            accounts,
            config: poolState.config,
            preInstructions,
            postInstructions,
            hook: transferHook
                ? await this.getRemainingAccountsForTransferHook(
                      poolState.baseMint,
                      [
                          {
                              accountsType: AccountsType.TransferHookBase,
                              source: poolState.baseVault,
                              destination: tokenAAccount,
                              authority: this.poolAuthority,
                          },
                      ]
                  )
                : undefined,
        }
    }

    /** The extra accounts a Token-2022 transfer hook needs for each transfer, in the program's slice format. */
    protected async getRemainingAccountsForTransferHook(
        mint: PublicKey,
        transfers: TransferHookTransfer[]
    ): Promise<{
        info: TransferHookAccountsInfo
        accounts: AccountMeta[]
    }> {
        const mintInfo = await this.connection.getAccountInfo(
            mint,
            this.commitment
        )
        if (!mintInfo) {
            throw new Error(`Invalid mint: ${mint.toString()}`)
        }
        if (mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            return { info: { slices: [] }, accounts: [] }
        }

        const mintState = unpackMint(mint, mintInfo, TOKEN_2022_PROGRAM_ID)
        const transferHook = getTransferHook(mintState)
        if (!transferHook || transferHook.programId.equals(PublicKey.default)) {
            return { info: { slices: [] }, accounts: [] }
        }

        const slices: TransferHookAccountsInfo['slices'] = []
        const accounts: AccountMeta[] = []
        for (const transfer of transfers) {
            const transferWithHookIx = createTransferCheckedInstruction(
                transfer.source,
                mint,
                transfer.destination,
                transfer.authority,
                BigInt(0),
                mintState.decimals,
                [],
                TOKEN_2022_PROGRAM_ID
            )
            await addExtraAccountMetasForExecute(
                this.connection,
                transferWithHookIx,
                transferHook.programId,
                transfer.source,
                mint,
                transfer.destination,
                transfer.authority,
                BigInt(0),
                this.commitment
            )
            const transferHookAccounts = transferWithHookIx.keys.slice(
                TRANSFER_CHECKED_FIXED_ACCOUNTS
            )
            slices.push({
                accountsType: transfer.accountsType,
                length: transferHookAccounts.length,
            })
            accounts.push(...transferHookAccounts)
        }

        return { info: { slices }, accounts }
    }

    protected async buildWithdrawMigrationFeeTx(
        role: keyof typeof WITHDRAW_MIGRATION_FEE_FLAG,
        pool: PublicKey,
        sender: PublicKey
    ): Promise<Transaction> {
        const { accounts, preInstructions, postInstructions } =
            await this.resolveWithdrawAccounts(pool, sender)

        return this.program.methods
            .withdrawMigrationFee(WITHDRAW_MIGRATION_FEE_FLAG[role])
            .accountsPartial({ ...accounts, sender })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * The accounts a quote withdrawal from the pool shares across the
     * partner and creator surplus and migration fee instructions, with the
     * signer's quote token account created and SOL unwrapped afterwards.
     */
    protected async resolveWithdrawAccounts(
        pool: PublicKey,
        owner: PublicKey
    ): Promise<{
        accounts: {
            poolAuthority: PublicKey
            config: PublicKey
            virtualPool: PublicKey
            tokenQuoteAccount: PublicKey
            quoteVault: PublicKey
            quoteMint: PublicKey
            tokenQuoteProgram: PublicKey
        }
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
    }> {
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )
        const {
            addresses: [tokenQuoteAccount],
            instructions: preInstructions,
        } = await getOrCreateATAs(
            this.connection,
            owner,
            [
                {
                    mint: poolConfigState.quoteMint,
                    owner,
                    tokenProgram: tokenQuoteProgram,
                },
            ],
            this.commitment
        )

        return {
            accounts: {
                poolAuthority: this.poolAuthority,
                config: virtualPool.poolState.config,
                virtualPool: pool,
                tokenQuoteAccount,
                quoteVault: virtualPool.poolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                tokenQuoteProgram,
            },
            preInstructions,
            postInstructions: isNativeSol(poolConfigState.quoteMint)
                ? [unwrapSOLInstruction(owner, owner)]
                : [],
        }
    }
}
