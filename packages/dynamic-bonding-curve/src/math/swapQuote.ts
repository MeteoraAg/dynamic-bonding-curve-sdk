import BN from 'bn.js'
import { SafeMath } from './safeMath'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
    getNextSqrtPriceFromInput,
} from './curve'
import { getFeeOnAmount } from './feeMath'
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
            poolState.volatilityTracker
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
            poolState.volatilityTracker
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
        quoteToBase && collectFeeMode === CollectFeeMode.OnlyQuote
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
 * Matches Rust's quote_exact_in function
 */
export async function swapQuote(
    virtualPool: VirtualPool,
    config: PoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    hasReferral: boolean = false,
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

    return getSwapResult(
        virtualPool,
        config,
        amountIn,
        feeMode,
        tradeDirection,
        currentPoint
    )
}
