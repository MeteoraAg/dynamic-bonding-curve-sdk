import { expect, test, describe } from 'vitest'
import { buildCurveWithTwoSegments } from '../src/helpers'
import { BaseFeeMode, TokenDecimal } from '../src'
import { curveBaseParams, expectProgramValidCurve } from './utils/curve'

describe('buildCurveWithTwoSegments tests', () => {
    const baseParams = curveBaseParams({
        token: { leftover: 10000 },
        fee: { dynamicFeeEnabled: true },
    })

    test('build curve with two segments', () => {
        const config = buildCurveWithTwoSegments({
            ...baseParams,
            token: {
                ...baseParams.token,
                tokenBaseDecimal: TokenDecimal.NINE,
                leftover: 350000000,
            },
            fee: {
                ...baseParams.fee,
                baseFeeParams: {
                    baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                    feeSchedulerParam: {
                        startingFeeBps: 5000,
                        endingFeeBps: 100,
                        numberOfPeriod: 120,
                        totalDuration: 120,
                    },
                },
            },
            initialMarketCap: 20000,
            migrationMarketCap: 1000000,
            percentageSupplyOnMigration: 20,
        })

        expectProgramValidCurve(config)
    })

    test('keeps a fractional percentageSupplyOnMigration', () => {
        const params = {
            ...baseParams,
            initialMarketCap: 30,
            migrationMarketCap: 300,
            percentageSupplyOnMigration: 20,
        }
        const whole = buildCurveWithTwoSegments(params)
        const fraction = buildCurveWithTwoSegments({
            ...params,
            percentageSupplyOnMigration: 20.5,
        })
        expect(
            fraction.migrationQuoteThreshold.eq(whole.migrationQuoteThreshold)
        ).toBe(false)
        expect(fraction.curve[0].liquidity.eq(whole.curve[0].liquidity)).toBe(
            false
        )
    })
})
