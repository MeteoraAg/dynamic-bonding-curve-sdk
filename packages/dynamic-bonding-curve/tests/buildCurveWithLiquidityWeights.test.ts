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
    TokenUpdateAuthorityOption,
} from '../src'
import Decimal from 'decimal.js'
import { convertBNToDecimal } from './utils/common'

describe('buildCurveWithLiquidityWeights tests', () => {
    const baseParams: BuildCurveBaseParams = {
        token: {
            tokenType: TokenType.SPL,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.NINE,
            tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
            totalTokenSupply: 1000000000,
            leftover: 1000,
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

    test('build curve with liquidity weights 1.2^n', () => {
        console.log('\n testing build curve with liquidity weights 1.2^n...')
        const liquidityWeights: number[] = []
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
        const liquidityWeights: number[] = []
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
        const liquidityWeights: number[] = []
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
            token: {
                tokenType: TokenType.SPL,
                tokenBaseDecimal: TokenDecimal.NINE,
                tokenQuoteDecimal: TokenDecimal.SIX,
                tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
                totalTokenSupply: 1000000000,
                leftover: 200000000,
            },
            migration: {
                migrationOption: MigrationOption.MET_DAMM,
                migrationFeeOption: MigrationFeeOption.FixedBps100,
                migrationFee: {
                    feePercentage: 0,
                    creatorFeePercentage: 0,
                },
            },
            lockedVesting: {
                totalLockedVestingAmount: 10000000,
                numberOfVestingPeriod: 1,
                cliffUnlockAmount: 0,
                totalVestingDuration: 1,
                cliffDurationFromMigrationTime: 0,
            },
            initialMarketCap: 15,
            migrationMarketCap: 255,
            liquidityWeights,
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
            token: {
                tokenType: TokenType.SPL,
                tokenBaseDecimal: TokenDecimal.SIX,
                tokenQuoteDecimal: TokenDecimal.SIX,
                tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
                totalTokenSupply: 100000000,
                leftover: 50000000,
            },
            migration: {
                migrationOption: MigrationOption.MET_DAMM,
                migrationFeeOption: MigrationFeeOption.FixedBps100,
                migrationFee: {
                    feePercentage: 0,
                    creatorFeePercentage: 0,
                },
            },
            initialMarketCap: 50,
            migrationMarketCap: 100000,
            liquidityWeights,
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
