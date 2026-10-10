import BN from 'bn.js'
import {
    swapQuoteExactIn,
    swapQuoteExactOut,
    swapQuotePartialFill,
} from '../math/swapQuote'
import { getMigrationThresholdPrice } from './migration'
import {
    SwapMode,
    TokenType,
    type ConfigParameters,
    type QuotePoolConfig,
    type QuoteVirtualPool,
    type SimulatedQuoteBaseParams,
    type SimulatedQuoteFromInputAmountParams,
    type SimulatedQuoteFromOutputAmountParams,
    type SwapQuote2Result,
} from '../types'

/**
 * The config fields the quote math reads, as process_create_config writes
 * them. A base transfer fee is a separate createConfig2 argument, so it is
 * only applied when the caller passes baseTransferFeeBasisPoints or baseMint.
 */
function poolConfigFromParameters(
    config: ConfigParameters,
    quoteTokenFlag: number
): QuotePoolConfig {
    return {
        poolFees: {
            baseFee: config.poolFees.baseFee,
            dynamicFee: config.poolFees.dynamicFee
                ? { ...config.poolFees.dynamicFee, initialized: 1 }
                : { initialized: 0, binStep: 0, variableFeeControl: 0 },
        },
        collectFeeMode: config.collectFeeMode,
        sqrtStartPrice: config.sqrtStartPrice,
        migrationQuoteThreshold: config.migrationQuoteThreshold,
        migrationSqrtPrice: getMigrationThresholdPrice(
            config.migrationQuoteThreshold,
            config.sqrtStartPrice,
            config.curve
        ),
        curve: config.curve,
        enableFirstSwapWithMinFee: config.enableFirstSwapWithMinFee ? 1 : 0,
        quoteTokenFlag,
        transferFeeFlag: 0,
        transferFeeBasisPoints: 0,
    }
}

/** The pool initialize_pool writes: the start price, no reserve, no swap and no volatility. */
function initialVirtualPool(
    sqrtStartPrice: BN,
    activationPoint: BN
): QuoteVirtualPool {
    return {
        poolState: {
            sqrtPrice: sqrtStartPrice,
            quoteReserve: new BN(0),
            activationPoint,
            hasSwap: 0,
            volatilityTracker: { volatilityAccumulator: new BN(0) },
        },
    }
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
    const config = poolConfigFromParameters(
        params.config,
        params.quoteTokenFlag ?? TokenType.SPLToken
    )
    const virtualPool = initialVirtualPool(
        params.config.sqrtStartPrice,
        currentPoint
    )
    const slippageBps = params.slippageBps ?? 0
    const hasReferral = params.hasReferral ?? false
    const eligibleForFirstSwapWithMinFee =
        params.eligibleForFirstSwapWithMinFee ?? false
    const { currentEpoch, baseMint, quoteMint, baseTransferFeeBasisPoints } =
        params
    const transferFees = {
        currentEpoch,
        baseMint,
        quoteMint,
        baseTransferFeeBasisPoints,
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

    const quote =
        params.swapMode === SwapMode.PartialFill
            ? swapQuotePartialFill
            : swapQuoteExactIn
    return quote(
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

/**
 * Quote a buildCurve result as if its pool had just been initialized at
 * currentPoint. A base transfer fee is only applied when
 * baseTransferFeeBasisPoints or baseMint is passed.
 */
export function getQuoteFromInputAmount(
    params: SimulatedQuoteFromInputAmountParams
): SwapQuote2Result {
    return quoteAtInitialization(params)
}

/** Exact-out counterpart of getQuoteFromInputAmount. */
export function getQuoteFromOutputAmount(
    params: SimulatedQuoteFromOutputAmountParams
): SwapQuote2Result {
    return quoteAtInitialization({
        ...params,
        swapMode: SwapMode.ExactOut,
    })
}
