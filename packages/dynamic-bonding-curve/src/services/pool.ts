import { Transaction } from '@solana/web3.js'
import {
    DynamicBondingCurveProgram,
    type TransferHookTransfer,
} from './program'
import {
    AccountsType,
    SwapMode,
    SwapQuote2Params,
    SwapQuoteParams,
    Swap2Params,
    type SwapParams,
    SwapQuoteResult,
    SwapQuote2Result,
    TradeDirection,
    type PoolConfig,
    type VirtualPool,
    type SwapQuoteConfig,
    type SimulatedQuoteFromInputAmountParams,
    type SimulatedQuoteFromOutputAmountParams,
} from '../types'
import { validateSwapAmount, getMigrationThresholdPrice } from '../helpers'
import {
    swapQuoteExactIn,
    swapQuoteExactOut,
    swapQuotePartialFill,
    swapQuote,
    getFeeMode,
} from '../math'
import { prepareSwapAccounts, rateLimiterApplied } from '../helpers/swap'
import BN from 'bn.js'

export class PoolService extends DynamicBondingCurveProgram {
    /**
     * Build an exact-in swap transaction for an existing pool.
     *
     * The transaction prepares token accounts, wraps SOL when SOL is the input mint,
     * and unwraps SOL after the swap when either side of the trade is SOL.
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

        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool) {
            throw new Error(
                'Pool uses a transfer hook, use swap2WithTransferHook'
            )
        }

        validateSwapAmount(amountIn)

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: poolConfigState.poolFees.baseFee.baseFeeMode,
            firstFactor: poolConfigState.poolFees.baseFee.firstFactor,
            secondFactor: poolConfigState.poolFees.baseFee.secondFactor,
            thirdFactor: poolConfigState.poolFees.baseFee.thirdFactor,
            activationType: poolConfigState.activationType,
            activationPoint: virtualPool.poolState.activationPoint,
            swapBaseForQuote,
        })

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                swapBaseForQuote,
                virtualPool.poolState,
                poolConfigState
            )

        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: payer ? payer : owner,
            inputOwner: owner,
            outputOwner: owner,
            unwrapAuthority: owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount: amountIn,
            includeInstructionSysvar:
                rateLimited ||
                Boolean(poolConfigState.enableFirstSwapWithMinFee),
        })

        return this.program.methods
            .swap({
                amountIn,
                minimumAmountOut,
            })
            .accountsPartial({
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                config: virtualPool.poolState.config,
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
     * Build a swap transaction using `SwapMode.ExactIn`, `SwapMode.PartialFill`, or `SwapMode.ExactOut`.
     *
     * Exact-out swaps use `amountOut` and `maximumAmountIn`;
     * Exact-in and Partial-fill swaps use `amountIn` and `minimumAmountOut`.
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

        validateSwapAmount(amount0)

        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool) {
            throw new Error(
                'Pool uses a transfer hook, use swap2WithTransferHook'
            )
        }

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: poolConfigState.poolFees.baseFee.baseFeeMode,
            firstFactor: poolConfigState.poolFees.baseFee.firstFactor,
            secondFactor: poolConfigState.poolFees.baseFee.secondFactor,
            thirdFactor: poolConfigState.poolFees.baseFee.thirdFactor,
            activationType: poolConfigState.activationType,
            activationPoint: virtualPool.poolState.activationPoint,
            swapBaseForQuote,
        })

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                swapBaseForQuote,
                virtualPool.poolState,
                poolConfigState
            )

        const wrapAmount =
            swapMode === SwapMode.ExactIn || swapMode === SwapMode.PartialFill
                ? amount0
                : amount1
        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: payer ? payer : owner,
            inputOwner: owner,
            outputOwner: owner,
            unwrapAuthority: owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount,
            includeInstructionSysvar:
                rateLimited ||
                Boolean(poolConfigState.enableFirstSwapWithMinFee),
        })

        return this.program.methods
            .swap2({
                amount0,
                amount1,
                swapMode: swapMode,
            })
            .accountsPartial({
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                config: virtualPool.poolState.config,
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
     * Build a swap2 transaction for transfer-hook pools.
     */
    async swap2WithTransferHook(params: Swap2Params): Promise<Transaction> {
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

        validateSwapAmount(amount0)

        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (!isTransferHookPool) {
            throw new Error('Pool does not use a transfer hook, use swap2')
        }

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: poolConfigState.poolFees.baseFee.baseFeeMode,
            firstFactor: poolConfigState.poolFees.baseFee.firstFactor,
            secondFactor: poolConfigState.poolFees.baseFee.secondFactor,
            thirdFactor: poolConfigState.poolFees.baseFee.thirdFactor,
            activationType: poolConfigState.activationType,
            activationPoint: virtualPool.poolState.activationPoint,
            swapBaseForQuote,
        })

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                swapBaseForQuote,
                virtualPool.poolState,
                poolConfigState
            )

        const wrapAmount =
            swapMode === SwapMode.ExactIn || swapMode === SwapMode.PartialFill
                ? amount0
                : amount1
        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: payer ? payer : owner,
            inputOwner: owner,
            outputOwner: owner,
            unwrapAuthority: owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount,
            includeInstructionSysvar:
                rateLimited ||
                Boolean(poolConfigState.enableFirstSwapWithMinFee),
        })

        const baseVault = virtualPool.poolState.baseVault
        const transferHookTransfers: TransferHookTransfer[] = [
            swapBaseForQuote
                ? {
                      accountsType: AccountsType.TransferHookBase,
                      source: inputTokenAccount,
                      destination: baseVault,
                      authority: owner,
                  }
                : {
                      accountsType: AccountsType.TransferHookBase,
                      source: baseVault,
                      destination: outputTokenAccount,
                      authority: this.poolAuthority,
                  },
        ]
        if (
            referralTokenAccount != null &&
            getFeeMode(
                poolConfigState.collectFeeMode,
                swapBaseForQuote
                    ? TradeDirection.BaseToQuote
                    : TradeDirection.QuoteToBase,
                true
            ).feesOnBaseToken
        ) {
            transferHookTransfers.push({
                accountsType: AccountsType.TransferHookBaseReferral,
                source: baseVault,
                destination: referralTokenAccount,
                authority: this.poolAuthority,
            })
        }
        const {
            info: transferHookAccountsInfo,
            accounts: transferHookAccounts,
        } = await this.getRemainingAccountsForTransferHook(
            virtualPool.poolState.baseMint,
            transferHookTransfers
        )

        remainingAccounts.push(...transferHookAccounts)

        return this.program.methods
            .swap2WithTransferHook(
                {
                    amount0,
                    amount1,
                    swapMode,
                },
                transferHookAccountsInfo
            )
            .accountsPartial({
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                config: virtualPool.poolState.config,
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
     * Quote an exact-in swap for the original swap instruction.
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
            eligibleForFirstSwapWithMinFee,
        } = params

        return swapQuote(
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            params
        )
    }

    /**
     * Quote a swap using `SwapMode.ExactIn`, `SwapMode.PartialFill`, or `SwapMode.ExactOut`.
     */
    swapQuote2(params: SwapQuote2Params): SwapQuote2Result {
        const {
            virtualPool,
            config,
            swapBaseForQuote,
            swapMode,
            hasReferral,
            eligibleForFirstSwapWithMinFee,
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
                        currentPoint,
                        eligibleForFirstSwapWithMinFee,
                        params
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
                        currentPoint,
                        eligibleForFirstSwapWithMinFee,
                        params
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
                        currentPoint,
                        eligibleForFirstSwapWithMinFee,
                        params
                    )
                }
                throw new Error(
                    'amountIn is required for PartialFill swap mode'
                )

            default:
                throw new Error(`Unsupported swap mode: ${swapMode}`)
        }
    }

    /**
     * Reconcile the only two fields that differ between an on-chain `PoolConfig`
     * and a `buildCurve` output (`ConfigParameters`) so the quote math can
     * consume either directly:
     * - `migrationSqrtPrice`: used when present, otherwise derived from the
     *   curve and migration quote threshold (it is the swap stop price).
     * - `dynamicFee`: a null/undefined object becomes a disabled one, and a
     *   present object is treated as enabled unless `initialized` says otherwise.
     *
     * Everything else is already in the right shape and passed through.
     */
    private normalizeQuoteConfig(config: SwapQuoteConfig): PoolConfig {
        if (!config.curve || config.curve.length === 0) {
            throw new Error('config.curve is empty')
        }

        const migrationSqrtPrice =
            config.migrationSqrtPrice ??
            getMigrationThresholdPrice(
                config.migrationQuoteThreshold,
                config.sqrtStartPrice,
                config.curve
            )

        const dynamicFee = config.poolFees.dynamicFee

        return {
            ...config,
            migrationSqrtPrice,
            poolFees: {
                ...config.poolFees,
                dynamicFee: dynamicFee
                    ? {
                          ...dynamicFee,
                          initialized: dynamicFee.initialized ?? 1,
                      }
                    : { initialized: 0, binStep: 0, variableFeeControl: 0 },
            },
        } as unknown as PoolConfig
    }

    /**
     * creates a virtual pool state at launch with zeroed reserves and volatility, start price set.
     */
    private buildSimulatedVirtualPool(sqrtStartPrice: BN): VirtualPool {
        return {
            poolState: {
                sqrtPrice: new BN(sqrtStartPrice),
                baseReserve: new BN(0),
                quoteReserve: new BN(0),
                activationPoint: new BN(0),
                volatilityTracker: {
                    lastUpdateTimestamp: new BN(0),
                    sqrtPriceReference: new BN(0),
                    volatilityAccumulator: new BN(0),
                    volatilityReference: new BN(0),
                    padding: [],
                },
            },
        } as unknown as VirtualPool
    }

    /**
     * quotes a swap from an input amount before any pool exists.
     */
    getQuoteFromInputAmount(
        params: SimulatedQuoteFromInputAmountParams
    ): SwapQuote2Result {
        const {
            config,
            swapBaseForQuote,
            amountIn,
            swapMode = SwapMode.ExactIn,
            slippageBps = 0,
            hasReferral = false,
            eligibleForFirstSwapWithMinFee = false,
            currentPoint = new BN(0),
        } = params

        const poolConfig = this.normalizeQuoteConfig(config)
        const virtualPool = this.buildSimulatedVirtualPool(
            poolConfig.sqrtStartPrice
        )

        if (swapMode === SwapMode.PartialFill) {
            return swapQuotePartialFill(
                virtualPool,
                poolConfig,
                swapBaseForQuote,
                amountIn,
                slippageBps,
                hasReferral,
                currentPoint,
                eligibleForFirstSwapWithMinFee,
                params
            )
        }

        return swapQuoteExactIn(
            virtualPool,
            poolConfig,
            swapBaseForQuote,
            amountIn,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            params
        )
    }

    /**
     * quotes a swap from an exact output amount (`SwapMode.ExactOut`)
     */
    getQuoteFromOutputAmount(
        params: SimulatedQuoteFromOutputAmountParams
    ): SwapQuote2Result {
        const {
            config,
            swapBaseForQuote,
            amountOut,
            slippageBps = 0,
            hasReferral = false,
            eligibleForFirstSwapWithMinFee = false,
            currentPoint = new BN(0),
        } = params

        const poolConfig = this.normalizeQuoteConfig(config)
        const virtualPool = this.buildSimulatedVirtualPool(
            poolConfig.sqrtStartPrice
        )

        return swapQuoteExactOut(
            virtualPool,
            poolConfig,
            swapBaseForQuote,
            amountOut,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            params
        )
    }
}
