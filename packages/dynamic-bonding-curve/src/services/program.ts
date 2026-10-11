import {
    AccountMeta,
    Commitment,
    Connection,
    PublicKey,
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
    getTokenType,
    getTokenBadgeRemainingAccounts,
    deriveTokenBadgeAddress,
    hasTransferFeeOrConfigAuthority,
    isSupportedQuoteMint,
    unwrapSOLInstruction,
    isNativeSol,
    validateConfigParameters,
    validateSwapAmount,
    validateTransferHookProgram,
    validateTransferHookProgramExecutable,
} from '../helpers'
import type { Program } from '@coral-xyz/anchor'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'
import {
    AccountsType,
    CollectFeeMode,
    ConfigParameters,
    CreatePoolParams,
    CreatePoolWithTransferHookParams,
    FirstBuyParams,
    FirstBuyWithTransferHookParams,
    InitializePoolBaseParams,
    PoolConfig,
    PrepareSwapParams,
    SwapMode,
    TokenType,
    TradeDirection,
    TransferFeeParameters,
    TransferHookAccountsInfo,
    VirtualPool,
} from '../types'
import { METAPLEX_PROGRAM_ID } from '../constants'
import {
    createTransferCheckedWithTransferHookInstruction,
    getTransferHook,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    unpackMint,
    type Mint,
} from '@solana/spl-token'
import { getFeeMode } from '../math/feeMath'
import { getEpochTransferFee } from '../math/transferFee'
import type { DbcClientContext } from '../client'
import { StateService } from './state'
import { prepareSwapAccounts } from '../helpers/swap'

// a transfer_checked instruction's keys are source, mint, destination,
// authority, then the transfer hook's extra accounts
const TRANSFER_CHECKED_FIXED_ACCOUNTS = 4

const WITHDRAW_MIGRATION_FEE_FLAG = { partner: 0, creator: 1 } as const

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
        virtualPoolState: { baseMint: PublicKey; poolType: TokenType },
        poolConfigState: { quoteMint: PublicKey; quoteTokenFlag: TokenType }
    ): PrepareSwapParams {
        const base = {
            mint: virtualPoolState.baseMint,
            program: getTokenProgram(virtualPoolState.poolType),
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

    protected async getQuoteMintState(quoteMint: PublicKey): Promise<{
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
    protected async resolveQuoteMintTokenBadge(
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

    protected async buildCreateConfigTx(
        configParam: ConfigParameters,
        config: PublicKey,
        feeClaimer: PublicKey,
        leftoverReceiver: PublicKey,
        quoteMint: PublicKey,
        payer: PublicKey,
        tokenBadge?: PublicKey
    ): Promise<Transaction> {
        validateConfigParameters(
            { ...configParam, leftoverReceiver },
            { feeClaimer }
        )
        const { mint, currentEpoch } = await this.getQuoteMintState(quoteMint)
        if (hasTransferFeeOrConfigAuthority(mint, currentEpoch)) {
            throw new Error(
                'Quote mint has a non-zero transfer fee or a live transfer fee config authority, use createConfig2'
            )
        }
        const resolvedTokenBadge = await this.resolveQuoteMintTokenBadge(
            mint,
            currentEpoch,
            tokenBadge
        )

        return this.program.methods
            .createConfig(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .remainingAccounts(
                getTokenBadgeRemainingAccounts(resolvedTokenBadge)
            )
            .transaction()
    }

    protected async buildCreateConfig2Tx(
        configParam: ConfigParameters,
        config: PublicKey,
        feeClaimer: PublicKey,
        leftoverReceiver: PublicKey,
        quoteMint: PublicKey,
        payer: PublicKey,
        transferFeeParameters: TransferFeeParameters | null,
        tokenBadge?: PublicKey
    ): Promise<Transaction> {
        const { mint, currentEpoch } = await this.getQuoteMintState(quoteMint)
        validateConfigParameters(
            { ...configParam, leftoverReceiver },
            {
                transferFeeParameters,
                quoteMintHasTransferFee: hasTransferFeeOrConfigAuthority(
                    mint,
                    currentEpoch
                ),
                quoteEpochTransferFee: getEpochTransferFee(mint, currentEpoch),
                feeClaimer,
            }
        )
        const resolvedTokenBadge = await this.resolveQuoteMintTokenBadge(
            mint,
            currentEpoch,
            tokenBadge
        )

        return this.program.methods
            .createConfig2(configParam, transferFeeParameters)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .remainingAccounts(
                getTokenBadgeRemainingAccounts(resolvedTokenBadge)
            )
            .transaction()
    }

    protected async buildCreateConfigWithTransferHookTx(
        configParam: ConfigParameters,
        config: PublicKey,
        feeClaimer: PublicKey,
        leftoverReceiver: PublicKey,
        quoteMint: PublicKey,
        transferHookProgram: PublicKey,
        payer: PublicKey,
        tokenBadge?: PublicKey
    ): Promise<Transaction> {
        validateConfigParameters(
            { ...configParam, leftoverReceiver },
            { isTransferHook: true, transferHookProgram, feeClaimer }
        )
        const { mint, currentEpoch } = await this.getQuoteMintState(quoteMint)
        if (hasTransferFeeOrConfigAuthority(mint, currentEpoch)) {
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
        const resolvedTokenBadge = await this.resolveQuoteMintTokenBadge(
            mint,
            currentEpoch,
            tokenBadge
        )

        return this.program.methods
            .createConfigWithTransferHook(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                transferHookProgram,
                payer,
            })
            .remainingAccounts(
                getTokenBadgeRemainingAccounts(resolvedTokenBadge)
            )
            .transaction()
    }

    protected async initializeSplPool(
        params: InitializePoolBaseParams & {
            mintMetadata: PublicKey
            tokenQuoteProgram: PublicKey
        }
    ): Promise<Transaction> {
        const { name, symbol, uri, poolCreator, tokenBadge, ...accounts } =
            params

        return this.program.methods
            .initializeVirtualPoolWithSplToken({ name, symbol, uri })
            .accountsPartial({
                ...accounts,
                creator: poolCreator,
                poolAuthority: this.poolAuthority,
                metadataProgram: METAPLEX_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(tokenBadge))
            .transaction()
    }

    protected async initializeToken2022Pool(
        params: InitializePoolBaseParams & { tokenQuoteProgram: PublicKey }
    ): Promise<Transaction> {
        const { name, symbol, uri, poolCreator, tokenBadge, ...accounts } =
            params

        return this.program.methods
            .initializeVirtualPoolWithToken2022({ name, symbol, uri })
            .accountsPartial({
                ...accounts,
                creator: poolCreator,
                poolAuthority: this.poolAuthority,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(tokenBadge))
            .transaction()
    }

    protected async initializeToken2022PoolWithTransferHook(
        params: InitializePoolBaseParams & {
            transferHookProgram: PublicKey
            tokenQuoteProgram: PublicKey
        }
    ): Promise<Transaction> {
        const { name, symbol, uri, poolCreator, tokenBadge, ...accounts } =
            params

        return this.program.methods
            .initializeVirtualPoolWithToken2022TransferHook({
                name,
                symbol,
                uri,
            })
            .accountsPartial({
                ...accounts,
                creator: poolCreator,
                poolAuthority: this.poolAuthority,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(tokenBadge))
            .transaction()
    }

    protected async buildCreatePoolTx(
        createPoolParam: CreatePoolParams,
        tokenType: TokenType,
        quoteMint: PublicKey,
        allowQuoteTransferFee = true
    ): Promise<Transaction> {
        const {
            baseMint,
            name,
            symbol,
            uri,
            poolCreator,
            config,
            payer,
            tokenBadge,
        } = createPoolParam

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const {
            mint,
            tokenProgram: tokenQuoteProgram,
            currentEpoch,
        } = await this.getQuoteMintState(quoteMint)

        const baseParams = {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault: deriveDbcTokenVaultAddress(pool, baseMint),
            quoteVault: deriveDbcTokenVaultAddress(pool, quoteMint),
            quoteMint,
            tokenQuoteProgram,
            tokenBadge: await this.resolveQuoteMintTokenBadge(
                mint,
                currentEpoch,
                tokenBadge,
                allowQuoteTransferFee
            ),
        }

        return tokenType === TokenType.SPLToken
            ? this.initializeSplPool({
                  ...baseParams,
                  mintMetadata: deriveMintMetadata(baseMint),
              })
            : this.initializeToken2022Pool(baseParams)
    }

    protected async buildCreatePoolWithTransferHookTx(
        createPoolParam: CreatePoolWithTransferHookParams,
        quoteMint: PublicKey,
        tokenQuoteProgram: PublicKey
    ): Promise<Transaction> {
        const {
            baseMint,
            name,
            symbol,
            uri,
            poolCreator,
            config,
            payer,
            transferHookProgram,
            tokenBadge,
        } = createPoolParam

        if (!validateTransferHookProgram(transferHookProgram)) {
            throw new Error(
                'Invalid transfer hook program: cannot be the DBC program, SPL Token, SPL Token-2022, or the default pubkey'
            )
        }

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const { mint, currentEpoch } = await this.getQuoteMintState(quoteMint)

        return this.initializeToken2022PoolWithTransferHook({
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault: deriveDbcTokenVaultAddress(pool, baseMint),
            quoteVault: deriveDbcTokenVaultAddress(pool, quoteMint),
            quoteMint,
            transferHookProgram,
            tokenQuoteProgram,
            tokenBadge: await this.resolveQuoteMintTokenBadge(
                mint,
                currentEpoch,
                tokenBadge,
                false
            ),
        })
    }

    /** Accounts and SOL handling shared by the first-buy swap builders. */
    private async prepareFirstBuy(
        firstBuyParam: FirstBuyParams,
        baseMint: PublicKey,
        config: PublicKey,
        tokenType: TokenType,
        quoteMint: PublicKey,
        enableFirstSwapWithMinFee: boolean
    ) {
        const { buyer, receiver, buyAmount } = firstBuyParam
        validateSwapAmount(buyAmount)

        const quoteTokenFlag = await getTokenType(
            this.connection,
            quoteMint,
            this.commitment
        )
        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                false,
                { baseMint, poolType: tokenType },
                { quoteMint, quoteTokenFlag }
            )
        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const swapAccounts = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: buyer,
            inputOwner: buyer,
            outputOwner: receiver ?? buyer,
            unwrapAuthority: buyer,
            inputMint,
            outputMint,
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
        quoteMint: PublicKey,
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
            quoteMint,
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
        collectFeeMode: CollectFeeMode,
        quoteMint: PublicKey,
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
            TokenType.Token2022,
            quoteMint,
            enableFirstSwapWithMinFee
        )
        const { referralTokenAccount } = firstBuyParam

        const transferHookTransfers: TransferHookTransfer[] = [
            {
                accountsType: AccountsType.TransferHookBase,
                source: accounts.baseVault,
                destination: accounts.outputTokenAccount,
                authority: this.poolAuthority,
            },
        ]
        if (
            referralTokenAccount != null &&
            getFeeMode(collectFeeMode, TradeDirection.QuoteToBase, true)
                .feesOnBaseToken
        ) {
            transferHookTransfers.push({
                accountsType: AccountsType.TransferHookBaseReferral,
                source: accounts.baseVault,
                destination: referralTokenAccount,
                authority: this.poolAuthority,
            })
        }

        // the base mint does not exist before the pool is created, so a
        // bundled first buy needs the hook accounts from the caller
        const transferHookAccountsResult =
            firstBuyParam.transferHookAccountsInfo &&
            firstBuyParam.transferHookAccounts
                ? {
                      info: firstBuyParam.transferHookAccountsInfo,
                      accounts: firstBuyParam.transferHookAccounts,
                  }
                : await this.getRemainingAccountsForTransferHook(
                      baseMint,
                      transferHookTransfers
                  )
        remainingAccounts.push(...transferHookAccountsResult.accounts)

        return this.program.methods
            .swap2WithTransferHook(
                {
                    amount0: firstBuyParam.buyAmount,
                    amount1: firstBuyParam.minimumAmountOut,
                    swapMode: SwapMode.ExactIn,
                },
                transferHookAccountsResult.info
            )
            .accountsPartial(accounts)
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Token accounts for a trading fee claim. With a native SOL quote the
     * wrapped SOL goes to the claimer's ATA, which is then closed to feeReceiver.
     */
    protected async resolveTradingFeeAccounts(params: {
        payer: PublicKey
        feeReceiver: PublicKey
        claimer: PublicKey
        pool: PublicKey
        virtualPool: VirtualPool
        poolConfigState: PoolConfig
    }): Promise<{
        accounts: ClaimTradingFeeAccounts
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
    }> {
        const { payer, feeReceiver, claimer, pool, virtualPool } = params
        const { poolState } = virtualPool
        const { quoteMint, tokenType, quoteTokenFlag } = params.poolConfigState
        const tokenBaseProgram = getTokenProgram(tokenType)
        const tokenQuoteProgram = getTokenProgram(quoteTokenFlag)
        const quoteIsSol = isNativeSol(quoteMint)

        const {
            addresses: [tokenAAccount, tokenBAccount],
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
                {
                    mint: quoteMint,
                    owner: quoteIsSol ? claimer : feeReceiver,
                    tokenProgram: tokenQuoteProgram,
                },
            ],
            this.commitment
        )

        return {
            accounts: {
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
            },
            preInstructions,
            postInstructions: quoteIsSol
                ? [unwrapSOLInstruction(claimer, feeReceiver)]
                : [],
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
            const transferWithHookIx =
                await createTransferCheckedWithTransferHookInstruction(
                    this.connection,
                    transfer.source,
                    mint,
                    transfer.destination,
                    transfer.authority,
                    BigInt(0),
                    mintState.decimals,
                    [],
                    this.commitment,
                    TOKEN_2022_PROGRAM_ID
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
            sender,
            [
                {
                    mint: poolConfigState.quoteMint,
                    owner: sender,
                    tokenProgram: tokenQuoteProgram,
                },
            ],
            this.commitment
        )
        const postInstructions = isNativeSol(poolConfigState.quoteMint)
            ? [unwrapSOLInstruction(sender, sender)]
            : []

        return this.program.methods
            .withdrawMigrationFee(WITHDRAW_MIGRATION_FEE_FLAG[role])
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPool.poolState.config,
                virtualPool: pool,
                tokenQuoteAccount,
                quoteVault: virtualPool.poolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                sender,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /** The owner's quote token account for a surplus withdrawal, with SOL unwrapped afterwards. */
    protected async buildWithdrawSurplusAccounts(
        owner: PublicKey,
        poolConfigState: PoolConfig
    ): Promise<{
        tokenQuoteAccount: PublicKey
        tokenQuoteProgram: PublicKey
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
    }> {
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
            tokenQuoteAccount,
            tokenQuoteProgram,
            preInstructions,
            postInstructions: isNativeSol(poolConfigState.quoteMint)
                ? [unwrapSOLInstruction(owner, owner)]
                : [],
        }
    }
}
