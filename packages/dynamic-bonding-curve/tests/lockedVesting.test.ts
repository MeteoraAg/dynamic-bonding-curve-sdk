import {
    getLockedVestingParams,
    getTotalVestingAmount,
    TokenDecimal,
} from '../src'
import { expect, test, describe } from 'vitest'

describe('getLockedVestingParams', () => {
    const cases = [
        {
            totalLockedVestingAmount: 7777777,
            numberOfVestingPeriod: 13,
            cliffUnlockAmount: 8,
            totalVestingDuration: 365 * 24 * 60 * 60,
            cliffDurationFromMigrationTime: 0,
        },
        {
            totalLockedVestingAmount: 10000000,
            numberOfVestingPeriod: 365,
            cliffUnlockAmount: 0,
            totalVestingDuration: 365 * 24 * 60 * 60,
            cliffDurationFromMigrationTime: 0,
        },
        {
            totalLockedVestingAmount: 20000000,
            numberOfVestingPeriod: 1,
            cliffUnlockAmount: 20000000,
            totalVestingDuration: 1,
            cliffDurationFromMigrationTime: 1000 * 365 * 24 * 60 * 60,
        },
        {
            totalLockedVestingAmount: 8888888,
            numberOfVestingPeriod: 9,
            cliffUnlockAmount: 9999,
            totalVestingDuration: 365 * 24 * 60 * 60,
            cliffDurationFromMigrationTime: 0,
        },
        {
            totalLockedVestingAmount: 1000000,
            numberOfVestingPeriod: 1,
            cliffUnlockAmount: 1000000,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 365 * 24 * 60 * 60,
        },
    ]

    test.each(cases)(
        'total vesting amount matches the input for %o',
        (params) => {
            const result = getLockedVestingParams(
                params.totalLockedVestingAmount,
                params.numberOfVestingPeriod,
                params.cliffUnlockAmount,
                params.totalVestingDuration,
                params.cliffDurationFromMigrationTime,
                TokenDecimal.SIX
            )

            expect(getTotalVestingAmount(result).toNumber()).toEqual(
                params.totalLockedVestingAmount * 10 ** TokenDecimal.SIX
            )
        }
    )
})
