import BN from 'bn.js'
import { describe, expect, test } from 'vitest'
import {
    calculateQuoteToBaseFromAmountIn,
    getCurveBreakdown,
    getDeltaAmountQuoteUnsigned,
    getMigrationThresholdPrice,
    Rounding,
    validateCurve,
    type LiquidityDistributionParameters,
} from '../src'

// Pure helper regressions: no connection, wallet, validator or program execution.
const Q64 = new BN('18446744073709551616')
const LIQUIDITY = new BN('11068046444225730969600000000000')

type Fixture = {
    name: string
    threshold: string
    endpoints: string[]
    liquidityMultipliers?: number[]
    expectedAmounts: string[]
    expectedSqrtPrice: string
    terminalSegment: number
    roundedCapacity?: { segment: number; amount: string }
}

const fixtures: Fixture[] = [
    {
        name: 'partial first segment',
        threshold: '500000000000',
        endpoints: ['36893488147419103232', '55340232221128654848'],
        expectedAmounts: ['500000000000', '0'],
        expectedSqrtPrice: '33819030801800844629',
        terminalSegment: 0,
    },
    {
        name: 'exact first boundary with unused tail',
        threshold: '600000000000',
        endpoints: ['36893488147419103232', '55340232221128654848'],
        expectedAmounts: ['600000000000', '0'],
        expectedSqrtPrice: '36893488147419103232',
        terminalSegment: 0,
    },
    {
        name: 'partial second segment uses only the remaining threshold',
        threshold: '1000000000000',
        endpoints: ['36893488147419103232', '55340232221128654848'],
        expectedAmounts: ['600000000000', '400000000000'],
        expectedSqrtPrice: '49191317529892137642',
        terminalSegment: 1,
    },
    {
        name: 'exact final boundary',
        threshold: '1200000000000',
        endpoints: ['36893488147419103232', '55340232221128654848'],
        expectedAmounts: ['600000000000', '600000000000'],
        expectedSqrtPrice: '55340232221128654848',
        terminalSegment: 1,
    },
    {
        name: 'exact interior boundary stops before the next segment',
        threshold: '1200000000000',
        endpoints: [
            '36893488147419103232',
            '55340232221128654848',
            '73786976294838206464',
        ],
        expectedAmounts: ['600000000000', '600000000000', '0'],
        expectedSqrtPrice: '55340232221128654848',
        terminalSegment: 1,
    },
    {
        name: 'partial third segment',
        threshold: '1300000000000',
        endpoints: [
            '36893488147419103232',
            '55340232221128654848',
            '73786976294838206464',
        ],
        expectedAmounts: ['600000000000', '600000000000', '100000000000'],
        expectedSqrtPrice: '58414689566746913450',
        terminalSegment: 2,
    },
    {
        name: 'exact full capacity of three segments',
        threshold: '1800000000000',
        endpoints: [
            '36893488147419103232',
            '55340232221128654848',
            '73786976294838206464',
        ],
        expectedAmounts: ['600000000000', '600000000000', '600000000000'],
        expectedSqrtPrice: '73786976294838206464',
        terminalSegment: 2,
    },
    {
        name: 'unequal capacities do not reallocate the original threshold',
        threshold: '1000000000000',
        endpoints: ['36893488147419103232', '55340232221128654848'],
        liquidityMultipliers: [1, 2],
        expectedAmounts: ['600000000000', '400000000000'],
        expectedSqrtPrice: '43042402838655620437',
        terminalSegment: 1,
    },
    {
        name: 'rounded full first capacity snaps to its exact upper price',
        threshold: '600000000001',
        endpoints: ['36893488147419103233', '55340232221128654848'],
        expectedAmounts: ['600000000001', '0'],
        expectedSqrtPrice: '36893488147419103233',
        terminalSegment: 0,
        roundedCapacity: { segment: 0, amount: '600000000001' },
    },
    {
        name: 'rounded full later capacity snaps and leaves the tail unused',
        threshold: '1200000000001',
        endpoints: [
            '36893488147419103232',
            '55340232221128654849',
            '73786976294838206464',
        ],
        expectedAmounts: ['600000000000', '600000000001', '0'],
        expectedSqrtPrice: '55340232221128654849',
        terminalSegment: 1,
        roundedCapacity: { segment: 1, amount: '600000000001' },
    },
]

function makeCurve(
    fixture: Pick<Fixture, 'endpoints' | 'liquidityMultipliers'>
) {
    return fixture.endpoints.map((sqrtPrice, index) => ({
        sqrtPrice: new BN(sqrtPrice),
        liquidity: LIQUIDITY.muln(fixture.liquidityMultipliers?.[index] ?? 1),
    }))
}

function snapshotInputs(
    threshold: BN,
    start: BN,
    curve: LiquidityDistributionParameters[]
) {
    return JSON.stringify({
        threshold: threshold.toString(),
        start: start.toString(),
        curve: curve.map(({ sqrtPrice, liquidity }) => ({
            sqrtPrice: sqrtPrice.toString(),
            liquidity: liquidity.toString(),
        })),
    })
}

describe('getCurveBreakdown', () => {
    test.each(fixtures)('$name', (fixture) => {
        const threshold = new BN(fixture.threshold)
        const start = Q64.clone()
        const curve = makeCurve(fixture)
        const before = snapshotInputs(threshold, start, curve)
        expect(validateCurve(curve, start)).toBe(true)

        const result = getCurveBreakdown(threshold, start, curve)

        // Fixed expected integers are the primary regression oracle.
        expect(
            result.segmentAmounts.map((amount) => amount.toString())
        ).toEqual(fixture.expectedAmounts)
        expect(result.totalAmount.toString()).toBe(fixture.threshold)
        expect(result.finalSqrtPrice.toString()).toBe(fixture.expectedSqrtPrice)
        expect(result.segmentAmounts).toHaveLength(curve.length)
        expect(
            result.segmentAmounts
                .reduce((sum, amount) => sum.add(amount), new BN(0))
                .toString()
        ).toBe(fixture.threshold)

        const terminalLower =
            fixture.terminalSegment === 0
                ? start
                : curve[fixture.terminalSegment - 1].sqrtPrice
        expect(result.finalSqrtPrice.gte(terminalLower)).toBe(true)
        expect(
            result.finalSqrtPrice.lte(curve[fixture.terminalSegment].sqrtPrice)
        ).toBe(true)

        if (fixture.roundedCapacity) {
            const index = fixture.roundedCapacity.segment
            expect(
                getDeltaAmountQuoteUnsigned(
                    index === 0 ? start : curve[index - 1].sqrtPrice,
                    curve[index].sqrtPrice,
                    curve[index].liquidity,
                    Rounding.Up
                ).toString()
            ).toBe(fixture.roundedCapacity.amount)
        }

        // These are consistency controls, not an independent program oracle.
        expect(
            getMigrationThresholdPrice(threshold, start, curve).toString()
        ).toBe(fixture.expectedSqrtPrice)
        const buy = calculateQuoteToBaseFromAmountIn(
            { curve },
            start,
            threshold,
            curve[curve.length - 1].sqrtPrice
        )
        expect(buy.nextSqrtPrice.toString()).toBe(fixture.expectedSqrtPrice)
        expect(buy.amountLeft.isZero()).toBe(true)
        expect(snapshotInputs(threshold, start, curve)).toBe(before)
    })

    test('zero threshold retains the start price and zero allocations', () => {
        // Helper behavior only: zero is not a valid funded new configuration.
        const curve = makeCurve({
            endpoints: ['36893488147419103232', '55340232221128654848'],
        })
        const threshold = new BN(0)
        const start = Q64.clone()
        const before = snapshotInputs(threshold, start, curve)
        const result = getCurveBreakdown(threshold, start, curve)
        expect(
            result.segmentAmounts.map((amount) => amount.toString())
        ).toEqual(['0', '0'])
        expect(result.totalAmount.isZero()).toBe(true)
        expect(result.finalSqrtPrice.toString()).toBe('18446744073709551616')
        expect(snapshotInputs(threshold, start, curve)).toBe(before)
    })

    test('preserves empty-curve rejection', () => {
        expect(() =>
            getCurveBreakdown(new BN('1000000000000'), Q64.clone(), [])
        ).toThrowError(/^Curve is empty$/)
    })

    test('preserves insufficient-capacity rejection and its exact shortfall', () => {
        const threshold = new BN('1900000000000')
        const start = Q64.clone()
        const curve = makeCurve({
            endpoints: [
                '36893488147419103232',
                '55340232221128654848',
                '73786976294838206464',
            ],
        })
        const before = snapshotInputs(threshold, start, curve)
        expect(() => getCurveBreakdown(threshold, start, curve)).toThrowError(
            /^Not enough liquidity in curve\. Total allocated: 1800000000000, Required: 1900000000000, Shortfall: 100000000000$/
        )
        expect(snapshotInputs(threshold, start, curve)).toBe(before)
    })
})
