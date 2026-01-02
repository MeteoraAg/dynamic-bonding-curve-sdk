import {
    ActivationType,
    getLockedVestingParams,
    getTotalVestingAmount,
    TokenDecimal,
} from '../src'
import { convertBNToDecimal } from './utils/common'
import { expect, test, describe } from 'vitest'

describe('calculateLockedVesting tests', () => {
    test('calculate locked vesting parameters 1', () => {
        const totalLockedVestingAmount = 7777777
        const numberOfVestingPeriod = 13
        const cliffUnlockAmount = 8
        const totalVestingDuration = 365 * 24 * 60 * 60
        const cliffDurationFromMigrationTime = 0

        const result = getLockedVestingParams(
            totalLockedVestingAmount,
            numberOfVestingPeriod,
            cliffUnlockAmount,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        console.log(
            'totalCalculatedVestingAmount',
            totalCalculatedVestingAmount.toString()
        )
        console.log('totalLockedVestingAmount', totalLockedVestingAmount)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalLockedVestingAmount * 10 ** TokenDecimal.SIX
        )
    })

    test('calculate locked vesting parameters 2', () => {
        const totalLockedVestingAmount = 10000000
        const numberOfVestingPeriod = 365
        const cliffUnlockAmount = 0
        const totalVestingDuration = 365 * 24 * 60 * 60
        const cliffDurationFromMigrationTime = 0

        const result = getLockedVestingParams(
            totalLockedVestingAmount,
            numberOfVestingPeriod,
            cliffUnlockAmount,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        console.log(
            'totalCalculatedVestingAmount',
            totalCalculatedVestingAmount.toString()
        )
        console.log('totalLockedVestingAmount', totalLockedVestingAmount)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalLockedVestingAmount * 10 ** TokenDecimal.SIX
        )
    })

    test('calculate locked vesting parameters 3', () => {
        const totalLockedVestingAmount = 20000000
        const numberOfVestingPeriod = 1
        const cliffUnlockAmount = 20000000
        const totalVestingDuration = 1
        const cliffDurationFromMigrationTime = 1000 * 365 * 24 * 60 * 60

        const result = getLockedVestingParams(
            totalLockedVestingAmount,
            numberOfVestingPeriod,
            cliffUnlockAmount,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        console.log(
            'totalCalculatedVestingAmount',
            totalCalculatedVestingAmount.toString()
        )
        console.log('totalLockedVestingAmount', totalLockedVestingAmount)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalLockedVestingAmount * 10 ** TokenDecimal.SIX
        )
    })

    test('calculate locked vesting parameters 4', () => {
        const totalLockedVestingAmount = 8888888
        const numberOfVestingPeriod = 9
        const cliffUnlockAmount = 9999
        const totalVestingDuration = 365 * 24 * 60 * 60
        const cliffDurationFromMigrationTime = 0

        const result = getLockedVestingParams(
            totalLockedVestingAmount,
            numberOfVestingPeriod,
            cliffUnlockAmount,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        console.log(
            'totalCalculatedVestingAmount',
            totalCalculatedVestingAmount.toString()
        )
        console.log('totalLockedVestingAmount', totalLockedVestingAmount)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalLockedVestingAmount * 10 ** TokenDecimal.SIX
        )
    })

    test('calculate locked vesting parameters 5', () => {
        const totalLockedVestingAmount = 1000000
        const numberOfVestingPeriod = 1
        const cliffUnlockAmount = 1000000
        const totalVestingDuration = 0
        const cliffDurationFromMigrationTime = 365 * 24 * 60 * 60

        const result = getLockedVestingParams(
            totalLockedVestingAmount,
            numberOfVestingPeriod,
            cliffUnlockAmount,
            totalVestingDuration,
            cliffDurationFromMigrationTime,
            TokenDecimal.SIX
        )

        console.log('result', convertBNToDecimal(result))

        const totalCalculatedVestingAmount = getTotalVestingAmount(result)

        console.log(
            'totalCalculatedVestingAmount',
            totalCalculatedVestingAmount.toString()
        )
        console.log('totalLockedVestingAmount', totalLockedVestingAmount)

        expect(totalCalculatedVestingAmount.toNumber()).toEqual(
            totalLockedVestingAmount * 10 ** TokenDecimal.SIX
        )
    })
})
