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
    TradeDirection,
    type FeeMode,
    type QuotePoolConfig,
    type QuoteTransferFees,
    type QuoteVirtualPool,
    type SwapAmount,
    type SwapQuote2Result,
    type SwapQuoteResult,
    type SwapResult,
    type SwapResult2,
} from '../types'
import {
    calculateTransferFeeExcludedAmount,
    calculateTransferFeeIncludedAmount,
    resolveSwapTransferFees,
} from './transferFee'
import { MAX_BASIS_POINT, U64_MAX } from '../constants'
import { ProgramError } from './errors'

export type SwapAmountFromOutput = {
    amountIn: BN
    nextSqrtPrice: BN
}

type SwapFees = {
    tradingFee: BN
    protocolFee: BN
    referralFee: BN
}

type Curve = Pick<QuotePoolConfig, 'curve' | 'sqrtStartPrice'>

const ZERO = new BN(0)
const NO_FEES: SwapFees = {
    tradingFee: ZERO,
    protocolFee: ZERO,
    referralFee: ZERO,
}

function addU64(total: BN, amount: BN): BN {
    const sum = total.add(amount)
    if (sum.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return sum
}

function u64(amount: BN): BN {
    if (amount.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return amount
}

function assertSlippageBps(slippageBps: number): void {
    if (slippageBps < 0 || slippageBps > MAX_BASIS_POINT) {
        throw new Error(`slippageBps must be between 0 and ${MAX_BASIS_POINT}`)
    }
}

function minimumAmountOutWithSlippage(amount: BN, slippageBps: number): BN {
    assertSlippageBps(slippageBps)
    return amount.muln(MAX_BASIS_POINT - slippageBps).divn(MAX_BASIS_POINT)
}

function maximumAmountInWithSlippage(amount: BN, slippageBps: number): BN {
    assertSlippageBps(slippageBps)
    return amount.muln(MAX_BASIS_POINT + slippageBps).divn(MAX_BASIS_POINT)
}

// the caller still has to bundle the swap after initialize pool in the same transaction, without CPI
function isFirstSwapWithMinFee(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    hasReferral: boolean,
    eligibleForFirstSwapWithMinFee: boolean
): boolean {
    return (
        eligibleForFirstSwapWithMinFee &&
        !hasReferral &&
        config.enableFirstSwapWithMinFee === 1 &&
        virtualPool.poolState.hasSwap === 0
    )
}

function beginSwapQuote(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    swapBaseForQuote: boolean,
    amount: BN,
    hasReferral: boolean,
    transferFees?: QuoteTransferFees
) {
    if (amount.isZero()) {
        throw new Error(ProgramError.AmountIsZero)
    }
    if (
        virtualPool.poolState.quoteReserve.gte(config.migrationQuoteThreshold)
    ) {
        throw new Error(ProgramError.PoolIsCompleted)
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

/** The total fee numerator for a swap, or the minimum base fee for an eligible first swap. */
function tradeFeeNumerator(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    currentPoint: BN,
    tradeDirection: TradeDirection,
    amount: BN,
    amountExcludesFee: boolean,
    eligibleForFirstSwapWithMinFee: boolean
): BN {
    if (eligibleForFirstSwapWithMinFee) {
        const { baseFee } = config.poolFees
        return getBaseFeeHandler(
            baseFee.cliffFeeNumerator,
            baseFee.firstFactor,
            baseFee.secondFactor,
            baseFee.thirdFactor,
            baseFee.baseFeeMode
        ).getMinBaseFeeNumerator()
    }
    const totalFeeNumerator = amountExcludesFee
        ? getTotalFeeNumeratorFromExcludedFeeAmount
        : getTotalFeeNumeratorFromIncludedFeeAmount
    return totalFeeNumerator(
        config.poolFees,
        virtualPool.poolState.volatilityTracker,
        currentPoint,
        virtualPool.poolState.activationPoint,
        amount,
        tradeDirection
    )
}

function takeFee(
    feeNumerator: BN,
    includedFeeAmount: BN,
    hasReferral: boolean
): { amount: BN; fees: SwapFees } {
    const { amount, ...fees } = getFeeOnAmount(
        feeNumerator,
        includedFeeAmount,
        hasReferral
    )
    return { amount, fees }
}

function addFee(
    feeNumerator: BN,
    excludedFeeAmount: BN,
    hasReferral: boolean
): { amount: BN; fees: SwapFees } {
    const [amount, feeAmount] = getIncludedFeeAmount(
        feeNumerator,
        excludedFeeAmount
    )
    const [tradingFee, protocolFee, referralFee] = splitFees(
        feeAmount,
        hasReferral
    )
    return { amount, fees: { tradingFee, protocolFee, referralFee } }
}

function swapFromInput(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    tradeDirection: TradeDirection,
    amountIn: BN
): SwapAmount {
    return tradeDirection === TradeDirection.BaseToQuote
        ? calculateBaseToQuoteFromAmountIn(
              config,
              virtualPool.poolState.sqrtPrice,
              amountIn
          )
        : calculateQuoteToBaseFromAmountIn(
              config,
              virtualPool.poolState.sqrtPrice,
              amountIn,
              config.migrationSqrtPrice
          )
}

/** The program's get_swap_result_from_exact_input. */
export function getSwapResultFromExactInput(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2 {
    const feeNumerator = tradeFeeNumerator(
        virtualPool,
        config,
        currentPoint,
        tradeDirection,
        amountIn,
        false,
        eligibleForFirstSwapWithMinFee
    )

    let fees = NO_FEES
    let actualAmountIn = amountIn
    if (feeMode.feesOnInput) {
        ;({ amount: actualAmountIn, fees } = takeFee(
            feeNumerator,
            amountIn,
            feeMode.hasReferral
        ))
    }

    const { outputAmount, nextSqrtPrice, amountLeft } = swapFromInput(
        virtualPool,
        config,
        tradeDirection,
        actualAmountIn
    )
    if (!amountLeft.isZero()) {
        throw new Error(ProgramError.InsufficientLiquidity)
    }

    let actualAmountOut = outputAmount
    if (!feeMode.feesOnInput) {
        ;({ amount: actualAmountOut, fees } = takeFee(
            feeNumerator,
            outputAmount,
            feeMode.hasReferral
        ))
    }

    return {
        amountLeft,
        includedFeeInputAmount: amountIn,
        excludedFeeInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice,
        ...fees,
    }
}

/** The legacy swap result shape, derived like the program's SwapResult2::get_swap_result. */
export function getSwapResult(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult {
    const result = getSwapResultFromExactInput(
        virtualPool,
        config,
        amountIn,
        feeMode,
        tradeDirection,
        currentPoint,
        eligibleForFirstSwapWithMinFee
    )
    return {
        actualInputAmount: result.excludedFeeInputAmount,
        outputAmount: result.outputAmount,
        nextSqrtPrice: result.nextSqrtPrice,
        tradingFee: result.tradingFee,
        protocolFee: result.protocolFee,
        referralFee: result.referralFee,
    }
}

/** The program's get_swap_result_from_partial_input. */
export function getSwapResultFromPartialInput(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2 {
    const feeNumerator = tradeFeeNumerator(
        virtualPool,
        config,
        currentPoint,
        tradeDirection,
        amountIn,
        false,
        eligibleForFirstSwapWithMinFee
    )

    let fees = NO_FEES
    let actualAmountIn = amountIn
    if (feeMode.feesOnInput) {
        ;({ amount: actualAmountIn, fees } = takeFee(
            feeNumerator,
            amountIn,
            feeMode.hasReferral
        ))
    }

    const { outputAmount, nextSqrtPrice, amountLeft } = swapFromInput(
        virtualPool,
        config,
        tradeDirection,
        actualAmountIn
    )

    // when the curve runs out, the fee is recomputed on the part that was swapped
    let includedFeeInputAmount = amountIn
    if (!amountLeft.isZero()) {
        actualAmountIn = SafeMath.sub(actualAmountIn, amountLeft)
        if (feeMode.feesOnInput) {
            const partialFeeNumerator = tradeFeeNumerator(
                virtualPool,
                config,
                currentPoint,
                tradeDirection,
                actualAmountIn,
                true,
                eligibleForFirstSwapWithMinFee
            )
            ;({ amount: includedFeeInputAmount, fees } = addFee(
                partialFeeNumerator,
                actualAmountIn,
                feeMode.hasReferral
            ))
        } else {
            includedFeeInputAmount = actualAmountIn
        }
    }

    let actualAmountOut = outputAmount
    if (!feeMode.feesOnInput) {
        ;({ amount: actualAmountOut, fees } = takeFee(
            feeNumerator,
            outputAmount,
            feeMode.hasReferral
        ))
    }

    return {
        amountLeft,
        includedFeeInputAmount,
        excludedFeeInputAmount: actualAmountIn,
        outputAmount: actualAmountOut,
        nextSqrtPrice,
        ...fees,
    }
}

/** The program's get_swap_result_from_exact_output. */
export function getSwapResultFromExactOutput(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountOut: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2 {
    let fees = NO_FEES
    let includedFeeOutAmount = amountOut
    if (!feeMode.feesOnInput) {
        const feeNumerator = tradeFeeNumerator(
            virtualPool,
            config,
            currentPoint,
            tradeDirection,
            amountOut,
            true,
            eligibleForFirstSwapWithMinFee
        )
        ;({ amount: includedFeeOutAmount, fees } = addFee(
            feeNumerator,
            amountOut,
            feeMode.hasReferral
        ))
    }

    const { amountIn, nextSqrtPrice } =
        tradeDirection === TradeDirection.BaseToQuote
            ? calculateBaseToQuoteFromAmountOut(
                  config,
                  virtualPool.poolState.sqrtPrice,
                  includedFeeOutAmount
              )
            : calculateQuoteToBaseFromAmountOut(
                  config,
                  virtualPool.poolState.sqrtPrice,
                  includedFeeOutAmount
              )
    if (nextSqrtPrice.gt(config.migrationSqrtPrice)) {
        throw new Error(ProgramError.InsufficientLiquidity)
    }

    let includedFeeInputAmount = amountIn
    if (feeMode.feesOnInput) {
        const feeNumerator = tradeFeeNumerator(
            virtualPool,
            config,
            currentPoint,
            tradeDirection,
            amountIn,
            true,
            eligibleForFirstSwapWithMinFee
        )
        ;({ amount: includedFeeInputAmount, fees } = addFee(
            feeNumerator,
            amountIn,
            feeMode.hasReferral
        ))
    }

    return {
        amountLeft: ZERO,
        includedFeeInputAmount,
        excludedFeeInputAmount: amountIn,
        outputAmount: amountOut,
        nextSqrtPrice,
        ...fees,
    }
}

// The curve array keeps 20 points for pools created before the 16-point
// limit; unused points are zero and skipped.

/** Quote received for amountIn base, walking the curve down from currentSqrtPrice. */
export function calculateBaseToQuoteFromAmountIn(
    configState: Curve,
    currentSqrtPrice: BN,
    amountIn: BN
): SwapAmount {
    let totalOutputAmount = ZERO
    let sqrtPrice = currentSqrtPrice
    let amountLeft = amountIn

    for (let i = configState.curve.length - 2; i >= 0; i--) {
        const point = configState.curve[i]
        const liquidity = configState.curve[i + 1].liquidity
        if (point.sqrtPrice.isZero() || point.liquidity.isZero()) {
            continue
        }
        if (!point.sqrtPrice.lt(sqrtPrice)) {
            continue
        }

        const maxAmountIn = getDeltaAmountBaseUnsigned256(
            point.sqrtPrice,
            sqrtPrice,
            liquidity,
            Rounding.Up
        )
        if (amountLeft.lt(maxAmountIn)) {
            const nextSqrtPrice = getNextSqrtPriceFromInput(
                sqrtPrice,
                liquidity,
                amountLeft,
                true
            )
            totalOutputAmount = addU64(
                totalOutputAmount,
                getDeltaAmountQuoteUnsigned(
                    nextSqrtPrice,
                    sqrtPrice,
                    liquidity,
                    Rounding.Down
                )
            )
            sqrtPrice = nextSqrtPrice
            amountLeft = ZERO
            break
        }

        totalOutputAmount = addU64(
            totalOutputAmount,
            getDeltaAmountQuoteUnsigned(
                point.sqrtPrice,
                sqrtPrice,
                liquidity,
                Rounding.Down
            )
        )
        sqrtPrice = point.sqrtPrice
        amountLeft = SafeMath.sub(amountLeft, u64(maxAmountIn))
    }

    // the first segment runs down to sqrtStartPrice
    if (!amountLeft.isZero()) {
        const liquidity = configState.curve[0].liquidity
        let nextSqrtPrice = getNextSqrtPriceFromInput(
            sqrtPrice,
            liquidity,
            amountLeft,
            true
        )
        if (nextSqrtPrice.lt(configState.sqrtStartPrice)) {
            nextSqrtPrice = configState.sqrtStartPrice
            amountLeft = SafeMath.sub(
                amountLeft,
                getDeltaAmountBaseUnsigned(
                    nextSqrtPrice,
                    sqrtPrice,
                    liquidity,
                    Rounding.Up
                )
            )
        } else {
            amountLeft = ZERO
        }
        totalOutputAmount = addU64(
            totalOutputAmount,
            getDeltaAmountQuoteUnsigned(
                nextSqrtPrice,
                sqrtPrice,
                liquidity,
                Rounding.Down
            )
        )
        sqrtPrice = nextSqrtPrice
    }

    return {
        amountLeft,
        outputAmount: totalOutputAmount,
        nextSqrtPrice: sqrtPrice,
    }
}

/** Base received for amountIn quote, walking the curve up to stopSqrtPrice. */
export function calculateQuoteToBaseFromAmountIn(
    configState: Pick<QuotePoolConfig, 'curve'>,
    currentSqrtPrice: BN,
    amountIn: BN,
    stopSqrtPrice: BN
): SwapAmount {
    let totalOutputAmount = ZERO
    let sqrtPrice = currentSqrtPrice
    let amountLeft = amountIn

    for (const point of configState.curve) {
        if (point.sqrtPrice.isZero() || point.liquidity.isZero()) {
            break
        }
        const referenceSqrtPrice = BN.min(stopSqrtPrice, point.sqrtPrice)
        if (!referenceSqrtPrice.gt(sqrtPrice)) {
            continue
        }

        const maxAmountIn = getDeltaAmountQuoteUnsigned256(
            sqrtPrice,
            referenceSqrtPrice,
            point.liquidity,
            Rounding.Up
        )
        if (amountLeft.lt(maxAmountIn)) {
            const nextSqrtPrice = getNextSqrtPriceFromInput(
                sqrtPrice,
                point.liquidity,
                amountLeft,
                false
            )
            totalOutputAmount = addU64(
                totalOutputAmount,
                getDeltaAmountBaseUnsigned(
                    sqrtPrice,
                    nextSqrtPrice,
                    point.liquidity,
                    Rounding.Down
                )
            )
            sqrtPrice = nextSqrtPrice
            amountLeft = ZERO
            break
        }

        totalOutputAmount = addU64(
            totalOutputAmount,
            getDeltaAmountBaseUnsigned(
                sqrtPrice,
                referenceSqrtPrice,
                point.liquidity,
                Rounding.Down
            )
        )
        sqrtPrice = referenceSqrtPrice
        amountLeft = SafeMath.sub(amountLeft, u64(maxAmountIn))
        if (sqrtPrice.eq(stopSqrtPrice)) {
            break
        }
    }

    return {
        outputAmount: totalOutputAmount,
        nextSqrtPrice: sqrtPrice,
        amountLeft,
    }
}

/** Base needed for outAmount quote, walking the curve down from currentSqrtPrice. */
export function calculateBaseToQuoteFromAmountOut(
    configState: Curve,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmountFromOutput {
    let sqrtPrice = currentSqrtPrice
    let amountLeft = outAmount
    let totalAmountIn = ZERO

    for (let i = configState.curve.length - 2; i >= 0; i--) {
        const point = configState.curve[i]
        const liquidity = configState.curve[i + 1].liquidity
        if (point.sqrtPrice.isZero() || point.liquidity.isZero()) {
            continue
        }
        if (!point.sqrtPrice.lt(sqrtPrice)) {
            continue
        }

        const maxAmountOut = getDeltaAmountQuoteUnsigned256(
            point.sqrtPrice,
            sqrtPrice,
            liquidity,
            Rounding.Down
        )
        if (amountLeft.lt(maxAmountOut)) {
            const nextSqrtPrice = getNextSqrtPriceFromOutput(
                sqrtPrice,
                liquidity,
                amountLeft,
                true
            )
            totalAmountIn = addU64(
                totalAmountIn,
                getDeltaAmountBaseUnsigned(
                    nextSqrtPrice,
                    sqrtPrice,
                    liquidity,
                    Rounding.Up
                )
            )
            sqrtPrice = nextSqrtPrice
            amountLeft = ZERO
            break
        }

        totalAmountIn = addU64(
            totalAmountIn,
            getDeltaAmountBaseUnsigned(
                point.sqrtPrice,
                sqrtPrice,
                liquidity,
                Rounding.Up
            )
        )
        sqrtPrice = point.sqrtPrice
        amountLeft = SafeMath.sub(amountLeft, u64(maxAmountOut))
    }

    if (!amountLeft.isZero()) {
        const liquidity = configState.curve[0].liquidity
        const maxAmountOut = getDeltaAmountQuoteUnsigned256(
            configState.sqrtStartPrice,
            sqrtPrice,
            liquidity,
            Rounding.Down
        )
        if (amountLeft.gt(maxAmountOut)) {
            throw new Error(ProgramError.InsufficientLiquidity)
        }
        const nextSqrtPrice = getNextSqrtPriceFromOutput(
            sqrtPrice,
            liquidity,
            amountLeft,
            true
        )
        if (nextSqrtPrice.lt(configState.sqrtStartPrice)) {
            throw new Error(ProgramError.InsufficientLiquidity)
        }
        totalAmountIn = addU64(
            totalAmountIn,
            getDeltaAmountBaseUnsigned(
                nextSqrtPrice,
                sqrtPrice,
                liquidity,
                Rounding.Up
            )
        )
        sqrtPrice = nextSqrtPrice
    }

    return { amountIn: totalAmountIn, nextSqrtPrice: sqrtPrice }
}

/** Quote needed for outAmount base, walking the curve up from currentSqrtPrice. */
export function calculateQuoteToBaseFromAmountOut(
    configState: Pick<QuotePoolConfig, 'curve'>,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmountFromOutput {
    let totalInAmount = ZERO
    let sqrtPrice = currentSqrtPrice
    let amountLeft = outAmount

    for (const point of configState.curve) {
        if (point.sqrtPrice.isZero() || point.liquidity.isZero()) {
            break
        }
        if (!point.sqrtPrice.gt(sqrtPrice)) {
            continue
        }

        const maxAmountOut = getDeltaAmountBaseUnsigned256(
            sqrtPrice,
            point.sqrtPrice,
            point.liquidity,
            Rounding.Down
        )
        if (amountLeft.lt(maxAmountOut)) {
            const nextSqrtPrice = getNextSqrtPriceFromOutput(
                sqrtPrice,
                point.liquidity,
                amountLeft,
                false
            )
            totalInAmount = addU64(
                totalInAmount,
                getDeltaAmountQuoteUnsigned(
                    sqrtPrice,
                    nextSqrtPrice,
                    point.liquidity,
                    Rounding.Up
                )
            )
            sqrtPrice = nextSqrtPrice
            amountLeft = ZERO
            break
        }

        totalInAmount = addU64(
            totalInAmount,
            getDeltaAmountQuoteUnsigned(
                sqrtPrice,
                point.sqrtPrice,
                point.liquidity,
                Rounding.Up
            )
        )
        sqrtPrice = point.sqrtPrice
        amountLeft = SafeMath.sub(amountLeft, u64(maxAmountOut))
    }

    if (!amountLeft.isZero()) {
        throw new Error(ProgramError.AmountLeftIsNotZero)
    }

    return { amountIn: totalInAmount, nextSqrtPrice: sqrtPrice }
}

function quoteExactIn(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number,
    hasReferral: boolean,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean,
    transferFees?: QuoteTransferFees
): SwapQuote2Result & { minimumAmountOut: BN } {
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
        throw new Error(ProgramError.AmountIsZero)
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

/** Exact-in quote in the legacy SwapResult shape. */
export function swapQuote(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean,
    transferFees?: QuoteTransferFees
): SwapQuoteResult {
    const result = quoteExactIn(
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn,
        slippageBps,
        hasReferral,
        currentPoint,
        eligibleForFirstSwapWithMinFee,
        transferFees
    )
    return {
        actualInputAmount: result.excludedFeeInputAmount,
        outputAmount: result.outputAmount,
        nextSqrtPrice: result.nextSqrtPrice,
        tradingFee: result.tradingFee,
        protocolFee: result.protocolFee,
        referralFee: result.referralFee,
        minimumAmountOut: result.minimumAmountOut,
        includedTransferFeeAmountIn: result.includedTransferFeeAmountIn,
        excludedTransferFeeAmountOut: result.excludedTransferFeeAmountOut,
    }
}

/** Exact-in quote; amountIn includes any transfer fee on the input mint. */
export function swapQuoteExactIn(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    swapBaseForQuote: boolean,
    amountIn: BN,
    slippageBps: number = 0,
    hasReferral: boolean,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean,
    transferFees?: QuoteTransferFees
): SwapQuote2Result {
    return quoteExactIn(
        virtualPool,
        config,
        swapBaseForQuote,
        amountIn,
        slippageBps,
        hasReferral,
        currentPoint,
        eligibleForFirstSwapWithMinFee,
        transferFees
    )
}

/** Partial-fill quote; the input the pool can take is reported in includedTransferFeeAmountIn. */
export function swapQuotePartialFill(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
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
        throw new Error(ProgramError.AmountIsZero)
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
    // a partial fill under an active rate limiter can reconstruct an input above amountIn
    if (includedAmountIn.gt(amountIn)) {
        throw new Error(ProgramError.ExceededInputAmount)
    }
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
        includedTransferFeeAmountIn: includedAmountIn,
        excludedTransferFeeAmountOut: excludedAmountOut,
    }
}

/** Exact-out quote; outAmount is what the user receives after any transfer fee on the output mint. */
export function swapQuoteExactOut(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
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
        throw new Error(ProgramError.AmountIsZero)
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
