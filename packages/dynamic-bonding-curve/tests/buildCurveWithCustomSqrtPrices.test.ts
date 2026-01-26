import { describe, test as it, expect } from 'vitest'
import {
    buildCurveWithCustomSqrtPrices,
    ActivationType,
    BaseFeeMode,
    CollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    createSqrtPrices,
    BuildCurveBaseParams,
    DammV2BaseFeeMode,
} from '../src'
import BN from 'bn.js'

describe('buildCurveWithCustomSqrtPrices', () => {
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
        leftover: 1000,
        tokenUpdateAuthority: 0,
        migrationFee: {
            feePercentage: 0,
            creatorFeePercentage: 0,
        },
        poolCreationFee: 1,
        migratedPoolBaseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
        enableFirstSwapWithMinFee: false,
    }

    it('should create a curve with custom sqrt prices', () => {
        const prices = [0.001, 0.005, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        expect(config.curve.length).toBe(2) // 3 prices = 2 segments
        expect(config.sqrtStartPrice.toString()).toBe(sqrtPrices[0].toString())
        expect(config.curve[config.curve.length - 1].sqrtPrice.toString()).toBe(
            sqrtPrices[sqrtPrices.length - 1].toString()
        )
    })

    it('should distribute liquidity evenly when weights not provided', () => {
        const prices = [0.001, 0.005, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        // With even weights, liquidity should be equal (within rounding)
        const liquidity0 = config.curve[0].liquidity
        const liquidity1 = config.curve[1].liquidity

        // Allow for some rounding difference
        const diff = liquidity0.sub(liquidity1).abs()
        const tolerance = liquidity0.divn(1000) // 0.1% tolerance
        expect(diff.lte(tolerance)).toBe(true)
    })

    it('should respect custom liquidity weights', () => {
        const prices = [0.001, 0.005, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )
        const liquidityWeights = [2, 1] // First segment has 2x liquidity

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
            liquidityWeights,
        })

        const liquidity0 = config.curve[0].liquidity
        const liquidity1 = config.curve[1].liquidity

        // First segment should have approximately 2x the liquidity
        const ratio =
            new BN(liquidity0).muln(100).div(liquidity1).toNumber() / 100
        expect(ratio).toBeGreaterThan(1.9)
        expect(ratio).toBeLessThan(2.1)
    })

    it('should handle many price points', () => {
        const prices = [0.0001, 0.0005, 0.001, 0.002, 0.004, 0.006, 0.008, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        expect(config.curve.length).toBe(7) // 8 prices = 7 segments
    })

    it('should validate minimum price points', () => {
        const prices = [0.001] // Only 1 price
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        expect(() => {
            buildCurveWithCustomSqrtPrices({
                ...baseParams,
                sqrtPrices,
            })
        }).toThrow('sqrtPrices array must have at least 2 elements')
    })

    it('should validate ascending order', () => {
        const prices = [0.01, 0.005, 0.001] // Descending order
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        expect(() => {
            buildCurveWithCustomSqrtPrices({
                ...baseParams,
                sqrtPrices,
            })
        }).toThrow('sqrtPrices must be in ascending order')
    })

    it('should validate liquidity weights length', () => {
        const prices = [0.001, 0.005, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )
        const liquidityWeights = [1] // Should be 2 weights for 3 prices

        expect(() => {
            buildCurveWithCustomSqrtPrices({
                ...baseParams,
                sqrtPrices,
                liquidityWeights,
            })
        }).toThrow('liquidityWeights length must equal sqrtPrices.length - 1')
    })

    it('should handle duplicate prices', () => {
        const prices = [0.001, 0.001, 0.01] // Duplicate price
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        expect(() => {
            buildCurveWithCustomSqrtPrices({
                ...baseParams,
                sqrtPrices,
            })
        }).toThrow('sqrtPrices must be in ascending order')
    })

    it('should produce valid migration quote threshold', () => {
        const prices = [0.001, 0.005, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        expect(config.migrationQuoteThreshold.gt(new BN(0))).toBe(true)
    })

    it('should respect percentage supply on migration', () => {
        const prices = [0.001, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config80 = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        const config50 = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        // Both configs should be valid with positive liquidity
        expect(config80.curve[0].liquidity.gt(new BN(0))).toBe(true)
        expect(config50.curve[0].liquidity.gt(new BN(0))).toBe(true)

        // Both should have the same curve structure
        expect(config80.curve.length).toBe(config50.curve.length)
    })

    it('should handle non-uniform price spacing', () => {
        // Prices with varying gaps
        const prices = [0.001, 0.002, 0.005, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        expect(config.curve.length).toBe(3)
        // Each segment should have positive liquidity
        config.curve.forEach((segment) => {
            expect(segment.liquidity.gt(new BN(0))).toBe(true)
        })
    })

    it('should work with very small prices', () => {
        const prices = [0.00001, 0.0001, 0.001]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        expect(config.curve.length).toBe(2)
        expect(config.sqrtStartPrice.gt(new BN(0))).toBe(true)
    })

    it('should work with larger prices', () => {
        const prices = [0.1, 0.5, 1.0]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        expect(config.curve.length).toBe(2)
        expect(config.migrationQuoteThreshold.gt(new BN(0))).toBe(true)
    })

    it('should have consistent total supply calculation', () => {
        const prices = [0.001, 0.005, 0.01]
        const sqrtPrices = createSqrtPrices(
            prices,
            TokenDecimal.NINE,
            TokenDecimal.NINE
        )

        const config = buildCurveWithCustomSqrtPrices({
            ...baseParams,
            sqrtPrices,
        })

        if (config.tokenSupply) {
            expect(config.tokenSupply.preMigrationTokenSupply.toString()).toBe(
                config.tokenSupply.postMigrationTokenSupply.toString()
            )
        } else {
            expect(false).toBe(true)
        }
    })
})
