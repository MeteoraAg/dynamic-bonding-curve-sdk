import BN from 'bn.js'
import { mulDiv, sqrt } from '../utilsMath'
import { FEE_DENOMINATOR, MAX_FEE_NUMERATOR, U64_MAX } from '../../constants'
import { Rounding, TradeDirection } from '../../types'
import { toNumerator } from '../feeMath'

/**
 * Check if rate limiter is applied based on current conditions
 * @param currentPoint - Current point (slot or timestamp)
 * @param activationPoint - Activation point
 * @param tradeDirection - Trade direction
 * @param maxLimiterDuration - Max limiter duration
 * @param referenceAmount - Reference amount for rate limiter
 * @param feeIncrementBps - Fee increment bps for rate limiter
 * @returns Whether rate limiter is applied
 */
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

    // Only handle for the case quote to base and collect fee mode in quote token
    if (tradeDirection === TradeDirection.BaseToQuote) {
        return false
    }

    const lastEffectiveRateLimiterPoint =
        activationPoint.add(maxLimiterDuration)
    return currentPoint.lte(lastEffectiveRateLimiterPoint)
}

/**
 * Check if rate limiter is zero (disabled)
 * @param referenceAmount - Reference amount
 * @param maxLimiterDuration - Max limiter duration
 * @param feeIncrementBps - Fee increment bps
 * @returns Whether rate limiter is zero
 */
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

/**
 * Check if rate limiter is non-zero (enabled)
 * @param referenceAmount - Reference amount
 * @param maxLimiterDuration - Max limiter duration
 * @param feeIncrementBps - Fee increment bps
 * @returns Whether rate limiter is non-zero
 */
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

/**
 * Calculate the max index for rate limiter
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param feeIncrementBps - The fee increment bps
 * @returns The max index
 * @throws Error if calculation fails due to overflow or division by zero
 */
export function getMaxIndex(cliffFeeNumerator: BN, feeIncrementBps: BN): BN {
    // Safe subtraction: MAX_FEE_NUMERATOR - cliffFeeNumerator
    if (cliffFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))) {
        throw new Error('Cliff fee numerator exceeds maximum fee numerator')
    }
    const deltaNumerator = new BN(MAX_FEE_NUMERATOR).sub(cliffFeeNumerator)

    const feeIncrementNumerator = toNumerator(
        feeIncrementBps,
        new BN(FEE_DENOMINATOR)
    )

    // Safe division: check for division by zero
    if (feeIncrementNumerator.isZero()) {
        throw new Error('Fee increment numerator cannot be zero')
    }

    return deltaNumerator.div(feeIncrementNumerator)
}

/**
 * Get max out amount with min base fee
 * @param cliffFeeNumerator - Cliff fee numerator
 * @param referenceAmount - Reference amount
 * @param feeIncrementBps - Fee increment bps
 * @returns Max out amount
 */
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
 * Get checked amounts for rate limiter
 * @param cliffFeeNumerator - Cliff fee numerator
 * @param referenceAmount - Reference amount
 * @param feeIncrementBps - Fee increment bps
 * @returns Tuple of (checkedExcludedFeeAmount, checkedIncludedFeeAmount, isOverflow)
 */
export function getCheckedAmounts(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN
): [BN, BN, boolean] {
    const maxIndex = getMaxIndex(cliffFeeNumerator, feeIncrementBps)
    const x0 = referenceAmount
    const one = new BN(1)
    const maxIndexInputAmount = maxIndex.add(one).mul(x0)

    if (maxIndexInputAmount.lte(U64_MAX)) {
        const checkedIncludedFeeAmount = maxIndexInputAmount
        const checkedOutputAmount = getRateLimiterExcludedFeeAmount(
            cliffFeeNumerator,
            referenceAmount,
            feeIncrementBps,
            checkedIncludedFeeAmount
        )
        return [checkedOutputAmount, checkedIncludedFeeAmount, false]
    } else {
        const checkedExcludedFeeAmount = getRateLimiterExcludedFeeAmount(
            cliffFeeNumerator,
            referenceAmount,
            feeIncrementBps,
            U64_MAX
        )
        return [checkedExcludedFeeAmount, U64_MAX, true]
    }
}

/**
 * Calculate the fee numerator on rate limiter from excluded fee amount
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param referenceAmount - The reference amount
 * @param feeIncrementBps - The fee increment bps
 * @param excludedFeeAmount - The excluded fee amount
 * @returns The fee numerator
 */
export function getFeeNumeratorFromExcludedAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    excludedFeeAmount: BN
): BN {
    // Need to categorize in 3 cases:
    // - excluded_fee_amount <= get_excluded_fee_amount(reference_amount)
    // - excluded_fee_amount > get_excluded_fee_amount(reference_amount) && excluded_fee_amount < get_excluded_fee_amount(reference_amount * (max_index+1))
    // - excluded_fee_amount >= get_excluded_fee_amount(reference_amount * (max_index+1))
    // Note: because excluded_fee_amount = included_fee_amount - fee_numerator * included_fee_amount / fee_denominator
    // It is very difficult to calculate exactly fee_numerator from excluded_fee_amount,
    // With any precision difference, even 1 unit, the excluded_fee_amount will be changed a lot when value of included_fee_amount is high
    // Then a sanity check here is we just ensure fee_numerator >= cliff_fee_numerator
    // Note: That also exclude the dynamic fee in calculation, so in rate limiter fee mode, fees can be different for different swap modes

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

    // Add the early check
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
        const two = new BN(2)
        const four = new BN(4)

        // d: fee denominator
        // ex: excluded_fee_amount
        // input_amount = x0 + (a * x0)
        // fee = x0 * (c + c*a + i*a*(a+1)/2) / d
        // fee = x0 * (a+1) * (c + i*a/2) / d
        // fee = input_amount * (c + i * (input_amount/x0-1)/2) / d
        // ex = input_amount - fee
        // ex = input_amount - input_amount * (c + i * (input_amount/x0-1)/2) / d
        // ex * d * 2 = input_amount * d * 2 - input_amount * (2 * c + i * (input_amount/x0-1))
        // ex * d * 2 * x0 = input_amount * d * 2 * x0 - input_amount * (2 * c * x0 + i * (input_amount-x0))
        // ex * d * 2 * x0 = input_amount * d * 2 * x0 - input_amount * (2 * c * x0 + i * input_amount- i*x0)
        // ex * d * 2 * x0 = input_amount * d * 2 * x0 - input_amount * 2 * c * x0 - i * input_amount ^ 2 + input_amount * i*x0
        // i * input_amount ^ 2 - input_amount * (-2 * c * x0 + i*x0 + d * 2 * x0) + ex * d * 2 * x0 = 0
        // equation: x * input_amount ^ 2  - y * input_amount + z = 0
        // x = i, y =  (-2 * c * x0 + i*x0 + d * 2 * x0), z = ex * d * 2 * x0
        // input_amount = (y +(-) sqrt(y^2 - 4xz)) / 2x

        const i = toNumerator(feeIncrementBps, new BN(FEE_DENOMINATOR))
        const x0 = referenceAmount
        const d = new BN(FEE_DENOMINATOR)
        const c = cliffFeeNumerator
        const ex = excludedFeeAmount

        const x = i // x > 0
        const y = two.mul(d).mul(x0).add(i.mul(x0)).sub(two.mul(c).mul(x0)) // y is always greater than zero
        const z = two.mul(ex).mul(d).mul(x0)

        // solve quadratic equation
        // check it again, why sub, not add
        const discriminant = y.mul(y).sub(four.mul(x).mul(z))
        const sqrtDiscriminant = sqrt(discriminant)

        includedFeeAmount = y.sub(sqrtDiscriminant).div(two.mul(x))

        const aPlusOne = includedFeeAmount.div(x0)

        const firstExcludedFeeAmount = getRateLimiterExcludedFeeAmount(
            cliffFeeNumerator,
            referenceAmount,
            feeIncrementBps,
            includedFeeAmount
        )

        const excludedFeeRemainingAmount = excludedFeeAmount.sub(
            firstExcludedFeeAmount
        )

        const remainingAmountFeeNumerator = c.add(i.mul(aPlusOne))

        const includedFeeRemainingAmount = mulDiv(
            excludedFeeRemainingAmount,
            new BN(FEE_DENOMINATOR),
            new BN(FEE_DENOMINATOR).sub(remainingAmountFeeNumerator),
            Rounding.Up
        )

        const totalInAmount = includedFeeAmount.add(includedFeeRemainingAmount)
        includedFeeAmount = totalInAmount
    } else {
        // excluded_fee_amount > checked_excluded_fee_amount
        if (isOverflow) {
            throw new Error('Math overflow')
        }
        const excludedFeeRemainingAmount = excludedFeeAmount.sub(
            checkedExcludedFeeAmount
        )
        // remaining_amount should take the max fee
        const includedFeeRemainingAmount = mulDiv(
            excludedFeeRemainingAmount,
            new BN(FEE_DENOMINATOR),
            new BN(FEE_DENOMINATOR).sub(new BN(MAX_FEE_NUMERATOR)),
            Rounding.Up
        )

        const totalAmountIn = includedFeeRemainingAmount.add(
            checkedIncludedFeeAmount
        )
        includedFeeAmount = totalAmountIn
    }

    const tradingFee = includedFeeAmount.sub(excludedFeeAmount)

    const feeNumerator = mulDiv(
        tradingFee,
        new BN(FEE_DENOMINATOR),
        includedFeeAmount,
        Rounding.Up
    )

    // sanity check
    if (feeNumerator.lt(cliffFeeNumerator)) {
        throw new Error(
            'Undetermined error: fee numerator less than cliff fee numerator'
        )
    }

    return feeNumerator
}

/**
 * Get excluded fee amount from included fee amount using rate limiter
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param referenceAmount - The reference amount
 * @param feeIncrementBps - The fee increment bps
 * @param includedFeeAmount - The included fee amount
 * @returns The excluded fee amount
 */
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

    const tradingFee = mulDiv(
        includedFeeAmount,
        feeNumerator,
        new BN(FEE_DENOMINATOR),
        Rounding.Up
    )

    return includedFeeAmount.sub(tradingFee)
}

/**
 * Calculate the fee numerator on rate limiter from included fee amount
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param referenceAmount - The reference amount
 * @param feeIncrementBps - The fee increment bps
 * @param includedFeeAmount - The included fee amount
 * @returns The fee numerator
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
    // because we all calculate in BN, so it is safe to avoid safe math
    if (a.lt(maxIndex)) {
        const numerator1 = c
            .add(c.mul(a))
            .add(i.mul(a).mul(a.add(one)).div(two))
        const numerator2 = c.add(i.mul(a.add(one)))
        const firstFee = x0.mul(numerator1)
        const secondFee = b.mul(numerator2)
        tradingFeeNumerator = firstFee.add(secondFee)
    } else {
        const numerator1 = c
            .add(c.mul(maxIndex))
            .add(i.mul(maxIndex).mul(maxIndex.add(one)).div(two))
        const numerator2 = new BN(MAX_FEE_NUMERATOR)
        const firstFee = x0.mul(numerator1)

        const d = a.sub(maxIndex)
        const leftAmount = d.mul(x0).add(b)
        const secondFee = leftAmount.mul(numerator2)
        tradingFeeNumerator = firstFee.add(secondFee)
    }

    const denominator = new BN(FEE_DENOMINATOR)
    const tradingFee = tradingFeeNumerator
        .add(denominator)
        .sub(one)
        .div(denominator)

    // reverse to fee numerator:
    // input_amount * numerator / FEE_DENOMINATOR = trading_fee
    // => numerator = trading_fee * FEE_DENOMINATOR / input_amount
    const feeNumerator = mulDiv(
        tradingFee,
        new BN(FEE_DENOMINATOR),
        includedFeeAmount,
        Rounding.Up
    )

    return feeNumerator
}

/**
 * Get the min base fee numerator for rate limiter
 * @param cliffFeeNumerator - The cliff fee numerator
 * @returns The min base fee numerator
 */
export function getRateLimiterMinBaseFeeNumerator(cliffFeeNumerator: BN): BN {
    return cliffFeeNumerator
}
