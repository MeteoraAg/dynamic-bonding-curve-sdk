import {
    ActivationType,
    getRateLimiterParams,
    BaseFeeMode,
    bpsToFeeNumerator,
    getFeeNumeratorFromIncludedAmount,
} from '../src'
import { expect, test, describe } from 'vitest'
import BN from 'bn.js'

describe('Rate Limiter tests', () => {
    test('getRateLimiterParams', () => {
        const baseFeeBps = 100 // 1%
        const feeIncrementBps = 10 // 10 bps
        const referenceAmount = 0.2
        const maxLimiterDuration = 100000 // slots
        const tokenQuoteDecimal = 6
        const activationType = ActivationType.Slot

        const params = getRateLimiterParams(
            baseFeeBps,
            feeIncrementBps,
            referenceAmount,
            maxLimiterDuration,
            tokenQuoteDecimal,
            activationType
        )

        console.log(params)

        expect(params.baseFeeMode).toBe(BaseFeeMode.RateLimiter)
        expect(params.cliffFeeNumerator.toNumber()).toBe(
            bpsToFeeNumerator(baseFeeBps).toNumber()
        )
        expect(params.firstFactor).toBeGreaterThan(0) // feeIncrementBps
        expect(params.secondFactor.toNumber()).toBe(maxLimiterDuration)
        expect(params.thirdFactor.toNumber()).toBe(
            referenceAmount * 10 ** tokenQuoteDecimal
        )

        const fee = getFeeNumeratorFromIncludedAmount(
            params.cliffFeeNumerator,
            new BN(referenceAmount * 1e9),
            new BN(feeIncrementBps),
            new BN(0.4 * 1e9)
        )
        console.log('0.4 SOL tx fee:', fee.toString())

        const fee2 = getFeeNumeratorFromIncludedAmount(
            params.cliffFeeNumerator,
            new BN(referenceAmount * 1e9),
            new BN(feeIncrementBps),
            new BN(0.2 * 1e9)
        )
        console.log('0.2 SOL tx fee:', fee2.toString())

        const fee3 = getFeeNumeratorFromIncludedAmount(
            params.cliffFeeNumerator,
            new BN(referenceAmount * 1e9),
            new BN(feeIncrementBps),
            new BN(0.1 * 1e9)
        )
        console.log('0.1 SOL tx fee:', fee3.toString())

        const fee4 = getFeeNumeratorFromIncludedAmount(
            params.cliffFeeNumerator,
            new BN(referenceAmount * 1e9),
            new BN(feeIncrementBps),
            new BN(1 * 1e9)
        )
        console.log('1 SOL tx fee:', fee4.toString())

        expect(fee.toNumber()).toBeGreaterThan(fee2.toNumber())
        expect(fee2.toNumber()).toBe(fee3.toNumber())
        expect(fee4.toNumber()).toBeGreaterThan(fee.toNumber())
    })
})
