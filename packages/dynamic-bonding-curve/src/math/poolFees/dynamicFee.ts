import {
    DYNAMIC_FEE_ROUNDING_OFFSET,
    DYNAMIC_FEE_SCALING_FACTOR,
} from '../../constants'
import type { QuoteDynamicFee, QuoteVolatilityTracker } from '../../types'
import { SafeMath } from '../safeMath'
import BN from 'bn.js'

export function isDynamicFeeEnabled(dynamicFee: QuoteDynamicFee): boolean {
    return dynamicFee.initialized !== 0
}

/**
 * ((volatility_accumulator * bin_step)^2 * variable_fee_control + 99_999_999_999) / 100_000_000_000,
 * or 0 when the dynamic fee is not initialized.
 */
export function getVariableFeeNumerator(
    dynamicFee: QuoteDynamicFee,
    volatilityTracker: QuoteVolatilityTracker
): BN {
    if (!isDynamicFeeEnabled(dynamicFee)) {
        return new BN(0)
    }
    const volatilityTimesBinStep = SafeMath.mul(
        volatilityTracker.volatilityAccumulator,
        new BN(dynamicFee.binStep)
    )
    const vFee = SafeMath.mul(
        SafeMath.mul(volatilityTimesBinStep, volatilityTimesBinStep),
        new BN(dynamicFee.variableFeeControl)
    )
    return SafeMath.div(
        SafeMath.add(vFee, DYNAMIC_FEE_ROUNDING_OFFSET),
        DYNAMIC_FEE_SCALING_FACTOR
    )
}
