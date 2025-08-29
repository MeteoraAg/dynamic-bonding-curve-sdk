import {
    DYNAMIC_FEE_ROUNDING_OFFSET,
    DYNAMIC_FEE_SCALING_FACTOR,
} from '../../constants'
import { DynamicFeeConfig, VolatilityTracker } from '../../types'
import { SafeMath } from '../safeMath'
import BN from 'bn.js'

/**
 * Check if dynamic fee is enabled
 * @param dynamicFee Dynamic fee parameters
 * @returns True if dynamic fee is enabled
 */
export function isDynamicFeeEnabled(dynamicFee: DynamicFeeConfig): boolean {
    return dynamicFee.initialized !== 0
}

/**
 * Get variable fee numerator from dynamic fee
 * @param dynamicFee Dynamic fee parameters
 * @param volatilityTracker Volatility tracker
 * @returns Variable fee numerator
 */
export function getVariableFeeNumerator(
    dynamicFee: DynamicFeeConfig,
    volatilityTracker: VolatilityTracker
): BN {
    if (!isDynamicFeeEnabled(dynamicFee)) {
        return new BN(0)
    }

    // 1. Computing the squared price movement (volatility_accumulator * bin_step)^2
    const volatilityTimesBinStep = SafeMath.mul(
        volatilityTracker.volatilityAccumulator,
        new BN(dynamicFee.binStep)
    )
    const squareVfaBin = SafeMath.mul(
        volatilityTimesBinStep,
        volatilityTimesBinStep
    )

    // 2. Multiplying by the fee control factor
    const vFee = SafeMath.mul(
        squareVfaBin,
        new BN(dynamicFee.variableFeeControl)
    )

    // 3. Scaling down the result to fit within u64 range (dividing by 1e11 and rounding up)
    const scaledVFee = SafeMath.div(
        SafeMath.add(vFee, DYNAMIC_FEE_ROUNDING_OFFSET),
        DYNAMIC_FEE_SCALING_FACTOR
    )

    return scaledVFee
}
