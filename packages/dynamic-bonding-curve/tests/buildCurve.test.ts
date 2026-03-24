import { expect, test, describe } from 'vitest'
import {
    buildCurve,
    getMigratedPoolFeeParams,
    validateCompoundingFeeBps,
    validateMigratedPoolFee,
} from '../src/helpers'
import BN from 'bn.js'
import {
    ActivationType,
    BaseFeeMode,
    BuildCurveBaseParams,
    CollectFeeMode,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import { convertBNToDecimal } from './utils/common'
import {
    DEFAULT_MIGRATED_POOL_FEE_PARAMS,
    DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
} from '../src/constants'

describe('buildCurve tests', () => {
    const baseParams: BuildCurveBaseParams = {
        token: {
            tokenType: TokenType.SPL,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.NINE,
            tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
            totalTokenSupply: 1000000000,
            leftover: 0,
        },
        fee: {
            baseFeeParams: {
                baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
                feeSchedulerParam: {
                    startingFeeBps: 100,
                    endingFeeBps: 100,
                    numberOfPeriod: 0,
                    totalDuration: 0,
                },
            },
            dynamicFeeEnabled: true,
            collectFeeMode: CollectFeeMode.QuoteToken,
            creatorTradingFeePercentage: 0,
            poolCreationFee: 1,
            enableFirstSwapWithMinFee: false,
        },
        migration: {
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: MigrationFeeOption.FixedBps100,
            migrationFee: {
                feePercentage: 0,
                creatorFeePercentage: 0,
            },
        },
        liquidityDistribution: {
            partnerLiquidityPercentage: 0,
            partnerPermanentLockedLiquidityPercentage: 100,
            creatorLiquidityPercentage: 0,
            creatorPermanentLockedLiquidityPercentage: 0,
        },
        lockedVesting: {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
        activationType: ActivationType.Slot,
    }

    test('build curve with percentage and threshold parameters', () => {
        console.log(
            '\n testing build curve with percentage and threshold parameters...'
        )
        const config = buildCurve({
            ...baseParams,
            percentageSupplyOnMigration: 2.983257229832572,
            migrationQuoteThreshold: 95.07640791476408,
        })

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })
})

describe('getMigratedPoolFeeParams Unit Tests', () => {
    test('should return scheduler params when marketCapFeeSchedulerParams is provided with FeeMarketCapSchedulerLinear', () => {
        const migratedPoolFee = {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 500,
            baseFeeMode: DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
            marketCapFeeSchedulerParams: {
                endingBaseFeeBps: 50,
                numberOfPeriod: 10,
                startingMarketCap: 20000,
                endingMarketCap: 20000000,
                schedulerExpirationDuration: 86400,
            },
        }
        const baseFeeParamsInput = {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        }

        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.FixedBps100, // should be overridden to Customizable
            migratedPoolFee,
            baseFeeParamsInput
        )

        expect(result.migrationFeeOption).toBe(MigrationFeeOption.Customizable)
        expect(result.migratedPoolFee.poolFeeBps).toBe(500)
        expect(
            result.migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod
        ).toBe(10)
        expect(
            result.migratedPoolMarketCapFeeSchedulerParams
                .schedulerExpirationDuration
        ).toBe(86400)
        expect(
            result.migratedPoolMarketCapFeeSchedulerParams.reductionFactor.gt(
                new BN(0)
            )
        ).toBe(true)
    })

    test('should return default scheduler params when using FeeTimeSchedulerLinear', () => {
        const migratedPoolFee = {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 500,
            baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            marketCapFeeSchedulerParams: {
                endingBaseFeeBps: 100,
                numberOfPeriod: 10,
                startingMarketCap: 20000,
                endingMarketCap: 20000000,
                schedulerExpirationDuration: 86400,
            },
        }
        const baseFeeParamsInput = {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        }

        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.FixedBps100,
            migratedPoolFee,
            baseFeeParamsInput
        )

        // Should still force Customizable when marketCapFeeSchedulerParams is provided
        expect(result.migrationFeeOption).toBe(MigrationFeeOption.Customizable)
        // But scheduler params should be defaults for time-based modes
        expect(result.migratedPoolMarketCapFeeSchedulerParams).toEqual(
            DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
        )
    })

    test('should return default params when migratedPoolFee is undefined with Customizable option', () => {
        const baseFeeParamsInput = {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        }

        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.FixedBps100,
            undefined, // no migratedPoolFee provided
            baseFeeParamsInput
        )

        expect(result.migrationFeeOption).toBe(MigrationFeeOption.FixedBps100)
        expect(result.migratedPoolFee).toEqual(DEFAULT_MIGRATED_POOL_FEE_PARAMS)
        expect(result.migratedPoolBaseFeeMode).toBe(
            DammV2BaseFeeMode.FeeTimeSchedulerLinear
        )
        expect(result.migratedPoolMarketCapFeeSchedulerParams).toEqual(
            DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
        )
    })

    test('Compounding mode should propagate compoundingFeeBps', () => {
        const baseFeeParamsInput = {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        }

        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            {
                collectFeeMode: MigratedCollectFeeMode.Compounding,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 300,
                compoundingFeeBps: 500,
            },
            baseFeeParamsInput
        )

        expect(result.migrationFeeOption).toBe(MigrationFeeOption.Customizable)
        expect(result.migratedPoolFee.collectFeeMode).toBe(
            MigratedCollectFeeMode.Compounding
        )
        expect(result.compoundingFeeBps).toBe(500)
    })

    test('Compounding mode without compoundingFeeBps should default to 0', () => {
        const baseFeeParamsInput = {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        }

        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            {
                collectFeeMode: MigratedCollectFeeMode.Compounding,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 300,
            },
            baseFeeParamsInput
        )

        expect(result.compoundingFeeBps).toBe(0)
    })

    test('Non-compounding mode should have compoundingFeeBps = 0', () => {
        const baseFeeParamsInput = {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        }

        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            {
                collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 300,
            },
            baseFeeParamsInput
        )

        expect(result.compoundingFeeBps).toBe(0)
    })
})

describe('validateCompoundingFeeBps Tests', () => {
    test('Compounding mode with valid compoundingFeeBps should pass', () => {
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.Compounding, 500)
        ).toBe(true)
    })

    test('Compounding mode with compoundingFeeBps = 0 should fail', () => {
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.Compounding, 0)
        ).toBe(false)
    })

    test('Compounding mode with compoundingFeeBps > MAX_BASIS_POINT should fail', () => {
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.Compounding, 10001)
        ).toBe(false)
    })

    test('Non-compounding mode with compoundingFeeBps = 0 should pass', () => {
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.QuoteToken, 0)
        ).toBe(true)
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.OutputToken, 0)
        ).toBe(true)
    })

    test('Non-compounding mode with non-zero compoundingFeeBps should fail', () => {
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.QuoteToken, 100)
        ).toBe(false)
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.OutputToken, 250)
        ).toBe(false)
    })
})

describe('validateMigratedPoolFee with Compounding mode', () => {
    test('Compounding mode with valid compoundingFeeBps should pass validation', () => {
        const result = validateMigratedPoolFee(
            {
                collectFeeMode: MigratedCollectFeeMode.Compounding,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 300,
            },
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            undefined,
            500
        )
        expect(result).toBe(true)
    })

    test('Compounding mode with compoundingFeeBps = 0 should fail validation', () => {
        const result = validateMigratedPoolFee(
            {
                collectFeeMode: MigratedCollectFeeMode.Compounding,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 300,
            },
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            undefined,
            0
        )
        expect(result).toBe(false)
    })

    test('Compounding mode with omitted compoundingFeeBps should fail validation', () => {
        const result = validateMigratedPoolFee(
            {
                collectFeeMode: MigratedCollectFeeMode.Compounding,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 300,
            },
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            undefined,
            undefined
        )
        expect(result).toBe(false)
    })

    test('Non-compounding mode with non-zero compoundingFeeBps should fail validation', () => {
        const result = validateMigratedPoolFee(
            {
                collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 300,
            },
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            undefined,
            100
        )
        expect(result).toBe(false)
    })
})

describe('Migration Fee Option Tests', () => {
    const baseTokenParams = {
        tokenType: TokenType.SPL,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    }

    const baseFeeParams = {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear as const,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        },
        dynamicFeeEnabled: false,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 1,
        enableFirstSwapWithMinFee: false,
    }

    const baseLiquidityDistribution = {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 100,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    }

    const baseLockedVesting = {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    }

    describe('Fixed MigrationFeeOption (0-5)', () => {
        test('FixedBps25 should use default migratedPoolFee params', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps25,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.FixedBps25
            )
            expect(curveConfig.migratedPoolFee).toEqual(
                DEFAULT_MIGRATED_POOL_FEE_PARAMS
            )
            expect(curveConfig.migratedPoolMarketCapFeeSchedulerParams).toEqual(
                DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
            )
        })

        test('FixedBps100 should use default migratedPoolFee params', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps100,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.FixedBps100
            )
            expect(curveConfig.migratedPoolFee).toEqual(
                DEFAULT_MIGRATED_POOL_FEE_PARAMS
            )
        })

        test('FixedBps600 should use default migratedPoolFee params', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps600,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.FixedBps600
            )
            expect(curveConfig.migratedPoolFee).toEqual(
                DEFAULT_MIGRATED_POOL_FEE_PARAMS
            )
        })

        test('Fixed option with custom migratedPoolFee should still use defaults', () => {
            // when using fixed options, custom migratedPoolFee should be ignored
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps200,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.OutputToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 500, // this should be ignored
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.FixedBps200
            )
            // should still use default params, not the custom ones
            expect(curveConfig.migratedPoolFee).toEqual(
                DEFAULT_MIGRATED_POOL_FEE_PARAMS
            )
        })
    })

    describe('Customizable MigrationFeeOption without MarketCapFeeScheduler', () => {
        test('Customizable should use custom migratedPoolFee params', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.Customizable,
                    migrationFee: {
                        feePercentage: 10,
                        creatorFeePercentage: 50,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 250,
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.Customizable
            )
            expect(curveConfig.migratedPoolFee.poolFeeBps).toBe(250)
            expect(curveConfig.migratedPoolFee.collectFeeMode).toBe(
                MigratedCollectFeeMode.QuoteToken
            )
            expect(curveConfig.migratedPoolFee.dynamicFee).toBe(
                DammV2DynamicFeeMode.Enabled
            )
            // should still use default scheduler params (no marketCapFeeScheduler configured)
            expect(curveConfig.migratedPoolMarketCapFeeSchedulerParams).toEqual(
                DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
            )
        })

        test('Customizable without migratedPoolFee should use defaults', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.Customizable,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    // no migratedPoolFee provided
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.Customizable
            )
            // should use default params when not provided
            expect(curveConfig.migratedPoolFee).toEqual(
                DEFAULT_MIGRATED_POOL_FEE_PARAMS
            )
        })

        test('Customizable with different dynamicFee modes', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.Customizable,
                    migrationFee: {
                        feePercentage: 5,
                        creatorFeePercentage: 25,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.OutputToken,
                        dynamicFee: DammV2DynamicFeeMode.Disabled,
                        poolFeeBps: 100,
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.Customizable
            )
            expect(curveConfig.migratedPoolFee.dynamicFee).toBe(
                DammV2DynamicFeeMode.Disabled
            )
            expect(curveConfig.migratedPoolFee.collectFeeMode).toBe(
                MigratedCollectFeeMode.OutputToken
            )
        })
    })

    describe('MarketCapFeeScheduler Configuration', () => {
        test('MarketCapFeeScheduler with FeeMarketCapSchedulerLinear should populate scheduler params', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps100,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 500,
                        baseFeeMode:
                            DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
                        marketCapFeeSchedulerParams: {
                            endingBaseFeeBps: 50,
                            numberOfPeriod: 10,
                            startingMarketCap: 20000,
                            endingMarketCap: 20000000,
                            schedulerExpirationDuration: 86400,
                        },
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            // should be forced to Customizable due to marketCapFeeScheduler
            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.Customizable
            )
            expect(curveConfig.migratedPoolFee.poolFeeBps).toBe(500)
            expect(
                curveConfig.migratedPoolMarketCapFeeSchedulerParams
                    .numberOfPeriod
            ).toBe(10)
            expect(
                curveConfig.migratedPoolMarketCapFeeSchedulerParams
                    .schedulerExpirationDuration
            ).toBe(86400)
            // reductionFactor should be calculated (non-zero)
            expect(
                curveConfig.migratedPoolMarketCapFeeSchedulerParams.reductionFactor.gt(
                    new BN(0)
                )
            ).toBe(true)
        })

        test('MarketCapFeeScheduler with FeeMarketCapSchedulerExponential', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: {
                    ...baseFeeParams,
                    baseFeeParams: {
                        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                        feeSchedulerParam: {
                            startingFeeBps: 800,
                            endingFeeBps: 100,
                            numberOfPeriod: 20,
                            totalDuration: 7200,
                        },
                    },
                },
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.Customizable,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 800,
                        baseFeeMode:
                            DammV2BaseFeeMode.FeeMarketCapSchedulerExponential,
                        marketCapFeeSchedulerParams: {
                            endingBaseFeeBps: 50,
                            numberOfPeriod: 15,
                            startingMarketCap: 20000,
                            endingMarketCap: 20000000,
                            schedulerExpirationDuration: 172800,
                        },
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.Customizable
            )
            expect(curveConfig.migratedPoolBaseFeeMode).toBe(
                DammV2BaseFeeMode.FeeMarketCapSchedulerExponential
            )
            expect(curveConfig.migratedPoolFee.poolFeeBps).toBe(800)
            expect(
                curveConfig.migratedPoolMarketCapFeeSchedulerParams
                    .numberOfPeriod
            ).toBe(15)
        })

        test('MarketCapFeeScheduler should use bonding curve ending fee as cliff fee', () => {
            const endingFeeBps = 200
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: {
                    ...baseFeeParams,
                    baseFeeParams: {
                        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
                        feeSchedulerParam: {
                            startingFeeBps: 600,
                            endingFeeBps,
                            numberOfPeriod: 10,
                            totalDuration: 3600,
                        },
                    },
                },
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps200,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                        dynamicFee: DammV2DynamicFeeMode.Disabled,
                        poolFeeBps: 200,
                        baseFeeMode:
                            DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
                        marketCapFeeSchedulerParams: {
                            endingBaseFeeBps: 50,
                            numberOfPeriod: 5,
                            startingMarketCap: 20000,
                            endingMarketCap: 20000000,
                            schedulerExpirationDuration: 43200,
                        },
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.Customizable
            )
            expect(curveConfig.migratedPoolFee.poolFeeBps).toBe(200)
            expect(
                curveConfig.migratedPoolMarketCapFeeSchedulerParams
                    .numberOfPeriod
            ).toBe(5)
        })

        test('MarketCapFeeScheduler with FeeTimeSchedulerLinear should use default scheduler params', () => {
            // time-based fee modes don't populate market cap scheduler params
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM_V2,
                    migrationFeeOption: MigrationFeeOption.FixedBps100,
                    migrationFee: {
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 500,
                        baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
                        marketCapFeeSchedulerParams: {
                            endingBaseFeeBps: 100,
                            numberOfPeriod: 10,
                            startingMarketCap: 20000,
                            endingMarketCap: 20000000,
                            schedulerExpirationDuration: 86400,
                        },
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            expect(curveConfig.migrationFeeOption).toBe(
                MigrationFeeOption.Customizable
            )
            // but scheduler params should be defaults for time-based modes
            expect(curveConfig.migratedPoolMarketCapFeeSchedulerParams).toEqual(
                DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
            )
        })
    })

    describe('DAMM V1 Migration Option', () => {
        test('DAMM V1 should always use default params regardless of settings', () => {
            const curveConfig = buildCurve({
                token: baseTokenParams,
                fee: baseFeeParams,
                migration: {
                    migrationOption: MigrationOption.MET_DAMM, // V1
                    migrationFeeOption: MigrationFeeOption.Customizable,
                    migrationFee: {
                        feePercentage: 10,
                        creatorFeePercentage: 50,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.OutputToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 999, // Should be ignored for DAMM V1
                    },
                },
                liquidityDistribution: baseLiquidityDistribution,
                lockedVesting: baseLockedVesting,
                activationType: ActivationType.Timestamp,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            // for DAMM V1, customizable option should work but params are defaults
            expect(curveConfig.migratedPoolFee).toEqual(
                DEFAULT_MIGRATED_POOL_FEE_PARAMS
            )
            expect(curveConfig.migratedPoolMarketCapFeeSchedulerParams).toEqual(
                DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
            )
        })
    })
})
