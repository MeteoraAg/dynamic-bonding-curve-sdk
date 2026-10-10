import {
    ActivationType,
    getRateLimiterParams,
    getBaseFeeParams,
    BaseFeeMode,
    bpsToFeeNumerator,
} from '../src'
import { getFeeNumeratorFromIncludedAmount } from '../src/math'
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

        const fee2 = getFeeNumeratorFromIncludedAmount(
            params.cliffFeeNumerator,
            new BN(referenceAmount * 1e9),
            new BN(feeIncrementBps),
            new BN(0.2 * 1e9)
        )

        const fee3 = getFeeNumeratorFromIncludedAmount(
            params.cliffFeeNumerator,
            new BN(referenceAmount * 1e9),
            new BN(feeIncrementBps),
            new BN(0.1 * 1e9)
        )

        const fee4 = getFeeNumeratorFromIncludedAmount(
            params.cliffFeeNumerator,
            new BN(referenceAmount * 1e9),
            new BN(feeIncrementBps),
            new BN(1 * 1e9)
        )

        expect(fee.toNumber()).toBeGreaterThan(fee2.toNumber())
        expect(fee2.toNumber()).toBe(fee3.toNumber())
        expect(fee4.toNumber()).toBeGreaterThan(fee.toNumber())
    })

    test('getBaseFeeParams rejects RateLimiter for new configs', () => {
        expect(() =>
            getBaseFeeParams({
                baseFeeMode: BaseFeeMode.RateLimiter,
                rateLimiterParam: {
                    baseFeeBps: 100,
                    feeIncrementBps: 10,
                    referenceAmount: 0.2,
                    maxLimiterDuration: 100000,
                },
            })
        ).toThrow(/RateLimiter is deprecated/)
    })
})
