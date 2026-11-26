import { expect, test, describe } from 'vitest'
import { buildCurveWithMarketCap, getTotalVestingAmount } from '../src/helpers'
import { MigrationFeeOption, MigrationOption, TokenDecimal } from '../src'
import { curveBaseParams, expectProgramValidCurve } from './utils/curve'

describe('buildCurveWithMarketCap tests', () => {
    const baseParams = curveBaseParams({
        fee: { dynamicFeeEnabled: true },
    })

    test('build curve by market cap 1', () => {
        const config = buildCurveWithMarketCap({
            ...baseParams,
            initialMarketCap: 23.5,
            migrationMarketCap: 405.882352941,
        })

        expectProgramValidCurve(config)
    })

    test('build curve by market cap 2', () => {
        const config = buildCurveWithMarketCap({
            ...baseParams,
            initialMarketCap: 0.1,
            migrationMarketCap: 0.5,
        })

        expectProgramValidCurve(config)
    })

    test('build curve by market cap with locked vesting', () => {
        const lockedVestingConfig = {
            totalLockedVestingAmount: 10000000,
            numberOfVestingPeriod: 1000,
            cliffUnlockAmount: 0,
            totalVestingDuration: 365 * 24 * 60 * 60,
            cliffDurationFromMigrationTime: 0,
        }

        const config = buildCurveWithMarketCap({
            ...baseParams,
            lockedVesting: lockedVestingConfig,
            initialMarketCap: 99.1669972233,
            migrationMarketCap: 462.779320376,
        })

        expectProgramValidCurve(config)

        // 10,000,000 tokens at 6 decimals over 1000 periods of 31,536 seconds
        expect(
            Object.fromEntries(
                Object.entries(config.lockedVesting).map(([key, value]) => [
                    key,
                    value.toString(),
                ])
            )
        ).toEqual({
            amountPerPeriod: '10000000000',
            cliffDurationFromMigrationTime: '0',
            cliffUnlockAmount: '0',
            frequency: '31536',
            numberOfPeriod: '1000',
        })
        expect(getTotalVestingAmount(config.lockedVesting).toString()).toBe(
            '10000000000000'
        )
    })

    test('build curve by market cap 3', () => {
        const config = buildCurveWithMarketCap({
            ...curveBaseParams({
                token: {
                    tokenQuoteDecimal: TokenDecimal.SIX,
                    totalTokenSupply: 100000000,
                },
                fee: {
                    dynamicFeeEnabled: true,
                    creatorTradingFeePercentage: 50,
                },
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps100,
                    migrationFee: {
                        feePercentage: 1,
                        creatorFeePercentage: 50,
                    },
                },
                lockedVesting: {
                    totalLockedVestingAmount: 50000000,
                    numberOfVestingPeriod: 1,
                    cliffUnlockAmount: 50000000,
                    totalVestingDuration: 1,
                    cliffDurationFromMigrationTime: 0,
                },
            }),
            initialMarketCap: 1000,
            migrationMarketCap: 3000,
        })

        expectProgramValidCurve(config)
    })
})
