import { BaseFeeMode, getFeeSchedulerParams } from '../src'
import { expect, test, describe } from 'vitest'

describe('getFeeSchedulerParams', () => {
    test('linear schedule reduces the numerator by the same amount each period', () => {
        const result = getFeeSchedulerParams(
            5000,
            1000,
            BaseFeeMode.FeeSchedulerLinear,
            144,
            144 * 60
        )

        expect(result.cliffFeeNumerator.toNumber()).toEqual(500_000_000)
        expect(result.firstFactor).toEqual(144)
        expect(result.secondFactor.toNumber()).toEqual(60)
        expect(result.thirdFactor.toNumber()).toEqual(2_777_777)
    })

    test('exponential schedule picks the Q64 decay that lands on the ending fee', () => {
        const result = getFeeSchedulerParams(
            5000,
            100,
            BaseFeeMode.FeeSchedulerExponential,
            100,
            10 * 60 * 60
        )

        expect(result.secondFactor.toNumber()).toEqual(360)
        expect(result.thirdFactor.toNumber()).toEqual(383)
    })
})
