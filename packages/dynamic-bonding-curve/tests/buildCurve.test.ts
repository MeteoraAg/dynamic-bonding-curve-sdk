import { expect, test, describe } from 'vitest'
import BN from 'bn.js'
import {
    BaseFeeMode,
    buildCurve,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    type BuildCurveBaseParams,
} from '../src'
import {
    DEFAULT_MIGRATED_POOL_FEE_PARAMS,
    DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
} from '../src/constants'
import { curveBaseParams, expectProgramValidCurve } from './utils/curve'

const baseParams = curveBaseParams({
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        },
    },
})

describe('buildCurve', () => {
    test('builds a curve from a migration percentage and quote threshold', () => {
        const config = buildCurve({
            ...baseParams,
            percentageSupplyOnMigration: 2.983257229832572,
            migrationQuoteThreshold: 95.07640791476408,
        })

        expectProgramValidCurve(config)
        expect(config.migrationQuoteThreshold.toString()).toBe('95076407914')
    })

    test('accepts a 5-decimal quote mint', () => {
        const config = buildCurve({
            ...baseParams,
            token: { ...baseParams.token, tokenQuoteDecimal: 5 },
            percentageSupplyOnMigration: 20,
            migrationQuoteThreshold: 1_000_000_000,
        })

        expectProgramValidCurve(config)
        expect(
            config.migrationQuoteThreshold.eq(
                new BN(1_000_000_000).mul(new BN(10 ** 5))
            )
        ).toBe(true)
    })
})

describe('buildCurve migration fee options', () => {
    const build = (migration: BuildCurveBaseParams['migration']) =>
        buildCurve({
            ...baseParams,
            migration,
            percentageSupplyOnMigration: 25,
            migrationQuoteThreshold: 1,
        })

    test.each([
        MigrationFeeOption.FixedBps25,
        MigrationFeeOption.FixedBps100,
        MigrationFeeOption.FixedBps600,
    ])('fixed option %i uses the preset migrated pool fee', (option) => {
        const config = build({
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: option,
            migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        })

        expect(config.migrationFeeOption).toBe(option)
        expect(config.migratedPoolFee).toEqual(DEFAULT_MIGRATED_POOL_FEE_PARAMS)
        expect(config.migratedPoolMarketCapFeeSchedulerParams).toEqual(
            DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
        )
    })

    test('a fixed option ignores custom migrated pool fee values', () => {
        const config = build({
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: MigrationFeeOption.FixedBps200,
            migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
            migratedPoolFee: {
                collectFeeMode: MigratedCollectFeeMode.OutputToken,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 500,
            },
        })

        expect(config.migrationFeeOption).toBe(MigrationFeeOption.FixedBps200)
        expect(config.migratedPoolFee).toEqual(DEFAULT_MIGRATED_POOL_FEE_PARAMS)
    })

    test('a fixed option rejects a market cap scheduler', () => {
        expect(() =>
            build({
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.FixedBps100,
                migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
                migratedPoolFee: {
                    collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                    dynamicFee: DammV2DynamicFeeMode.Enabled,
                    poolFeeBps: 500,
                    baseFeeMode: DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
                    marketCapFeeSchedulerParams: {
                        endingBaseFeeBps: 50,
                        numberOfPeriod: 10,
                        priceMultiple: 1000,
                        schedulerExpirationDuration: 86400,
                    },
                },
            })
        ).toThrow('require MigrationFeeOption.Customizable')
    })

    test('Customizable uses the custom migrated pool fee', () => {
        const config = build({
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: MigrationFeeOption.Customizable,
            migrationFee: { feePercentage: 10, creatorFeePercentage: 50 },
            migratedPoolFee: {
                collectFeeMode: MigratedCollectFeeMode.OutputToken,
                dynamicFee: DammV2DynamicFeeMode.Disabled,
                poolFeeBps: 250,
            },
        })

        expect(config.migrationFeeOption).toBe(MigrationFeeOption.Customizable)
        expect(config.migratedPoolFee).toEqual({
            collectFeeMode: MigratedCollectFeeMode.OutputToken,
            dynamicFee: DammV2DynamicFeeMode.Disabled,
            poolFeeBps: 250,
        })
        expect(config.migratedPoolBaseFeeMode).toBe(
            DammV2BaseFeeMode.FeeTimeSchedulerLinear
        )
        expect(config.migratedPoolMarketCapFeeSchedulerParams).toEqual(
            DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
        )
        expectProgramValidCurve(config)
    })

    test('Customizable requires a migrated pool fee', () => {
        expect(() =>
            build({
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.Customizable,
                migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
            })
        ).toThrow(
            'migratedPoolFee.poolFeeBps is required when migrationFeeOption is Customizable'
        )
    })

    test.each([
        [DammV2BaseFeeMode.FeeMarketCapSchedulerLinear, 200, 5],
        [DammV2BaseFeeMode.FeeMarketCapSchedulerExponential, 800, 15],
    ])(
        'Customizable with market cap scheduler mode %i starts at the pool fee',
        (baseFeeMode, poolFeeBps, numberOfPeriod) => {
            const config = build({
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.Customizable,
                migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
                migratedPoolFee: {
                    collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                    dynamicFee: DammV2DynamicFeeMode.Enabled,
                    poolFeeBps,
                    baseFeeMode,
                    marketCapFeeSchedulerParams: {
                        endingBaseFeeBps: 50,
                        numberOfPeriod,
                        priceMultiple: 1000,
                        schedulerExpirationDuration: 86400,
                    },
                },
            })

            expect(config.migratedPoolBaseFeeMode).toBe(baseFeeMode)
            expect(config.migratedPoolFee.poolFeeBps).toBe(poolFeeBps)
            expect(
                config.migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod
            ).toBe(numberOfPeriod)
            expect(
                config.migratedPoolMarketCapFeeSchedulerParams
                    .schedulerExpirationDuration
            ).toBe(86400)
            expect(
                config.migratedPoolMarketCapFeeSchedulerParams.reductionFactor.gt(
                    new BN(0)
                )
            ).toBe(true)
            expectProgramValidCurve(config)
        }
    )

    test('a time scheduler mode rejects market cap scheduler params', () => {
        expect(() =>
            build({
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.Customizable,
                migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
                migratedPoolFee: {
                    collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                    dynamicFee: DammV2DynamicFeeMode.Enabled,
                    poolFeeBps: 500,
                    baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
                    marketCapFeeSchedulerParams: {
                        endingBaseFeeBps: 100,
                        numberOfPeriod: 10,
                        priceMultiple: 1000,
                        schedulerExpirationDuration: 86400,
                    },
                },
            })
        ).toThrow('marketCapFeeSchedulerParams must be set exactly when')
    })

    test('DAMM v1 is rejected for new configs', () => {
        expect(() =>
            build({
                migrationOption: MigrationOption.MET_DAMM,
                migrationFeeOption: MigrationFeeOption.Customizable,
                migrationFee: { feePercentage: 10, creatorFeePercentage: 50 },
                migratedPoolFee: {
                    collectFeeMode: MigratedCollectFeeMode.OutputToken,
                    dynamicFee: DammV2DynamicFeeMode.Enabled,
                    poolFeeBps: 999,
                },
            })
        ).toThrow(/MET_DAMM \(DAMM v1\) is deprecated/)
    })
})
