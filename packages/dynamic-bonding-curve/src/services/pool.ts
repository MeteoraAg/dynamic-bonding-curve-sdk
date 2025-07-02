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
    ActivationType,
    BaseFeeMode,
    ConfigParameters,
    CreateConfigAndPoolParam,
    CreateConfigAndPoolWithFirstBuyParam,
    CreatePoolWithFirstBuyParam,
    CreatePoolWithPartnerAndCreatorFirstBuyParam,
    FirstBuyParam,
    InitializePoolBaseParam,
    PrepareSwapParams,
    SwapQuoteExactInParam,
    TokenType,
    type CreatePoolParam,
    type SwapParam,
    type SwapQuoteParam,
} from '../types'
import {
    deriveDbcPoolAddress,
    deriveMintMetadata,
    getTokenProgram,
    unwrapSOLInstruction,
    wrapSOLInstruction,
    deriveDbcTokenVaultAddress,
    getTokenType,
    checkRateLimiterApplied,
} from '../helpers'
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { METAPLEX_PROGRAM_ID } from '../constants'
import { swapQuote, calculateQuoteExactInAmount } from '../math/swapQuote'
import { StateService } from './state'
import {
    validateConfigParameters,
    validateSwapAmount,
} from '../helpers/validation'
import BN from 'bn.js'

export class PoolService extends DynamicBondingCurveProgram {
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Private method to initialize a pool with SPL token
     * @param initializeSplPoolParams - The parameters for the initialize SPL pool
     * @returns A transaction that initializes the pool with SPL token
     */
    private async initializeSplPool(
        initializeSplPoolParams: InitializePoolBaseParam
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
        } = initializeSplPoolParams
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
     * @param initializeToken2022PoolParams - The parameters for the initialize Token2022 pool
     * @returns A transaction that initializes the pool with Token2022
     */
    private async initializeToken2022Pool(
        initializeToken2022PoolParams: InitializePoolBaseParam
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
        } = initializeToken2022PoolParams
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
     * @param virtualPoolState - The virtual pool state
     * @param poolConfigState - The pool config state
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
     * @param createConfigAndPoolWithFirstBuyParam - The parameters for the config and pool and buy
     * @param configKey - The config key
     * @param quoteMintToken - The quote mint token
     * @param payerAddress - The payer address
     * @returns A transaction that creates the pool
     */
    private async createPoolTx(
        createPoolParam: CreatePoolParam,
        tokenType: TokenType,
        quoteMint: PublicKey
    ): Promise<Transaction> {
        const { baseMint, name, symbol, uri, poolCreator, config, payer } =
            createPoolParam

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

        const baseParams: InitializePoolBaseParam = {
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
     * @param createConfigAndPoolWithFirstBuyParam - The parameters for the config and pool and buy
     * @param configKey - The config key
     * @param quoteMintToken - The quote mint token
     * @param payerAddress - The payer address
     * @returns Instructions for the first buy
     */
    private async swapBuyTx(
        firstBuyParam: FirstBuyParam,
        baseMint: PublicKey,
        config: PublicKey,
        baseFeeMode: BaseFeeMode,
        tokenType: TokenType,
        quoteMint: PublicKey
    ): Promise<Transaction> {
        const { buyer, buyAmount, minimumAmountOut, referralTokenAccount } =
            firstBuyParam

        // error checks
        validateSwapAmount(buyAmount)

        // check if rate limiter is applied
        // this swapBuyTx is only QuoteToBase direction
        // this swapBuyTx does not check poolState, so there is no check for activation point
        const isRateLimiterApplied = checkRateLimiterApplied(
            baseFeeMode,
            false,
            new BN(0),
            new BN(0),
            new BN(0)
        )

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

        const {
            ataTokenA: inputTokenAccount,
            ataTokenB: outputTokenAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            buyer,
            buyer,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram
        )

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
        const remainingAccounts = isRateLimiterApplied
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
     * @param createPoolParam - The parameters for the pool
     * @returns A new pool
     */
    async createPool(createPoolParam: CreatePoolParam): Promise<Transaction> {
        const { baseMint, config, name, symbol, uri, payer, poolCreator } =
            createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)

        const { quoteMint, tokenType } = poolConfigState

        const pool = deriveDbcPoolAddress(quoteMint, baseMint, config)
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint)
        const quoteVault = deriveDbcTokenVaultAddress(pool, quoteMint)

        const baseParams: InitializePoolBaseParam = {
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
     * @param createConfigAndPoolParam - The parameters for the config and pool
     * @returns A new config and pool
     */
    async createConfigAndPool(
        createConfigAndPoolParam: CreateConfigAndPoolParam
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = createConfigAndPoolParam

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
                ...createConfigAndPoolParam.preCreatePoolParam,
                config: configKey,
                payer: payerAddress,
            },
            createConfigAndPoolParam.tokenType,
            quoteMintToken
        )
        tx.add(createPoolTx)

        return tx
    }

    /**
     * Create a new config and pool and buy tokens
     * @param createConfigAndPoolWithFirstBuyParam - The parameters for the config and pool and buy
     * @returns An object containing the new config transaction, new pool transaction, and first buy transaction
     */
    async createConfigAndPoolWithFirstBuy(
        createConfigAndPoolWithFirstBuyParam: CreateConfigAndPoolWithFirstBuyParam
    ): Promise<{
        createConfigTx: Transaction
        createPoolTx: Transaction
        swapBuyTx: Transaction
    }> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = createConfigAndPoolWithFirstBuyParam

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
                ...createConfigAndPoolWithFirstBuyParam.preCreatePoolParam,
                config: configKey,
                payer: payerAddress,
            },
            createConfigAndPoolWithFirstBuyParam.tokenType,
            quoteMintToken
        )

        // create first buy transaction
        const swapBuyTx = await this.swapBuyTx(
            createConfigAndPoolWithFirstBuyParam.firstBuyParam,
            createConfigAndPoolWithFirstBuyParam.preCreatePoolParam.baseMint,
            configKey,
            createConfigAndPoolWithFirstBuyParam.poolFees.baseFee.baseFeeMode,
            createConfigAndPoolWithFirstBuyParam.tokenType,
            quoteMintToken
        )

        return {
            createConfigTx,
            createPoolTx,
            swapBuyTx,
        }
    }

    /**
     * Create a new pool and buy tokens
     * @param createPoolWithFirstBuyParam - The parameters for the pool and buy
     * @returns An object containing the new pool transaction and swap buy transaction
     */
    async createPoolWithFirstBuy(
        createPoolWithFirstBuyParam: CreatePoolWithFirstBuyParam
    ): Promise<{
        createPoolTx: Transaction
        swapBuyTx: Transaction
    }> {
        const { config } = createPoolWithFirstBuyParam.createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)

        const { quoteMint, tokenType } = poolConfigState

        // create pool transaction
        const createPoolTx = await this.createPoolTx(
            createPoolWithFirstBuyParam.createPoolParam,
            tokenType,
            quoteMint
        )

        // create first buy transaction
        const swapBuyTx = await this.swapBuyTx(
            createPoolWithFirstBuyParam.firstBuyParam,
            createPoolWithFirstBuyParam.createPoolParam.baseMint,
            config,
            poolConfigState.poolFees.baseFee.baseFeeMode,
            tokenType,
            quoteMint
        )

        return {
            createPoolTx,
            swapBuyTx,
        }
    }

    /**
     * Create a new pool and buy tokens with partner and creator
     * @param createPoolWithPartnerAndCreatorFirstBuyParam - The parameters for the pool and buy
     * @returns An object containing the new pool transaction and swap buy transactions
     */
    async createPoolWithPartnerAndCreatorFirstBuy(
        createPoolWithPartnerAndCreatorFirstBuyParam: CreatePoolWithPartnerAndCreatorFirstBuyParam
    ): Promise<{
        createPoolTx: Transaction
        partnerSwapBuyTx: Transaction
        creatorSwapBuyTx: Transaction
    }> {
        const { config } =
            createPoolWithPartnerAndCreatorFirstBuyParam.createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)

        const { quoteMint, tokenType } = poolConfigState

        // create pool transaction
        const createPoolTx = await this.createPoolTx(
            createPoolWithPartnerAndCreatorFirstBuyParam.createPoolParam,
            tokenType,
            quoteMint
        )

        // create partner first buy transaction
        const partnerSwapBuyTx = await this.swapBuyTx(
            {
                buyer: createPoolWithPartnerAndCreatorFirstBuyParam
                    .partnerFirstBuyParam.partner,
                buyAmount:
                    createPoolWithPartnerAndCreatorFirstBuyParam
                        .partnerFirstBuyParam.buyAmount,
                minimumAmountOut:
                    createPoolWithPartnerAndCreatorFirstBuyParam
                        .partnerFirstBuyParam.minimumAmountOut,
                referralTokenAccount:
                    createPoolWithPartnerAndCreatorFirstBuyParam
                        .partnerFirstBuyParam.referralTokenAccount,
            },
            createPoolWithPartnerAndCreatorFirstBuyParam.createPoolParam
                .baseMint,
            config,
            poolConfigState.poolFees.baseFee.baseFeeMode,
            tokenType,
            quoteMint
        )

        // create creator first buy transaction
        const creatorSwapBuyTx = await this.swapBuyTx(
            {
                buyer: createPoolWithPartnerAndCreatorFirstBuyParam
                    .creatorFirstBuyParam.creator,
                buyAmount:
                    createPoolWithPartnerAndCreatorFirstBuyParam
                        .creatorFirstBuyParam.buyAmount,
                minimumAmountOut:
                    createPoolWithPartnerAndCreatorFirstBuyParam
                        .creatorFirstBuyParam.minimumAmountOut,
                referralTokenAccount:
                    createPoolWithPartnerAndCreatorFirstBuyParam
                        .creatorFirstBuyParam.referralTokenAccount,
            },
            createPoolWithPartnerAndCreatorFirstBuyParam.createPoolParam
                .baseMint,
            config,
            poolConfigState.poolFees.baseFee.baseFeeMode,
            tokenType,
            quoteMint
        )

        return {
            createPoolTx,
            partnerSwapBuyTx,
            creatorSwapBuyTx,
        }
    }

    /**
     * Swap between base and quote
     * @param pool - The pool address
     * @param swapParam - The parameters for the swap
     * @returns A swap transaction
     */
    async swap(swapParam: SwapParam): Promise<Transaction> {
        const poolState = await this.state.getPool(swapParam.pool)

        if (!poolState) {
            throw new Error(`Pool not found: ${swapParam.pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        const { amountIn, minimumAmountOut, swapBaseForQuote, owner, payer } =
            swapParam

        // error checks
        validateSwapAmount(amountIn)

        let currentPoint
        if (poolConfigState.activationType === ActivationType.Slot) {
            const currentSlot = await this.connection.getSlot()
            currentPoint = new BN(currentSlot)
        } else {
            const currentSlot = await this.connection.getSlot()
            const currentTime = await this.connection.getBlockTime(currentSlot)
            currentPoint = new BN(currentTime)
        }

        // check if rate limiter is applied if:
        // 1. rate limiter mode
        // 2. swap direction is QuoteToBase
        // 3. current point is greater than activation point
        // 4. current point is less than activation point + maxLimiterDuration
        const isRateLimiterApplied = checkRateLimiterApplied(
            poolConfigState.poolFees.baseFee.baseFeeMode,
            swapBaseForQuote,
            currentPoint,
            poolState.activationPoint,
            poolConfigState.poolFees.baseFee.secondFactor
        )

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
        const remainingAccounts = isRateLimiterApplied
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
                pool: swapParam.pool,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                config: poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount: swapParam.referralTokenAccount,
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
     * Calculate the amount out for a swap (quote)
     * @param virtualPool - The virtual pool
     * @param config - The config
     * @param swapBaseForQuote - Whether to swap base for quote
     * @param amountIn - The amount in
     * @param slippageBps - Slippage tolerance in basis points (100 = 1%)
     * @param hasReferral - Whether the referral is enabled
     * @param currentPoint - The current point
     * @returns The swap quote result
     */
    swapQuote(swapQuoteParam: SwapQuoteParam) {
        const {
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            slippageBps = 0,
            hasReferral,
            currentPoint,
        } = swapQuoteParam

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
     * Calculate the exact amount in for a swap (quote)
     * @param swapQuoteExactInParam - The parameters for the swap
     * @returns The exact amount in for the swap
     */
    swapQuoteExactIn(swapQuoteExactInParam: SwapQuoteExactInParam): {
        exactAmountIn: BN
    } {
        const { virtualPool, config, currentPoint } = swapQuoteExactInParam

        const requiredQuoteAmount = calculateQuoteExactInAmount(
            config,
            virtualPool,
            currentPoint
        )

        return {
            exactAmountIn: requiredQuoteAmount,
        }
    }
}
