import { describe, expect, test } from 'vitest'
import BN from 'bn.js'
import { CollectFeeMode, TradeDirection } from '../src'
import {
    calculateBaseToQuoteFromAmountIn,
    getFeeMode,
    getIncludedFeeAmount,
} from '../src/math'
import { buildTestCurveConfig } from './utils/common'
import { MAX_FEE_NUMERATOR, U64_MAX } from '../src/constants'

describe('calculateBaseToQuoteFromAmountIn', () => {
    const curveConfig = buildTestCurveConfig()

    test('calculateBaseToQuoteFromAmountIn returns amountLeft when input exceeds available liquidity', () => {
        const configState = {
            curve: curveConfig.curve,
            sqrtStartPrice: curveConfig.sqrtStartPrice,
        }

        const currentSqrtPrice = curveConfig.sqrtStartPrice

        const excessiveAmountIn = new BN('1000000000000000')

        const result = calculateBaseToQuoteFromAmountIn(
            configState,
            currentSqrtPrice,
            excessiveAmountIn
        )

        expect(result.nextSqrtPrice.eq(curveConfig.sqrtStartPrice)).toBe(true)

        expect(result.amountLeft.gte(new BN(0))).toBe(true)
        expect(result.amountLeft.eq(excessiveAmountIn)).toBe(true)

        expect(result.outputAmount.eq(new BN(0))).toBe(true)
    })

    test('calculateBaseToQuoteFromAmountIn caps at sqrtStartPrice when selling pushes price below', () => {
        const configState = {
            curve: curveConfig.curve,
            sqrtStartPrice: curveConfig.sqrtStartPrice,
        }

        let currentSqrtPrice = curveConfig.sqrtStartPrice
        for (const point of curveConfig.curve) {
            if (
                !point.sqrtPrice.isZero() &&
                point.sqrtPrice.gt(currentSqrtPrice)
            ) {
                currentSqrtPrice = point.sqrtPrice
            }
        }

        const excessiveAmountIn = new BN('10000000000000000000')

        const result = calculateBaseToQuoteFromAmountIn(
            configState,
            currentSqrtPrice,
            excessiveAmountIn
        )

        expect(result.nextSqrtPrice.eq(curveConfig.sqrtStartPrice)).toBe(true)

        expect(result.amountLeft.gt(new BN(0))).toBe(true)
        expect(result.outputAmount.gt(new BN(0))).toBe(true)
    })
})

describe('swap fee math bounds', () => {
    test('getFeeMode rejects an unknown collect fee mode', () => {
        expect(() =>
            getFeeMode(2 as CollectFeeMode, TradeDirection.QuoteToBase, false)
        ).toThrow('Invalid collect fee mode')
    })

    test('getIncludedFeeAmount rejects an amount above u64', () => {
        expect(() =>
            getIncludedFeeAmount(new BN(MAX_FEE_NUMERATOR), U64_MAX)
        ).toThrow('Type cast error')
    })
})
