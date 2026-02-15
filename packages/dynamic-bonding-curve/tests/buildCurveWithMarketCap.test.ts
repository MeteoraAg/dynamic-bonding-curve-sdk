import { expect, test, describe } from 'vitest'
import {
    buildCurveWithMarketCap,
    getTotalVestingAmount,
    getLockedVestingParams,
} from '../src/helpers'
import BN from 'bn.js'
import {
    ActivationType,
    BuildCurveBaseParams,
    CollectFeeMode,
    BaseFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import { convertBNToDecimal } from './utils/common'

describe('buildCurveWithMarketCap tests', () => {
    const baseParams: BuildCurveBaseParams = {
        token: {
            tokenType: TokenType.SPL,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.NINE,
            tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
            totalTokenSupply: 1000000000,
            leftover: 10000,
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

    test('build curve by market cap 1', () => {
        console.log('\n testing build curve by market cap...')
        const config = buildCurveWithMarketCap({
            ...baseParams,
            initialMarketCap: 23.5,
            migrationMarketCap: 405.882352941,
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

    test('build curve by market cap 2', () => {
        console.log('\n testing build curve by market cap...')
        const config = buildCurveWithMarketCap({
            ...baseParams,
            initialMarketCap: 0.1,
            migrationMarketCap: 0.5,
        })

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold.toString()
        )

        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve by market cap with locked vesting', () => {
        console.log('\n testing build curve with locked vesting...')
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

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()

        const lockedVesting = getLockedVestingParams(
            lockedVestingConfig.totalLockedVestingAmount,
            lockedVestingConfig.numberOfVestingPeriod,
            lockedVestingConfig.cliffUnlockAmount,
            lockedVestingConfig.totalVestingDuration,
            lockedVestingConfig.cliffDurationFromMigrationTime,
            baseParams.token.tokenBaseDecimal
        )

        console.log('lockedVesting', convertBNToDecimal(lockedVesting))

        const totalVestingAmount = getTotalVestingAmount(lockedVesting)

        console.log('totalVestingAmount', totalVestingAmount.toString())

        const vestingPercentage = totalVestingAmount
            .mul(new BN(100))
            .div(
                new BN(
                    baseParams.token.totalTokenSupply *
                        10 ** baseParams.token.tokenBaseDecimal
                )
            )
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

        expect(totalVestingAmount.toNumber()).toBe(
            lockedVestingConfig.totalLockedVestingAmount *
                10 ** baseParams.token.tokenBaseDecimal
        )
    })

    test('build curve by market cap 3', () => {
        console.log('\n testing build curve by market cap...')

        const config = buildCurveWithMarketCap({
            token: {
                tokenType: TokenType.SPL,
                tokenBaseDecimal: TokenDecimal.SIX,
                tokenQuoteDecimal: TokenDecimal.SIX,
                tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
                totalTokenSupply: 100000000,
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
                creatorTradingFeePercentage: 50,
                poolCreationFee: 1,
                enableFirstSwapWithMinFee: false,
            },
            migration: {
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.FixedBps100,
                migrationFee: {
                    feePercentage: 1.5,
                    creatorFeePercentage: 50,
                },
            },
            liquidityDistribution: {
                partnerLiquidityPercentage: 0,
                partnerPermanentLockedLiquidityPercentage: 100,
                creatorLiquidityPercentage: 0,
                creatorPermanentLockedLiquidityPercentage: 0,
            },
            lockedVesting: {
                totalLockedVestingAmount: 50000000,
                numberOfVestingPeriod: 1,
                cliffUnlockAmount: 50000000,
                totalVestingDuration: 1,
                cliffDurationFromMigrationTime: 0,
            },
            activationType: ActivationType.Slot,
            initialMarketCap: 1000,
            migrationMarketCap: 3000,
        })

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold.toString()
        )

        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })
})
