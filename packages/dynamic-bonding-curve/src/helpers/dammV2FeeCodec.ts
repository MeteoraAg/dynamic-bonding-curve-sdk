import { BorshCoder, Idl, IdlTypes } from '@coral-xyz/anchor'
import DammV2IDL from '../idl/damm-v2/idl.json'
import type { CpAmm as DammV2Types } from '../idl/damm-v2/idl'

export const dammV2Coder = new BorshCoder(DammV2IDL as Idl)
export type PodAlignedFeeMarketCapScheduler =
    IdlTypes<DammV2Types>['podAlignedFeeMarketCapScheduler']

export function decodePodAlignedFeeMarketCapScheduler(
    data: Buffer
): PodAlignedFeeMarketCapScheduler {
    const decoded = dammV2Coder.types.decode(
        'PodAlignedFeeMarketCapScheduler',
        data
    )
    return {
        cliffFeeNumerator: decoded.cliff_fee_numerator,
        numberOfPeriod: decoded.number_of_period,
        sqrtPriceStepBps: decoded.sqrt_price_step_bps,
        schedulerExpirationDuration: decoded.scheduler_expiration_duration,
        reductionFactor: decoded.reduction_factor,
        baseFeeMode: decoded.base_fee_mode,
        padding: decoded.padding,
    }
}
