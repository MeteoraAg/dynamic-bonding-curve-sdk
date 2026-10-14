import BN from 'bn.js'
import { describe, expect, test } from 'vitest'
import {
    getBaseTokenForSwap,
    getCurveBreakdown,
    getMigrationThresholdPrice,
    getSwapAmountWithBuffer,
    MAX_SQRT_PRICE,
    Rounding,
    U64_MAX,
    type LiquidityDistributionParameters,
} from '../src'
import {
    calculateQuoteToBaseFromAmountIn,
    getDeltaAmountBaseUnsigned256,
    getDeltaAmountQuoteUnsigned,
    getDeltaAmountQuoteUnsigned256,
    ProgramError,
} from '../src/math'
import { validateCurve } from '../src/helpers/validation'

// Regressions from PR #120 (snuff12): the breakdown consumes only the
// remaining threshold and stops at exact cumulative completion.
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
): LiquidityDistributionParameters[] {
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

        expect(
            result.segmentAmounts.map((amount) => amount.toString())
        ).toEqual(fixture.expectedAmounts)
        expect(result.totalAmount.toString()).toBe(fixture.threshold)
        expect(result.finalSqrtPrice.toString()).toBe(fixture.expectedSqrtPrice)
        expect(result.segmentAmounts).toHaveLength(curve.length)

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

        // The program-side threshold price and the buy quote agree with the breakdown
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

    test('zero threshold keeps the start price and allocates nothing', () => {
        const curve = makeCurve({
            endpoints: ['36893488147419103232', '55340232221128654848'],
        })
        const result = getCurveBreakdown(new BN(0), Q64.clone(), curve)
        expect(
            result.segmentAmounts.map((amount) => amount.toString())
        ).toEqual(['0', '0'])
        expect(result.totalAmount.isZero()).toBe(true)
        expect(result.finalSqrtPrice.toString()).toBe(Q64.toString())
    })

    test('rejects an empty curve', () => {
        expect(() =>
            getCurveBreakdown(new BN('1000000000000'), Q64.clone(), [])
        ).toThrowError(/^Curve is empty$/)
    })

    test('rejects a threshold above the curve capacity', () => {
        const curve = makeCurve({
            endpoints: [
                '36893488147419103232',
                '55340232221128654848',
                '73786976294838206464',
            ],
        })
        expect(() =>
            getCurveBreakdown(new BN('1900000000000'), Q64.clone(), curve)
        ).toThrowError(
            /^Not enough liquidity: the curve holds 1800000000000 quote, the threshold is 1900000000000$/
        )
    })

    test('takes a partial slice of a segment wider than u64', () => {
        const start = new BN(1).shln(40)
        const liquidity = new BN(1).shln(100)
        const curve = [{ sqrtPrice: MAX_SQRT_PRICE, liquidity }]
        const threshold = new BN(10).pow(new BN(12))
        expect(
            getDeltaAmountQuoteUnsigned256(
                start,
                MAX_SQRT_PRICE,
                liquidity,
                Rounding.Up
            ).gt(U64_MAX)
        ).toBe(true)

        const breakdown = getCurveBreakdown(threshold, start, curve)
        expect(
            breakdown.segmentAmounts.map((amount) => amount.toString())
        ).toEqual([threshold.toString()])
        expect(breakdown.finalSqrtPrice.toString()).toBe(
            getMigrationThresholdPrice(threshold, start, curve).toString()
        )
    })
})

describe('getSwapAmountWithBuffer', () => {
    test('casts only the amount it keeps when the curve tail exceeds u64', () => {
        const start = new BN(1).shln(40)
        const migration = new BN(1).shln(41)
        const liquidity = new BN(1).shln(100)
        const curve = [
            { sqrtPrice: migration, liquidity },
            { sqrtPrice: MAX_SQRT_PRICE, liquidity: new BN(1).shln(110) },
        ]
        const swapBase = getDeltaAmountBaseUnsigned256(
            start,
            migration,
            liquidity,
            Rounding.Up
        )
        expect(
            getBaseTokenForSwap(start, MAX_SQRT_PRICE, curve).gt(U64_MAX)
        ).toBe(true)
        expect(getSwapAmountWithBuffer(swapBase, start, curve).toString()).toBe(
            swapBase.muln(125).divn(100).toString()
        )
        expect(() => getSwapAmountWithBuffer(U64_MAX, start, curve)).toThrow(
            ProgramError.MathOverflow
        )
    })
})
