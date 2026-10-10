import BN from 'bn.js'
import { describe, expect, test } from 'vitest'
import {
    buildCurve,
    getBaseTokenForSwap,
    getCurveBreakdown,
    getMigrationThresholdPrice,
    getQuoteReserveFromNextSqrtPrice,
    getSwapAmountWithBuffer,
    MAX_CURVE_POINT,
} from '../src'
import { liveCurve } from '../src/math'
import { curveBaseParams } from './utils/curve'

// PoolConfig.curve is stored with MAX_CURVE_POINT entries; the unused ones are zero.
const config = buildCurve({
    ...curveBaseParams(),
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: 100,
})
const zero = { sqrtPrice: new BN(0), liquidity: new BN(0) }
const stored = [
    ...config.curve,
    ...Array.from(
        { length: MAX_CURVE_POINT - config.curve.length },
        () => zero
    ),
]
const migrationSqrtPrice = getMigrationThresholdPrice(
    config.migrationQuoteThreshold,
    config.sqrtStartPrice,
    config.curve
)
const swapBase = getBaseTokenForSwap(
    config.sqrtStartPrice,
    migrationSqrtPrice,
    config.curve
)

describe('stored curve padding', () => {
    test('liveCurve drops the zero points', () => {
        expect(stored).toHaveLength(MAX_CURVE_POINT)
        expect(liveCurve(stored)).toEqual(config.curve)
        expect(liveCurve(config.curve)).toBe(config.curve)
    })

    test('the curve helpers read a stored curve like the program', () => {
        expect(
            getMigrationThresholdPrice(
                config.migrationQuoteThreshold,
                config.sqrtStartPrice,
                stored
            ).eq(migrationSqrtPrice)
        ).toBe(true)
        expect(
            getBaseTokenForSwap(
                config.sqrtStartPrice,
                migrationSqrtPrice,
                stored
            ).eq(swapBase)
        ).toBe(true)
        expect(
            getSwapAmountWithBuffer(swapBase, config.sqrtStartPrice, stored).eq(
                getSwapAmountWithBuffer(
                    swapBase,
                    config.sqrtStartPrice,
                    config.curve
                )
            )
        ).toBe(true)

        expect(
            getQuoteReserveFromNextSqrtPrice(migrationSqrtPrice, {
                curve: stored,
                sqrtStartPrice: config.sqrtStartPrice,
            }).eq(config.migrationQuoteThreshold)
        ).toBe(true)

        const breakdown = getCurveBreakdown(
            config.migrationQuoteThreshold,
            config.sqrtStartPrice,
            stored
        )
        expect(breakdown.segmentAmounts).toHaveLength(config.curve.length)
        expect(breakdown.finalSqrtPrice.eq(migrationSqrtPrice)).toBe(true)
    })
})
