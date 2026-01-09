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
        totalTokenSupply: 1000000000,
        migrationOption: MigrationOption.MET_DAMM_V2,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        lockedVestingParams: {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
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
        activationType: ActivationType.Slot,
        collectFeeMode: CollectFeeMode.QuoteToken,
        migrationFeeOption: MigrationFeeOption.FixedBps100,
        tokenType: TokenType.SPL,
        partnerLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
        creatorTradingFeePercentage: 0,
        leftover: 10000,
        tokenUpdateAuthority: 0,
        migrationFee: {
            feePercentage: 0,
            creatorFeePercentage: 0,
        },
        poolCreationFee: 1,
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
        const lockedVestingParams = {
            ...baseParams,
            initialMarketCap: 99.1669972233,
            migrationMarketCap: 462.779320376,
            lockedVestingParam: {
                totalLockedVestingAmount: 10000000,
                numberOfVestingPeriod: 1000,
                cliffUnlockAmount: 0,
                totalVestingDuration: 365 * 24 * 60 * 60,
                cliffDurationFromMigrationTime: 0,
            },
        }

        const config = buildCurveWithMarketCap(lockedVestingParams)

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
            lockedVestingParams.lockedVestingParam.totalLockedVestingAmount,
            lockedVestingParams.lockedVestingParam.numberOfVestingPeriod,
            lockedVestingParams.lockedVestingParam.cliffUnlockAmount,
            lockedVestingParams.lockedVestingParam.totalVestingDuration,
            lockedVestingParams.lockedVestingParam
                .cliffDurationFromMigrationTime,
            lockedVestingParams.tokenBaseDecimal
        )

        console.log('lockedVesting', convertBNToDecimal(lockedVesting))

        const totalVestingAmount = getTotalVestingAmount(lockedVesting)

        console.log('totalVestingAmount', totalVestingAmount.toString())

        const vestingPercentage = totalVestingAmount
            .mul(new BN(100))
            .div(
                new BN(
                    lockedVestingParams.totalTokenSupply *
                        10 ** lockedVestingParams.tokenBaseDecimal
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
            lockedVestingParams.lockedVestingParam.totalLockedVestingAmount *
                10 ** lockedVestingParams.tokenBaseDecimal
        )
    })

    test('build curve by market cap 3', () => {
        console.log('\n testing build curve by market cap...')

        const config = buildCurveWithMarketCap({
            totalTokenSupply: 100000000,
            initialMarketCap: 1000,
            migrationMarketCap: 3000,
            migrationOption: MigrationOption.MET_DAMM_V2,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.SIX,
            lockedVestingParams: {
                totalLockedVestingAmount: 50000000,
                numberOfVestingPeriod: 1,
                cliffUnlockAmount: 50000000,
                totalVestingDuration: 1,
                cliffDurationFromMigrationTime: 0,
            },
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
            activationType: ActivationType.Slot,
            collectFeeMode: CollectFeeMode.QuoteToken,
            migrationFeeOption: MigrationFeeOption.FixedBps100,
            tokenType: TokenType.SPL,
            partnerLiquidityPercentage: 0,
            creatorLiquidityPercentage: 0,
            partnerPermanentLockedLiquidityPercentage: 100,
            creatorPermanentLockedLiquidityPercentage: 0,
            creatorTradingFeePercentage: 50,
            leftover: 0,
            tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
            migrationFee: {
                feePercentage: 1.5,
                creatorFeePercentage: 50,
            },
            poolCreationFee: 1,
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
