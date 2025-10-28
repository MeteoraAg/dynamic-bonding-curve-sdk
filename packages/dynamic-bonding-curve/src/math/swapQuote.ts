import BN from 'bn.js'
import { SafeMath } from './safeMath'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
    getNextSqrtPriceFromInput,
    getNextSqrtPriceFromOutput,
} from './curve'
import {
    getTotalFeeNumeratorFromIncludedFeeAmount,
    getTotalFeeNumeratorFromExcludedFeeAmount,
    getIncludedFeeAmount,
    splitFees,
    getFeeOnAmount,
    getFeeMode,
} from './feeMath'
import {
    Rounding,
    SwapResult,
    TradeDirection,
    type FeeMode,
    type PoolConfig,
    type SwapQuoteResult,
    type SwapAmount,
    type SwapResult2,
    type VirtualPool,
    SwapQuote2Result,
} from '../types'
import { U128_MAX } from '../constants'

// SwapQuote V1 //

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

    const tradeFeeNumerator = getTotalFeeNumeratorFromIncludedFeeAmount(
        configState.poolFees,
        poolState.volatilityTracker,
        currentPoint,
        poolState.activationPoint,
        amountIn,
        tradeDirection
    )

    const actualAmountIn = feeMode.feesOnInput
        ? (() => {
              const feeResult = getFeeOnAmount(
                  tradeFeeNumerator,
                  amountIn,
                  configState.poolFees,
                  feeMode.hasReferral
              )

              actualProtocolFee = feeResult.protocolFee
              actualTradingFee = feeResult.tradingFee
              actualReferralFee = feeResult.referralFee

              return feeResult.amount
          })()
        : amountIn

    const swapAmountFromInput =
        tradeDirection === TradeDirection.BaseToQuote
            ? calculateBaseToQuoteFromAmountIn(
                  configState,
                  poolState.sqrtPrice,
                  actualAmountIn
              )
            : calculateQuoteToBaseFromAmountIn(
                  configState,
                  poolState.sqrtPrice,
                  actualAmountIn,
                  U128_MAX
              )

    const { outputAmount, nextSqrtPrice } = swapAmountFromInput

    const actualAmountOut = feeMode.feesOnInput
        ? outputAmount
        : (() => {
              const feeResult = getFeeOnAmount(
                  tradeFeeNumerator,
                  outputAmount,
                  configState.poolFees,
                  feeMode.hasReferral
              )

              actualTradingFee = feeResult.tradingFee
              actualProtocolFee = feeResult.protocolFee
              actualReferralFee = feeResult.referralFee

              return feeResult.amount
          })()

    return {
        actualInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice,
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

// SwapQuote V2 //

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

    const actualAmountIn = feeMode.feesOnInput
        ? (() => {
              const feeResult = getFeeOnAmount(
                  tradeFeeNumerator,
                  amountIn,
                  config.poolFees,
                  feeMode.hasReferral
              )

              actualProtocolFee = feeResult.protocolFee
              actualTradingFee = feeResult.tradingFee
              actualReferralFee = feeResult.referralFee

              return feeResult.amount
          })()
        : amountIn

    const swapAmountFromInput =
        tradeDirection === TradeDirection.BaseToQuote
            ? calculateBaseToQuoteFromAmountIn(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn
              )
            : calculateQuoteToBaseFromAmountIn(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )

    const { outputAmount, nextSqrtPrice, amountLeft } = swapAmountFromInput

    if (!amountLeft.isZero()) {
        throw new Error('Swap amount is over a threshold')
    }

    const actualAmountOut = feeMode.feesOnInput
        ? outputAmount
        : (() => {
              const feeResult = getFeeOnAmount(
                  tradeFeeNumerator,
                  outputAmount,
                  config.poolFees,
                  feeMode.hasReferral
              )

              actualTradingFee = feeResult.tradingFee
              actualProtocolFee = feeResult.protocolFee
              actualReferralFee = feeResult.referralFee

              return feeResult.amount
          })()

    return {
        amountLeft,
        includedFeeInputAmount: amountIn,
        excludedFeeInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice,
        tradingFee: actualTradingFee,
        protocolFee: actualProtocolFee,
        referralFee: actualReferralFee,
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

    let actualAmountIn = feeMode.feesOnInput
        ? (() => {
              const feeResult = getFeeOnAmount(
                  tradeFeeNumerator,
                  amountIn,
                  config.poolFees,
                  feeMode.hasReferral
              )

              actualProtocolFee = feeResult.protocolFee
              actualTradingFee = feeResult.tradingFee
              actualReferralFee = feeResult.referralFee

              return feeResult.amount
          })()
        : amountIn

    const swapAmountFromInput =
        tradeDirection === TradeDirection.BaseToQuote
            ? calculateBaseToQuoteFromAmountIn(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn
              )
            : calculateQuoteToBaseFromAmountIn(
                  config,
                  virtualPool.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )

    const { outputAmount, nextSqrtPrice, amountLeft } = swapAmountFromInput

    const includedFeeInputAmount = !amountLeft.isZero()
        ? (() => {
              actualAmountIn = SafeMath.sub(actualAmountIn, amountLeft)

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

                  return includedFeeAmount
              } else {
                  return actualAmountIn
              }
          })()
        : amountIn

    const actualAmountOut = feeMode.feesOnInput
        ? outputAmount
        : (() => {
              const feeResult = getFeeOnAmount(
                  tradeFeeNumerator,
                  outputAmount,
                  config.poolFees,
                  feeMode.hasReferral
              )

              actualProtocolFee = feeResult.protocolFee
              actualTradingFee = feeResult.tradingFee
              actualReferralFee = feeResult.referralFee

              return feeResult.amount
          })()

    return {
        amountLeft,
        includedFeeInputAmount,
        excludedFeeInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice,
        tradingFee: actualTradingFee,
        protocolFee: actualProtocolFee,
        referralFee: actualReferralFee,
    }
}

/**
 * Calculate output amount from base to quote from amount in
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param amountIn Input amount
 * @param stopSqrtPrice Stop sqrt price
 * @returns Swap amount
 */
export function calculateBaseToQuoteFromAmountIn(
    configState: {
        curve: Array<{
            sqrtPrice: BN
            liquidity: BN
        }>
    },
    currentSqrtPrice: BN,
    amountIn: BN
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

    // Use curve.length for backward compatibility for existing pools with 20 points
    for (let i = configState.curve.length - 2; i >= 0; i--) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            continue
        }

        if (configState.curve[i].sqrtPrice.lt(currentSqrtPriceLocal)) {
            const maxAmountIn = getDeltaAmountBaseUnsigned(
                configState.curve[i].sqrtPrice,
                currentSqrtPriceLocal,
                configState.curve[i + 1].liquidity,
                Rounding.Up
            )

            if (amountLeft.lt(maxAmountIn)) {
                const nextSqrtPrice = getNextSqrtPriceFromInput(
                    currentSqrtPriceLocal,
                    configState.curve[i + 1].liquidity,
                    amountLeft,
                    true
                )

                const outputAmount = getDeltaAmountQuoteUnsigned(
                    nextSqrtPrice,
                    currentSqrtPriceLocal,
                    configState.curve[i + 1].liquidity,
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
                    configState.curve[i + 1].liquidity,
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

        const outputAmount = getDeltaAmountQuoteUnsigned(
            nextSqrtPrice,
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            Rounding.Down
        )

        totalOutputAmount = SafeMath.add(totalOutputAmount, outputAmount)
        currentSqrtPriceLocal = nextSqrtPrice
    }

    // no need to validate amount_left because if user sell more than what has in quote reserve,
    // then it will be failed when deduct pool.quote_reserve
    return {
        outputAmount: totalOutputAmount,
        nextSqrtPrice: currentSqrtPriceLocal,
        amountLeft: new BN(0),
    }
}

/**
 * Calculate output amount from quote to base from amount in
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param amountIn Input amount
 * @param stopSqrtPrice Stop sqrt price
 * @returns Swap amount
 */
export function calculateQuoteToBaseFromAmountIn(
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

    // Use curve.len() for backward compatibility for existing pools with 20 points
    for (let i = 0; i < configState.curve.length; i++) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            break
        }

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
              const [includedFeeOutAmount, feeAmount] = getIncludedFeeAmount(
                  tradeFeeNumerator,
                  amountOut
              )

              // that ensure includedFeeOutAmount = amountOut + tradingFee + protocolFee + referralFee
              const [tradingFee, protocolFee, referralFee] = splitFees(
                  config.poolFees,
                  feeAmount,
                  feeMode.hasReferral
              )

              actualTradingFee = tradingFee
              actualProtocolFee = protocolFee
              actualReferralFee = referralFee
              return includedFeeOutAmount
          })()

    const swapAmountFromOutput = (() => {
        switch (tradeDirection) {
            case TradeDirection.BaseToQuote:
                return calculateBaseToQuoteFromAmountOut(
                    config,
                    virtualPool.sqrtPrice,
                    includedFeeOutAmount
                )
            case TradeDirection.QuoteToBase:
                return calculateQuoteToBaseFromAmountOut(
                    config,
                    virtualPool.sqrtPrice,
                    includedFeeOutAmount
                )
        }
    })()

    const { outputAmount: amountIn, nextSqrtPrice } = swapAmountFromOutput

    if (nextSqrtPrice.gt(config.migrationSqrtPrice)) {
        throw new Error('Swap amount is over a threshold')
    }

    const [excludedFeeInputAmount, includedFeeInputAmount] = feeMode.feesOnInput
        ? (() => {
              const tradeFeeNumerator =
                  getTotalFeeNumeratorFromExcludedFeeAmount(
                      config.poolFees,
                      virtualPool.volatilityTracker,
                      currentPoint,
                      virtualPool.activationPoint,
                      amountIn,
                      tradeDirection
                  )

              const [includedFeeInAmount, feeAmount] = getIncludedFeeAmount(
                  tradeFeeNumerator,
                  amountIn
              )

              // that ensure includedFeeInAmount = excludedFeeInputAmount + tradingFee + protocolFee + referralFee
              const [tradingFee, protocolFee, referralFee] = splitFees(
                  config.poolFees,
                  feeAmount,
                  feeMode.hasReferral
              )

              actualTradingFee = tradingFee
              actualProtocolFee = protocolFee
              actualReferralFee = referralFee
              return [amountIn, includedFeeInAmount]
          })()
        : [amountIn, amountIn]

    return {
        amountLeft: new BN(0),
        includedFeeInputAmount,
        excludedFeeInputAmount,
        outputAmount: amountOut,
        nextSqrtPrice,
        tradingFee: actualTradingFee,
        protocolFee: actualProtocolFee,
        referralFee: actualReferralFee,
    }
}

/**
 * Calculate input amount from base to quote from amount out
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param outAmount Quote output amount
 * @returns Swap amount with input calculated
 */
export function calculateBaseToQuoteFromAmountOut(
    configState: PoolConfig,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmount {
    let currentSqrtPriceLocal = currentSqrtPrice
    let amountLeft = outAmount
    let totalAmountIn = new BN(0)

    // Use curve.len() for backward compatibility for existing pools with 20 points
    for (let i = configState.curve.length - 2; i >= 0; i--) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            continue
        }

        if (configState.curve[i].sqrtPrice.lt(currentSqrtPriceLocal)) {
            const maxAmountOut = getDeltaAmountQuoteUnsigned(
                configState.curve[i].sqrtPrice,
                currentSqrtPriceLocal,
                configState.curve[i + 1].liquidity,
                Rounding.Down
            )

            if (amountLeft.lt(maxAmountOut)) {
                const nextSqrtPrice = getNextSqrtPriceFromOutput(
                    currentSqrtPriceLocal,
                    configState.curve[i + 1].liquidity,
                    amountLeft,
                    true
                )

                const inAmount = getDeltaAmountBaseUnsigned(
                    nextSqrtPrice,
                    currentSqrtPriceLocal,
                    configState.curve[i + 1].liquidity,
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
                    configState.curve[i + 1].liquidity,
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
 * Calculate input amount from quote to base from amount out
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param outAmount Base output amount
 * @returns Swap amount with input calculated
 */
export function calculateQuoteToBaseFromAmountOut(
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
