import BN from 'bn.js'
import { SafeMath } from './safeMath'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountBaseUnsigned256,
    getDeltaAmountQuoteUnsigned,
    getDeltaAmountQuoteUnsigned256,
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
import { getBaseFeeHandler } from './poolFees/baseFee'
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
    type QuoteTransferFees,
} from '../types'
import {
    calculateTransferFeeExcludedAmount,
    calculateTransferFeeIncludedAmount,
    resolveSwapTransferFees,
} from './transferFee'
import { MAX_BASIS_POINT, U64_MAX } from '../constants'

function addU64(total: BN, amount: BN): BN {
    const sum = total.add(amount)
    if (sum.gt(U64_MAX)) {
        throw new Error('Math overflow')
    }
    return sum
}

function u64(amount: BN): BN {
    if (amount.gt(U64_MAX)) {
        throw new Error('Math overflow')
    }
    return amount
}

function minimumAmountOutWithSlippage(amount: BN, slippageBps: number): BN {
    if (slippageBps > 0) {
        return amount
            .mul(new BN(MAX_BASIS_POINT - slippageBps))
            .div(new BN(MAX_BASIS_POINT))
    }
    return amount
}

function maximumAmountInWithSlippage(amount: BN, slippageBps: number): BN {
    if (slippageBps > 0) {
        return amount
            .mul(new BN(MAX_BASIS_POINT + slippageBps))
            .div(new BN(MAX_BASIS_POINT))
    }
    return amount
}

// the caller still has to bundle the swap after initialize pool in the same transaction, without CPI
function isFirstSwapWithMinFee(
    virtualPool: VirtualPool,
    config: PoolConfig,
    hasReferral: boolean,
    eligibleForFirstSwapWithMinFee: boolean
): boolean {
    return (
        eligibleForFirstSwapWithMinFee &&
        !hasReferral &&
        Number(config.enableFirstSwapWithMinFee ?? 0) === 1 &&
        Number(virtualPool.poolState.hasSwap ?? 0) === 0
    )
}

function beginSwapQuote(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amount: BN,
    hasReferral: boolean,
    transferFees?: QuoteTransferFees
): {
    tradeDirection: TradeDirection
    feeMode: FeeMode
    input: ReturnType<typeof resolveSwapTransferFees>['input']
    output: ReturnType<typeof resolveSwapTransferFees>['output']
} {
    if (
        virtualPool.poolState.quoteReserve.gte(config.migrationQuoteThreshold)
    ) {
        throw new Error('Virtual pool is completed')
    }

    if (amount.isZero()) {
        throw new Error('Amount is zero')
    }

    const tradeDirection = swapBaseForQuote
        ? TradeDirection.BaseToQuote
        : TradeDirection.QuoteToBase

    return {
        tradeDirection,
        feeMode: getFeeMode(config.collectFeeMode, tradeDirection, hasReferral),
        ...resolveSwapTransferFees(config, swapBaseForQuote, transferFees),
    }
}

export function getSwapResult(
    virtualPool: VirtualPool,
    configState: PoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    const baseFeeHandler = getBaseFeeHandler(
        configState.poolFees.baseFee.cliffFeeNumerator,
        configState.poolFees.baseFee.firstFactor,
        configState.poolFees.baseFee.secondFactor,
        configState.poolFees.baseFee.thirdFactor,
        configState.poolFees.baseFee.baseFeeMode
    )

    const tradeFeeNumerator = eligibleForFirstSwapWithMinFee
        ? baseFeeHandler.getMinBaseFeeNumerator()
        : getTotalFeeNumeratorFromIncludedFeeAmount(
              configState.poolFees,
              virtualPool.poolState.volatilityTracker,
              currentPoint,
              virtualPool.poolState.activationPoint,
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
                  virtualPool.poolState.sqrtPrice,
                  actualAmountIn
              )
            : calculateQuoteToBaseFromAmountIn(
                  configState,
                  virtualPool.poolState.sqrtPrice,
                  actualAmountIn,
                  configState.migrationSqrtPrice
              )

    const { outputAmount, nextSqrtPrice, amountLeft } = swapAmountFromInput

    if (!amountLeft.isZero()) {
        throw new Error('Liquidity in bonding curve is insufficient')
    }

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

export function swapQuote(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean,
    transferFees?: QuoteTransferFees
): SwapQuoteResult {
    const { tradeDirection, feeMode, input, output } = beginSwapQuote(
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn,
        hasReferral,
        transferFees
    )
    const excludedAmountIn = calculateTransferFeeExcludedAmount(
        input,
        amountIn
    ).amount
    if (excludedAmountIn.isZero()) {
        throw new Error('Amount is zero')
    }

    const result = getSwapResult(
        virtualPool,
        config,
        excludedAmountIn,
        feeMode,
        tradeDirection,
        currentPoint,
        isFirstSwapWithMinFee(
            virtualPool,
            config,
            hasReferral,
            eligibleForFirstSwapWithMinFee
        )
    )
    const excludedAmountOut = calculateTransferFeeExcludedAmount(
        output,
        result.outputAmount
    ).amount

    return {
        ...result,
        minimumAmountOut: minimumAmountOutWithSlippage(
            excludedAmountOut,
            slippageBps
        ),
        includedTransferFeeAmountIn: amountIn,
        excludedTransferFeeAmountOut: excludedAmountOut,
    }
}

export function getSwapResultFromExactInput(
    virtualPool: VirtualPool,
    config: PoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2 {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    const baseFeeHandler = getBaseFeeHandler(
        config.poolFees.baseFee.cliffFeeNumerator,
        config.poolFees.baseFee.firstFactor,
        config.poolFees.baseFee.secondFactor,
        config.poolFees.baseFee.thirdFactor,
        config.poolFees.baseFee.baseFeeMode
    )

    const tradeFeeNumerator = eligibleForFirstSwapWithMinFee
        ? baseFeeHandler.getMinBaseFeeNumerator()
        : getTotalFeeNumeratorFromIncludedFeeAmount(
              config.poolFees,
              virtualPool.poolState.volatilityTracker,
              currentPoint,
              virtualPool.poolState.activationPoint,
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
                  virtualPool.poolState.sqrtPrice,
                  actualAmountIn
              )
            : calculateQuoteToBaseFromAmountIn(
                  config,
                  virtualPool.poolState.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )

    const { outputAmount, nextSqrtPrice, amountLeft } = swapAmountFromInput

    if (!amountLeft.isZero()) {
        throw new Error('Liquidity in bonding curve is insufficient')
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

export function getSwapResultFromPartialInput(
    virtualPool: VirtualPool,
    config: PoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2 {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    const baseFeeHandler = getBaseFeeHandler(
        config.poolFees.baseFee.cliffFeeNumerator,
        config.poolFees.baseFee.firstFactor,
        config.poolFees.baseFee.secondFactor,
        config.poolFees.baseFee.thirdFactor,
        config.poolFees.baseFee.baseFeeMode
    )

    const tradeFeeNumerator = eligibleForFirstSwapWithMinFee
        ? baseFeeHandler.getMinBaseFeeNumerator()
        : getTotalFeeNumeratorFromIncludedFeeAmount(
              config.poolFees,
              virtualPool.poolState.volatilityTracker,
              currentPoint,
              virtualPool.poolState.activationPoint,
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
                  virtualPool.poolState.sqrtPrice,
                  actualAmountIn
              )
            : calculateQuoteToBaseFromAmountIn(
                  config,
                  virtualPool.poolState.sqrtPrice,
                  actualAmountIn,
                  config.migrationSqrtPrice
              )

    const { outputAmount, nextSqrtPrice, amountLeft } = swapAmountFromInput

    const includedFeeInputAmount = !amountLeft.isZero()
        ? (() => {
              actualAmountIn = SafeMath.sub(actualAmountIn, amountLeft)

              if (feeMode.feesOnInput) {
                  const tradeFeeNumeratorPartial =
                      eligibleForFirstSwapWithMinFee
                          ? baseFeeHandler.getMinBaseFeeNumerator()
                          : getTotalFeeNumeratorFromExcludedFeeAmount(
                                config.poolFees,
                                virtualPool.poolState.volatilityTracker,
                                currentPoint,
                                virtualPool.poolState.activationPoint,
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

export function calculateBaseToQuoteFromAmountIn(
    configState: {
        curve: Array<{
            sqrtPrice: BN
            liquidity: BN
        }>
        sqrtStartPrice: BN
    },
    currentSqrtPrice: BN,
    amountIn: BN
): SwapAmount {
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
            const maxAmountIn = getDeltaAmountBaseUnsigned256(
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

                totalOutputAmount = addU64(totalOutputAmount, outputAmount)
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

                totalOutputAmount = addU64(totalOutputAmount, outputAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, u64(maxAmountIn))
            }
        }
    }

    if (!amountLeft.isZero()) {
        let nextSqrtPrice = getNextSqrtPriceFromInput(
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            amountLeft,
            true
        )

        if (nextSqrtPrice.lt(configState.sqrtStartPrice)) {
            nextSqrtPrice = configState.sqrtStartPrice

            const amountIn = getDeltaAmountBaseUnsigned(
                nextSqrtPrice,
                currentSqrtPriceLocal,
                configState.curve[0].liquidity,
                Rounding.Up
            )
            amountLeft = SafeMath.sub(amountLeft, amountIn)
        } else {
            amountLeft = new BN(0)
        }

        const outputAmount = getDeltaAmountQuoteUnsigned(
            nextSqrtPrice,
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            Rounding.Down
        )

        totalOutputAmount = addU64(totalOutputAmount, outputAmount)
        currentSqrtPriceLocal = nextSqrtPrice
    }

    return {
        amountLeft,
        outputAmount: totalOutputAmount,
        nextSqrtPrice: currentSqrtPriceLocal,
    }
}

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
            const maxAmountIn = getDeltaAmountQuoteUnsigned256(
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

                totalOutputAmount = addU64(totalOutputAmount, outputAmount)
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

                totalOutputAmount = addU64(totalOutputAmount, outputAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, u64(maxAmountIn))

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

export function getSwapResultFromExactOutput(
    virtualPool: VirtualPool,
    config: PoolConfig,
    amountOut: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2 {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    const baseFeeHandler = getBaseFeeHandler(
        config.poolFees.baseFee.cliffFeeNumerator,
        config.poolFees.baseFee.firstFactor,
        config.poolFees.baseFee.secondFactor,
        config.poolFees.baseFee.thirdFactor,
        config.poolFees.baseFee.baseFeeMode
    )

    const includedFeeOutAmount = feeMode.feesOnInput
        ? amountOut
        : (() => {
              const tradeFeeNumerator = eligibleForFirstSwapWithMinFee
                  ? baseFeeHandler.getMinBaseFeeNumerator()
                  : getTotalFeeNumeratorFromExcludedFeeAmount(
                        config.poolFees,
                        virtualPool.poolState.volatilityTracker,
                        currentPoint,
                        virtualPool.poolState.activationPoint,
                        amountOut,
                        tradeDirection
                    )
              const [includedFeeOutAmount, feeAmount] = getIncludedFeeAmount(
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
              return includedFeeOutAmount
          })()

    const swapAmountFromOutput = (() => {
        switch (tradeDirection) {
            case TradeDirection.BaseToQuote:
                return calculateBaseToQuoteFromAmountOut(
                    config,
                    virtualPool.poolState.sqrtPrice,
                    includedFeeOutAmount
                )
            case TradeDirection.QuoteToBase:
                return calculateQuoteToBaseFromAmountOut(
                    config,
                    virtualPool.poolState.sqrtPrice,
                    includedFeeOutAmount
                )
        }
    })()

    const { outputAmount: amountIn, nextSqrtPrice } = swapAmountFromOutput

    if (nextSqrtPrice.gt(config.migrationSqrtPrice)) {
        throw new Error('Liquidity in bonding curve is insufficient')
    }

    const [excludedFeeInputAmount, includedFeeInputAmount] = feeMode.feesOnInput
        ? (() => {
              const tradeFeeNumerator = eligibleForFirstSwapWithMinFee
                  ? baseFeeHandler.getMinBaseFeeNumerator()
                  : getTotalFeeNumeratorFromExcludedFeeAmount(
                        config.poolFees,
                        virtualPool.poolState.volatilityTracker,
                        currentPoint,
                        virtualPool.poolState.activationPoint,
                        amountIn,
                        tradeDirection
                    )

              const [includedFeeInAmount, feeAmount] = getIncludedFeeAmount(
                  tradeFeeNumerator,
                  amountIn
              )

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
            const maxAmountOut = getDeltaAmountQuoteUnsigned256(
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

                totalAmountIn = addU64(totalAmountIn, inAmount)
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

                totalAmountIn = addU64(totalAmountIn, inAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, u64(maxAmountOut))
            }
        }
    }

    if (!amountLeft.isZero()) {
        const maxAmountOut = getDeltaAmountQuoteUnsigned256(
            configState.sqrtStartPrice,
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            Rounding.Down
        )

        if (amountLeft.gt(maxAmountOut)) {
            throw new Error('Liquidity in bonding curve is insufficient')
        }

        const nextSqrtPrice = getNextSqrtPriceFromOutput(
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            amountLeft,
            true
        )

        if (nextSqrtPrice.lt(configState.sqrtStartPrice)) {
            throw new Error('Liquidity in bonding curve is insufficient')
        }

        const inAmount = getDeltaAmountBaseUnsigned(
            nextSqrtPrice,
            currentSqrtPriceLocal,
            configState.curve[0].liquidity,
            Rounding.Up
        )

        totalAmountIn = addU64(totalAmountIn, inAmount)
        currentSqrtPriceLocal = nextSqrtPrice
    }

    return {
        outputAmount: totalAmountIn,
        nextSqrtPrice: currentSqrtPriceLocal,
        amountLeft: new BN(0),
    }
}

export function calculateQuoteToBaseFromAmountOut(
    configState: PoolConfig,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmount {
    let totalInAmount = new BN(0)
    let currentSqrtPriceLocal = currentSqrtPrice
    let amountLeft = outAmount

    for (let i = 0; i < configState.curve.length; i++) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            break
        }

        if (configState.curve[i].sqrtPrice.gt(currentSqrtPriceLocal)) {
            const maxAmountOut = getDeltaAmountBaseUnsigned256(
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

                totalInAmount = addU64(totalInAmount, inAmount)
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

                totalInAmount = addU64(totalInAmount, inAmount)
                currentSqrtPriceLocal = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, u64(maxAmountOut))
            }
        }
    }

    if (!amountLeft.isZero()) {
        throw new Error('Amount left is not zero')
    }

    return {
        outputAmount: totalInAmount,
        nextSqrtPrice: currentSqrtPriceLocal,
        amountLeft: new BN(0),
    }
}

export function swapQuoteExactIn(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean,
    transferFees?: QuoteTransferFees
): SwapQuote2Result {
    const { tradeDirection, feeMode, input, output } = beginSwapQuote(
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn,
        hasReferral,
        transferFees
    )
    const excludedAmountIn = calculateTransferFeeExcludedAmount(
        input,
        amountIn
    ).amount
    if (excludedAmountIn.isZero()) {
        throw new Error('Amount is zero')
    }

    const result = getSwapResultFromExactInput(
        virtualPool,
        config,
        excludedAmountIn,
        feeMode,
        tradeDirection,
        currentPoint,
        isFirstSwapWithMinFee(
            virtualPool,
            config,
            hasReferral,
            eligibleForFirstSwapWithMinFee
        )
    )
    const excludedAmountOut = calculateTransferFeeExcludedAmount(
        output,
        result.outputAmount
    ).amount

    return {
        ...result,
        minimumAmountOut: minimumAmountOutWithSlippage(
            excludedAmountOut,
            slippageBps
        ),
        includedTransferFeeAmountIn: amountIn,
        excludedTransferFeeAmountOut: excludedAmountOut,
    }
}

export function swapQuotePartialFill(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean,
    transferFees?: QuoteTransferFees
): SwapQuote2Result {
    const { tradeDirection, feeMode, input, output } = beginSwapQuote(
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn,
        hasReferral,
        transferFees
    )
    const excludedAmountIn = calculateTransferFeeExcludedAmount(
        input,
        amountIn
    ).amount
    if (excludedAmountIn.isZero()) {
        throw new Error('Amount is zero')
    }

    const result = getSwapResultFromPartialInput(
        virtualPool,
        config,
        excludedAmountIn,
        feeMode,
        tradeDirection,
        currentPoint,
        isFirstSwapWithMinFee(
            virtualPool,
            config,
            hasReferral,
            eligibleForFirstSwapWithMinFee
        )
    )
    const includedAmountIn = result.amountLeft.isZero()
        ? amountIn
        : calculateTransferFeeIncludedAmount(
              input,
              result.includedFeeInputAmount
          ).amount
    const excludedAmountOut = calculateTransferFeeExcludedAmount(
        output,
        result.outputAmount
    ).amount
    // A partial fill with an active rate limiter can reconstruct an input above amountIn
    if (includedAmountIn.gt(amountIn)) {
        throw new Error('Required input amount exceeds the provided amount in')
    }

    return {
        ...result,
        minimumAmountOut: minimumAmountOutWithSlippage(
            excludedAmountOut,
            slippageBps
        ),
        includedTransferFeeAmountIn: includedAmountIn,
        excludedTransferFeeAmountOut: excludedAmountOut,
    }
}

export function swapQuoteExactOut(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    outAmount: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean,
    transferFees?: QuoteTransferFees
): SwapQuote2Result {
    const { tradeDirection, feeMode, input, output } = beginSwapQuote(
        virtualPool,
        config,
        swapBaseForQuote,
        outAmount,
        hasReferral,
        transferFees
    )
    const includedAmountOut = calculateTransferFeeIncludedAmount(
        output,
        outAmount
    ).amount
    if (includedAmountOut.isZero()) {
        throw new Error('Amount is zero')
    }

    const result = getSwapResultFromExactOutput(
        virtualPool,
        config,
        includedAmountOut,
        feeMode,
        tradeDirection,
        currentPoint,
        isFirstSwapWithMinFee(
            virtualPool,
            config,
            hasReferral,
            eligibleForFirstSwapWithMinFee
        )
    )
    const includedAmountIn = calculateTransferFeeIncludedAmount(
        input,
        result.includedFeeInputAmount
    ).amount

    return {
        ...result,
        maximumAmountIn: maximumAmountInWithSlippage(
            includedAmountIn,
            slippageBps
        ),
        includedTransferFeeAmountIn: includedAmountIn,
        excludedTransferFeeAmountOut: outAmount,
    }
}
