import {
    ActivationType,
    getRateLimiterParams,
    BaseFeeMode,
    bpsToFeeNumerator,
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
    calculateRateLimiterFee,
} from '../src'
import { expect, test, describe } from 'bun:test'
import BN from 'bn.js'

describe('Rate Limiter tests', () => {
    test('getRateLimiterParams with Slot activation type', () => {
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

        const fee = calculateRateLimiterFee(params, new BN(0.4 * 1e9))
        console.log('0.4 SOL tx fee:', fee.toString())

        const fee2 = calculateRateLimiterFee(params, new BN(0.2 * 1e9))
        console.log('0.2 SOL tx fee:', fee2.toString())

        const fee3 = calculateRateLimiterFee(params, new BN(0.1 * 1e9))
        console.log('0.1 SOL tx fee:', fee3.toString())
    })

    test('getRateLimiterParams with Timestamp activation type', () => {
        const baseFeeBps = 100 // 1%
        const feeIncrementBps = 50 // 50 bps
        const referenceAmount = 1000
        const maxLimiterDuration = 40000 // seconds
        const tokenQuoteDecimal = 6
        const activationType = ActivationType.Timestamp

        const params = getRateLimiterParams(
            baseFeeBps,
            feeIncrementBps,
            referenceAmount,
            maxLimiterDuration,
            tokenQuoteDecimal,
            activationType
        )

        // Verify the parameters
        expect(params.baseFeeMode).toBe(BaseFeeMode.RateLimiter)
        expect(params.cliffFeeNumerator.toNumber()).toBe(
            bpsToFeeNumerator(baseFeeBps).toNumber()
        )
        expect(params.firstFactor).toBeGreaterThan(0) // feeIncrementBps
        expect(params.secondFactor.toNumber()).toBe(maxLimiterDuration)
        expect(params.thirdFactor.toNumber()).toBe(
            referenceAmount * 10 ** tokenQuoteDecimal
        )
    })

    test('calculateRateLimiterFee with different input amounts', () => {
        const baseFeeBps = 100 // 1%
        const feeIncrementBps = 100 // 100 bps
        const referenceAmount = 1
        const maxLimiterDuration = 100000
        const tokenQuoteDecimal = 9
        const activationType = ActivationType.Slot

        const params = getRateLimiterParams(
            baseFeeBps,
            feeIncrementBps,
            referenceAmount,
            maxLimiterDuration,
            tokenQuoteDecimal,
            activationType
        )

        // test fee calculation for input amount <= reference amount
        const inputAmount1 = new BN(0.5 * 1e9)
        const fee1 = calculateRateLimiterFee(params, inputAmount1)
        expect(fee1.toNumber()).toBe(
            inputAmount1
                .mul(params.cliffFeeNumerator)
                .div(new BN(FEE_DENOMINATOR))
                .toNumber()
        )
        console.log('0.5 SOL tx fee:', fee1.toString())

        // test fee calculation for input amount > reference amount but < 2 * reference amount
        const inputAmount2 = new BN(1.5 * 1e9)
        const fee2 = calculateRateLimiterFee(params, inputAmount2)
        expect(fee2.toNumber()).toBeGreaterThan(fee1.toNumber())

        // test fee calculation for input amount >> reference amount
        const inputAmount3 = new BN(10 * 1e9)
        const fee3 = calculateRateLimiterFee(params, inputAmount3)
        expect(fee3.toNumber()).toBeGreaterThan(fee2.toNumber())

        // verif that fees are increasing with input amount
        expect(fee3.toNumber()).toBeGreaterThan(fee2.toNumber())
        expect(fee2.toNumber()).toBeGreaterThan(fee1.toNumber())
    })

    test('calculateRateLimiterFee with maximum fee cap', () => {
        const baseFeeBps = 100 // 1%
        const feeIncrementBps = 200 // 200 bps
        const referenceAmount = 1000
        const maxLimiterDuration = 100000
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

        // Test with a very large input amount to ensure we hit the maximum fee
        const inputAmount = new BN(1000000)
        const fee = calculateRateLimiterFee(params, inputAmount)

        // Calculate the maximum possible fee
        const maxFee = inputAmount
            .mul(new BN(MAX_FEE_NUMERATOR))
            .div(new BN(FEE_DENOMINATOR))

        // The actual fee should not exceed the maximum fee
        expect(fee.toNumber()).toBeLessThanOrEqual(maxFee.toNumber())
    })

    test('test rate limiter', () => {
        const baseFeeBps = 200
        const feeIncrementBps = 1000
        const referenceAmount = 0.5
        const maxLimiterDuration = 9000
        const tokenQuoteDecimal = 9
        const activationType = ActivationType.Slot

        const params = getRateLimiterParams(
            baseFeeBps,
            feeIncrementBps,
            referenceAmount,
            maxLimiterDuration,
            tokenQuoteDecimal,
            activationType
        )

        const inputAmount = new BN(4995000000)
        const fee = calculateRateLimiterFee(params, inputAmount)
        console.log('5 SOL tx fee:', fee.toString())
    })
})
