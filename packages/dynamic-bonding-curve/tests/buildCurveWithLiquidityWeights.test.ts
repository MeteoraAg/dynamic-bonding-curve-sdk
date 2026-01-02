import { expect, test, describe } from 'vitest'
import { buildCurveWithLiquidityWeights } from '../src/helpers'
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
} from '../src'
import Decimal from 'decimal.js'
import { convertBNToDecimal } from './utils/common'

describe('buildCurveWithLiquidityWeights tests', () => {
    const baseParams: BuildCurveBaseParams = {
        totalTokenSupply: 1000000000,
        migrationOption: MigrationOption.MET_DAMM_V2,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        lockedVestingParam: {
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
        partnerLpPercentage: 0,
        creatorLpPercentage: 0,
        partnerLockedLpPercentage: 100,
        creatorLockedLpPercentage: 0,
        creatorTradingFeePercentage: 0,
        leftover: 10000,
        tokenUpdateAuthority: 0,
        migrationFee: {
            feePercentage: 10,
            creatorFeePercentage: 50,
        },
    }

    test('build curve with liquidity weights 1.2^n', () => {
        console.log('\n testing build curve with liquidity weights 1.2^n...')
        let liquidityWeights: number[] = []
        for (let i = 0; i < 16; i++) {
            liquidityWeights[i] = new Decimal(1.2)
                .pow(new Decimal(i))
                .toNumber()
        }

        console.log('liquidityWeights:', liquidityWeights)

        const curveGraphParams = {
            ...baseParams,
            initialMarketCap: 30,
            migrationMarketCap: 300,
            liquidityWeights,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

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

    test('build curve with liquidity weights 0.6^n', () => {
        console.log('\n testing build curve with liquidity weights 0.6^n...')
        let liquidityWeights: number[] = []
        for (let i = 0; i < 16; i++) {
            liquidityWeights[i] = new Decimal(0.6)
                .pow(new Decimal(i))
                .toNumber()
        }

        const curveGraphParams = {
            ...baseParams,
            initialMarketCap: 30,
            migrationMarketCap: 300,
            liquidityWeights,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

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

    test('build curve with liquidity weights v1', () => {
        console.log('\n testing build curve with liquidity weights v1...')
        let liquidityWeights: number[] = []
        for (let i = 0; i < 16; i++) {
            if (i < 15) {
                liquidityWeights[i] = new Decimal(1.2)
                    .pow(new Decimal(i))
                    .toNumber()
            } else {
                liquidityWeights[i] = 80
            }
        }

        console.log('liquidityWeights:', liquidityWeights)

        const curveGraphParams = {
            ...baseParams,
            totalTokenSupply: 1000000000,
            initialMarketCap: 15,
            migrationMarketCap: 255,
            tokenQuoteDecimal: TokenDecimal.SIX,
            tokenBaseDecimal: TokenDecimal.NINE,
            lockedVestingParam: {
                totalLockedVestingAmount: 10000000,
                numberOfVestingPeriod: 1,
                cliffUnlockAmount: 0,
                totalVestingDuration: 1,
                cliffDurationFromMigrationTime: 0,
            },
            leftover: 200000000,
            liquidityWeights,
            migrationOption: MigrationOption.MET_DAMM,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.SIX))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })

    test('build curve with liquidity weights v2', () => {
        console.log('\n testing build curve with liquidity weights v2...')

        const liquidityWeights = [
            0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24,
            20.48, 40.96, 81.92, 163.84, 327.68,
        ]

        console.log('liquidityWeights:', liquidityWeights)

        const curveGraphParams = {
            ...baseParams,
            totalTokenSupply: 100000000,
            initialMarketCap: 50,
            migrationMarketCap: 100000,
            tokenQuoteDecimal: TokenDecimal.SIX,
            tokenBaseDecimal: TokenDecimal.SIX,
            leftover: 50000000,
            liquidityWeights,
            migrationOption: MigrationOption.MET_DAMM,
        }

        const config = buildCurveWithLiquidityWeights(curveGraphParams)

        console.log(
            'migrationQuoteThreshold: %d',
            config.migrationQuoteThreshold
                .div(new BN(10 ** TokenDecimal.SIX))
                .toString()
        )
        console.log('sqrtStartPrice', convertBNToDecimal(config.sqrtStartPrice))
        console.log('curve', convertBNToDecimal(config.curve))
        expect(config).toBeDefined()
    })
})
