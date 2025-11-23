import {
    Commitment,
    PublicKey,
    TransactionInstruction,
    type Connection,
    Transaction,
    SYSVAR_INSTRUCTIONS_PUBKEY,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    ConfigParameters,
    CreateConfigAndPoolParams,
    CreateConfigAndPoolWithFirstBuyParams,
    CreatePoolWithFirstBuyParams,
    CreatePoolWithPartnerAndCreatorFirstBuyParams,
    FirstBuyParams,
    InitializePoolBaseParams,
    PrepareSwapParams,
    SwapMode,
    SwapQuote2Params,
    SwapQuoteParams,
    Swap2Params,
    TokenType,
    type CreatePoolParams,
    type SwapParams,
    SwapQuoteResult,
    SwapQuote2Result,
    TradeDirection,
    BaseFee,
    BaseFeeMode,
} from '../types'
import {
    deriveDbcPoolAddress,
    deriveMintMetadata,
    getTokenProgram,
    unwrapSOLInstruction,
    wrapSOLInstruction,
    deriveDbcTokenVaultAddress,
    getTokenType,
    getOrCreateATAInstruction,
    validateConfigParameters,
    validateSwapAmount,
    getCurrentPoint,
} from '../helpers'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { METAPLEX_PROGRAM_ID } from '../constants'
import {
    swapQuoteExactIn,
    swapQuoteExactOut,
    swapQuotePartialFill,
    swapQuote,
    isRateLimiterApplied,
} from '../math'
import { StateService } from './state'
import BN from 'bn.js'

export class PoolService extends DynamicBondingCurveProgram {
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Private method to initialize a pool with SPL token
     * @param name - The name of the token
     * @param symbol - The symbol of the token
     * @param uri - The URI of the token
     * @param pool - The pool address
     * @param config - The config address
     * @param payer - The payer address
     * @param poolCreator - The pool creator address
     * @param baseMint - The base mint address
     * @param baseVault - The base vault address
     * @param quoteVault - The quote vault address
     * @param quoteMint - The quote mint address
     * @param mintMetadata - The mint metadata address (Optional)
     * @returns A transaction that initializes the pool with SPL token
     */
    private async initializeSplPool(
        params: InitializePoolBaseParams
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
                tokenQuoteProgram: TOKEN_PROGRAM_ID,
                metadataProgram: METAPLEX_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .transaction()
    }

    /**
     * Private method to initialize a pool with Token2022
     * @param name - The name of the token
     * @param symbol - The symbol of the token
     * @param uri - The URI of the token
     * @param pool - The pool address
     * @param config - The config address
     * @param payer - The payer address
     * @param poolCreator - The pool creator address
     * @param baseMint - The base mint address
     * @param baseVault - The base vault address
     * @param quoteVault - The quote vault address
     * @param quoteMint - The quote mint address
     * @param mintMetadata - The mint metadata address (Optional)
     * @returns A transaction that initializes the pool with Token2022
     */
    private async initializeToken2022Pool(
        params: InitializePoolBaseParams
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
                tokenQuoteProgram: TOKEN_PROGRAM_ID,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .transaction()
    }

    /**
     * Private method to prepare swap parameters
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param virtualPoolState - The virtual pool state consisting of baseMint and poolType
     * @param poolConfigState - The pool config state consisting of quoteMint and quoteTokenFlag
     * @returns The prepare swap parameters
     */
    private prepareSwapParams(
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
        } else {
            return {
                inputMint: new PublicKey(poolConfigState.quoteMint),
                outputMint: new PublicKey(virtualPoolState.baseMint),
                inputTokenProgram: getTokenProgram(
                    poolConfigState.quoteTokenFlag
                ),
                outputTokenProgram: getTokenProgram(virtualPoolState.poolType),
            }
        }
    }

    /**
     * Private method to create config transaction
     * @param configParam - The config parameters
     * @param config - The config address
     * @param feeClaimer - The fee claimer address
     * @param leftoverReceiver - The leftover receiver address
     * @param quoteMint - The quote mint address
     * @param payer - The payer address
     * @returns A transaction that creates the config
     */
    private async createConfigTx(
        configParam: ConfigParameters,
        config: PublicKey,
        feeClaimer: PublicKey,
        leftoverReceiver: PublicKey,
        quoteMint: PublicKey,
        payer: PublicKey
    ): Promise<Transaction> {
        // error checks
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
            .transaction()
    }

    /**
     * Private method to create pool transaction
     * @param createPoolParam - The parameters for the pool consisting of baseMint, name, symbol, uri, poolCreator, config, and payer
     * @param tokenType - The token type
     * @param quoteMint - The quote mint token
     * @returns A transaction that creates the pool
     */
    private async createPoolTx(
        createPoolParam: CreatePoolParams,
        tokenType: TokenType,
        quoteMint: PublicKey
    ): Promise<Transaction> {
        const { baseMint, name, symbol, uri, poolCreator, config, payer } =
            createPoolParam

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

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
        }

        if (tokenType === TokenType.SPL) {
            const mintMetadata = deriveMintMetadata(baseMint)
            return this.initializeSplPool({ ...baseParams, mintMetadata })
        } else {
            return this.initializeToken2022Pool(baseParams)
        }
    }

    /**
     * Private method to create first buy transaction
     * @param firstBuyParam - The parameters for the first buy consisting of buyer, receiver (optional), buyAmount, minimumAmountOut, and referralTokenAccount
     * @param baseMint - The base mint token
     * @param config - The config key
     * @param baseFee - The base fee
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param currentPoint - The current point
     * @param tokenType - The token type
     * @param quoteMint - The quote mint token
     * @returns Instructions for the first buy
     */
    private async swapBuyTx(
        firstBuyParam: FirstBuyParams,
        baseMint: PublicKey,
        config: PublicKey,
        baseFee: BaseFee,
        swapBaseForQuote: boolean,
        currentPoint: BN,
        tokenType: TokenType,
        quoteMint: PublicKey
    ): Promise<Transaction> {
        const {
            buyer,
            receiver,
            buyAmount,
            minimumAmountOut,
            referralTokenAccount,
        } = firstBuyParam

        // error checks
        validateSwapAmount(buyAmount)

        // check if rate limiter is applied
        // this swapBuyTx is only QuoteToBase direction
        // this swapBuyTx does not check poolState, so there is no check for activation point
        let rateLimiterApplied = false
        if (baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
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
                    quoteMint: quoteMint,
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
                inputTokenProgram
            ),
            getOrCreateATAInstruction(
                this.connection,
                outputMint,
                receiver ? receiver : buyer,
                buyer,
                true,
                outputTokenProgram
            ),
        ])
        createAtaTokenAIx && preInstructions.push(createAtaTokenAIx)
        createAtaTokenBIx && preInstructions.push(createAtaTokenBIx)

        // add SOL wrapping instructions if needed
        if (inputMint.equals(NATIVE_MINT)) {
            preInstructions.push(
                ...wrapSOLInstruction(
                    buyer,
                    inputTokenAccount,
                    BigInt(buyAmount.toString())
                )
            )
        }

        // add postInstructions for SOL unwrapping if needed
        const postInstructions: TransactionInstruction[] = []
        if (
            [inputMint.toBase58(), outputMint.toBase58()].includes(
                NATIVE_MINT.toBase58()
            )
        ) {
            const unwrapIx = unwrapSOLInstruction(buyer, buyer)
            unwrapIx && postInstructions.push(unwrapIx)
        }

        // add remaining accounts if rate limiter is applied
        const remainingAccounts = rateLimiterApplied
            ? [
                  {
                      isSigner: false,
                      isWritable: false,
                      pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
                  },
              ]
            : []

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

    /**
     * Create a new pool
     * @param name - The name of the token
     * @param symbol - The symbol of the token
     * @param uri - The URI of the token
     * @param config - The config address
     * @param payer - The payer address
     * @param poolCreator - The pool creator address
     * @param baseMint - The base mint address
     * @returns A new pool
     */
    async createPool(params: CreatePoolParams): Promise<Transaction> {
        const { baseMint, config, name, symbol, uri, payer, poolCreator } =
            params

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const { quoteMint, tokenType } = poolConfigState

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

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
        }

        if (tokenType === TokenType.SPL) {
            const mintMetadata = deriveMintMetadata(baseMint)
            return this.initializeSplPool({ ...baseParams, mintMetadata })
        } else {
            return this.initializeToken2022Pool(baseParams)
        }
    }

    /**
     * Create a new config and pool
     * @param config - The config address
     * @param feeClaimer - The fee claimer address
     * @param leftoverReceiver - The leftover receiver address
     * @param quoteMint - The quote mint address
     * @param payer - The payer address
     * @param configParam - The parameters for the config
     * @param preCreatePoolParam - The parameters for the pool
     * @returns A new config and pool
     */
    async createConfigAndPool(
        params: CreateConfigAndPoolParams
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = params

        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)
        const feeClaimerAddress = new PublicKey(feeClaimer)
        const leftoverReceiverAddress = new PublicKey(leftoverReceiver)

        const tx = new Transaction()

        // create config transaction
        const createConfigTx = await this.createConfigTx(
            configParam,
            configKey,
            feeClaimerAddress,
            leftoverReceiverAddress,
            quoteMintToken,
            payerAddress
        )

        tx.add(createConfigTx)

        // create pool transaction
        const createPoolTx = await this.createPoolTx(
            {
                ...params.preCreatePoolParam,
                config: configKey,
                payer: payerAddress,
            },
            params.tokenType,
            quoteMintToken
        )
        tx.add(createPoolTx)

        return tx
    }

    /**
     * Create a new config and pool and buy tokens
     * @param config - The config address
     * @param feeClaimer - The fee claimer address
     * @param leftoverReceiver - The leftover receiver address
     * @param quoteMint - The quote mint address
     * @param payer - The payer address
     * @param configParam - The parameters for the config
     * @param preCreatePoolParam - The parameters for the pool
     * @param firstBuyParam - The parameters for the first buy
     * @returns An object containing the new config transaction, new pool transaction, and first buy transaction
     */
    async createConfigAndPoolWithFirstBuy(
        params: CreateConfigAndPoolWithFirstBuyParams
    ): Promise<{
        createConfigTx: Transaction
        createPoolTx: Transaction
        swapBuyTx: Transaction | undefined
    }> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = params

        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)
        const feeClaimerAddress = new PublicKey(feeClaimer)
        const leftoverReceiverAddress = new PublicKey(leftoverReceiver)

        // create config transaction
        const createConfigTx = await this.createConfigTx(
            configParam,
            configKey,
            feeClaimerAddress,
            leftoverReceiverAddress,
            quoteMintToken,
            payerAddress
        )

        // create pool transaction
        const createPoolTx = await this.createPoolTx(
            {
                ...params.preCreatePoolParam,
                config: configKey,
                payer: payerAddress,
            },
            params.tokenType,
            quoteMintToken
        )

        const currentPoint = await getCurrentPoint(
            this.connection,
            configParam.activationType
        )

        // create first buy transaction
        let swapBuyTx: Transaction | undefined
        if (
            params.firstBuyParam &&
            params.firstBuyParam.buyAmount.gt(new BN(0))
        ) {
            swapBuyTx = await this.swapBuyTx(
                params.firstBuyParam,
                params.preCreatePoolParam.baseMint,
                configKey,
                configParam.poolFees.baseFee,
                false,
                currentPoint,
                params.tokenType,
                quoteMintToken
            )
        }

        return {
            createConfigTx,
            createPoolTx,
            swapBuyTx,
        }
    }

    /**
     * Create a new pool and buy tokens
     * @param createPoolParam - The parameters for the pool
     * @param firstBuyParam - The parameters for the first buy
     * @returns An object containing the new pool transaction and swap buy transaction
     */
    async createPoolWithFirstBuy(
        params: CreatePoolWithFirstBuyParams
    ): Promise<{
        createPoolTx: Transaction
        swapBuyTx: Transaction | undefined
    }> {
        const { createPoolParam, firstBuyParam } = params

        const { config } = createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const { quoteMint, tokenType } = poolConfigState

        // create pool transaction
        const createPoolTx = await this.createPoolTx(
            createPoolParam,
            tokenType,
            quoteMint
        )

        const currentPoint = await getCurrentPoint(
            this.connection,
            poolConfigState.activationType
        )

        // create first buy transaction
        let swapBuyTx: Transaction | undefined
        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            swapBuyTx = await this.swapBuyTx(
                firstBuyParam,
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                false,
                currentPoint,
                tokenType,
                quoteMint
            )
        }

        return {
            createPoolTx,
            swapBuyTx,
        }
    }

    /**
     * Create a new pool and buy tokens with partner and creator
     * @param createPoolParam - The parameters for the pool
     * @param partnerFirstBuyParam - The parameters for the partner first buy
     * @param creatorFirstBuyParam - The parameters for the creator first buy
     * @returns An object containing the new pool transaction and swap buy transactions for partner and creator
     */
    async createPoolWithPartnerAndCreatorFirstBuy(
        params: CreatePoolWithPartnerAndCreatorFirstBuyParams
    ): Promise<{
        createPoolTx: Transaction
        partnerSwapBuyTx: Transaction | undefined
        creatorSwapBuyTx: Transaction | undefined
    }> {
        const { createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam } =
            params
        const { config } = createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)

        const { quoteMint, tokenType } = poolConfigState

        // create pool transaction
        const createPoolTx = await this.createPoolTx(
            createPoolParam,
            tokenType,
            quoteMint
        )

        const currentPoint = await getCurrentPoint(
            this.connection,
            poolConfigState.activationType
        )

        // create partner first buy transaction
        let partnerSwapBuyTx: Transaction | undefined
        if (
            partnerFirstBuyParam &&
            partnerFirstBuyParam.buyAmount.gt(new BN(0))
        ) {
            partnerSwapBuyTx = await this.swapBuyTx(
                {
                    buyer: partnerFirstBuyParam.partner,
                    receiver: partnerFirstBuyParam.receiver,
                    buyAmount: partnerFirstBuyParam.buyAmount,
                    minimumAmountOut: partnerFirstBuyParam.minimumAmountOut,
                    referralTokenAccount:
                        partnerFirstBuyParam.referralTokenAccount,
                },
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                false,
                currentPoint,
                tokenType,
                quoteMint
            )
        }

        // create creator first buy transaction
        let creatorSwapBuyTx: Transaction | undefined
        if (
            creatorFirstBuyParam &&
            creatorFirstBuyParam.buyAmount.gt(new BN(0))
        ) {
            creatorSwapBuyTx = await this.swapBuyTx(
                {
                    buyer: creatorFirstBuyParam.creator,
                    receiver: creatorFirstBuyParam.receiver,
                    buyAmount: creatorFirstBuyParam.buyAmount,
                    minimumAmountOut: creatorFirstBuyParam.minimumAmountOut,
                    referralTokenAccount:
                        creatorFirstBuyParam.referralTokenAccount,
                },
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                false,
                currentPoint,
                tokenType,
                quoteMint
            )
        }

        return {
            createPoolTx,
            partnerSwapBuyTx,
            creatorSwapBuyTx,
        }
    }

    /**
     * Swap between base and quote
     * @param owner - The owner of the swap
     * @param pool - The pool address
     * @param amountIn - The amount in
     * @param minimumAmountOut - The minimum amount out
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param referralTokenAccount - The referral token account (nullible)
     * @param payer - The payer of the swap (optional)
     * @returns A swap transaction
     */
    async swap(params: SwapParams): Promise<Transaction> {
        const {
            amountIn,
            minimumAmountOut,
            swapBaseForQuote,
            owner,
            payer,
            pool,
            referralTokenAccount,
        } = params

        const poolState = await this.state.getPool(pool)
        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        // error checks
        validateSwapAmount(amountIn)

        const currentPoint = await getCurrentPoint(
            this.connection,
            poolConfigState.activationType
        )

        // check if rate limiter is applied if:
        // 1. rate limiter mode
        // 2. swap direction is QuoteToBase
        // 3. current point is greater than activation point
        // 4. current point is less than activation point + maxLimiterDuration
        let rateLimiterApplied = false
        if (
            poolConfigState.poolFees.baseFee.baseFeeMode ===
            BaseFeeMode.RateLimiter
        ) {
            rateLimiterApplied = isRateLimiterApplied(
                currentPoint,
                poolState.activationPoint,
                swapBaseForQuote
                    ? TradeDirection.BaseToQuote
                    : TradeDirection.QuoteToBase,
                poolConfigState.poolFees.baseFee.secondFactor,
                poolConfigState.poolFees.baseFee.thirdFactor,
                new BN(poolConfigState.poolFees.baseFee.firstFactor)
            )
        }

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(swapBaseForQuote, poolState, poolConfigState)

        // add preInstructions for ATA creation and SOL wrapping
        const {
            ataTokenA: inputTokenAccount,
            ataTokenB: outputTokenAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            owner,
            payer ? payer : owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram
        )

        // add SOL wrapping instructions if needed
        if (inputMint.equals(NATIVE_MINT)) {
            preInstructions.push(
                ...wrapSOLInstruction(
                    owner,
                    inputTokenAccount,
                    BigInt(amountIn.toString())
                )
            )
        }

        // add postInstructions for SOL unwrapping
        const postInstructions: TransactionInstruction[] = []
        if (
            [inputMint.toBase58(), outputMint.toBase58()].includes(
                NATIVE_MINT.toBase58()
            )
        ) {
            const unwrapIx = unwrapSOLInstruction(owner, owner)
            unwrapIx && postInstructions.push(unwrapIx)
        }

        // add remaining accounts if rate limiter is applied
        const remainingAccounts = rateLimiterApplied
            ? [
                  {
                      isSigner: false,
                      isWritable: false,
                      pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
                  },
              ]
            : []

        return this.program.methods
            .swap({
                amountIn,
                minimumAmountOut,
            })
            .accountsPartial({
                baseMint: poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                config: poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount,
                inputTokenAccount,
                outputTokenAccount,
                payer: owner,
                tokenBaseProgram: swapBaseForQuote
                    ? inputTokenProgram
                    : outputTokenProgram,
                tokenQuoteProgram: swapBaseForQuote
                    ? outputTokenProgram
                    : inputTokenProgram,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Swap V2 between base and quote (included SwapMode: ExactIn, PartialFill, ExactOut)
     * @param owner - The owner of the swap
     * @param pool - The pool address
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param referralTokenAccount - The referral token account (nullible)
     * @param payer - The payer of the swap (optional)
     * @param swapMode - The swap mode (ExactIn: 0, PartialFill: 1, ExactOut: 2)
     * @param amountIn - The amount in (for ExactIn and PartialFill)
     * @param minimumAmountOut - The minimum amount out (for ExactIn and PartialFill)
     * @param amountOut - The amount out (for ExactOut)
     * @param maximumAmountIn - The maximum amount in (for ExactOut)
     * @returns A swap transaction
     */
    async swap2(params: Swap2Params): Promise<Transaction> {
        const {
            pool,
            swapBaseForQuote,
            swapMode,
            owner,
            payer,
            referralTokenAccount,
        } = params

        let amount0: BN
        let amount1: BN

        if (swapMode === SwapMode.ExactOut) {
            amount0 = params.amountOut
            amount1 = params.maximumAmountIn
        } else {
            amount0 = params.amountIn
            amount1 = params.minimumAmountOut
        }

        // error checks
        validateSwapAmount(amount0)

        const poolState = await this.state.getPool(pool)

        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const currentPoint = await getCurrentPoint(
            this.connection,
            poolConfigState.activationType
        )

        // check if rate limiter is applied if:
        // 1. rate limiter mode
        // 2. swap direction is QuoteToBase
        // 3. current point is greater than activation point
        // 4. current point is less than activation point + maxLimiterDuration
        let rateLimiterApplied = false
        if (
            poolConfigState.poolFees.baseFee.baseFeeMode ===
            BaseFeeMode.RateLimiter
        ) {
            rateLimiterApplied = isRateLimiterApplied(
                currentPoint,
                poolState.activationPoint,
                swapBaseForQuote
                    ? TradeDirection.BaseToQuote
                    : TradeDirection.QuoteToBase,
                poolConfigState.poolFees.baseFee.secondFactor,
                poolConfigState.poolFees.baseFee.thirdFactor,
                new BN(poolConfigState.poolFees.baseFee.firstFactor)
            )
        }

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(swapBaseForQuote, poolState, poolConfigState)

        // add preInstructions for ATA creation and SOL wrapping
        const {
            ataTokenA: inputTokenAccount,
            ataTokenB: outputTokenAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            owner,
            payer ? payer : owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram
        )

        // add SOL wrapping instructions if needed
        if (inputMint.equals(NATIVE_MINT)) {
            const amount =
                swapMode === SwapMode.ExactIn ||
                swapMode === SwapMode.PartialFill
                    ? amount0
                    : amount1
            preInstructions.push(
                ...wrapSOLInstruction(
                    owner,
                    inputTokenAccount,
                    BigInt(amount.toString())
                )
            )
        }

        // add postInstructions for SOL unwrapping
        const postInstructions: TransactionInstruction[] = []
        if (
            [inputMint.toBase58(), outputMint.toBase58()].includes(
                NATIVE_MINT.toBase58()
            )
        ) {
            const unwrapIx = unwrapSOLInstruction(owner, owner)
            unwrapIx && postInstructions.push(unwrapIx)
        }

        // add remaining accounts if rate limiter is applied
        const remainingAccounts = rateLimiterApplied
            ? [
                  {
                      isSigner: false,
                      isWritable: false,
                      pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
                  },
              ]
            : []

        return this.program.methods
            .swap2({
                amount0,
                amount1,
                swapMode: swapMode,
            })
            .accountsPartial({
                baseMint: poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                config: poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount: referralTokenAccount,
                inputTokenAccount,
                outputTokenAccount,
                payer: owner,
                tokenBaseProgram: swapBaseForQuote
                    ? inputTokenProgram
                    : outputTokenProgram,
                tokenQuoteProgram: swapBaseForQuote
                    ? outputTokenProgram
                    : inputTokenProgram,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Calculate the amount out for a swap (quote) (for swap1)
     * @param virtualPool - The virtual pool
     * @param config - The config
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param amountIn - The amount in
     * @param slippageBps - Slippage tolerance in basis points (100 = 1%) (optional)
     * @param hasReferral - Whether the referral is enabled
     * @param currentPoint - The current point
     * @returns The swap quote result
     */
    swapQuote(params: SwapQuoteParams): SwapQuoteResult {
        const {
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            slippageBps,
            hasReferral,
            currentPoint,
        } = params

        return swapQuote(
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            slippageBps,
            hasReferral,
            currentPoint
        )
    }

    /**
     * Calculate the amount out for a swap (quote) based on swap mode (for swap2)
     * @param virtualPool - The virtual pool
     * @param config - The config
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param hasReferral - Whether the referral is enabled
     * @param currentPoint - The current point
     * @param slippageBps - Slippage tolerance in basis points (100 = 1%) (optional)
     * @param swapMode - The swap mode (ExactIn: 0, PartialFill: 1, ExactOut: 2)
     * @param amountIn - The amount in (for ExactIn and PartialFill)
     * @param amountOut - The amount out (for ExactOut)
     * @returns The swap quote result
     */
    swapQuote2(params: SwapQuote2Params): SwapQuote2Result {
        const {
            virtualPool,
            config,
            swapBaseForQuote,
            swapMode,
            hasReferral,
            currentPoint,
            slippageBps,
        } = params

        switch (swapMode) {
            case SwapMode.ExactIn:
                if ('amountIn' in params) {
                    return swapQuoteExactIn(
                        virtualPool,
                        config,
                        swapBaseForQuote,
                        params.amountIn,
                        slippageBps,
                        hasReferral,
                        currentPoint
                    )
                }
                throw new Error('amountIn is required for ExactIn swap mode')

            case SwapMode.ExactOut:
                if ('amountOut' in params) {
                    return swapQuoteExactOut(
                        virtualPool,
                        config,
                        swapBaseForQuote,
                        params.amountOut,
                        slippageBps,
                        hasReferral,
                        currentPoint
                    )
                }
                throw new Error('outAmount is required for ExactOut swap mode')

            case SwapMode.PartialFill:
                if ('amountIn' in params) {
                    return swapQuotePartialFill(
                        virtualPool,
                        config,
                        swapBaseForQuote,
                        params.amountIn,
                        slippageBps,
                        hasReferral,
                        currentPoint
                    )
                }
                throw new Error(
                    'amountIn is required for PartialFill swap mode'
                )

            default:
                throw new Error(`Unsupported swap mode: ${swapMode}`)
        }
    }
}
