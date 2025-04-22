import Decimal from 'decimal.js'
import BN from 'bn.js'
import {
    type ConfigParameters,
    type DesignConstantProductCurveParam,
    type DesignCustomConstantProductCurveParam,
} from './types'
import { MAX_SQRT_PRICE } from './constants'
import {
    getSqrtPriceFromPrice,
    getMigrationBaseToken,
    getTotalVestingAmount,
    getFirstCurve,
    getTotalSupplyFromCurve,
} from './common'
import { getInitialLiquidityFromDeltaBase } from './math/curve'

/**
 * Design a constant product curve
 * @param designConstantProductCurveParam - The parameters for the constant product curve
 * @returns The design constant product curve
 */
export function designConstantProductCurve(
    designConstantProductCurveParam: DesignConstantProductCurveParam
): ConfigParameters {
    const {
        totalTokenSupply,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        lockedVesting,
    } = designConstantProductCurveParam

    const migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    const totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

    const migrationQuoteThresholdWithDecimals = new BN(
        migrationQuoteThreshold * 10 ** tokenQuoteDecimal
    )

    const migrationPrice = new Decimal(migrationQuoteThreshold.toString()).div(
        new Decimal(migrationBaseSupply.toString())
    )

    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const migrationBaseAmount = getMigrationBaseToken(
        new BN(migrationQuoteThresholdWithDecimals),
        migrateSqrtPrice,
        migrationOption
    )

    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)

    const { sqrtStartPrice, curve } = getFirstCurve(
        migrateSqrtPrice,
        migrationBaseAmount,
        swapAmount,
        migrationQuoteThresholdWithDecimals
    )

    const totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdWithDecimals,
        sqrtStartPrice,
        curve,
        lockedVesting,
        migrationOption
    )

    const remainingAmount = totalSupply.sub(totalDynamicSupply)

    const lastLiquidity = getInitialLiquidityFromDeltaBase(
        remainingAmount,
        MAX_SQRT_PRICE,
        migrateSqrtPrice
    )

    if (!lastLiquidity.isZero()) {
        curve.push({
            sqrtPrice: MAX_SQRT_PRICE,
            liquidity: lastLiquidity,
        })
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                cliffFeeNumerator: new BN(2_500_000),
                numberOfPeriod: 0,
                reductionFactor: new BN(0),
                periodFrequency: new BN(0),
                feeSchedulerMode: 0,
            },
            dynamicFee: null,
        },
        activationType: 0,
        collectFeeMode: 1,
        migrationOption,
        tokenType: 0, // spl_token
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold: migrationQuoteThresholdWithDecimals,
        partnerLpPercentage: 0,
        creatorLpPercentage: 0,
        partnerLockedLpPercentage: 100,
        creatorLockedLpPercentage: 0,
        sqrtStartPrice,
        lockedVesting,
        migrationFeeOption: 0,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        padding: [],
        curve,
    }
    return instructionParams
}

/**
 * Design a custom constant product curve
 * @param designCustomConstantProductCurveParam - The parameters for the custom constant product curve
 * @returns The design custom constant product curve
 */
export function designCustomConstantProductCurve(
    designCustomConstantProductCurveParam: DesignCustomConstantProductCurveParam
): ConfigParameters {
    const {
        totalTokenSupply,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        lockedVesting,
    } = designCustomConstantProductCurveParam.constantProductCurveParam

    const {
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
    } = designCustomConstantProductCurveParam.feeSchedulerParam

    const {
        baseFeeBps,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        migrationFeeOption,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
    } = designCustomConstantProductCurveParam

    const migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    const totalSupply = new BN(totalTokenSupply).mul(
        new BN(10).pow(new BN(tokenBaseDecimal))
    )

    const migrationQuoteThresholdWithDecimals = new BN(
        migrationQuoteThreshold * 10 ** tokenQuoteDecimal
    )

    const migrationPrice = new Decimal(migrationQuoteThreshold.toString()).div(
        new Decimal(migrationBaseSupply.toString())
    )

    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const migrationBaseAmount = getMigrationBaseToken(
        new BN(migrationQuoteThresholdWithDecimals),
        migrateSqrtPrice,
        migrationOption
    )

    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)

    const { sqrtStartPrice, curve } = getFirstCurve(
        migrateSqrtPrice,
        migrationBaseAmount,
        swapAmount,
        migrationQuoteThresholdWithDecimals
    )

    const totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdWithDecimals,
        sqrtStartPrice,
        curve,
        lockedVesting,
        migrationOption
    )

    const remainingAmount = totalSupply.sub(totalDynamicSupply)

    const lastLiquidity = getInitialLiquidityFromDeltaBase(
        remainingAmount,
        MAX_SQRT_PRICE,
        migrateSqrtPrice
    )

    if (!lastLiquidity.isZero()) {
        curve.push({
            sqrtPrice: MAX_SQRT_PRICE,
            liquidity: lastLiquidity,
        })
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                cliffFeeNumerator: new BN((baseFeeBps * 100000).toString()),
                numberOfPeriod: numberOfPeriod,
                reductionFactor: new BN(reductionFactor),
                periodFrequency: new BN(periodFrequency),
                feeSchedulerMode: feeSchedulerMode,
            },
            dynamicFee: dynamicFeeEnabled
                ? {
                      binStep: 1,
                      binStepU128: new BN('1844674407370955'),
                      filterPeriod: 10,
                      decayPeriod: 120,
                      reductionFactor: 5000,
                      variableFeeControl: 2000000,
                      maxVolatilityAccumulator: 100000,
                  }
                : null,
        },
        activationType: activationType,
        collectFeeMode: collectFeeMode,
        migrationOption: migrationOption,
        tokenType: tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold: migrationQuoteThresholdWithDecimals,
        partnerLpPercentage: partnerLpPercentage,
        creatorLpPercentage: creatorLpPercentage,
        partnerLockedLpPercentage: partnerLockedLpPercentage,
        creatorLockedLpPercentage: creatorLockedLpPercentage,
        sqrtStartPrice,
        lockedVesting,
        migrationFeeOption: migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        padding: [],
        curve,
    }
    return instructionParams
}
