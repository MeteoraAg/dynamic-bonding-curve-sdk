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
    type QuoteTransferFees,
    type SwapQuote2Result,
    type SwapQuoteConfig,
    type VirtualPool,
} from '../types'

/**
 * A `buildCurve` result lacks `migrationSqrtPrice` and `dynamicFee.initialized`,
 * which the quote math reads. Fill those in and leave everything else as passed.
 */
function normalizeQuoteConfig(config: SwapQuoteConfig): PoolConfig {
    if (!config.curve?.length) {
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
                ? { ...dynamicFee, initialized: dynamicFee.initialized ?? 1 }
                : { initialized: 0, binStep: 0, variableFeeControl: 0 },
        },
    } as PoolConfig
}

/**
 * The state the program writes at pool creation: price at `sqrtStartPrice`,
 * no reserves, a zeroed volatility tracker, and no swap yet.
 */
function buildSimulatedVirtualPool(sqrtStartPrice: BN): VirtualPool {
    return {
        poolState: {
            sqrtPrice: sqrtStartPrice,
            baseReserve: new BN(0),
            quoteReserve: new BN(0),
            activationPoint: new BN(0),
            hasSwap: 0,
            volatilityTracker: {
                lastUpdateTimestamp: new BN(0),
                sqrtPriceReference: new BN(0),
                volatilityAccumulator: new BN(0),
                volatilityReference: new BN(0),
            },
        },
    } as VirtualPool
}

/**
 * Quote exact-in, partial-fill, or exact-out.
 * Omit `virtualPool` to price a `buildCurve` result before the config and pool accounts exist.
 * An existing pool needs `currentPoint`, otherwise time-based fees would be quoted at activation.
 */
export function quoteSwap2(params: QuoteSwap2Params): SwapQuote2Result {
    if (params.virtualPool && !params.currentPoint) {
        throw new Error('currentPoint is required when virtualPool is set')
    }

    const config = normalizeQuoteConfig(params.config)
    const virtualPool =
        params.virtualPool ?? buildSimulatedVirtualPool(config.sqrtStartPrice)
    const currentPoint = params.currentPoint ?? new BN(0)
    const slippageBps = params.slippageBps ?? 0
    const hasReferral = params.hasReferral ?? false
    const eligibleForFirstSwapWithMinFee =
        params.eligibleForFirstSwapWithMinFee ?? false
    const transferFees: QuoteTransferFees = {
        currentEpoch: params.currentEpoch,
        baseMint: params.baseMint,
        quoteMint: params.quoteMint,
        baseTransferFeeBasisPoints: params.baseTransferFeeBasisPoints,
    }

    if (params.swapMode === SwapMode.ExactOut) {
        return swapQuoteExactOut(
            virtualPool,
            config,
            params.swapBaseForQuote,
            params.amountOut,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            transferFees
        )
    }

    if (params.swapMode === SwapMode.PartialFill) {
        return swapQuotePartialFill(
            virtualPool,
            config,
            params.swapBaseForQuote,
            params.amountIn,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            transferFees
        )
    }

    return swapQuoteExactIn(
        virtualPool,
        config,
        params.swapBaseForQuote,
        params.amountIn,
        slippageBps,
        hasReferral,
        currentPoint,
        eligibleForFirstSwapWithMinFee,
        transferFees
    )
}
