import BN from 'bn.js'
import { describe, expect, test } from 'vitest'
import {
    BaseFeeMode,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    getFeeSchedulerParams,
    getMigratedPoolFeeParams,
    getMigratedPoolMarketCapFeeSchedulerParams,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    MAX_FEE_NUMERATOR,
    MIN_FEE_NUMERATOR,
} from '../src'
import { getFeeNumeratorOnExponentialFeeScheduler } from '../src/math'

describe('getFeeSchedulerParams', () => {
    test('a constant fee has no periods and stays within the program bounds', () => {
        const params = getFeeSchedulerParams(
            100,
            100,
            BaseFeeMode.FeeSchedulerLinear,
            0,
            0
        )
        expect(params.cliffFeeNumerator.toNumber()).toBe(10_000_000)
        expect(params.firstFactor).toBe(0)
        expect(params.secondFactor.isZero()).toBe(true)
        expect(params.thirdFactor.isZero()).toBe(true)
    })

    test.each([
        [10, 10],
        [9950, 9950],
    ])(
        'rejects a constant fee of %i bps outside the program bounds',
        (start, end) => {
            expect(() =>
                getFeeSchedulerParams(
                    start,
                    end,
                    BaseFeeMode.FeeSchedulerLinear,
                    0,
                    0
                )
            ).toThrow(
                /exceeds maximum allowed value|less than minimum allowed value/
            )
        }
    )

    test('rejects a period frequency that floors to zero', () => {
        expect(() =>
            getFeeSchedulerParams(
                100,
                50,
                BaseFeeMode.FeeSchedulerLinear,
                100,
                50
            )
        ).toThrow('totalDuration must be at least numberOfPeriod')
    })

    test('rejects an exponential ending fee that one bps of decay already undershoots', () => {
        expect(() =>
            getFeeSchedulerParams(
                100,
                99,
                BaseFeeMode.FeeSchedulerExponential,
                1000,
                1000
            )
        ).toThrow('too close to startingBaseFeeBps')
        expect(() =>
            getFeeSchedulerParams(
                9900,
                25,
                BaseFeeMode.FeeSchedulerExponential,
                65_535,
                65_535
            )
        ).toThrow('too close to startingBaseFeeBps')
    })

    test('an exponential schedule ends at or above the requested fee', () => {
        const params = getFeeSchedulerParams(
            5000,
            100,
            BaseFeeMode.FeeSchedulerExponential,
            10,
            1000
        )
        const endingFee = getFeeNumeratorOnExponentialFeeScheduler(
            params.cliffFeeNumerator,
            params.thirdFactor,
            params.firstFactor
        )
        expect(endingFee.gte(new BN(10_000_000))).toBe(true)
        expect(endingFee.gte(new BN(MIN_FEE_NUMERATOR))).toBe(true)
        expect(params.cliffFeeNumerator.lte(new BN(MAX_FEE_NUMERATOR))).toBe(
            true
        )
        expect(params.secondFactor.toNumber()).toBe(100)
    })
})

describe('getMigratedPoolMarketCapFeeSchedulerParams', () => {
    test('rejects an exponential ending fee that is not reachable', () => {
        expect(() =>
            getMigratedPoolMarketCapFeeSchedulerParams(
                1000,
                999,
                DammV2BaseFeeMode.FeeMarketCapSchedulerExponential,
                1000,
                1000,
                3600
            )
        ).toThrow('too close to startingBaseFeeBps')
    })

    test('builds a linear schedule', () => {
        const params = getMigratedPoolMarketCapFeeSchedulerParams(
            1000,
            100,
            DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
            10,
            1000,
            3600
        )
        expect(params.numberOfPeriod).toBe(10)
        expect(params.sqrtPriceStepBps).toBeGreaterThan(0)
        expect(params.schedulerExpirationDuration).toBe(3600)
        expect(params.reductionFactor.toNumber()).toBe(9_000_000)
    })
})

describe('getMigratedPoolFeeParams', () => {
    const customFee = {
        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
        dynamicFee: DammV2DynamicFeeMode.Disabled,
        poolFeeBps: 100,
    }

    test('a fixed option returns the preset config with a linear time scheduler', () => {
        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.FixedBps100,
            {
                ...customFee,
                baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            }
        )
        expect(result.migratedPoolBaseFeeMode).toBe(
            DammV2BaseFeeMode.FeeTimeSchedulerLinear
        )
        expect(result.migratedPoolFee.poolFeeBps).toBe(0)
        expect(result.migrationFeeOption).toBe(MigrationFeeOption.FixedBps100)
        expect(result.compoundingFeeBps).toBe(0)
    })

    test('a fixed option rejects a custom base fee mode or market cap scheduler', () => {
        expect(() =>
            getMigratedPoolFeeParams(
                MigrationOption.MET_DAMM_V2,
                MigrationFeeOption.FixedBps100,
                {
                    ...customFee,
                    baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerExponential,
                }
            )
        ).toThrow('require MigrationFeeOption.Customizable')
        expect(() =>
            getMigratedPoolFeeParams(
                MigrationOption.MET_DAMM_V2,
                MigrationFeeOption.FixedBps100,
                {
                    ...customFee,
                    baseFeeMode: DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
                    marketCapFeeSchedulerParams: {
                        endingBaseFeeBps: 10,
                        numberOfPeriod: 10,
                        priceMultiple: 1000,
                        schedulerExpirationDuration: 3600,
                    },
                }
            )
        ).toThrow('require MigrationFeeOption.Customizable')
    })

    test('Customizable requires poolFeeBps', () => {
        expect(() =>
            getMigratedPoolFeeParams(
                MigrationOption.MET_DAMM_V2,
                MigrationFeeOption.Customizable
            )
        ).toThrow('migratedPoolFee.poolFeeBps is required')
    })

    test('Customizable with a market cap scheduler builds the scheduler params', () => {
        const result = getMigratedPoolFeeParams(
            MigrationOption.MET_DAMM_V2,
            MigrationFeeOption.Customizable,
            {
                ...customFee,
                baseFeeMode: DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
                marketCapFeeSchedulerParams: {
                    endingBaseFeeBps: 10,
                    numberOfPeriod: 10,
                    priceMultiple: 1000,
                    schedulerExpirationDuration: 3600,
                },
            }
        )
        expect(result.migratedPoolBaseFeeMode).toBe(
            DammV2BaseFeeMode.FeeMarketCapSchedulerLinear
        )
        expect(
            result.migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod
        ).toBe(10)
        expect(
            result.migratedPoolMarketCapFeeSchedulerParams.reductionFactor.toNumber()
        ).toBe(900_000)
        expect(result.migratedPoolFee.poolFeeBps).toBe(100)
    })

    test('a market cap scheduler needs its params and a time scheduler must not have them', () => {
        expect(() =>
            getMigratedPoolFeeParams(
                MigrationOption.MET_DAMM_V2,
                MigrationFeeOption.Customizable,
                {
                    ...customFee,
                    baseFeeMode: DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
                }
            )
        ).toThrow('marketCapFeeSchedulerParams must be set exactly when')
        expect(() =>
            getMigratedPoolFeeParams(
                MigrationOption.MET_DAMM_V2,
                MigrationFeeOption.Customizable,
                {
                    ...customFee,
                    marketCapFeeSchedulerParams: {
                        endingBaseFeeBps: 10,
                        numberOfPeriod: 10,
                        priceMultiple: 1000,
                        schedulerExpirationDuration: 3600,
                    },
                }
            )
        ).toThrow('marketCapFeeSchedulerParams must be set exactly when')
    })
})
