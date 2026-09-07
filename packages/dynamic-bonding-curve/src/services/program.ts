import {
    AccountMeta,
    Commitment,
    Connection,
    PublicKey,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js'
import {
    deriveDbcPoolAddress,
    createDbcProgram,
    deriveDbcPoolAuthority,
    deriveDbcTokenVaultAddress,
    deriveMintMetadata,
    getCurrentPoint,
    getOrCreateATAInstruction,
    getTokenProgram,
    getTokenType,
    getTokenBadgeRemainingAccounts,
    unwrapSOLInstruction,
    validateConfigParameters,
    validateSwapAmount,
    validateTransferHookProgram,
    wrapSOLInstruction,
    findAssociatedTokenAddress,
} from '../helpers'
import type { Program } from '@coral-xyz/anchor'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'
import {
    ActivationType,
    AccountsType,
    BaseFee,
    BaseFeeMode,
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
    TransferHookAccountsInfo,
    VirtualPool,
} from '../types'
import { METAPLEX_PROGRAM_ID } from '../constants'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedWithTransferHookInstruction,
    getTransferHook,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    unpackMint,
} from '@solana/spl-token'
import { isRateLimiterApplied } from '../math'
import BN from 'bn.js'
import { StateService } from './state'

type ClaimTradingFeeAccountParams = {
    payer: PublicKey
    feeReceiver: PublicKey
    pool: PublicKey
    virtualPool: VirtualPool
    poolConfigState: PoolConfig
    tokenBaseProgram: PublicKey
    tokenQuoteProgram: PublicKey
}

type ClaimTradingFeeSolAccountParams = ClaimTradingFeeAccountParams & {
    tempWSolAcc: PublicKey
}

type AccountsTypeValue = (typeof AccountsType)[keyof typeof AccountsType]

export class DynamicBondingCurveProgram {
    program: Program<DynamicBondingCurveIDL>
    protected connection: Connection
    protected poolAuthority: PublicKey
    protected commitment: Commitment
    protected state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        const { program } = createDbcProgram(connection, commitment)
        this.program = program
        this.connection = connection
        this.poolAuthority = deriveDbcPoolAuthority()
        this.commitment = commitment
        this.state = new StateService(connection, commitment)
    }

    protected async getPoolWithConfig(pool: PublicKey | string): Promise<{
        virtualPool: VirtualPool
        poolConfigState: PoolConfig
    }> {
        const virtualPool = await this.state.getPool(pool)
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPool.poolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        return { virtualPool, poolConfigState }
    }

    protected prepareSwapParams(
        swapBaseForQuote: boolean,
        virtualPoolState: {
            baseMint: PublicKey
            poolType: TokenType
        },
        poolConfigState: {
            quoteMint: PublicKey
            quoteTokenFlag: TokenType
        }
    ): PrepareSwapParams {
        if (swapBaseForQuote) {
            return {
                inputMint: new PublicKey(virtualPoolState.baseMint),
                outputMint: new PublicKey(poolConfigState.quoteMint),
                inputTokenProgram: getTokenProgram(virtualPoolState.poolType),
                outputTokenProgram: getTokenProgram(
                    poolConfigState.quoteTokenFlag
                ),
            }
        }

        return {
            inputMint: new PublicKey(poolConfigState.quoteMint),
            outputMint: new PublicKey(virtualPoolState.baseMint),
            inputTokenProgram: getTokenProgram(poolConfigState.quoteTokenFlag),
            outputTokenProgram: getTokenProgram(virtualPoolState.poolType),
        }
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
        validateConfigParameters({ ...configParam, leftoverReceiver })

        return this.program.methods
            .createConfig(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(tokenBadge))
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
            { isTransferHook: true, transferHookProgram }
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
            .remainingAccounts(getTokenBadgeRemainingAccounts(tokenBadge))
            .transaction()
    }

    protected async initializeSplPool(
        params: InitializePoolBaseParams & { tokenQuoteProgram: PublicKey }
    ): Promise<Transaction> {
        const {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            mintMetadata,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
            tokenBadge,
            tokenQuoteProgram,
        } = params

        return this.program.methods
            .initializeVirtualPoolWithSplToken({
                name,
                symbol,
                uri,
            })
            .accountsPartial({
                pool,
                config,
                payer,
                creator: poolCreator,
                mintMetadata,
                baseMint,
                poolAuthority: this.poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                tokenQuoteProgram,
                metadataProgram: METAPLEX_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(tokenBadge))
            .transaction()
    }

    protected async initializeToken2022Pool(
        params: InitializePoolBaseParams & { tokenQuoteProgram: PublicKey }
    ): Promise<Transaction> {
        const {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
            tokenBadge,
            tokenQuoteProgram,
        } = params

        return this.program.methods
            .initializeVirtualPoolWithToken2022({
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
                poolAuthority: this.poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                tokenQuoteProgram,
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
        const {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
            transferHookProgram,
            tokenQuoteProgram,
            tokenBadge,
        } = params

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
                poolAuthority: this.poolAuthority,
                baseVault,
                quoteVault,
                quoteMint,
                transferHookProgram,
                tokenQuoteProgram,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .remainingAccounts(getTokenBadgeRemainingAccounts(tokenBadge))
            .transaction()
    }

    protected async buildCreatePoolTx(
        createPoolParam: CreatePoolParams,
        tokenType: TokenType,
        quoteMint: PublicKey
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
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

        const quoteTokenType = await getTokenType(this.connection, quoteMint)
        if (quoteTokenType === null) {
            throw new Error(`Invalid quote mint: ${quoteMint.toString()}`)
        }
        const tokenQuoteProgram = getTokenProgram(quoteTokenType)

        const baseParams: InitializePoolBaseParams = {
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
            tokenBadge,
        }

        if (tokenType === TokenType.SPLToken) {
            const mintMetadata = deriveMintMetadata(baseMint)
            return this.initializeSplPool({
                ...baseParams,
                mintMetadata,
                tokenQuoteProgram,
            })
        }

        return this.initializeToken2022Pool({
            ...baseParams,
            tokenQuoteProgram,
        })
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
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

        return this.initializeToken2022PoolWithTransferHook({
            name,
            symbol,
            uri,
            pool,
            config,
            payer,
            poolCreator,
            baseMint,
            baseVault,
            quoteVault,
            quoteMint,
            transferHookProgram,
            tokenQuoteProgram,
            tokenBadge,
        })
    }

    protected async buildSwapBuyTx(
        firstBuyParam: FirstBuyParams,
        baseMint: PublicKey,
        config: PublicKey,
        baseFee: BaseFee,
        swapBaseForQuote: boolean,
        activationType: ActivationType,
        tokenType: TokenType,
        quoteMint: PublicKey,
        enableFirstSwapWithMinFee: boolean
    ): Promise<Transaction> {
        const {
            buyer,
            receiver,
            buyAmount,
            minimumAmountOut,
            referralTokenAccount,
        } = firstBuyParam

        validateSwapAmount(buyAmount)

        let rateLimiterApplied = false
        if (baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
            const currentPoint = await getCurrentPoint(
                this.connection,
                activationType
            )

            rateLimiterApplied = isRateLimiterApplied(
                currentPoint,
                new BN(0),
                swapBaseForQuote
                    ? TradeDirection.BaseToQuote
                    : TradeDirection.QuoteToBase,
                baseFee.secondFactor,
                baseFee.thirdFactor,
                new BN(baseFee.firstFactor)
            )
        }

        const quoteTokenFlag = await getTokenType(this.connection, quoteMint)

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                false,
                {
                    baseMint,
                    poolType: tokenType,
                },
                {
                    quoteMint,
                    quoteTokenFlag,
                }
            )

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

        const preInstructions: TransactionInstruction[] = []

        const [
            { ataPubkey: inputTokenAccount, ix: createAtaTokenAIx },
            { ataPubkey: outputTokenAccount, ix: createAtaTokenBIx },
        ] = await Promise.all([
            getOrCreateATAInstruction(
                this.connection,
                inputMint,
                buyer,
                buyer,
                true,
                inputTokenProgram,
                this.commitment
            ),
            getOrCreateATAInstruction(
                this.connection,
                outputMint,
                receiver ? receiver : buyer,
                buyer,
                true,
                outputTokenProgram,
                this.commitment
            ),
        ])
        createAtaTokenAIx && preInstructions.push(createAtaTokenAIx)
        createAtaTokenBIx && preInstructions.push(createAtaTokenBIx)

        if (inputMint.equals(NATIVE_MINT)) {
            preInstructions.push(
                ...wrapSOLInstruction(
                    buyer,
                    inputTokenAccount,
                    BigInt(buyAmount.toString())
                )
            )
        }

        const postInstructions: TransactionInstruction[] = []
        if (
            [inputMint.toBase58(), outputMint.toBase58()].includes(
                NATIVE_MINT.toBase58()
            )
        ) {
            const unwrapIx = unwrapSOLInstruction(buyer, buyer)
            unwrapIx && postInstructions.push(unwrapIx)
        }

        const remainingAccounts: AccountMeta[] = []
        if (rateLimiterApplied || enableFirstSwapWithMinFee) {
            remainingAccounts.push({
                isSigner: false,
                isWritable: false,
                pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            })
        }

        return this.program.methods
            .swap({
                amountIn: buyAmount,
                minimumAmountOut,
            })
            .accountsPartial({
                baseMint,
                quoteMint,
                pool,
                baseVault,
                quoteVault,
                config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount,
                inputTokenAccount,
                outputTokenAccount,
                payer: buyer,
                tokenBaseProgram: outputTokenProgram,
                tokenQuoteProgram: inputTokenProgram,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    protected async buildSwap2WithTransferHookBuyTx(
        firstBuyParam: FirstBuyWithTransferHookParams,
        baseMint: PublicKey,
        config: PublicKey,
        baseFee: BaseFee,
        activationType: ActivationType,
        quoteMint: PublicKey,
        enableFirstSwapWithMinFee: boolean
    ): Promise<Transaction> {
        const {
            buyer,
            receiver,
            buyAmount,
            minimumAmountOut,
            referralTokenAccount,
        } = firstBuyParam

        validateSwapAmount(buyAmount)

        let rateLimiterApplied = false
        if (baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
            const currentPoint = await getCurrentPoint(
                this.connection,
                activationType
            )

            rateLimiterApplied = isRateLimiterApplied(
                currentPoint,
                new BN(0),
                TradeDirection.QuoteToBase,
                baseFee.secondFactor,
                baseFee.thirdFactor,
                new BN(baseFee.firstFactor)
            )
        }

        const quoteTokenFlag = await getTokenType(this.connection, quoteMint)
        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                false,
                {
                    baseMint,
                    poolType: TokenType.Token2022,
                },
                {
                    quoteMint,
                    quoteTokenFlag,
                }
            )

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)
        const preInstructions: TransactionInstruction[] = []

        const [
            { ataPubkey: inputTokenAccount, ix: createAtaTokenAIx },
            { ataPubkey: outputTokenAccount, ix: createAtaTokenBIx },
        ] = await Promise.all([
            getOrCreateATAInstruction(
                this.connection,
                inputMint,
                buyer,
                buyer,
                true,
                inputTokenProgram,
                this.commitment
            ),
            getOrCreateATAInstruction(
                this.connection,
                outputMint,
                receiver ? receiver : buyer,
                buyer,
                true,
                outputTokenProgram,
                this.commitment
            ),
        ])
        createAtaTokenAIx && preInstructions.push(createAtaTokenAIx)
        createAtaTokenBIx && preInstructions.push(createAtaTokenBIx)

        if (inputMint.equals(NATIVE_MINT)) {
            preInstructions.push(
                ...wrapSOLInstruction(
                    buyer,
                    inputTokenAccount,
                    BigInt(buyAmount.toString())
                )
            )
        }

        const postInstructions: TransactionInstruction[] = []
        if (
            [inputMint.toBase58(), outputMint.toBase58()].includes(
                NATIVE_MINT.toBase58()
            )
        ) {
            const unwrapIx = unwrapSOLInstruction(buyer, buyer)
            unwrapIx && postInstructions.push(unwrapIx)
        }

        const remainingAccounts: AccountMeta[] = []
        if (rateLimiterApplied || enableFirstSwapWithMinFee) {
            remainingAccounts.push({
                isSigner: false,
                isWritable: false,
                pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            })
        }

        const transferHookAccountTypes =
            referralTokenAccount != null
                ? [
                      AccountsType.TransferHookBase,
                      AccountsType.TransferHookBaseReferral,
                  ]
                : [AccountsType.TransferHookBase]
        let transferHookAccountsResult: {
            info: TransferHookAccountsInfo
            accounts: AccountMeta[]
        }
        if (
            firstBuyParam.transferHookAccountsInfo &&
            firstBuyParam.transferHookAccounts
        ) {
            transferHookAccountsResult = {
                info: firstBuyParam.transferHookAccountsInfo,
                accounts: firstBuyParam.transferHookAccounts,
            }
        } else {
            try {
                transferHookAccountsResult =
                    await this.getRemainingAccountsForTransferHook(
                        baseMint,
                        transferHookAccountTypes
                    )
            } catch {
                throw new Error(
                    `Unable to resolve transfer-hook remaining accounts for ${baseMint.toString()}. ` +
                        `When bundling pool initialization with the first buy, pass transferHookAccountsInfo and transferHookAccounts on the first-buy params.`
                )
            }
        }

        remainingAccounts.push(...transferHookAccountsResult.accounts)

        return this.program.methods
            .swap2WithTransferHook(
                {
                    amount0: buyAmount,
                    amount1: minimumAmountOut,
                    swapMode: SwapMode.ExactIn,
                },
                transferHookAccountsResult.info
            )
            .accountsPartial({
                baseMint,
                quoteMint,
                pool,
                baseVault,
                quoteVault,
                config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount,
                inputTokenAccount,
                outputTokenAccount,
                payer: buyer,
                tokenBaseProgram: outputTokenProgram,
                tokenQuoteProgram: inputTokenProgram,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    protected async buildClaimTradingFeeAccountsForSol(
        params: ClaimTradingFeeSolAccountParams
    ): Promise<{
        accounts: {
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
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
    }> {
        const {
            payer,
            feeReceiver,
            tempWSolAcc,
            pool,
            virtualPool,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = params

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const tokenBaseAccount = findAssociatedTokenAddress(
            feeReceiver,
            virtualPool.poolState.baseMint,
            tokenBaseProgram
        )

        const tokenQuoteAccount = findAssociatedTokenAddress(
            tempWSolAcc,
            poolConfigState.quoteMint,
            tokenQuoteProgram
        )

        preInstructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                tokenBaseAccount,
                feeReceiver,
                virtualPool.poolState.baseMint,
                tokenBaseProgram
            ),
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                tokenQuoteAccount,
                tempWSolAcc,
                poolConfigState.quoteMint,
                tokenQuoteProgram
            )
        )

        const unwrapSolIx = unwrapSOLInstruction(tempWSolAcc, feeReceiver)
        unwrapSolIx && postInstructions.push(unwrapSolIx)

        const accounts = {
            poolAuthority: this.poolAuthority,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: virtualPool.poolState.baseVault,
            quoteVault: virtualPool.poolState.quoteVault,
            baseMint: virtualPool.poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions, postInstructions }
    }

    protected async buildClaimTradingFeeAccountsForNonSol(
        params: ClaimTradingFeeAccountParams
    ): Promise<{
        accounts: {
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
        preInstructions: TransactionInstruction[]
    }> {
        const {
            payer,
            feeReceiver,
            pool,
            virtualPool,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = params

        const {
            ataTokenA: tokenBaseAccount,
            ataTokenB: tokenQuoteAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            feeReceiver,
            payer,
            virtualPool.poolState.baseMint,
            poolConfigState.quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram
        )

        const accounts = {
            poolAuthority: this.poolAuthority,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: virtualPool.poolState.baseVault,
            quoteVault: virtualPool.poolState.quoteVault,
            baseMint: virtualPool.poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions }
    }

    protected async getRemainingAccountsForTransferHook(
        mint: PublicKey,
        accountTypes: AccountsTypeValue[] = [AccountsType.TransferHookBase]
    ): Promise<{
        info: TransferHookAccountsInfo
        accounts: AccountMeta[]
    }> {
        const emptyAccounts: {
            info: TransferHookAccountsInfo
            accounts: AccountMeta[]
        } = { info: { slices: [] }, accounts: [] }
        const mintInfo = await this.connection.getAccountInfo(
            mint,
            this.commitment
        )

        if (!mintInfo) {
            throw new Error(`Invalid mint: ${mint.toString()}`)
        }

        if (mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
            return emptyAccounts
        }

        const mintState = unpackMint(mint, mintInfo, TOKEN_2022_PROGRAM_ID)
        const transferHook = getTransferHook(mintState)
        if (!transferHook || transferHook.programId.equals(PublicKey.default)) {
            return emptyAccounts
        }

        const transferWithHookIx =
            await createTransferCheckedWithTransferHookInstruction(
                this.connection,
                PublicKey.default,
                mint,
                PublicKey.default,
                PublicKey.default,
                BigInt(0),
                mintState.decimals,
                [],
                this.commitment,
                TOKEN_2022_PROGRAM_ID
            )

        const transferHookAccounts = transferWithHookIx.keys.slice(4)
        const slices = accountTypes.map((accountsType) => ({
            accountsType,
            length: transferHookAccounts.length,
        }))
        const accounts = accountTypes.flatMap(() => transferHookAccounts)

        return { info: { slices }, accounts }
    }

    protected async buildWithdrawMigrationFeeTx(
        role: 'partner' | 'creator',
        pool: PublicKey,
        sender: PublicKey
    ): Promise<Transaction> {
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )
        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const { ataPubkey: tokenQuoteAccount, ix: createTokenQuoteAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                poolConfigState.quoteMint,
                sender,
                sender,
                true,
                tokenQuoteProgram,
                this.commitment
            )
        createTokenQuoteAccountIx &&
            preInstructions.push(createTokenQuoteAccountIx)

        if (poolConfigState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(sender, sender)
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        }

        return this.program.methods
            .withdrawMigrationFee(role === 'partner' ? 0 : 1)
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

    protected async prepareTokenAccounts(
        owner: PublicKey,
        payer: PublicKey,
        tokenAMint: PublicKey,
        tokenBMint: PublicKey,
        tokenAProgram: PublicKey,
        tokenBProgram: PublicKey
    ): Promise<{
        ataTokenA: PublicKey
        ataTokenB: PublicKey
        instructions: TransactionInstruction[]
    }> {
        const instructions: TransactionInstruction[] = []
        const [
            { ataPubkey: ataTokenA, ix: createAtaTokenAIx },
            { ataPubkey: ataTokenB, ix: createAtaTokenBIx },
        ] = await Promise.all([
            getOrCreateATAInstruction(
                this.connection,
                tokenAMint,
                owner,
                payer,
                true,
                tokenAProgram,
                this.commitment
            ),
            getOrCreateATAInstruction(
                this.connection,
                tokenBMint,
                owner,
                payer,
                true,
                tokenBProgram,
                this.commitment
            ),
        ])
        createAtaTokenAIx && instructions.push(createAtaTokenAIx)
        createAtaTokenBIx && instructions.push(createAtaTokenBIx)

        return { ataTokenA, ataTokenB, instructions }
    }

    /**
     * Return the underlying Anchor program client.
     */
    getProgram(): Program<DynamicBondingCurveIDL> {
        return this.program
    }
}
