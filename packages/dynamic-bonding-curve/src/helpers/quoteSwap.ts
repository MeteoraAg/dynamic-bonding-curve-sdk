import BN from 'bn.js'
import {
    swapQuoteExactIn,
    swapQuoteExactOut,
    swapQuotePartialFill,
} from '../math/swapQuote'
import { getMigrationThresholdPrice } from './migration'
import {
    SwapMode,
    type PoolConfig,
    type QuoteSwap2Params,
    type SwapQuote2Result,
    type SwapQuoteConfig,
    type VirtualPool,
} from '../types'

/**
 * A `buildCurve` result and an on-chain `PoolConfig` differ in two fields the
 * quote math reads. Fill those in and leave everything else as passed.
 */
function normalizeQuoteConfig(config: SwapQuoteConfig): PoolConfig {
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

/** Launch-state pool: price at `sqrtStartPrice`, reserves and volatility at zero. */
function buildSimulatedVirtualPool(sqrtStartPrice: BN): VirtualPool {
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
 * Quote exact-in, partial-fill, or exact-out.
 * Omit `virtualPool` to price a curve before the pool account exists.
 */
export function quoteSwap2(params: QuoteSwap2Params): SwapQuote2Result {
    const poolConfig = normalizeQuoteConfig(params.config)
    const virtualPool =
        params.virtualPool ?? buildSimulatedVirtualPool(poolConfig.sqrtStartPrice)
    const currentPoint =
        params.currentPoint ??
        (params.virtualPool
            ? params.virtualPool.poolState.activationPoint
            : new BN(0))
    const slippageBps = params.slippageBps ?? 0
    const hasReferral = params.hasReferral ?? false
    const eligibleForFirstSwapWithMinFee =
        params.eligibleForFirstSwapWithMinFee ?? false

    if (params.swapMode === SwapMode.ExactOut) {
        return swapQuoteExactOut(
            virtualPool,
            poolConfig,
            params.swapBaseForQuote,
            params.amountOut,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            params
        )
    }

    if (params.swapMode === SwapMode.PartialFill) {
        return swapQuotePartialFill(
            virtualPool,
            poolConfig,
            params.swapBaseForQuote,
            params.amountIn,
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
        params.swapBaseForQuote,
        params.amountIn,
        slippageBps,
        hasReferral,
        currentPoint,
        eligibleForFirstSwapWithMinFee,
        params
    )
}
