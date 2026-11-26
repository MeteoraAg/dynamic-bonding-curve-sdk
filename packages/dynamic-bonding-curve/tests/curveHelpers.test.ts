import BN from 'bn.js'
import Decimal from 'decimal.js'
import { describe, expect, test } from 'vitest'
import {
    buildCurveWithMidPrice,
    getLockedVestingParams,
    getPercentageSupplyOnMigration,
    getSqrtPriceFromPrice,
    getTokenomics,
    TokenDecimal,
} from '../src'
import { curveBaseParams, expectProgramValidCurve } from './utils/curve'

const noVesting = getLockedVestingParams(0, 0, 0, 0, 0, TokenDecimal.SIX)
const totalSupply = new BN(10).pow(new BN(15))
const tenPercentVesting = getLockedVestingParams(
    100_000_000,
    1,
    0,
    1,
    0,
    TokenDecimal.SIX
)

describe('getPercentageSupplyOnMigration', () => {
    test('is r / (1 + r) of the supply, with r the square root of the market cap ratio', () => {
        // r = sqrt(30 / 3000) = 0.1, so 100 * 0.1 / 1.1
        expect(
            getPercentageSupplyOnMigration(
                new Decimal(30),
                new Decimal(3000),
                noVesting,
                new BN(0),
                totalSupply
            )
        ).toBeCloseTo(9.090909, 5)
    })

    test('shrinks the share by the vesting and leftover percentages', () => {
        // 10% vesting and 5% leftover: 0.1 * 85 / 1.1
        expect(
            getPercentageSupplyOnMigration(
                new Decimal(30),
                new Decimal(3000),
                tenPercentVesting,
                totalSupply.divn(20),
                totalSupply
            )
        ).toBeCloseTo(7.727273, 5)
    })

    test('takes the migration fee off the deposit', () => {
        // r = 0.1 * 0.9 = 0.09, so 100 * 0.09 / 1.09
        expect(
            getPercentageSupplyOnMigration(
                new Decimal(30),
                new Decimal(3000),
                noVesting,
                new BN(0),
                totalSupply,
                10
            )
        ).toBeCloseTo(8.256881, 5)
    })

    test('defaults the migration fee to zero', () => {
        const args = [
            new Decimal(30),
            new Decimal(3000),
            noVesting,
            new BN(0),
            totalSupply,
        ] as const
        expect(getPercentageSupplyOnMigration(...args)).toBe(
            getPercentageSupplyOnMigration(...args, 0)
        )
    })
})

describe('getTokenomics', () => {
    const vesting = totalSupply.divn(10)
    const leftover = totalSupply.divn(20)
    const tokenomics = getTokenomics(
        new Decimal(30),
        new Decimal(3000),
        vesting,
        leftover,
        totalSupply
    )

    test('sizes the migration supply from the market cap ratio after vesting and leftover', () => {
        // 100 * 0.1 * 85 / 1.1 percent of 10^15
        expect(tokenomics.migrationSupply.toString()).toBe('77272727272727')
    })

    test('passes the leftover and vesting amounts through', () => {
        expect(tokenomics.leftoverSupply.eq(leftover)).toBe(true)
        expect(tokenomics.lockedVestingSupply.eq(vesting)).toBe(true)
    })

    test('leaves the rest of the supply to the bonding curve', () => {
        expect(tokenomics.bondingCurveSupply.toString()).toBe(
            totalSupply
                .sub(tokenomics.migrationSupply)
                .sub(leftover)
                .sub(vesting)
                .toString()
        )
        expect(
            tokenomics.bondingCurveSupply
                .add(tokenomics.migrationSupply)
                .add(tokenomics.leftoverSupply)
                .add(tokenomics.lockedVestingSupply)
                .eq(totalSupply)
        ).toBe(true)
    })
})

describe('buildCurveWithMidPrice', () => {
    const params = {
        ...curveBaseParams({ token: { leftover: 1_000 } }),
        initialMarketCap: 30,
        migrationMarketCap: 3000,
        midPrice: 0.0000003,
        percentageSupplyOnMigration: 20,
    }

    test('builds two segments that pass through the mid price and end at the migration market cap price', () => {
        const config = buildCurveWithMidPrice(params)

        expectProgramValidCurve(config)
        expect(config.curve).toHaveLength(2)
        expect(
            config.curve[0].sqrtPrice.eq(
                getSqrtPriceFromPrice(
                    params.midPrice.toString(),
                    TokenDecimal.SIX,
                    TokenDecimal.NINE
                )
            )
        ).toBe(true)
        expect(
            config.curve[1].sqrtPrice.eq(
                getSqrtPriceFromPrice(
                    '0.000003',
                    TokenDecimal.SIX,
                    TokenDecimal.NINE
                )
            )
        ).toBe(true)
    })

    test('starts at the initial market cap price', () => {
        const config = buildCurveWithMidPrice(params)

        // 30 quote of market cap over 10^9 tokens
        expect(
            config.sqrtStartPrice.eq(
                getSqrtPriceFromPrice(
                    '0.00000003',
                    TokenDecimal.SIX,
                    TokenDecimal.NINE
                )
            )
        ).toBe(true)
    })

    test.each([0.000004, 0.00000001])(
        'rejects a mid price of %d outside the initial and migration prices',
        (midPrice) => {
            expect(() =>
                buildCurveWithMidPrice({ ...params, midPrice })
            ).toThrow(
                'midPrice must be between the initial and migration prices'
            )
        }
    )
})
