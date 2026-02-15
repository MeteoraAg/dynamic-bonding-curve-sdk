import { expect, test, describe } from 'vitest'
import { buildCurveWithTwoSegments } from '../src/helpers'
import BN from 'bn.js'
import {
    ActivationType,
    BaseFeeMode,
    BuildCurveBaseParams,
    CollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import { convertBNToDecimal } from './utils/common'

describe('buildCurveWithTwoSegments tests', () => {
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

    test('build curve with two segments', () => {
        console.log('\n testing build curve with two segments...')

        const config = buildCurveWithTwoSegments({
            ...baseParams,
            token: {
                tokenType: TokenType.SPL,
                tokenBaseDecimal: TokenDecimal.NINE,
                tokenQuoteDecimal: TokenDecimal.NINE,
                tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
                totalTokenSupply: 1000000000,
                leftover: 350000000,
            },
            fee: {
                baseFeeParams: {
                    baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                    feeSchedulerParam: {
                        startingFeeBps: 5000,
                        endingFeeBps: 100,
                        numberOfPeriod: 120,
                        totalDuration: 120,
                    },
                },
                dynamicFeeEnabled: true,
                collectFeeMode: CollectFeeMode.QuoteToken,
                creatorTradingFeePercentage: 0,
                poolCreationFee: 1,
                enableFirstSwapWithMinFee: false,
            },
            initialMarketCap: 20000,
            migrationMarketCap: 1000000,
            percentageSupplyOnMigration: 20,
        })

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.NINE))
                .toString()
        )
        console.log(
            'baseFeeParams',
            convertBNToDecimal(config.poolFees.baseFee)
        )
        console.log(
            'lockedVestingParams',
            convertBNToDecimal(config.lockedVesting)
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })
})
