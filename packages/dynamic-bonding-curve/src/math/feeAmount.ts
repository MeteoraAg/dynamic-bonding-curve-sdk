import BN from 'bn.js'
import { FEE_DENOMINATOR, U64_MAX } from '../constants'
import { Rounding } from '../types'
import { mulDiv } from './utilsMath'
import { SafeMath } from './safeMath'
import { ProgramError } from './errors'

/**
 * [amount after the fee, fee], with the fee rounded up;
 * the program's PoolFeesConfig::get_excluded_fee_amount.
 */
export function getExcludedFeeAmount(
    tradeFeeNumerator: BN,
    includedFeeAmount: BN
): [BN, BN] {
    const tradingFee = mulDiv(
        includedFeeAmount,
        tradeFeeNumerator,
        new BN(FEE_DENOMINATOR),
        Rounding.Up
    )
    return [SafeMath.sub(includedFeeAmount, tradingFee), tradingFee]
}

/**
 * [amount before the fee, fee], rounded up and bounded by u64;
 * the program's PoolFeesConfig::get_included_fee_amount.
 */
export function getIncludedFeeAmount(
    tradeFeeNumerator: BN,
    excludedFeeAmount: BN
): [BN, BN] {
    const includedFeeAmount = mulDiv(
        excludedFeeAmount,
        new BN(FEE_DENOMINATOR),
        SafeMath.sub(new BN(FEE_DENOMINATOR), tradeFeeNumerator),
        Rounding.Up
    )
    if (includedFeeAmount.gt(U64_MAX)) {
        throw new Error(ProgramError.TypeCastFailed)
    }
    return [
        includedFeeAmount,
        SafeMath.sub(includedFeeAmount, excludedFeeAmount),
    ]
}
