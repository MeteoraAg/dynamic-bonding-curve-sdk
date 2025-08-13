import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
    getNextSqrtPriceFromInput,
    getNextSqrtPriceFromOutput,
} from './curve'
import {
    getBaseFeeNumerator,
    getFeeOnAmount,
    getVariableFee,
    getTotalFeeNumeratorFromIncludedFeeAmount,
    getTotalFeeNumeratorFromExcludedFeeAmount,
    getIncludedFeeAmount,
    splitFees,
    getFeeOnAmountWithTradeFeeNumerator,
} from './feeMath'
import {
    CollectFeeMode,
    Rounding,
    SwapResult,
    TradeDirection,
    type FeeMode,
    type FeeOnAmountResult,
    type PoolConfig,
    type SwapQuoteResult,
    type SwapAmount,
    type SwapResult2,
    type VirtualPool,
    SwapQuote2Result,
} from '../types'
import {
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
    MAX_SWALLOW_PERCENTAGE,
} from '../constants'

/**
 * Get swap amount from base to quote with stop price
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param amountIn Input amount
 * @param stopSqrtPrice Stop sqrt price
 * @returns Swap amount
 */
export function getSwapAmountFromBaseToQuote(
    configState: {
        curve: Array<{
            sqrtPrice: BN
            liquidity: BN
        }>
    },
    currentSqrtPrice: BN,
    amountIn: BN,
    stopSqrtPrice: BN
): SwapAmount {
    if (amountIn.isZero()) {
        return {
            outputAmount: new BN(0),
            nextSqrtPrice: currentSqrtPrice,
            amountLeft: new BN(0),
        }
    }

    let totalOutputAmount = new BN(0)
    let currentSqrtPriceLocal = currentSqrtPrice
    let amountLeft = amountIn

    // Use curve.len() - 1 for backward compatibility for existing pools with 20 points
    // iterate through curve points in reverse order
    for (let i = configState.curve.length - 2; i >= 0; i--) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            continue
        }

        if (configState.curve[i].sqrtPrice.lt(currentSqrtPriceLocal)) {
            const currentLiquidity = configState.curve[i + 1].liquidity

            const maxAmountIn = getDeltaAmountBaseUnsigned(
                configState.curve[i].sqrtPrice,
                currentSqrtPriceLocal,
                currentLiquidity,
                Rounding.Up
            )

            if (amountLeft.lt(maxAmountIn)) {
                const nextSqrtPrice = getNextSqrtPriceFromInput(
                    currentSqrtPriceLocal,
                    currentLiquidity,
                    amountLeft,
                    true
                )

                const outputAmount = getDeltaAmountQuoteUnsigned(
                    nextSqrtPrice,
                    currentSqrtPriceLocal,
                    currentLiquidity,
                    Rounding.Down
                )

                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = new BN(0)
                break
            } else {
                const nextSqrtPrice = configState.curve[i].sqrtPrice
                const outputAmount = getDeltaAmountQuoteUnsigned(
                    nextSqrtPrice,
                    currentSqrtPriceLocal,
                    currentLiquidity,
                    Rounding.Down
                )

                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, maxAmountIn)
            }
        }
    }

    if (!amountLeft.isZero()) {
        const nextSqrtPrice = getNextSqrtPriceFromInput(
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            amountLeft,
            true
        )

        // check if we hit the stop price (migration threshold)
        if (nextSqrtPrice.lte(stopSqrtPrice)) {
            // calculate how much we can actually consume before hitting stop price
            const actualNextSqrtPrice = stopSqrtPrice
            const actualAmountIn = getDeltaAmountBaseUnsigned(
                actualNextSqrtPrice,
                currentSqrtPriceLocal,
                configState.curve[0].liquidity,
                Rounding.Up
            )

            const outputAmount = getDeltaAmountQuoteUnsigned(
                actualNextSqrtPrice,
                currentSqrtPriceLocal,
                configState.curve[0].liquidity,
                Rounding.Down
            )

            totalOutputAmount = SafeMath.add(totalOutputAmount, outputAmount)
            currentSqrtPriceLocal = actualNextSqrtPrice
            amountLeft = SafeMath.sub(amountLeft, actualAmountIn)
        } else {
            const outputAmount = getDeltaAmountQuoteUnsigned(
                nextSqrtPrice,
                currentSqrtPriceLocal,
                configState.curve[0].liquidity,
                Rounding.Down
            )

            totalOutputAmount = SafeMath.add(totalOutputAmount, outputAmount)
            currentSqrtPriceLocal = nextSqrtPrice
            amountLeft = new BN(0)
        }
    }

    return {
        outputAmount: totalOutputAmount,
        nextSqrtPrice: currentSqrtPriceLocal,
        amountLeft: amountLeft,
    }
}

/**
 * Get swap amount from quote to base with stop price
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param amountIn Input amount
 * @param stopSqrtPrice Stop sqrt price
 * @returns Swap amount
 */
export function getSwapAmountFromQuoteToBase(
    configState: {
        curve: Array<{
            sqrtPrice: BN
            liquidity: BN
        }>
    },
    currentSqrtPrice: BN,
    amountIn: BN,
    stopSqrtPrice: BN
): SwapAmount {
    if (amountIn.isZero()) {
        return {
            outputAmount: new BN(0),
            nextSqrtPrice: currentSqrtPrice,
            amountLeft: new BN(0),
        }
    }

    let totalOutputAmount = new BN(0)
    let currentSqrtPriceLocal = currentSqrtPrice
    let amountLeft = amountIn

    // iterate through the curve points
    for (let i = 0; i < configState.curve.length; i++) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            break
        }

        // reference_sqrt_price = stop_sqrt_price.min(config.curve[i].sqrt_price)
        const referenceSqrtPrice = BN.min(
            stopSqrtPrice,
            configState.curve[i].sqrtPrice
        )

        if (referenceSqrtPrice.gt(currentSqrtPriceLocal)) {
            const maxAmountIn = getDeltaAmountQuoteUnsigned(
                currentSqrtPriceLocal,
                referenceSqrtPrice,
                configState.curve[i].liquidity,
                Rounding.Up
            )

            if (amountLeft.lt(maxAmountIn)) {
                const nextSqrtPrice = getNextSqrtPriceFromInput(
                    currentSqrtPriceLocal,
                    configState.curve[i].liquidity,
                    amountLeft,
                    false
                )

                const outputAmount = getDeltaAmountBaseUnsigned(
                    currentSqrtPriceLocal,
                    nextSqrtPrice,
                    configState.curve[i].liquidity,
                    Rounding.Down
                )

                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = new BN(0)
                break
            } else {
                const nextSqrtPrice = referenceSqrtPrice
                const outputAmount = getDeltaAmountBaseUnsigned(
                    currentSqrtPriceLocal,
                    nextSqrtPrice,
                    configState.curve[i].liquidity,
                    Rounding.Down
                )

                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, maxAmountIn)

                if (nextSqrtPrice.eq(stopSqrtPrice)) {
                    break
                }
            }
        }
    }

    return {
        outputAmount: totalOutputAmount,
        nextSqrtPrice: currentSqrtPriceLocal,
        amountLeft: amountLeft,
    }
}

/**
 * Get maximum swallow quote amount
 * @param config Pool config state
 * @returns Maximum swallow quote amount
 */
export function getMaxSwallowQuoteAmount(config: PoolConfig): BN {
    return mulDiv(
        config.migrationQuoteThreshold,
        new BN(MAX_SWALLOW_PERCENTAGE),
        new BN(100),
        Rounding.Down
    )
}

/**
 * Get fee mode
 * @param collectFeeMode Collect fee mode
 * @param tradeDirection Trade direction
 * @param hasReferral Whether referral is used
 * @returns Fee mode
 */
export function getFeeMode(
    collectFeeMode: CollectFeeMode,
    tradeDirection: TradeDirection,
    hasReferral: boolean
): FeeMode {
    // (CollectFeeMode::OutputToken, TradeDirection::BaseToQuote) => (false, false),
    // (CollectFeeMode::OutputToken, TradeDirection::QuoteToBase) => (false, true),
    // (CollectFeeMode::QuoteToken, TradeDirection::BaseToQuote) => (false, false),
    // (CollectFeeMode::QuoteToken, TradeDirection::QuoteToBase) => (true, false),

    let feesOnInput: boolean
    let feesOnBaseToken: boolean

    if (collectFeeMode === CollectFeeMode.OutputToken) {
        if (tradeDirection === TradeDirection.BaseToQuote) {
            feesOnInput = false
            feesOnBaseToken = false
        } else {
            // TradeDirection.QuoteToBase
            feesOnInput = false
            feesOnBaseToken = true
        }
    } else {
        // CollectFeeMode.QuoteToken
        if (tradeDirection === TradeDirection.BaseToQuote) {
            feesOnInput = false
            feesOnBaseToken = false
        } else {
            // TradeDirection.QuoteToBase
            feesOnInput = true
            feesOnBaseToken = false
        }
    }

    return {
        feesOnInput,
        feesOnBaseToken,
        hasReferral,
    }
}

/**
 * Get swap result
 * @param poolState Pool state
 * @param configState Config state
 * @param amountIn Input amount
 * @param feeMode Fee mode
 * @param tradeDirection Trade direction
 * @param currentPoint Current point
 * @returns Swap result
 */
export function getSwapResult(
    poolState: VirtualPool,
    configState: PoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN
): SwapResult {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    // apply fees on input if needed
    let actualAmountIn: BN
    if (feeMode.feesOnInput) {
        const feeResult: FeeOnAmountResult = getFeeOnAmount(
            amountIn,
            configState.poolFees,
            feeMode.hasReferral,
            currentPoint,
            poolState.activationPoint,
            poolState.volatilityTracker,
            tradeDirection
        )

        actualProtocolFee = feeResult.protocolFee
        actualTradingFee = feeResult.tradingFee
        actualReferralFee = feeResult.referralFee
        actualAmountIn = feeResult.amount
    } else {
        actualAmountIn = amountIn
    }

    // calculate swap amount
    const swapAmount: SwapAmount =
        tradeDirection === TradeDirection.BaseToQuote
            ? getSwapAmountFromBaseToQuote(
                  configState,
                  poolState.sqrtPrice,
                  actualAmountIn,
                  configState.migrationSqrtPrice
              )
            : getSwapAmountFromQuoteToBase(
                  configState,
                  poolState.sqrtPrice,
                  actualAmountIn,
                  configState.migrationSqrtPrice
              )

    // apply fees on output if needed
    let actualAmountOut: BN
    if (feeMode.feesOnInput) {
        actualAmountOut = swapAmount.outputAmount
    } else {
        const feeResult: FeeOnAmountResult = getFeeOnAmount(
            swapAmount.outputAmount,
            configState.poolFees,
            feeMode.hasReferral,
            currentPoint,
            poolState.activationPoint,
            poolState.volatilityTracker,
            tradeDirection
        )

        actualProtocolFee = feeResult.protocolFee
        actualTradingFee = feeResult.tradingFee
        actualReferralFee = feeResult.referralFee
        actualAmountOut = feeResult.amount
    }

    return {
        actualInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice: swapAmount.nextSqrtPrice,
        tradingFee: actualTradingFee,
        protocolFee: actualProtocolFee,
        referralFee: actualReferralFee,
    }
}

/**
 * Get swap result from exact input
 * @param virtualPool Virtual pool state
 * @param config Pool config state
 * @param amountIn Input amount
 * @param feeMode Fee mode
 * @param tradeDirection Trade direction
 * @param currentPoint Current point
 * @returns Swap result
 */
export function getSwapResultFromExactInput(
    virtualPool: VirtualPool,
    config: PoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN
): SwapResult2 {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    const tradeFeeNumerator = getTotalFeeNumeratorFromIncludedFeeAmount(
        config.poolFees,
        virtualPool.volatilityTracker,
        currentPoint,
        virtualPool.activationPoint,
        amountIn,
        tradeDirection
    )

    let actualAmountIn: BN
    if (feeMode.feesOnInput) {
        const feeResult = getFeeOnAmountWithTradeFeeNumerator(
            tradeFeeNumerator,
            amountIn,
            config.poolFees,
            feeMode.hasReferral
        )

        actualProtocolFee = feeResult.protocolFee
        actualTradingFee = feeResult.tradingFee
        actualReferralFee = feeResult.referralFee
        actualAmountIn = feeResult.amount
    } else {
        actualAmountIn = amountIn
    }

    const swapAmount =
        tradeDirection === TradeDirection.BaseToQuote
            ? getSwapAmountFromBaseToQuote(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )
            : getSwapAmountFromQuoteToBase(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )

    let actualAmountOut: BN
    if (feeMode.feesOnInput) {
        actualAmountOut = swapAmount.outputAmount
    } else {
        const feeResult = getFeeOnAmountWithTradeFeeNumerator(
            tradeFeeNumerator,
            swapAmount.outputAmount,
            config.poolFees,
            feeMode.hasReferral
        )

        actualTradingFee = feeResult.tradingFee
        actualProtocolFee = feeResult.protocolFee
        actualReferralFee = feeResult.referralFee
        actualAmountOut = feeResult.amount
    }

    return {
        amountLeft: swapAmount.amountLeft,
        includedFeeInputAmount: amountIn,
        excludedFeeInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice: swapAmount.nextSqrtPrice,
        tradingFee: actualTradingFee,
        protocolFee: actualProtocolFee,
        referralFee: actualReferralFee,
    }
}

/**
 * Get swap result from exact output
 * @param virtualPool Virtual pool state
 * @param config Pool config state
 * @param amountOut Output amount
 * @param feeMode Fee mode
 * @param tradeDirection Trade direction
 * @param currentPoint Current point
 * @returns Swap result
 */
export function getSwapResultFromExactOutput(
    virtualPool: VirtualPool,
    config: PoolConfig,
    amountOut: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN
): SwapResult2 {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    const includedFeeOutAmount = feeMode.feesOnInput
        ? amountOut
        : (() => {
              const tradeFeeNumerator =
                  getTotalFeeNumeratorFromExcludedFeeAmount(
                      config.poolFees,
                      virtualPool.volatilityTracker,
                      currentPoint,
                      virtualPool.activationPoint,
                      amountOut,
                      tradeDirection
                  )
              const [includedFeeAmount, feeAmount] = getIncludedFeeAmount(
                  tradeFeeNumerator,
                  amountOut
              )

              const [tradingFee, protocolFee, referralFee] = splitFees(
                  config.poolFees,
                  feeAmount,
                  feeMode.hasReferral
              )

              actualTradingFee = tradingFee
              actualProtocolFee = protocolFee
              actualReferralFee = referralFee
              return includedFeeAmount
          })()

    const swapAmountFromOutput =
        tradeDirection === TradeDirection.BaseToQuote
            ? getInAmountFromBaseToQuote(
                  config,
                  virtualPool.sqrtPrice,
                  includedFeeOutAmount
              )
            : getInAmountFromQuoteToBase(
                  config,
                  virtualPool.sqrtPrice,
                  includedFeeOutAmount
              )

    const [excludedFeeInputAmount, includedFeeInputAmount] = feeMode.feesOnInput
        ? (() => {
              const tradeFeeNumerator =
                  getTotalFeeNumeratorFromExcludedFeeAmount(
                      config.poolFees,
                      virtualPool.volatilityTracker,
                      currentPoint,
                      virtualPool.activationPoint,
                      swapAmountFromOutput.outputAmount,
                      tradeDirection
                  )

              const [includedFeeAmount, feeAmount] = getIncludedFeeAmount(
                  tradeFeeNumerator,
                  swapAmountFromOutput.outputAmount
              )

              const [tradingFee, protocolFee, referralFee] = splitFees(
                  config.poolFees,
                  feeAmount,
                  feeMode.hasReferral
              )

              actualTradingFee = tradingFee
              actualProtocolFee = protocolFee
              actualReferralFee = referralFee

              return [swapAmountFromOutput.outputAmount, includedFeeAmount]
          })()
        : [swapAmountFromOutput.outputAmount, swapAmountFromOutput.outputAmount]

    return {
        amountLeft: new BN(0),
        includedFeeInputAmount,
        excludedFeeInputAmount,
        outputAmount: amountOut,
        nextSqrtPrice: swapAmountFromOutput.nextSqrtPrice,
        tradingFee: actualTradingFee,
        protocolFee: actualProtocolFee,
        referralFee: actualReferralFee,
    }
}

/**
 * Get input amount from base to quote (selling)
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param outAmount Quote output amount
 * @returns Swap amount with input calculated
 */
export function getInAmountFromBaseToQuote(
    configState: PoolConfig,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmount {
    let currentSqrtPriceLocal = currentSqrtPrice
    let amountLeft = outAmount
    let totalAmountIn = new BN(0)

    // Use curve.len() - 1 for backward compatibility for existing pools with 20 points
    // iterate through curve points in reverse order
    for (let i = configState.curve.length - 2; i >= 0; i--) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            continue
        }

        if (configState.curve[i].sqrtPrice.lt(currentSqrtPriceLocal)) {
            const currentLiquidity = configState.curve[i + 1].liquidity

            if (currentLiquidity.isZero()) continue

            const maxAmountOut = getDeltaAmountQuoteUnsigned(
                configState.curve[i].sqrtPrice,
                currentSqrtPriceLocal,
                currentLiquidity,
                Rounding.Down
            )

            if (amountLeft.lt(maxAmountOut)) {
                const nextSqrtPrice = getNextSqrtPriceFromOutput(
                    currentSqrtPriceLocal,
                    currentLiquidity,
                    amountLeft,
                    true
                )

                const inAmount = getDeltaAmountBaseUnsigned(
                    nextSqrtPrice,
                    currentSqrtPriceLocal,
                    currentLiquidity,
                    Rounding.Up
                )

                totalAmountIn = SafeMath.add(totalAmountIn, inAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = new BN(0)
                break
            } else {
                const nextSqrtPrice = configState.curve[i].sqrtPrice
                const inAmount = getDeltaAmountBaseUnsigned(
                    nextSqrtPrice,
                    currentSqrtPriceLocal,
                    currentLiquidity,
                    Rounding.Up
                )

                totalAmountIn = SafeMath.add(totalAmountIn, inAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, maxAmountOut)
            }
        }
    }

    if (!amountLeft.isZero()) {
        const nextSqrtPrice = getNextSqrtPriceFromOutput(
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            amountLeft,
            true
        )

        if (nextSqrtPrice.lt(configState.sqrtStartPrice)) {
            throw new Error('Not enough liquidity')
        }

        const inAmount = getDeltaAmountBaseUnsigned(
            nextSqrtPrice,
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            Rounding.Up
        )

        totalAmountIn = SafeMath.add(totalAmountIn, inAmount)
        currentSqrtPriceLocal = nextSqrtPrice
    }

    return {
        outputAmount: totalAmountIn,
        nextSqrtPrice: currentSqrtPriceLocal,
        amountLeft: new BN(0),
    }
}

/**
 * Get input amount from quote to base (buying)
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param outAmount Base output amount
 * @returns Swap amount with input calculated
 */
export function getInAmountFromQuoteToBase(
    configState: PoolConfig,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmount {
    let totalInAmount = new BN(0)
    let currentSqrtPriceLocal = currentSqrtPrice
    let amountLeft = outAmount

    // iterate through curve points
    for (let i = 0; i < configState.curve.length; i++) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            break
        }

        if (configState.curve[i].liquidity.isZero()) continue

        if (configState.curve[i].sqrtPrice.gt(currentSqrtPriceLocal)) {
            const maxAmountOut = getDeltaAmountBaseUnsigned(
                currentSqrtPriceLocal,
                configState.curve[i].sqrtPrice,
                configState.curve[i].liquidity,
                Rounding.Down
            )

            if (amountLeft.lt(maxAmountOut)) {
                const nextSqrtPrice = getNextSqrtPriceFromOutput(
                    currentSqrtPriceLocal,
                    configState.curve[i].liquidity,
                    amountLeft,
                    false
                )

                const inAmount = getDeltaAmountQuoteUnsigned(
                    currentSqrtPriceLocal,
                    nextSqrtPrice,
                    configState.curve[i].liquidity,
                    Rounding.Up
                )

                totalInAmount = SafeMath.add(totalInAmount, inAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = new BN(0)
                break
            } else {
                const nextSqrtPrice = configState.curve[i].sqrtPrice
                const inAmount = getDeltaAmountQuoteUnsigned(
                    currentSqrtPriceLocal,
                    nextSqrtPrice,
                    configState.curve[i].liquidity,
                    Rounding.Up
                )

                totalInAmount = SafeMath.add(totalInAmount, inAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, maxAmountOut)
            }
        }
    }

    if (!amountLeft.isZero()) {
        throw new Error('Not enough liquidity')
    }

    return {
        outputAmount: totalInAmount,
        nextSqrtPrice: currentSqrtPriceLocal,
        amountLeft: new BN(0),
    }
}

/**
 * Get swap result from partial input
 * @param virtualPool Virtual pool state
 * @param config Pool config state
 * @param amountIn Input amount
 * @param feeMode Fee mode
 * @param tradeDirection Trade direction
 * @param currentPoint Current point
 * @returns Swap result
 */
export function getSwapResultFromPartialInput(
    virtualPool: VirtualPool,
    config: PoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN
): SwapResult2 {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    const tradeFeeNumerator = getTotalFeeNumeratorFromIncludedFeeAmount(
        config.poolFees,
        virtualPool.volatilityTracker,
        currentPoint,
        virtualPool.activationPoint,
        amountIn,
        tradeDirection
    )

    let actualAmountIn: BN
    if (feeMode.feesOnInput) {
        const feeResult = getFeeOnAmountWithTradeFeeNumerator(
            tradeFeeNumerator,
            amountIn,
            config.poolFees,
            feeMode.hasReferral
        )

        actualProtocolFee = feeResult.protocolFee
        actualTradingFee = feeResult.tradingFee
        actualReferralFee = feeResult.referralFee
        actualAmountIn = feeResult.amount
    } else {
        actualAmountIn = amountIn
    }

    // calculate swap amount using migration sqrt price as stop price for partial fill
    const swapAmount =
        tradeDirection === TradeDirection.BaseToQuote
            ? getSwapAmountFromBaseToQuote(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )
            : getSwapAmountFromQuoteToBase(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )

    let includedFeeInputAmount = amountIn
    if (swapAmount.amountLeft.gt(new BN(0))) {
        actualAmountIn = SafeMath.sub(actualAmountIn, swapAmount.amountLeft)

        // recalculate fees for partial fill
        if (feeMode.feesOnInput) {
            const tradeFeeNumeratorPartial =
                getTotalFeeNumeratorFromExcludedFeeAmount(
                    config.poolFees,
                    virtualPool.volatilityTracker,
                    currentPoint,
                    virtualPool.activationPoint,
                    actualAmountIn,
                    tradeDirection
                )
            const [includedFeeAmount, feeAmount] = getIncludedFeeAmount(
                tradeFeeNumeratorPartial,
                actualAmountIn
            )

            const [tradingFee, protocolFee, referralFee] = splitFees(
                config.poolFees,
                feeAmount,
                feeMode.hasReferral
            )

            actualTradingFee = tradingFee
            actualProtocolFee = protocolFee
            actualReferralFee = referralFee
            includedFeeInputAmount = includedFeeAmount
        } else {
            includedFeeInputAmount = actualAmountIn
        }
    }

    let actualAmountOut: BN
    if (feeMode.feesOnInput) {
        actualAmountOut = swapAmount.outputAmount
    } else {
        const feeResult = getFeeOnAmountWithTradeFeeNumerator(
            tradeFeeNumerator,
            swapAmount.outputAmount,
            config.poolFees,
            feeMode.hasReferral
        )

        actualProtocolFee = feeResult.protocolFee
        actualTradingFee = feeResult.tradingFee
        actualReferralFee = feeResult.referralFee
        actualAmountOut = feeResult.amount
    }

    return {
        amountLeft: swapAmount.amountLeft,
        includedFeeInputAmount,
        excludedFeeInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice: swapAmount.nextSqrtPrice,
        tradingFee: actualTradingFee,
        protocolFee: actualProtocolFee,
        referralFee: actualReferralFee,
    }
}

/**
 * Calculate quote for a swap with exact input amount (for swapQuote v1)
 * @param virtualPool Virtual pool state
 * @param config Pool config state
 * @param swapBaseForQuote Whether to swap base for quote
 * @param amountIn Input amount
 * @param slippageBps Slippage tolerance in basis points (100 = 1%)
 * @param hasReferral Whether referral is used
 * @param currentPoint Current point
 * @returns Swap quote result
 */
export function swapQuote(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN
): SwapQuoteResult {
    if (virtualPool.quoteReserve.gte(config.migrationQuoteThreshold)) {
        throw new Error('Virtual pool is completed')
    }

    if (amountIn.isZero()) {
        throw new Error('Amount is zero')
    }

    const tradeDirection = swapBaseForQuote
        ? TradeDirection.BaseToQuote
        : TradeDirection.QuoteToBase

    const feeMode = getFeeMode(
        config.collectFeeMode,
        tradeDirection,
        hasReferral
    )

    const result = getSwapResult(
        virtualPool,
        config,
        amountIn,
        feeMode,
        tradeDirection,
        currentPoint
    )

    let minimumAmountOut: BN
    if (slippageBps > 0) {
        // slippage factor: (10000 - slippageBps) / 10000
        const slippageFactor = new BN(10000 - slippageBps)
        const denominator = new BN(10000)

        // minimum amount out: amountOut * (10000 - slippageBps) / 10000
        minimumAmountOut = result.outputAmount
            .mul(slippageFactor)
            .div(denominator)
    } else {
        minimumAmountOut = result.outputAmount
    }

    return {
        ...result,
        minimumAmountOut,
    }
}

/**
 * Calculate quote for a swap with exact input amount
 * @param virtualPool Virtual pool state
 * @param config Pool config state
 * @param swapBaseForQuote Whether to swap base for quote
 * @param amountIn Input amount
 * @param slippageBps Slippage tolerance in basis points (100 = 1%)
 * @param hasReferral Whether referral is used
 * @param currentPoint Current point
 * @returns Swap quote result
 */
export function swapQuoteExactIn(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN
): SwapQuote2Result {
    if (virtualPool.quoteReserve.gte(config.migrationQuoteThreshold)) {
        throw new Error('Virtual pool is completed')
    }

    if (amountIn.isZero()) {
        throw new Error('Amount is zero')
    }

    const tradeDirection = swapBaseForQuote
        ? TradeDirection.BaseToQuote
        : TradeDirection.QuoteToBase

    const feeMode = getFeeMode(
        config.collectFeeMode,
        tradeDirection,
        hasReferral
    )

    const result = getSwapResultFromExactInput(
        virtualPool,
        config,
        amountIn,
        feeMode,
        tradeDirection,
        currentPoint
    )

    // check amount left threshold for exact in
    const maxSwallowQuoteAmount = getMaxSwallowQuoteAmount(config)
    if (result.amountLeft.gt(maxSwallowQuoteAmount)) {
        throw new Error('Amount left is over a threshold')
    }

    // calculate minimum amount out
    let minimumAmountOut: BN
    if (slippageBps > 0) {
        // slippage factor: (10000 - slippageBps) / 10000
        const slippageFactor = new BN(10000 - slippageBps)
        const denominator = new BN(10000)

        // minimum amount out: amountOut * (10000 - slippageBps) / 10000
        minimumAmountOut = result.outputAmount
            .mul(slippageFactor)
            .div(denominator)
    } else {
        minimumAmountOut = result.outputAmount
    }

    return {
        ...result,
        minimumAmountOut,
    }
}

/**
 * Calculate quote for a swap with partial fill
 * @param virtualPool Virtual pool state
 * @param config Pool config state
 * @param swapBaseForQuote Whether to swap base for quote
 * @param amountIn Input amount
 * @param hasReferral Whether referral is used
 * @param currentPoint Current point
 * @returns Swap quote result
 */
export function swapQuotePartialFill(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN
): SwapQuote2Result {
    if (virtualPool.quoteReserve.gte(config.migrationQuoteThreshold)) {
        throw new Error('Virtual pool is completed')
    }

    if (amountIn.isZero()) {
        throw new Error('Amount is zero')
    }

    const tradeDirection = swapBaseForQuote
        ? TradeDirection.BaseToQuote
        : TradeDirection.QuoteToBase

    const feeMode = getFeeMode(
        config.collectFeeMode,
        tradeDirection,
        hasReferral
    )

    const result = getSwapResultFromPartialInput(
        virtualPool,
        config,
        amountIn,
        feeMode,
        tradeDirection,
        currentPoint
    )

    // calculate minimum amount out
    let minimumAmountOut: BN
    if (slippageBps > 0) {
        // slippage factor: (10000 - slippageBps) / 10000
        const slippageFactor = new BN(10000 - slippageBps)
        const denominator = new BN(10000)

        // minimum amount out: amountOut * (10000 - slippageBps) / 10000
        minimumAmountOut = result.outputAmount
            .mul(slippageFactor)
            .div(denominator)
    } else {
        minimumAmountOut = result.outputAmount
    }

    return {
        ...result,
        minimumAmountOut,
    }
}

/**
 * Calculate quote for a swap with exact output amount
 * @param virtualPool Virtual pool state
 * @param config Pool config state
 * @param swapBaseForQuote Whether to swap base for quote
 * @param outAmount Output amount
 * @param slippageBps Slippage tolerance in basis points (100 = 1%)
 * @param hasReferral Whether referral is used
 * @param currentPoint Current point
 * @returns Swap quote result with input amount calculated
 */
export function swapQuoteExactOut(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    outAmount: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN
): SwapQuote2Result {
    if (virtualPool.quoteReserve.gte(config.migrationQuoteThreshold)) {
        throw new Error('Virtual pool is completed')
    }

    if (outAmount.isZero()) {
        throw new Error('Amount is zero')
    }

    const tradeDirection = swapBaseForQuote
        ? TradeDirection.BaseToQuote
        : TradeDirection.QuoteToBase

    const feeMode = getFeeMode(
        config.collectFeeMode,
        tradeDirection,
        hasReferral
    )

    const result = getSwapResultFromExactOutput(
        virtualPool,
        config,
        outAmount,
        feeMode,
        tradeDirection,
        currentPoint
    )

    // calculate maximum amount in (for slippage protection)
    let maximumAmountIn: BN
    if (slippageBps > 0) {
        // slippage factor: (10000 + slippageBps) / 10000
        const slippageFactor = new BN(10000 + slippageBps)
        const denominator = new BN(10000)

        // maximum amount in: inputAmount * (10000 + slippageBps) / 10000
        maximumAmountIn = result.includedFeeInputAmount
            .mul(slippageFactor)
            .div(denominator)
    } else {
        maximumAmountIn = result.includedFeeInputAmount
    }

    return {
        ...result,
        maximumAmountIn,
    }
}

/**
 * Calculate the required quote amount for exact input
 * @param migrationQuoteThreshold Migration quote threshold
 * @param quoteReserve Current quote reserve
 * @param collectFeeMode Fee collection mode
 * @param config Pool config state
 * @param currentPoint Current point
 * @returns Required quote amount
 */
export function swapQuoteRemainingCurve(
    config: PoolConfig,
    virtualPool: VirtualPool,
    currentPoint: BN
): BN {
    if (virtualPool.quoteReserve.gte(config.migrationQuoteThreshold)) {
        return new BN(0)
    }

    const amountInAfterFee = config.migrationQuoteThreshold.sub(
        virtualPool.quoteReserve
    )

    if (config.collectFeeMode === CollectFeeMode.QuoteToken) {
        const baseFeeNumerator = getBaseFeeNumerator(
            config.poolFees.baseFee,
            TradeDirection.QuoteToBase,
            currentPoint,
            virtualPool.activationPoint
        )

        let totalFeeNumerator = baseFeeNumerator
        if (config.poolFees.dynamicFee.initialized !== 0) {
            const variableFee = getVariableFee(
                config.poolFees.dynamicFee,
                virtualPool.volatilityTracker
            )
            totalFeeNumerator = SafeMath.add(totalFeeNumerator, variableFee)
        }

        // cap at MAX_FEE_NUMERATOR
        totalFeeNumerator = BN.min(totalFeeNumerator, new BN(MAX_FEE_NUMERATOR))

        // amountIn = amountInAfterFee * FEE_DENOMINATOR / (FEE_DENOMINATOR - effectiveFeeNumerator)
        const denominator = new BN(FEE_DENOMINATOR).sub(totalFeeNumerator)
        return mulDiv(
            amountInAfterFee,
            new BN(FEE_DENOMINATOR),
            denominator,
            Rounding.Up
        )
    } else {
        return amountInAfterFee
    }
}
