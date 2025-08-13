import BN from 'bn.js'
import { BASIS_POINT_MAX } from '../constants'
import { pow, SafeMath } from './safeMath'

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
