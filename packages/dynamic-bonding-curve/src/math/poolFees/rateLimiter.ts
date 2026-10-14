import BN from 'bn.js'
import { mulDiv, sqrt, toNumerator } from '../utilsMath'
import { SafeMath } from '../safeMath'
import { FEE_DENOMINATOR, MAX_FEE_NUMERATOR, U64_MAX } from '../../constants'
import { Rounding, TradeDirection } from '../../types'
import { ProgramError } from '../errors'
import { getExcludedFeeAmount, getIncludedFeeAmount } from '../feeAmount'

/** The rate limiter only applies to quote-to-base swaps inside maxLimiterDuration after activation. */
export function isRateLimiterApplied(
    currentPoint: BN,
    activationPoint: BN,
    tradeDirection: TradeDirection,
    maxLimiterDuration: BN,
    referenceAmount: BN,
    feeIncrementBps: BN
): boolean {
    if (
        isZeroRateLimiter(referenceAmount, maxLimiterDuration, feeIncrementBps)
    ) {
        return false
    }
    if (tradeDirection === TradeDirection.BaseToQuote) {
        return false
    }
    return currentPoint.lte(activationPoint.add(maxLimiterDuration))
}

export function isZeroRateLimiter(
    referenceAmount: BN,
    maxLimiterDuration: BN,
    feeIncrementBps: BN
): boolean {
    return (
        referenceAmount.isZero() &&
        maxLimiterDuration.isZero() &&
        feeIncrementBps.isZero()
    )
}

export function isNonZeroRateLimiter(
    referenceAmount: BN,
    maxLimiterDuration: BN,
    feeIncrementBps: BN
): boolean {
    return (
        !referenceAmount.isZero() &&
        !maxLimiterDuration.isZero() &&
        !feeIncrementBps.isZero()
    )
}

/** Number of fee increments between the cliff fee and MAX_FEE_NUMERATOR. */
export function getMaxIndex(cliffFeeNumerator: BN, feeIncrementBps: BN): BN {
    const deltaNumerator = SafeMath.sub(
        new BN(MAX_FEE_NUMERATOR),
        cliffFeeNumerator
    )
    return SafeMath.div(
        deltaNumerator,
        toNumerator(feeIncrementBps, new BN(FEE_DENOMINATOR))
    )
}

/**
 * The amounts at which the fee reaches its maximum:
 * [excluded fee amount, included fee amount, whether the included amount overflowed u64].
 */
export function getCheckedAmounts(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN
): [BN, BN, boolean] {
    const maxIndex = getMaxIndex(cliffFeeNumerator, feeIncrementBps)
    const maxIndexInputAmount = maxIndex.addn(1).mul(referenceAmount)
    const isOverflow = maxIndexInputAmount.gt(U64_MAX)
    const checkedIncludedFeeAmount = isOverflow ? U64_MAX : maxIndexInputAmount
    const checkedExcludedFeeAmount = getRateLimiterExcludedFeeAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        checkedIncludedFeeAmount
    )
    return [checkedExcludedFeeAmount, checkedIncludedFeeAmount, isOverflow]
}

/**
 * Fee numerator for an amount that excludes the fee. The included amount is
 * recovered from the excluded one, so this is not exact; the program only
 * requires the result to be at or above the cliff fee, and it leaves out the
 * dynamic fee.
 */
export function getFeeNumeratorFromExcludedAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    excludedFeeAmount: BN
): BN {
    const excludedFeeReferenceAmount = getRateLimiterExcludedFeeAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        referenceAmount
    )
    if (excludedFeeAmount.lte(excludedFeeReferenceAmount)) {
        return cliffFeeNumerator
    }

    const [checkedExcludedFeeAmount, checkedIncludedFeeAmount, isOverflow] =
        getCheckedAmounts(cliffFeeNumerator, referenceAmount, feeIncrementBps)

    if (excludedFeeAmount.eq(checkedExcludedFeeAmount)) {
        return getFeeNumeratorFromIncludedAmount(
            cliffFeeNumerator,
            referenceAmount,
            feeIncrementBps,
            checkedIncludedFeeAmount
        )
    }

    let includedFeeAmount: BN
    if (excludedFeeAmount.lt(checkedExcludedFeeAmount)) {
        // With x0 the reference amount, c the cliff fee, i the fee increment,
        // d the fee denominator and input_amount = x0 * (a + 1):
        //   fee = input_amount * (c + i * (input_amount / x0 - 1) / 2) / d
        //   ex  = input_amount - fee
        // which rearranges to the quadratic
        //   i * input_amount^2 - (2*d*x0 + i*x0 - 2*c*x0) * input_amount + 2*ex*d*x0 = 0
        // The smaller root is the input amount, because the larger one lies
        // past x0 * (max_index + 1), where the fee is already capped.
        const two = new BN(2)
        const i = toNumerator(feeIncrementBps, new BN(FEE_DENOMINATOR))
        const x0 = referenceAmount
        const d = new BN(FEE_DENOMINATOR)
        const c = cliffFeeNumerator
        const y = two.mul(d).mul(x0).add(i.mul(x0)).sub(two.mul(c).mul(x0))
        const z = two.mul(excludedFeeAmount).mul(d).mul(x0)
        const discriminant = y.mul(y).sub(new BN(4).mul(i).mul(z))
        const wholePeriodsInput = y.sub(sqrt(discriminant)).div(two.mul(i))

        // the integer root falls short of ex; the remainder pays the fee of the next tier
        const aPlusOne = wholePeriodsInput.div(x0)
        const excludedFeeRemainingAmount = SafeMath.sub(
            excludedFeeAmount,
            getRateLimiterExcludedFeeAmount(
                cliffFeeNumerator,
                referenceAmount,
                feeIncrementBps,
                wholePeriodsInput
            )
        )
        const [includedFeeRemainingAmount] = getIncludedFeeAmount(
            c.add(i.mul(aPlusOne)),
            excludedFeeRemainingAmount
        )
        includedFeeAmount = wholePeriodsInput.add(includedFeeRemainingAmount)
    } else {
        if (isOverflow) {
            throw new Error(ProgramError.MathOverflow)
        }
        // past the checked amount every unit pays the maximum fee
        const excludedFeeRemainingAmount = SafeMath.sub(
            excludedFeeAmount,
            checkedExcludedFeeAmount
        )
        const [includedFeeRemainingAmount] = getIncludedFeeAmount(
            new BN(MAX_FEE_NUMERATOR),
            excludedFeeRemainingAmount
        )
        includedFeeAmount = checkedIncludedFeeAmount.add(
            includedFeeRemainingAmount
        )
    }

    const tradingFee = SafeMath.sub(includedFeeAmount, excludedFeeAmount)
    const feeNumerator = mulDiv(
        tradingFee,
        new BN(FEE_DENOMINATOR),
        includedFeeAmount,
        Rounding.Up
    )
    if (feeNumerator.lt(cliffFeeNumerator)) {
        throw new Error(ProgramError.UndeterminedError)
    }
    return feeNumerator
}

/** Amount after the rate limiter fee for an amount that includes it. */
export function getRateLimiterExcludedFeeAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    includedFeeAmount: BN
): BN {
    const feeNumerator = getFeeNumeratorFromIncludedAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        includedFeeAmount
    )
    return getExcludedFeeAmount(feeNumerator, includedFeeAmount)[0]
}

/** The output of a swap of exactly the reference amount, which pays the cliff fee. */
export function getMaxOutAmountWithMinBaseFee(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN
): BN {
    return getRateLimiterExcludedFeeAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        referenceAmount
    )
}

/**
 * Fee numerator for an amount that includes the fee. Each whole reference
 * amount above the first pays one more fee increment, up to the maximum fee.
 */
export function getFeeNumeratorFromIncludedAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    includedFeeAmount: BN
): BN {
    if (includedFeeAmount.lte(referenceAmount)) {
        return cliffFeeNumerator
    }

    const c = cliffFeeNumerator
    const diff = includedFeeAmount.sub(referenceAmount)
    const a = diff.div(referenceAmount)
    const b = diff.mod(referenceAmount)
    const maxIndex = getMaxIndex(cliffFeeNumerator, feeIncrementBps)
    const i = toNumerator(feeIncrementBps, new BN(FEE_DENOMINATOR))
    const x0 = referenceAmount
    const one = new BN(1)
    const two = new BN(2)

    let tradingFeeNumerator: BN
    if (a.lt(maxIndex)) {
        const numerator1 = c
            .add(c.mul(a))
            .add(i.mul(a).mul(a.add(one)).div(two))
        const numerator2 = c.add(i.mul(a.add(one)))
        tradingFeeNumerator = x0.mul(numerator1).add(b.mul(numerator2))
    } else {
        const numerator1 = c
            .add(c.mul(maxIndex))
            .add(i.mul(maxIndex).mul(maxIndex.add(one)).div(two))
        const leftAmount = a.sub(maxIndex).mul(x0).add(b)
        tradingFeeNumerator = x0
            .mul(numerator1)
            .add(leftAmount.mul(new BN(MAX_FEE_NUMERATOR)))
    }

    const denominator = new BN(FEE_DENOMINATOR)
    const tradingFee = tradingFeeNumerator
        .add(denominator)
        .sub(one)
        .div(denominator)

    // numerator = trading_fee * FEE_DENOMINATOR / input_amount, rounded up
    return mulDiv(
        tradingFee,
        new BN(FEE_DENOMINATOR),
        includedFeeAmount,
        Rounding.Up
    )
}
