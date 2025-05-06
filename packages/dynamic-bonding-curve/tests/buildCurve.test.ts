import { expect, test, describe } from 'bun:test'
import {
    buildCurve,
    buildCurveByMarketCap,
    buildCurveGraph,
} from '../src/helpers'
import BN from 'bn.js'
import {
    ActivationType,
    CollectFeeMode,
    FeeSchedulerMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
} from '../src'
import { convertBNToDecimal } from './utils/common'
import { getMinBaseFeeBps } from '../src/helpers'
import { FEE_DENOMINATOR, BASIS_POINT_MAX } from '../src/constants'

describe('buildCurve tests', () => {
    const baseParams = {
        totalTokenSupply: 1000000000,
        migrationOption: MigrationOption.MET_DAMM,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        lockedVesting: {
            amountPerPeriod: new BN(0),
            cliffDurationFromMigrationTime: new BN(0),
            frequency: new BN(0),
            numberOfPeriod: new BN(0),
            cliffUnlockAmount: new BN(0),
        },
        feeSchedulerParam: {
            numberOfPeriod: 0,
            reductionFactor: 0,
            periodFrequency: 0,
            feeSchedulerMode: FeeSchedulerMode.Linear,
        },
        baseFeeBps: 25,
        dynamicFeeEnabled: true,
        activationType: ActivationType.Slot,
        collectFeeMode: CollectFeeMode.OnlyQuote,
        migrationFeeOption: MigrationFeeOption.FixedBps100,
        tokenType: TokenType.SPL,
        partnerLpPercentage: 0,
        creatorLpPercentage: 0,
        partnerLockedLpPercentage: 100,
        creatorLockedLpPercentage: 0,
        creatorTradingFeePercentage: 0,
        leftover: 10000,
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

        console.log('config:', convertBNToDecimal(config))
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    test('build curve with market cap parameters', () => {
        console.log('\n testing build curve with market cap parameters...')
        const config = buildCurveByMarketCap({
            ...baseParams,
            initialMarketCap: 99.1669972233,
            migrationMarketCap: 462.779320376,
        })

        console.log('config:', convertBNToDecimal(config))
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    test('build curve with locked vesting', () => {
        console.log('\n testing build curve with locked vesting...')
        const lockedVestingParams = {
            ...baseParams,
            initialMarketCap: 99.1669972233,
            migrationMarketCap: 462.779320376,
            lockedVesting: {
                amountPerPeriod: new BN(1000000),
                cliffDurationFromMigrationTime: new BN(0),
                frequency: new BN(30 * 24 * 60 * 60),
                numberOfPeriod: new BN(12),
                cliffUnlockAmount: new BN(5000000),
            },
        }

        const config = buildCurveByMarketCap(lockedVestingParams)

        console.log('config with locked vesting:', convertBNToDecimal(config))
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)

        const totalVestingAmount =
            lockedVestingParams.lockedVesting.cliffUnlockAmount.add(
                lockedVestingParams.lockedVesting.amountPerPeriod.mul(
                    lockedVestingParams.lockedVesting.numberOfPeriod
                )
            )
        const vestingPercentage = totalVestingAmount
            .mul(new BN(100))
            .div(new BN(lockedVestingParams.totalTokenSupply))
            .toNumber()

        expect(config.tokenSupply).not.toBeNull()
        if (config.tokenSupply) {
            expect(config.tokenSupply.preMigrationTokenSupply).toBeDefined()
            expect(config.tokenSupply.postMigrationTokenSupply).toBeDefined()

            const migrationPercentage = config.migrationQuoteThreshold
                .mul(new BN(100))
                .div(config.tokenSupply.preMigrationTokenSupply)
                .toNumber()

            expect(migrationPercentage).toBeLessThan(100 - vestingPercentage)
        }
    })

    test('build graph curve', () => {
        console.log('\n testing build curve graph...')
        const curveGraphParams = {
            ...baseParams,
            initialMarketCap: 30,
            migrationMarketCap: 300,
            kFactor: 1.2,
        }

        const config = buildCurveGraph(curveGraphParams)

        console.log('config for graph curve:', convertBNToDecimal(config))
        expect(config).toBeDefined()
        expect(config.migrationQuoteThreshold).toBeDefined()
        expect(config.curve).toBeDefined()
        expect(config.curve.length).toBeGreaterThan(0)
    })

    describe('getMinBaseFeeBps tests', () => {
        test('linear fee scheduler - should calculate minimum fee correctly', () => {
            const baseFeeBps = 5000
            const cliffFeeNumerator =
                (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX
            const numberOfPeriod = 144
            const reductionFactor = 3333333
            const feeSchedulerMode = FeeSchedulerMode.Linear

            const minBaseFeeBps = getMinBaseFeeBps(
                cliffFeeNumerator,
                numberOfPeriod,
                reductionFactor,
                feeSchedulerMode
            )

            // linear mode: cliffFeeNumerator - (numberOfPeriod * reductionFactor)
            const expectedMinFeeNumerator =
                cliffFeeNumerator - numberOfPeriod * reductionFactor
            const expectedMinFeeBps = Math.max(
                0,
                (expectedMinFeeNumerator / FEE_DENOMINATOR) * BASIS_POINT_MAX
            )

            console.log('minBaseFeeBps:', minBaseFeeBps)
            console.log('expectedMinFeeBps:', expectedMinFeeBps)

            expect(minBaseFeeBps).toBeLessThan(baseFeeBps)
            expect(minBaseFeeBps).toEqual(expectedMinFeeBps)
        })

        test('exponential fee scheduler - should calculate minimum fee correctly', () => {
            const baseFeeBps = 5000
            const cliffFeeNumerator =
                (baseFeeBps * FEE_DENOMINATOR) / BASIS_POINT_MAX
            const numberOfPeriod = 37.5
            const reductionFactor = 822.5
            const feeSchedulerMode = FeeSchedulerMode.Exponential

            const minBaseFeeBps = getMinBaseFeeBps(
                cliffFeeNumerator,
                numberOfPeriod,
                reductionFactor,
                feeSchedulerMode
            )

            // exponential mode: cliffFeeNumerator * (1 - reductionFactor/BASIS_POINT_MAX)^numberOfPeriod
            const decayRate = 1 - reductionFactor / BASIS_POINT_MAX
            const expectedMinFeeNumerator =
                cliffFeeNumerator * Math.pow(decayRate, numberOfPeriod)
            const expectedMinFeeBps = Math.max(
                0,
                (expectedMinFeeNumerator / FEE_DENOMINATOR) * BASIS_POINT_MAX
            )

            console.log('minBaseFeeBps:', minBaseFeeBps)
            console.log('expectedMinFeeBps:', expectedMinFeeBps)

            expect(minBaseFeeBps).toBeLessThan(baseFeeBps)
            expect(minBaseFeeBps).toEqual(expectedMinFeeBps)
        })
    })
})
