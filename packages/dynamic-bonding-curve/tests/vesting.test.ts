import { describe, expect, test } from 'vitest'
import { getLockedVestingParams, TokenDecimal } from '../src'

describe('getLockedVestingParams', () => {
    test('splits the amount over the periods and keeps the remainder at the cliff', () => {
        const params = getLockedVestingParams(
            1000,
            3,
            100,
            300,
            0,
            TokenDecimal.SIX
        )
        expect(params.frequency.toNumber()).toBe(100)
        expect(params.numberOfPeriod.toNumber()).toBe(3)
        expect(params.amountPerPeriod.toString()).toBe('300000000')
        expect(params.cliffUnlockAmount.toString()).toBe('100000000')
    })

    test('rejects a vesting duration shorter than the number of periods', () => {
        expect(() =>
            getLockedVestingParams(1000, 100, 0, 50, 0, TokenDecimal.SIX)
        ).toThrow(
            'totalVestingDuration must be at least numberOfVestingPeriod seconds'
        )
    })

    test('rejects a cliff-only vesting below one token', () => {
        expect(() =>
            getLockedVestingParams(0.5, 0, 0.5, 0, 0, TokenDecimal.SIX)
        ).toThrow('must be at least 1 token')
    })
})
