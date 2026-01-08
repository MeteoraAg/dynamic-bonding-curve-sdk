import { expect, test, describe } from 'vitest'
import { buildCurve } from '../src/helpers'
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
} from '../src'
import { convertBNToDecimal } from './utils/common'

describe('buildCurve tests', () => {
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
        leftover: 0,
        tokenUpdateAuthority: 0,
        migrationFee: {
            feePercentage: 0,
            creatorFeePercentage: 0,
        },
        poolCreationFee: 1,
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
