import { test, expect } from 'bun:test'
import BN from 'bn.js'
import {
    getFeeMode,
    getSwapAmountFromBaseToQuote,
    getSwapAmountFromQuoteToBase,
} from '../../src/math/swapQuote'
import { TradeDirection, CollectFeeMode } from '../../src/types'
import { Q } from '../utils/common'

test('getFeeMode with QuoteToken mode', () => {
    // Test base to quote direction
    const feeMode1 = getFeeMode(
        CollectFeeMode.QuoteToken,
        TradeDirection.BaseToQuote,
        false
    )
    expect(feeMode1.feesOnInput).toBe(false)
    expect(feeMode1.feesOnBaseToken).toBe(false)
    expect(feeMode1.hasReferral).toBe(false)

    // Test quote to base direction
    const feeMode2 = getFeeMode(
        CollectFeeMode.QuoteToken,
        TradeDirection.QuoteToBase,
        true
    )
    expect(feeMode2.feesOnInput).toBe(true)
    expect(feeMode2.feesOnBaseToken).toBe(false)
    expect(feeMode2.hasReferral).toBe(true)
})

test('getFeeMode with OutputToken mode', () => {
    // Test base to quote direction
    const feeMode1 = getFeeMode(
        CollectFeeMode.OutputToken,
        TradeDirection.BaseToQuote,
        false
    )
    expect(feeMode1.feesOnInput).toBe(false)
    expect(feeMode1.feesOnBaseToken).toBe(false)
    expect(feeMode1.hasReferral).toBe(false)

    // Test quote to base direction
    const feeMode2 = getFeeMode(
        CollectFeeMode.OutputToken,
        TradeDirection.QuoteToBase,
        true
    )
    expect(feeMode2.feesOnInput).toBe(false)
    expect(feeMode2.feesOnBaseToken).toBe(true)
    expect(feeMode2.hasReferral).toBe(true)
})

// Test getSwapAmountFromBaseToQuote function
test('getSwapAmountFromBaseToQuote zero amount', () => {
    const sqrtStartPrice = Q(1.0)

    // Create a simple config with one curve point
    const config = {
        curve: [
            {
                sqrtPrice: sqrtStartPrice,
                liquidity: new BN('1000000000'),
            },
        ],
    }

    // Test with zero amount
    const result = getSwapAmountFromBaseToQuote(
        config,
        sqrtStartPrice,
        new BN(0)
    )
    expect(result.outputAmount.isZero()).toBe(true)
    expect(result.nextSqrtPrice.eq(sqrtStartPrice)).toBe(true)
})

// Test getSwapAmountFromQuoteToBase function
test('getSwapAmountFromQuoteToBase zero amount', () => {
    const sqrtStartPrice = Q(1.0)

    // Create a simple config with one curve point
    const config = {
        curve: [
            {
                sqrtPrice: sqrtStartPrice.mul(new BN(2)),
                liquidity: new BN('1000000000'),
            },
        ],
    }

    // Test with zero amount
    const result = getSwapAmountFromQuoteToBase(
        config,
        sqrtStartPrice,
        new BN(0)
    )
    expect(result.outputAmount.isZero()).toBe(true)
    expect(result.nextSqrtPrice.eq(sqrtStartPrice)).toBe(true)
})

// Test error case for getSwapAmountFromQuoteToBase
test('getSwapAmountFromQuoteToBase not enough liquidity', () => {
    const sqrtStartPrice = Q(1.0)

    // Create a simple config with one curve point
    const config = {
        curve: [
            {
                sqrtPrice: sqrtStartPrice.mul(new BN(2)),
                liquidity: new BN('1000000000'),
            },
        ],
    }

    // Test with extremely large amount that exceeds available liquidity
    expect(() =>
        getSwapAmountFromQuoteToBase(
            config,
            sqrtStartPrice,
            new BN('10000000000000000000000')
        )
    ).toThrow('Not enough liquidity to process the entire amount')
})
