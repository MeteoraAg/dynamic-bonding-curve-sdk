import {
    MAX_BASIS_POINT,
    FEE_DENOMINATOR,
    BaseFeeMode,
    calculateFeeSchedulerEndingBaseFeeBps,
} from '../src'
import { expect, test, describe } from 'vitest'

describe('getMinBaseFeeBps tests', () => {
    test('linear fee scheduler - should calculate minimum fee correctly', () => {
        const baseFeeBps = 5000
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / MAX_BASIS_POINT
        const numberOfPeriod = 144
        const periodFrequency = 60
        const reductionFactor = 3333333
        const baseFeeMode = BaseFeeMode.FeeSchedulerLinear

        const minBaseFeeBps = calculateFeeSchedulerEndingBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            periodFrequency,
            reductionFactor,
            baseFeeMode
        )

        // linear mode: cliffFeeNumerator - (numberOfPeriod * reductionFactor)
        const expectedMinFeeNumerator =
            cliffFeeNumerator - numberOfPeriod * reductionFactor
        const expectedMinFeeBps = Math.max(
            0,
            (expectedMinFeeNumerator / FEE_DENOMINATOR) * MAX_BASIS_POINT
        )

        expect(minBaseFeeBps).toBeLessThan(baseFeeBps)
        expect(minBaseFeeBps).toEqual(expectedMinFeeBps)
    })

    test('exponential fee scheduler - should calculate minimum fee correctly', () => {
        const baseFeeBps = 5000
        const cliffFeeNumerator =
            (baseFeeBps * FEE_DENOMINATOR) / MAX_BASIS_POINT
        const numberOfPeriod = 38
        const periodFrequency = 60
        const reductionFactor = 823
        const baseFeeMode = BaseFeeMode.FeeSchedulerExponential

        const minBaseFeeBps = calculateFeeSchedulerEndingBaseFeeBps(
            cliffFeeNumerator,
            numberOfPeriod,
            periodFrequency,
            reductionFactor,
            baseFeeMode
        )

        // Q64 fee for cliff 500_000_000, reduction 823, 38 periods
        const expectedMinFeeNumerator = 19124839
        const expectedMinFeeBps = Math.max(
            0,
            (expectedMinFeeNumerator / FEE_DENOMINATOR) * MAX_BASIS_POINT
        )

        expect(minBaseFeeBps).toBeLessThan(baseFeeBps)
        expect(minBaseFeeBps).toEqual(expectedMinFeeBps)
    })
})
