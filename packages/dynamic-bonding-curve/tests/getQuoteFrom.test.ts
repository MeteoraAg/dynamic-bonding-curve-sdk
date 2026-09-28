import { expect, test, describe } from 'vitest'
import BN from 'bn.js'
import {
    ActivationType,
    BaseFeeMode,
    CollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    SwapMode,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
    buildCurve,
    getQuoteFromInputAmount,
    getQuoteFromOutputAmount,
} from '../src'

const curveConfig = buildCurve({
    token: {
        tokenType: TokenType.SPLToken,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
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
        dynamicFeeEnabled: false,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
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
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: 10,
})

describe('getQuoteFrom', () => {
    test('quotes exact-in and exact-out from a curve before a pool exists', () => {
        const amountIn = new BN(1_000_000_000)

        const exactIn = getQuoteFromInputAmount({
            config: curveConfig,
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactIn,
            amountIn,
            slippageBps: 50,
        })

        expect(exactIn.outputAmount.gt(new BN(0))).toBe(true)
        expect(
            exactIn.minimumAmountOut!.lt(exactIn.excludedTransferFeeAmountOut)
        ).toBe(true)
        expect(exactIn.includedTransferFeeAmountIn.eq(amountIn)).toBe(true)

        const exactOut = getQuoteFromOutputAmount({
            config: curveConfig,
            swapBaseForQuote: false,
            amountOut: exactIn.outputAmount,
            slippageBps: 50,
        })

        expect(exactOut.outputAmount.eq(exactIn.outputAmount)).toBe(true)
        expect(
            exactOut.maximumAmountIn!.gte(exactOut.includedFeeInputAmount)
        ).toBe(true)
    })

    test('partial fill returns the unfilled input', () => {
        const amountIn = new BN('100000000000000000000')

        expect(() =>
            getQuoteFromInputAmount({
                config: curveConfig,
                swapBaseForQuote: false,
                swapMode: SwapMode.ExactIn,
                amountIn,
            })
        ).toThrow('Insufficient Liquidity')

        const partial = getQuoteFromInputAmount({
            config: curveConfig,
            swapBaseForQuote: false,
            swapMode: SwapMode.PartialFill,
            amountIn,
        })

        expect(partial.outputAmount.gt(new BN(0))).toBe(true)
        expect(partial.amountLeft.gt(new BN(0))).toBe(true)
        expect(partial.includedFeeInputAmount.lt(amountIn)).toBe(true)
    })

    test('a fee scheduler stays at the cliff fee when currentPoint is set', () => {
        const schedulerConfig = buildCurve({
            token: {
                tokenType: TokenType.SPLToken,
                tokenBaseDecimal: TokenDecimal.SIX,
                tokenQuoteDecimal: TokenDecimal.NINE,
                tokenAuthorityOption: TokenAuthorityOption.Immutable,
                totalTokenSupply: 1_000_000_000,
                leftover: 0,
            },
            fee: {
                baseFeeParams: {
                    baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
                    feeSchedulerParam: {
                        startingFeeBps: 500,
                        endingFeeBps: 100,
                        numberOfPeriod: 10,
                        totalDuration: 1000,
                    },
                },
                dynamicFeeEnabled: false,
                collectFeeMode: CollectFeeMode.QuoteToken,
                creatorTradingFeePercentage: 0,
                poolCreationFee: 0,
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
            percentageSupplyOnMigration: 20,
            migrationQuoteThreshold: 10,
        })
        const amountIn = new BN(1_000_000_000)
        const atZero = getQuoteFromInputAmount({
            config: schedulerConfig,
            swapBaseForQuote: false,
            amountIn,
        })
        const atLaterPoint = getQuoteFromInputAmount({
            config: schedulerConfig,
            swapBaseForQuote: false,
            amountIn,
            currentPoint: new BN(500),
        })

        expect(atLaterPoint.tradingFee.eq(atZero.tradingFee)).toBe(true)
        expect(atLaterPoint.outputAmount.eq(atZero.outputAmount)).toBe(true)
    })
})
