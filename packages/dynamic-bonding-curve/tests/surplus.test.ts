import BN from 'bn.js'
import { describe, expect, test } from 'vitest'
import { getSurplusBreakdown } from '../src'

describe('getSurplusBreakdown', () => {
    test('is zero until the quote reserve reaches the threshold', () => {
        const split = getSurplusBreakdown(new BN(999), new BN(1000), 30)
        expect(split.total.isZero()).toBe(true)
        expect(split.partner.isZero()).toBe(true)
        expect(split.creator.isZero()).toBe(true)
        expect(split.protocol.isZero()).toBe(true)
    })

    test('splits 80% between partner and creator and leaves the rest to the protocol', () => {
        const split = getSurplusBreakdown(new BN(1123), new BN(1000), 30)
        expect(split.total.toNumber()).toBe(123)
        // floor(123 * 80 / 100) = 98, floor(98 * 30 / 100) = 29
        expect(split.creator.toNumber()).toBe(29)
        expect(split.partner.toNumber()).toBe(69)
        expect(split.protocol.toNumber()).toBe(25)
    })

    test('a zero creator percentage gives the partner the whole share', () => {
        const split = getSurplusBreakdown(new BN(2000), new BN(1000), 0)
        expect(split.creator.isZero()).toBe(true)
        expect(split.partner.toNumber()).toBe(800)
        expect(split.protocol.toNumber()).toBe(200)
    })
})
