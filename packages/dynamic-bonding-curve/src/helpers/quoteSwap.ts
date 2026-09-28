import BN from 'bn.js'
import {
    swapQuoteExactIn,
    swapQuoteExactOut,
    swapQuotePartialFill,
} from '../math/swapQuote'
import { getMigrationThresholdPrice } from './common'
import {
    SwapMode,
    type ConfigParameters,
    type PoolConfig,
    type QuoteTransferFees,
    type SimulatedQuoteBaseParams,
    type SimulatedQuoteFromInputAmountParams,
    type SimulatedQuoteFromOutputAmountParams,
    type SwapQuote2Result,
    type VirtualPool,
} from '../types'

function migrationSqrtPrice(config: ConfigParameters): BN {
    if (!config.curve || config.curve.length === 0) {
        throw new Error('config.curve is empty')
    }

    return getMigrationThresholdPrice(
        config.migrationQuoteThreshold,
        config.sqrtStartPrice,
        config.curve
    )
}

/**
 * `process_create_config` sets `initialized` to 1 when dynamic-fee parameters
 * are present and leaves the default (0) when they are not.
 */
function dynamicFeeFromParameters(
    dynamicFee: ConfigParameters['poolFees']['dynamicFee']
) {
    if (!dynamicFee) {
        return { initialized: 0, binStep: 0, variableFeeControl: 0 }
    }

    return {
        ...dynamicFee,
        initialized: 1,
    }
}

/**
 * Fields `process_create_config` writes that the quote math reads.
 * The quote functions are typed on the account, so this is asserted at the
 * boundary. Padding and pubkeys the math does not read are left unset.
 */
function poolConfigFromParameters(
    config: ConfigParameters,
    quoteTokenFlag: number | undefined
): PoolConfig {
    return {
        poolFees: {
            baseFee: config.poolFees.baseFee,
            dynamicFee: dynamicFeeFromParameters(config.poolFees.dynamicFee),
        },
        collectFeeMode: config.collectFeeMode,
        sqrtStartPrice: config.sqrtStartPrice,
        migrationQuoteThreshold: config.migrationQuoteThreshold,
        migrationSqrtPrice: migrationSqrtPrice(config),
        curve: config.curve,
        enableFirstSwapWithMinFee: config.enableFirstSwapWithMinFee ? 1 : 0,
        quoteTokenFlag,
    } as PoolConfig
}

/** Pool `initialize_pool` writes: start price, zero volatility, `has_swap` 0. */
function initialVirtualPool(
    sqrtStartPrice: BN,
    activationPoint: BN
): VirtualPool {
    return {
        poolState: {
            sqrtPrice: sqrtStartPrice,
            quoteReserve: new BN(0),
            activationPoint,
            hasSwap: 0,
            volatilityTracker: {
                volatilityAccumulator: new BN(0),
            },
        },
    } as VirtualPool
}

function quoteAtInitialization(
    params: SimulatedQuoteBaseParams &
        (
            | {
                  swapMode?: SwapMode.ExactIn | SwapMode.PartialFill
                  amountIn: BN
              }
            | {
                  swapMode: SwapMode.ExactOut
                  amountOut: BN
              }
        )
): SwapQuote2Result {
    const currentPoint = params.currentPoint ?? new BN(0)
    const config = poolConfigFromParameters(params.config, params.quoteTokenFlag)
    const virtualPool = initialVirtualPool(
        params.config.sqrtStartPrice,
        currentPoint
    )
    const slippageBps = params.slippageBps ?? 0
    const hasReferral = params.hasReferral ?? false
    const eligibleForFirstSwapWithMinFee =
        params.eligibleForFirstSwapWithMinFee ?? false
    const transferFees: QuoteTransferFees = params

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

export function getQuoteFromInputAmount(
    params: SimulatedQuoteFromInputAmountParams
): SwapQuote2Result {
    return quoteAtInitialization(params)
}

export function getQuoteFromOutputAmount(
    params: SimulatedQuoteFromOutputAmountParams
): SwapQuote2Result {
    return quoteAtInitialization({
        ...params,
        swapMode: SwapMode.ExactOut,
    })
}
