import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
    getNextSqrtPriceFromInput,
    getNextSqrtPriceFromOutput,
} from './curve'
import { getBaseFeeNumerator, getFeeOnAmount, getVariableFee } from './feeMath'
import {
    CollectFeeMode,
    Rounding,
    TradeDirection,
    type FeeMode,
    type FeeOnAmountResult,
    type PoolConfig,
    type QuoteResult,
    type SwapAmount,
    type VirtualPool,
} from '../types'
import { FEE_DENOMINATOR, MAX_FEE_NUMERATOR } from '../constants'

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
): QuoteResult {
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
                  actualAmountIn
              )
            : getSwapAmountFromQuoteToBase(
                  configState,
                  poolState.sqrtPrice,
                  actualAmountIn
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
        amountOut: actualAmountOut,
        minimumAmountOut: actualAmountOut,
        nextSqrtPrice: swapAmount.nextSqrtPrice,
        fee: {
            trading: actualTradingFee,
            protocol: actualProtocolFee,
            referral: actualReferralFee,
        },
        price: {
            beforeSwap: poolState.sqrtPrice,
            afterSwap: swapAmount.nextSqrtPrice,
        },
    }
}

/**
 * Get swap amount from base to quote
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param amountIn Input amount
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
    amountIn: BN
): SwapAmount {
    if (amountIn.isZero()) {
        return {
            outputAmount: new BN(0),
            nextSqrtPrice: currentSqrtPrice,
        }
    }

    // track total output with BN
    let totalOutputAmount = new BN(0)
    let sqrtPrice = currentSqrtPrice
    let amountLeft = amountIn

    // iterate through the curve points in reverse order
    for (let i = configState.curve.length - 1; i >= 0; i--) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            continue
        }

        if (configState.curve[i].sqrtPrice.lt(sqrtPrice)) {
            // get the current liquidity
            const currentLiquidity =
                i + 1 < configState.curve.length
                    ? configState.curve[i + 1].liquidity
                    : configState.curve[i].liquidity

            // skip if liquidity is zero
            if (currentLiquidity.isZero()) continue

            const maxAmountIn = getDeltaAmountBaseUnsigned(
                configState.curve[i].sqrtPrice,
                sqrtPrice,
                currentLiquidity,
                Rounding.Up
            )

            if (amountLeft.lt(maxAmountIn)) {
                const nextSqrtPrice = getNextSqrtPriceFromInput(
                    sqrtPrice,
                    currentLiquidity,
                    amountLeft,
                    true
                )

                const outputAmount = getDeltaAmountQuoteUnsigned(
                    nextSqrtPrice,
                    sqrtPrice,
                    currentLiquidity,
                    Rounding.Down
                )

                // add to total
                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                sqrtPrice = nextSqrtPrice
                amountLeft = new BN(0)
                break
            } else {
                const nextSqrtPrice = configState.curve[i].sqrtPrice
                const outputAmount = getDeltaAmountQuoteUnsigned(
                    nextSqrtPrice,
                    sqrtPrice,
                    currentLiquidity,
                    Rounding.Down
                )

                // add to total
                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                sqrtPrice = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, maxAmountIn)
            }
        }
    }

    if (!amountLeft.isZero() && !configState.curve[0].liquidity.isZero()) {
        const nextSqrtPrice = getNextSqrtPriceFromInput(
            sqrtPrice,
            configState.curve[0].liquidity,
            amountLeft,
            true
        )

        const outputAmount = getDeltaAmountQuoteUnsigned(
            nextSqrtPrice,
            sqrtPrice,
            configState.curve[0].liquidity,
            Rounding.Down
        )

        // add to total
        totalOutputAmount = SafeMath.add(totalOutputAmount, outputAmount)
        sqrtPrice = nextSqrtPrice
    }

    return {
        outputAmount: totalOutputAmount,
        nextSqrtPrice: sqrtPrice,
    }
}

/**
 * Get swap amount from quote to base
 * @param configState Config state
 * @param currentSqrtPrice Current sqrt price
 * @param amountIn Input amount
 * @returns Swap amount
 * @throws Error if not enough liquidity
 */
export function getSwapAmountFromQuoteToBase(
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
        }
    }

    let totalOutputAmount = new BN(0)
    let sqrtPrice = currentSqrtPrice
    let amountLeft = amountIn

    // iterate through the curve points
    for (let i = 0; i < configState.curve.length; i++) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            break
        }

        // skip if liquidity is zero
        if (configState.curve[i].liquidity.isZero()) continue

        if (configState.curve[i].sqrtPrice.gt(sqrtPrice)) {
            const maxAmountIn = getDeltaAmountQuoteUnsigned(
                sqrtPrice,
                configState.curve[i].sqrtPrice,
                configState.curve[i].liquidity,
                Rounding.Up
            )

            if (amountLeft.lt(maxAmountIn)) {
                const nextSqrtPrice = getNextSqrtPriceFromInput(
                    sqrtPrice,
                    configState.curve[i].liquidity,
                    amountLeft,
                    false
                )

                const outputAmount = getDeltaAmountBaseUnsigned(
                    sqrtPrice,
                    nextSqrtPrice,
                    configState.curve[i].liquidity,
                    Rounding.Down
                )

                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                sqrtPrice = nextSqrtPrice
                amountLeft = new BN(0)
                break
            } else {
                const nextSqrtPrice = configState.curve[i].sqrtPrice
                const outputAmount = getDeltaAmountBaseUnsigned(
                    sqrtPrice,
                    nextSqrtPrice,
                    configState.curve[i].liquidity,
                    Rounding.Down
                )

                totalOutputAmount = SafeMath.add(
                    totalOutputAmount,
                    outputAmount
                )
                sqrtPrice = nextSqrtPrice
                amountLeft = SafeMath.sub(amountLeft, maxAmountIn)
            }
        }
    }

    // check if all amount was processed
    if (!amountLeft.isZero()) {
        throw new Error('Not enough liquidity to process the entire amount')
    }

    return {
        outputAmount: totalOutputAmount,
        nextSqrtPrice: sqrtPrice,
    }
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
    const quoteToBase = tradeDirection === TradeDirection.QuoteToBase
    const feesOnInput =
        quoteToBase && collectFeeMode === CollectFeeMode.QuoteToken
    const feesOnBaseToken =
        quoteToBase && collectFeeMode === CollectFeeMode.OutputToken

    return {
        feesOnInput,
        feesOnBaseToken,
        hasReferral,
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
export async function swapQuoteExactIn(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN
): Promise<QuoteResult> {
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

    // calculate minimum amount out if slippage is provided
    if (slippageBps > 0) {
        // slippage factor: (10000 - slippageBps) / 10000
        const slippageFactor = new BN(10000 - slippageBps)
        const denominator = new BN(10000)

        // minimum amount out: amountOut * (10000 - slippageBps) / 10000
        const minimumAmountOut = result.amountOut
            .mul(slippageFactor)
            .div(denominator)

        return {
            ...result,
            minimumAmountOut,
        }
    }

    return result
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
export function calculateQuoteRemainingCurveAmount(
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

/**
 * Get excluded fee amount from included fee amount
 * @param tradeFeeNumerator Trade fee numerator
 * @param includedFeeAmount Included fee amount
 * @returns [excluded fee amount, trading fee]
 */
export function getExcludedFeeAmount(
    tradeFeeNumerator: BN,
    includedFeeAmount: BN
): [BN, BN] {
    const tradingFee = mulDiv(
        includedFeeAmount,
        tradeFeeNumerator,
        new BN(FEE_DENOMINATOR),
        Rounding.Up
    )

    const excludedFeeAmount = SafeMath.sub(includedFeeAmount, tradingFee)
    return [excludedFeeAmount, tradingFee]
}

/**
 * Get included fee amount from excluded fee amount
 * @param tradeFeeNumerator Trade fee numerator
 * @param excludedFeeAmount Excluded fee amount
 * @returns Included fee amount
 */
export function getIncludedFeeAmount(
    tradeFeeNumerator: BN,
    excludedFeeAmount: BN
): BN {
    const includedFeeAmount = mulDiv(
        excludedFeeAmount,
        new BN(FEE_DENOMINATOR),
        new BN(FEE_DENOMINATOR).sub(tradeFeeNumerator),
        Rounding.Up
    )

    // sanity check - verify the inverse calculation
    const [inverseAmount] = getExcludedFeeAmount(
        tradeFeeNumerator,
        includedFeeAmount
    )
    if (inverseAmount.lt(excludedFeeAmount)) {
        throw new Error('Inverse amount is less than excluded_fee_amount')
    }

    return includedFeeAmount
}

/**
 * Get swap result from output amount (reverse calculation)
 * @param poolState Pool state
 * @param configState Config state
 * @param outAmount Output amount
 * @param feeMode Fee mode
 * @param tradeDirection Trade direction
 * @param currentPoint Current point
 * @returns Swap result with input amount calculated
 */
export function getSwapResultFromOutAmount(
    poolState: VirtualPool,
    configState: PoolConfig,
    outAmount: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN
): QuoteResult {
    let actualProtocolFee = new BN(0)
    let actualTradingFee = new BN(0)
    let actualReferralFee = new BN(0)

    // get total trading fee numerator
    const baseFeeNumerator = getBaseFeeNumerator(
        configState.poolFees.baseFee,
        tradeDirection,
        currentPoint,
        poolState.activationPoint
    )

    let tradeFeeNumerator = baseFeeNumerator
    if (configState.poolFees.dynamicFee.initialized !== 0) {
        const variableFee = getVariableFee(
            configState.poolFees.dynamicFee,
            poolState.volatilityTracker
        )
        tradeFeeNumerator = SafeMath.add(tradeFeeNumerator, variableFee)
    }

    // cap at MAX_FEE_NUMERATOR
    tradeFeeNumerator = BN.min(tradeFeeNumerator, new BN(MAX_FEE_NUMERATOR))

    // calculate included fee amount based on fee mode
    const includedFeeOutAmount = feeMode.feesOnInput
        ? outAmount
        : getIncludedFeeAmount(tradeFeeNumerator, outAmount)

    // apply fees on output if not on input
    if (!feeMode.feesOnInput) {
        const feeResult: FeeOnAmountResult = getFeeOnAmount(
            includedFeeOutAmount,
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
    }

    // calculate swap amount (reverse calculation)
    const swapAmount: SwapAmount =
        tradeDirection === TradeDirection.BaseToQuote
            ? getInAmountFromBaseToQuote(
                  configState,
                  poolState.sqrtPrice,
                  includedFeeOutAmount
              )
            : getInAmountFromQuoteToBase(
                  configState,
                  poolState.sqrtPrice,
                  includedFeeOutAmount
              )

    // calculate included fee input amount if fees are on input
    const includedFeeInAmount = feeMode.feesOnInput
        ? getIncludedFeeAmount(tradeFeeNumerator, swapAmount.outputAmount)
        : swapAmount.outputAmount

    // apply fees on input if needed
    if (feeMode.feesOnInput) {
        const feeResult: FeeOnAmountResult = getFeeOnAmount(
            includedFeeInAmount,
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
    }

    return {
        amountOut: includedFeeInAmount,
        minimumAmountOut: outAmount,
        nextSqrtPrice: swapAmount.nextSqrtPrice,
        fee: {
            trading: actualTradingFee,
            protocol: actualProtocolFee,
            referral: actualReferralFee,
        },
        price: {
            beforeSwap: poolState.sqrtPrice,
            afterSwap: swapAmount.nextSqrtPrice,
        },
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

    // iterate through curve points in reverse order
    for (let i = configState.curve.length - 1; i >= 0; i--) {
        if (
            configState.curve[i].sqrtPrice.isZero() ||
            configState.curve[i].liquidity.isZero()
        ) {
            continue
        }

        if (configState.curve[i].sqrtPrice.lt(currentSqrtPriceLocal)) {
            const currentLiquidity =
                i + 1 < configState.curve.length
                    ? configState.curve[i + 1].liquidity
                    : configState.curve[i].liquidity

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
): QuoteResult {
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

    const result = getSwapResultFromOutAmount(
        virtualPool,
        config,
        outAmount,
        feeMode,
        tradeDirection,
        currentPoint
    )

    // calculate maximum amount in if slippage is provided
    if (slippageBps > 0) {
        // slippage factor: (10000 + slippageBps) / 10000
        const slippageFactor = new BN(10000 + slippageBps)
        const denominator = new BN(10000)

        // maximum amount in: amountIn * (10000 + slippageBps) / 10000
        const maximumAmountIn = result.amountOut
            .mul(slippageFactor)
            .div(denominator)

        return {
            ...result,
            amountOut: maximumAmountIn,
            minimumAmountOut: outAmount,
        }
    }

    return {
        ...result,
        minimumAmountOut: outAmount,
    }
}
