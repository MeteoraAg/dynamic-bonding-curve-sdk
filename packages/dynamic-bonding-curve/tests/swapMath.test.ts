import { describe, expect, test } from 'vitest'
import BN from 'bn.js'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    CollectFeeMode,
    createSqrtPrices,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
    TradeDirection,
} from '../src'
import {
    calculateBaseToQuoteFromAmountIn,
    getFeeMode,
    getIncludedFeeAmount,
} from '../src/math'
import { MAX_FEE_NUMERATOR, U64_MAX } from '../src/constants'

describe('calculateBaseToQuoteFromAmountIn', () => {
    const customPrices = [0.000000001, 0.00000000105, 0.000000002, 0.000001]
    const tokenBaseDecimal = TokenDecimal.SIX
    const tokenQuoteDecimal = TokenDecimal.NINE
    const sqrtPrices = createSqrtPrices(
        customPrices,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const liquidityWeights = [2, 1, 1]

    const curveConfig = buildCurveWithCustomSqrtPrices({
        token: {
            tokenType: TokenType.SPLToken,
            tokenBaseDecimal: tokenBaseDecimal,
            tokenQuoteDecimal: tokenQuoteDecimal,
            tokenAuthorityOption: TokenAuthorityOption.PartnerUpdateAuthority,
            totalTokenSupply: 1_000_000_000,
            leftover: 1000,
        },
        fee: {
            baseFeeParams: {
                baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                feeSchedulerParam: {
                    startingFeeBps: 9000,
                    endingFeeBps: 120,
                    numberOfPeriod: 60,
                    totalDuration: 60,
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
            migrationFeeOption: MigrationFeeOption.Customizable,
            migrationFee: {
                feePercentage: 10,
                creatorFeePercentage: 50,
            },
            migratedPoolFee: {
                collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 120,
                baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
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
        activationType: ActivationType.Timestamp,
        sqrtPrices,
        liquidityWeights,
    })

    test('calculateBaseToQuoteFromAmountIn returns amountLeft when input exceeds available liquidity', () => {
        const configState = {
            curve: curveConfig.curve,
            sqrtStartPrice: curveConfig.sqrtStartPrice,
        }

        const currentSqrtPrice = curveConfig.sqrtStartPrice

        const excessiveAmountIn = new BN('1000000000000000')

        const result = calculateBaseToQuoteFromAmountIn(
            configState,
            currentSqrtPrice,
            excessiveAmountIn
        )

        expect(result.nextSqrtPrice.eq(curveConfig.sqrtStartPrice)).toBe(true)

        expect(result.amountLeft.gte(new BN(0))).toBe(true)
        expect(result.amountLeft.eq(excessiveAmountIn)).toBe(true)

        expect(result.outputAmount.eq(new BN(0))).toBe(true)
    })

    test('calculateBaseToQuoteFromAmountIn caps at sqrtStartPrice when selling pushes price below', () => {
        const configState = {
            curve: curveConfig.curve,
            sqrtStartPrice: curveConfig.sqrtStartPrice,
        }

        let currentSqrtPrice = curveConfig.sqrtStartPrice
        for (const point of curveConfig.curve) {
            if (
                !point.sqrtPrice.isZero() &&
                point.sqrtPrice.gt(currentSqrtPrice)
            ) {
                currentSqrtPrice = point.sqrtPrice
            }
        }

        const excessiveAmountIn = new BN('10000000000000000000')

        const result = calculateBaseToQuoteFromAmountIn(
            configState,
            currentSqrtPrice,
            excessiveAmountIn
        )

        expect(result.nextSqrtPrice.eq(curveConfig.sqrtStartPrice)).toBe(true)

        expect(result.amountLeft.gt(new BN(0))).toBe(true)
        expect(result.outputAmount.gt(new BN(0))).toBe(true)
    })
})

describe('swap fee math bounds', () => {
    test('getFeeMode rejects an unknown collect fee mode', () => {
        expect(() =>
            getFeeMode(2 as CollectFeeMode, TradeDirection.QuoteToBase, false)
        ).toThrow('Invalid collect fee mode')
    })

    test('getIncludedFeeAmount rejects an amount above u64', () => {
        expect(() =>
            getIncludedFeeAmount(new BN(MAX_FEE_NUMERATOR), U64_MAX)
        ).toThrow('Type cast error')
    })
})
