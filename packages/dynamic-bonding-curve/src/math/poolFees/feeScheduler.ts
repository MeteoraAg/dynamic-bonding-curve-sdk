import BN from 'bn.js'
import { MAX_BASIS_POINT, ONE_Q64, U16_MAX } from '../../constants'
import { pow, SafeMath } from '../safeMath'
import { BaseFeeMode } from '../../types'
import { ProgramError } from '../errors'

/** The fee after every period has elapsed. */
export function getFeeSchedulerMinBaseFeeNumerator(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode
): BN {
    return getBaseFeeNumeratorByPeriod(
        cliffFeeNumerator,
        numberOfPeriod,
        new BN(numberOfPeriod),
        reductionFactor,
        feeSchedulerMode
    )
}

/** The fee in a period, which stops decaying after numberOfPeriod. */
export function getBaseFeeNumeratorByPeriod(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    period: BN,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode
): BN {
    const periodNumber = BN.min(period, new BN(numberOfPeriod)).toNumber()
    if (periodNumber > U16_MAX) {
        throw new Error(ProgramError.MathOverflow)
    }

    switch (feeSchedulerMode) {
        case BaseFeeMode.FeeSchedulerLinear:
            return getFeeNumeratorOnLinearFeeScheduler(
                cliffFeeNumerator,
                reductionFactor,
                periodNumber
            )
        case BaseFeeMode.FeeSchedulerExponential:
            return getFeeNumeratorOnExponentialFeeScheduler(
                cliffFeeNumerator,
                reductionFactor,
                periodNumber
            )
        default:
            throw new Error(ProgramError.InvalidBaseFeeMode)
    }
}

/** fee = cliff_fee_numerator - period * reduction_factor */
export function getFeeNumeratorOnLinearFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN {
    return SafeMath.sub(
        cliffFeeNumerator,
        SafeMath.mul(new BN(period), reductionFactor)
    )
}

/** fee = cliff_fee_numerator * (1 - reduction_factor / 10_000)^period in Q64 */
export function getFeeNumeratorOnExponentialFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN {
    if (period === 0) {
        return cliffFeeNumerator
    }
    const bps = SafeMath.div(
        SafeMath.shl(reductionFactor, 64),
        new BN(MAX_BASIS_POINT)
    )
    const base = SafeMath.sub(ONE_Q64, bps)
    const result = pow(base, new BN(period))
    return SafeMath.div(SafeMath.mul(cliffFeeNumerator, result), ONE_Q64)
}

/** The fee at currentPoint, with period = (currentPoint - activationPoint) / periodFrequency. */
export function getBaseFeeNumerator(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    periodFrequency: BN,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode,
    currentPoint: BN,
    activationPoint: BN
): BN {
    if (periodFrequency.isZero()) {
        return cliffFeeNumerator
    }
    const period = SafeMath.div(
        SafeMath.sub(currentPoint, activationPoint),
        periodFrequency
    )
    return getBaseFeeNumeratorByPeriod(
        cliffFeeNumerator,
        numberOfPeriod,
        period,
        reductionFactor,
        feeSchedulerMode
    )
}
