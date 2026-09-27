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
    getOrCreateATAInstruction,
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
    findAssociatedTokenAddress,
} from '../helpers'
import type { Program } from '@coral-xyz/anchor'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'
import {
    ActivationType,
    AccountsType,
    BaseFee,
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
    createAssociatedTokenAccountIdempotentInstruction,
    createTransferCheckedWithTransferHookInstruction,
    getTransferHook,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    unpackMint,
    type Mint,
} from '@solana/spl-token'
import { getEpochTransferFee, getFeeMode } from '../math'
import BN from 'bn.js'
import type { DbcClientContext } from '../client'
import { StateService } from './state'
import { prepareSwapAccounts, rateLimiterApplied } from '../helpers/swap'

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
        const [virtualPool, isTransferHookPool] = await Promise.all([
            this.state.getPool(pool),
            this.state.isTransferHookPool(pool),
        ])
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPool.poolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        return { virtualPool, poolConfigState, isTransferHookPool }
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

    protected async resolveQuoteMintTokenBadge(
        quoteMint: Mint,
        currentEpoch: number,
        tokenBadge?: PublicKey
    ): Promise<PublicKey | undefined> {
        if (isSupportedQuoteMint(quoteMint, currentEpoch)) {
            return tokenBadge
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
        validateConfigParameters({ ...configParam, leftoverReceiver })
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
            { isTransferHook: true, transferHookProgram }
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

        const {
            mint,
            tokenProgram: tokenQuoteProgram,
            currentEpoch,
        } = await this.getQuoteMintState(quoteMint)

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
            tokenBadge: await this.resolveQuoteMintTokenBadge(
                mint,
                currentEpoch,
                tokenBadge
            ),
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
            baseVault,
            quoteVault,
            quoteMint,
            transferHookProgram,
            tokenQuoteProgram,
            tokenBadge: await this.resolveQuoteMintTokenBadge(
                mint,
                currentEpoch,
                tokenBadge
            ),
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

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: baseFee.baseFeeMode,
            firstFactor: baseFee.firstFactor,
            secondFactor: baseFee.secondFactor,
            thirdFactor: baseFee.thirdFactor,
            activationType,
            activationPoint: new BN(0),
            swapBaseForQuote,
        })

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

        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: buyer,
            inputOwner: buyer,
            outputOwner: receiver ? receiver : buyer,
            unwrapAuthority: buyer,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount: buyAmount,
            includeInstructionSysvar: rateLimited || enableFirstSwapWithMinFee,
        })

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
        collectFeeMode: CollectFeeMode,
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

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: baseFee.baseFeeMode,
            firstFactor: baseFee.firstFactor,
            secondFactor: baseFee.secondFactor,
            thirdFactor: baseFee.thirdFactor,
            activationType,
            activationPoint: new BN(0),
            swapBaseForQuote: false,
        })

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
        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: buyer,
            inputOwner: buyer,
            outputOwner: receiver ? receiver : buyer,
            unwrapAuthority: buyer,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount: buyAmount,
            includeInstructionSysvar: rateLimited || enableFirstSwapWithMinFee,
        })

        const transferHookTransfers: TransferHookTransfer[] = [
            {
                accountsType: AccountsType.TransferHookBase,
                source: baseVault,
                destination: outputTokenAccount,
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
                source: baseVault,
                destination: referralTokenAccount,
                authority: this.poolAuthority,
            })
        }
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
                        transferHookTransfers
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

    protected async resolveTradingFeeAccounts(
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
        if (isNativeSol(params.poolConfigState.quoteMint)) {
            return this.buildClaimTradingFeeAccountsForSol(params)
        }

        const result = await this.buildClaimTradingFeeAccountsForNonSol(params)
        return { ...result, postInstructions: [] }
    }

    protected async getRemainingAccountsForTransferHook(
        mint: PublicKey,
        transfers: TransferHookTransfer[]
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
            const transferHookAccounts = transferWithHookIx.keys.slice(4)
            slices.push({
                accountsType: transfer.accountsType,
                length: transferHookAccounts.length,
            })
            accounts.push(...transferHookAccounts)
        }

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
