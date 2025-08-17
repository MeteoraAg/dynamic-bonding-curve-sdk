import BN from 'bn.js'
import { BASIS_POINT_MAX, U16_MAX } from '../../constants'
import { pow, SafeMath } from '../safeMath'
import { BaseFeeMode } from '../../types'

/**
 * Get max base fee numerator
 * @param cliffFeeNumerator Cliff fee numerator
 * @returns Max fee numerator
 */
export function getMaxBaseFeeNumerator(cliffFeeNumerator: BN): BN {
    return cliffFeeNumerator
}

/**
 * Get min base fee numerator
 * @param cliffFeeNumerator Cliff fee numerator
 * @param numberOfPeriod Number of periods
 * @param periodFrequency Period frequency
 * @param reductionFactor Reduction factor
 * @param feeSchedulerMode Fee scheduler mode
 * @returns Min fee numerator
 */
export function getMinBaseFeeNumerator(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    periodFrequency: BN,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode
): BN {
    return getBaseFeeNumeratorByPeriod(
        cliffFeeNumerator,
        numberOfPeriod,
        periodFrequency,
        reductionFactor,
        feeSchedulerMode
    )
}

/**
 * Get base fee numerator by period
 * @param cliffFeeNumerator Cliff fee numerator
 * @param numberOfPeriod Number of periods
 * @param period Period to calculate fee for
 * @param reductionFactor Reduction factor
 * @param feeSchedulerMode Fee scheduler mode
 * @returns Fee numerator
 */
export function getBaseFeeNumeratorByPeriod(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    period: BN,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode
): BN {
    const periodValue = BN.min(period, new BN(numberOfPeriod))
    const periodNumber = periodValue.toNumber()
    if (periodNumber > U16_MAX) {
        throw new Error('Math overflow')
    }

    switch (feeSchedulerMode) {
        case BaseFeeMode.FeeSchedulerLinear: {
            const feeNumerator = getFeeNumeratorOnLinearFeeScheduler(
                cliffFeeNumerator,
                reductionFactor,
                periodNumber
            )
            return feeNumerator
        }
        case BaseFeeMode.FeeSchedulerExponential: {
            const feeNumerator = getFeeNumeratorOnExponentialFeeScheduler(
                cliffFeeNumerator,
                reductionFactor,
                periodNumber
            )
            return feeNumerator
        }
        default:
            throw new Error('Invalid fee scheduler mode')
    }
}

/**
 * Get fee in period for linear fee scheduler
 * @param cliffFeeNumerator Cliff fee numerator
 * @param reductionFactor Reduction factor
 * @param period Period
 * @returns Fee numerator
 */
export function getFeeNumeratorOnLinearFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN {
    const reduction = SafeMath.mul(new BN(period), reductionFactor)

    if (reduction.gt(cliffFeeNumerator)) {
        return new BN(0)
    }

    return SafeMath.sub(cliffFeeNumerator, reduction)
}

/**
 * Get fee in period for exponential fee scheduler
 * @param cliffFeeNumerator Cliff fee numerator
 * @param reductionFactor Reduction factor
 * @param period Period
 * @returns Fee numerator
 */
export function getFeeNumeratorOnExponentialFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN {
    if (period === 0) {
        return cliffFeeNumerator
    }

    // Match Rust implementation exactly
    // Make reduction_factor into Q64x64, and divided by BASIS_POINT_MAX
    const basisPointMax = new BN(BASIS_POINT_MAX)
    const ONE_Q64 = new BN(1).shln(64)

    const bps = SafeMath.div(SafeMath.shl(reductionFactor, 64), basisPointMax)

    // base = ONE_Q64 - bps (equivalent to 1 - reduction_factor/10_000 in Q64.64)
    const base = SafeMath.sub(ONE_Q64, bps)

    const result = pow(base, new BN(period))

    // final fee: cliffFeeNumerator * result >> 64
    return SafeMath.div(SafeMath.mul(cliffFeeNumerator, result), ONE_Q64)
}

/**
 * Get base fee numerator
 * @param cliffFeeNumerator Cliff fee numerator
 * @param numberOfPeriod Number of periods
 * @param periodFrequency Period frequency
 * @param reductionFactor Reduction factor
 * @param feeSchedulerMode Fee scheduler mode
 * @param currentPoint Current point (slot or timestamp)
 * @param activationPoint Activation point
 * @returns Fee numerator
 */
export function getBaseFeeNumerator(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    periodFrequency: BN,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode,
    currentPoint: BN,
    activationPoint: BN
): BN {
    if (periodFrequency.eq(new BN(0))) {
        return cliffFeeNumerator
    }

    const period = currentPoint.sub(activationPoint).div(periodFrequency)

    return getBaseFeeNumeratorByPeriod(
        cliffFeeNumerator,
        numberOfPeriod,
        period,
        reductionFactor,
        feeSchedulerMode
    )
}
