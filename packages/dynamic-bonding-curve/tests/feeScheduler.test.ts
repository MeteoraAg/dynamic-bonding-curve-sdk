import { BaseFeeMode, getFeeSchedulerParams } from '../src'
import { convertBNToDecimal } from './utils/common'
import { expect, test, describe } from 'vitest'

describe('calculateFeeScheduler tests', () => {
    test('linear fee scheduler - should calculate parameters correctly', () => {
        const startingFeeBps = 5000
        const endingFeeBps = 1000
        const numberOfPeriod = 144
        const feeSchedulerMode = BaseFeeMode.FeeSchedulerLinear
        const totalDuration = 60

        const result = getFeeSchedulerParams(
            startingFeeBps,
            endingFeeBps,
            feeSchedulerMode,
            numberOfPeriod,
            totalDuration
        )

        console.log('result', convertBNToDecimal(result))

        // linear mode: cliffFeeNumerator - (numberOfPeriod * reductionFactor)
        expect(result.thirdFactor.toNumber()).toEqual(2777777)
    })

    test('exponential fee scheduler - should calculate parameters correctly', () => {
        const startingFeeBps = 5000
        const endingFeeBps = 100
        const numberOfPeriod = 100
        const feeSchedulerMode = BaseFeeMode.FeeSchedulerExponential
        const totalDuration = 10 * 60 * 60

        const result = getFeeSchedulerParams(
            startingFeeBps,
            endingFeeBps,
            feeSchedulerMode,
            numberOfPeriod,
            totalDuration
        )

        console.log('result', convertBNToDecimal(result))

        // exponential mode: cliffFeeNumerator * (1 - reductionFactor/10_000)^numberOfPeriod
        expect(result.thirdFactor.toNumber()).toEqual(383)
    })
})
