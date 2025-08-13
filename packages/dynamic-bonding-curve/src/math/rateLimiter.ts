import BN from 'bn.js'
import { mulDiv, sqrt } from './utilsMath'
import {
    BASIS_POINT_MAX,
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
} from '../constants'
import { Rounding } from '../types'

/**
 * Calculate the max index for rate limiter
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param feeIncrementBps - The fee increment bps
 * @returns The max index
 */
export function getMaxIndex(cliffFeeNumerator: BN, feeIncrementBps: BN): BN {
    const deltaNumerator = new BN(MAX_FEE_NUMERATOR).sub(cliffFeeNumerator)
    const feeIncrementNumerator = mulDiv(
        new BN(feeIncrementBps),
        new BN(FEE_DENOMINATOR),
        new BN(BASIS_POINT_MAX),
        Rounding.Down
    )
    return deltaNumerator.div(feeIncrementNumerator)
}

/**
 * Get excluded fee amount from included fee amount using rate limiter
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param referenceAmount - The reference amount
 * @param feeIncrementBps - The fee increment bps
 * @param includedFeeAmount - The included fee amount
 * @returns The excluded fee amount
 */
export function getExcludedFeeAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    includedFeeAmount: BN
): BN {
    const feeNumerator = getFeeNumeratorOnRateLimiterFromIncludedAmount(
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
export function getFeeNumeratorOnRateLimiterFromIncludedAmount(
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
    const i = mulDiv(
        feeIncrementBps,
        new BN(FEE_DENOMINATOR),
        new BN(BASIS_POINT_MAX),
        Rounding.Down
    )
    const x0 = referenceAmount
    const one = new BN(1)
    const two = new BN(2)

    let tradingFeeNumerator: BN
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

    return BN.min(feeNumerator, new BN(MAX_FEE_NUMERATOR))
}

/**
 * Calculate the fee numerator on rate limiter from excluded fee amount
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param referenceAmount - The reference amount
 * @param feeIncrementBps - The fee increment bps
 * @param excludedFeeAmount - The excluded fee amount
 * @returns The fee numerator
 */
export function getFeeNumeratorOnRateLimiterFromExcludedAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    excludedFeeAmount: BN
): BN {
    const excludedFeeReferenceAmount = getExcludedFeeAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        referenceAmount
    )

    if (excludedFeeAmount.lte(excludedFeeReferenceAmount)) {
        return cliffFeeNumerator
    }

    const maxIndex = getMaxIndex(cliffFeeNumerator, feeIncrementBps)
    const x0 = referenceAmount
    const one = new BN(1)
    const maxIndexInputAmount = maxIndex.add(one).mul(x0)

    // Check if we're within the quadratic region or the max fee region
    const maxIndexExcludedAmount = getExcludedFeeAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        maxIndexInputAmount
    )

    let includedFeeAmount: BN

    if (excludedFeeAmount.lt(maxIndexExcludedAmount)) {
        // Solve quadratic equation to find included fee amount
        // Based on the Rust implementation's quadratic formula
        const i = mulDiv(
            feeIncrementBps,
            new BN(FEE_DENOMINATOR),
            new BN(BASIS_POINT_MAX),
            Rounding.Down
        )
        const c = cliffFeeNumerator
        const d = new BN(FEE_DENOMINATOR)
        const ex = excludedFeeAmount
        const two = new BN(2)
        const four = new BN(4)

        // Quadratic equation coefficients
        const x = i // coefficient of input_amount^2
        const y = two.mul(d).mul(x0).add(i.mul(x0)).sub(two.mul(c).mul(x0)) // coefficient of input_amount
        const z = two.mul(ex).mul(d).mul(x0) // constant term

        // Solve: x * input_amount^2 - y * input_amount + z = 0
        // input_amount = (y - sqrt(y^2 - 4*x*z)) / (2*x)
        const discriminant = y.mul(y).sub(four.mul(x).mul(z))
        const sqrtDiscriminant = sqrt(discriminant)

        includedFeeAmount = y.sub(sqrtDiscriminant).div(two.mul(x))

        // Handle any remaining amount with the next fee tier
        const aPlusOne = includedFeeAmount.div(x0)
        const firstExcludedAmount = getExcludedFeeAmount(
            cliffFeeNumerator,
            referenceAmount,
            feeIncrementBps,
            includedFeeAmount
        )

        const excludedFeeRemainingAmount =
            excludedFeeAmount.sub(firstExcludedAmount)
        if (excludedFeeRemainingAmount.gt(new BN(0))) {
            const remainingAmountFeeNumerator = c.add(i.mul(aPlusOne))
            const includedFeeRemainingAmount = mulDiv(
                excludedFeeRemainingAmount,
                new BN(FEE_DENOMINATOR),
                new BN(FEE_DENOMINATOR).sub(remainingAmountFeeNumerator),
                Rounding.Up
            )
            includedFeeAmount = includedFeeAmount.add(
                includedFeeRemainingAmount
            )
        }
    } else {
        // Use max fee for the excess amount
        const excludedFeeRemainingAmount = excludedFeeAmount.sub(
            maxIndexExcludedAmount
        )
        const includedFeeRemainingAmount = mulDiv(
            excludedFeeRemainingAmount,
            new BN(FEE_DENOMINATOR),
            new BN(FEE_DENOMINATOR).sub(new BN(MAX_FEE_NUMERATOR)),
            Rounding.Up
        )
        includedFeeAmount = maxIndexInputAmount.add(includedFeeRemainingAmount)
    }

    const tradingFee = includedFeeAmount.sub(excludedFeeAmount)
    const feeNumerator = mulDiv(
        tradingFee,
        new BN(FEE_DENOMINATOR),
        includedFeeAmount,
        Rounding.Up
    )

    // Sanity check - ensure fee numerator is at least the cliff fee numerator
    return BN.max(feeNumerator, cliffFeeNumerator)
}
