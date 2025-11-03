import Decimal from 'decimal.js'
import BN from 'bn.js'
import {
    type ConfigParameters,
    type BuildCurveParams,
    BuildCurveWithMarketCapParams,
    BuildCurveWithLiquidityWeightsParams,
    BuildCurveWithTwoSegmentsParams,
    BaseFeeMode,
} from '../types'
import { MAX_SQRT_PRICE } from '../constants'
import {
    getSqrtPriceFromPrice,
    getMigrationBaseToken,
    getTotalVestingAmount,
    getFirstCurve,
    getTotalSupplyFromCurve,
    getPercentageSupplyOnMigration,
    getSqrtPriceFromMarketCap,
    getBaseTokenForSwap,
    getSwapAmountWithBuffer,
    getDynamicFeeParams,
    getTwoCurve,
    getLockedVestingParams,
    getMigrationQuoteAmountFromMigrationQuoteThreshold,
    getMigrationQuoteAmount,
    getMigrationQuoteThresholdFromMigrationQuoteAmount,
    getBaseFeeParams,
    getMigratedPoolFeeParams,
} from './common'
import { getInitialLiquidityFromDeltaBase } from '../math/curve'
import { convertDecimalToBN, convertToLamports, fromDecimalToBN } from './utils'

/**
 * Build a custom constant product curve
 * @param buildCurveParam - The parameters for the custom constant product curve
 * @returns The build custom constant product curve
 */
export function buildCurve(
    buildCurveParam: BuildCurveParams
): ConfigParameters {
    let {
        totalTokenSupply,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        migrationFeeOption,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        creatorTradingFeePercentage,
        leftover,
        tokenUpdateAuthority,
        migrationFee,
        baseFeeParams,
        migratedPoolFee,
    } = buildCurveParam

    const baseFee = getBaseFeeParams(
        baseFeeParams,
        tokenQuoteDecimal,
        activationType
    )

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const migratedPoolFeeParams = getMigratedPoolFeeParams(
        migrationOption,
        migrationFeeOption,
        migratedPoolFee
    )

    const migrationBaseSupply = new Decimal(totalTokenSupply)
        .mul(new Decimal(percentageSupplyOnMigration))
        .div(new Decimal(100))

    const totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)

    const migrationQuoteAmount =
        getMigrationQuoteAmountFromMigrationQuoteThreshold(
            new Decimal(migrationQuoteThreshold),
            migrationFee.feePercentage
        )

    const migrationPrice = new Decimal(migrationQuoteAmount.toString()).div(
        new Decimal(migrationBaseSupply.toString())
    )

    let migrationQuoteThresholdInLamport = convertToLamports(
        migrationQuoteThreshold,
        tokenQuoteDecimal
    )

    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)

    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    let migrationQuoteAmountInLamport = fromDecimalToBN(
        migrationQuoteAmount.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    const migrationBaseAmount = getMigrationBaseToken(
        migrationQuoteAmountInLamport,
        migrateSqrtPrice,
        migrationOption
    )

    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    const { sqrtStartPrice, curve } = getFirstCurve(
        migrateSqrtPrice,
        migrationBaseAmount,
        swapAmount,
        migrationQuoteThresholdInLamport,
        migrationFee.feePercentage
    )

    const totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdInLamport,
        sqrtStartPrice,
        curve,
        lockedVesting,
        migrationOption,
        totalLeftover,
        migrationFee.feePercentage
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
                ...baseFee,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(
                      baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter
                          ? baseFeeParams.rateLimiterParam.baseFeeBps
                          : baseFeeParams.feeSchedulerParam.endingFeeBps
                  )
                : null,
        },
        activationType: activationType,
        collectFeeMode: collectFeeMode,
        migrationOption: migrationOption,
        tokenType: tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold: migrationQuoteThresholdInLamport,
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
        creatorTradingFeePercentage,
        tokenUpdateAuthority,
        migrationFee,
        migratedPoolFee: {
            collectFeeMode: migratedPoolFeeParams.collectFeeMode,
            dynamicFee: migratedPoolFeeParams.dynamicFee,
            poolFeeBps: migratedPoolFeeParams.poolFeeBps,
        },
        padding: [],
        curve,
    }
    return instructionParams
}

/**
 * Build a custom constant product curve by market cap
 * @param buildCurveByMarketCapParam - The parameters for the custom constant product curve by market cap
 * @returns The build custom constant product curve by market cap
 */
export function buildCurveWithMarketCap(
    buildCurveWithMarketCapParam: BuildCurveWithMarketCapParams
): ConfigParameters {
    const {
        initialMarketCap,
        migrationMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        migrationFee,
        leftover,
    } = buildCurveWithMarketCapParam

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveWithMarketCapParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)

    const totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)

    const percentageSupplyOnMigration = getPercentageSupplyOnMigration(
        new Decimal(initialMarketCap),
        new Decimal(migrationMarketCap),
        lockedVesting,
        totalLeftover,
        totalSupply
    )

    const migrationQuoteAmount = getMigrationQuoteAmount(
        new Decimal(migrationMarketCap),
        new Decimal(percentageSupplyOnMigration)
    )
    const migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            migrationQuoteAmount,
            new Decimal(migrationFee.feePercentage)
        ).toNumber()

    return buildCurve({
        ...buildCurveWithMarketCapParam,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
    })
}

/**
 * Build a custom constant product curve by market cap
 * @param buildCurveWithTwoSegmentsParam - The parameters for the custom constant product curve by market cap
 * @returns The build custom constant product curve by market cap
 */
export function buildCurveWithTwoSegments(
    buildCurveWithTwoSegmentsParam: BuildCurveWithTwoSegmentsParams
): ConfigParameters {
    const {
        totalTokenSupply,
        initialMarketCap,
        migrationMarketCap,
        percentageSupplyOnMigration,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        creatorTradingFeePercentage,
        collectFeeMode,
        leftover,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        activationType,
        dynamicFeeEnabled,
        migrationFeeOption,
        migrationFee,
        tokenUpdateAuthority,
        baseFeeParams,
        migratedPoolFee,
    } = buildCurveWithTwoSegmentsParam

    const baseFee = getBaseFeeParams(
        baseFeeParams,
        tokenQuoteDecimal,
        activationType
    )

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveWithTwoSegmentsParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const migratedPoolFeeParams = getMigratedPoolFeeParams(
        migrationOption,
        migrationFeeOption,
        migratedPoolFee
    )

    let migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    let totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    let migrationQuoteAmount = getMigrationQuoteAmount(
        new Decimal(migrationMarketCap),
        new Decimal(percentageSupplyOnMigration)
    )
    let migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            migrationQuoteAmount,
            new Decimal(migrationFee.feePercentage)
        )

    let migrationPrice = migrationQuoteAmount.div(
        new Decimal(migrationBaseSupply.toString())
    )

    let migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    let migrationQuoteAmountInLamport = fromDecimalToBN(
        migrationQuoteAmount.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    let migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    let migrationBaseAmount = getMigrationBaseToken(
        migrationQuoteAmountInLamport,
        migrateSqrtPrice,
        migrationOption
    )

    let totalVestingAmount = getTotalVestingAmount(lockedVesting)

    let totalLeftover = convertToLamports(leftover, tokenBaseDecimal)

    let swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    let initialSqrtPrice = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    // instantiate midSqrtPriceDecimal1
    let midSqrtPriceDecimal1 = new Decimal(migrateSqrtPrice.toString())
        .mul(new Decimal(initialSqrtPrice.toString()))
        .sqrt()
    let midSqrtPrice1 = new BN(midSqrtPriceDecimal1.floor().toFixed())

    // mid_price2 = (p1 * p2^3)^(1/4)
    let numerator1 = new Decimal(initialSqrtPrice.toString())
    let numerator2 = Decimal.pow(migrateSqrtPrice.toString(), 3)
    let product1 = numerator1.mul(numerator2)
    let midSqrtPriceDecimal2 = Decimal.pow(product1, 0.25)
    let midSqrtPrice2 = new BN(midSqrtPriceDecimal2.floor().toFixed())

    // mid_price3 = (p1^3 * p2)^(1/4)
    let numerator3 = Decimal.pow(initialSqrtPrice.toString(), 3)
    let numerator4 = new Decimal(migrateSqrtPrice.toString())
    let product2 = numerator3.mul(numerator4)
    let midSqrtPriceDecimal3 = Decimal.pow(product2, 0.25)
    let midSqrtPrice3 = new BN(midSqrtPriceDecimal3.floor().toFixed())

    let midPrices = [midSqrtPrice1, midSqrtPrice2, midSqrtPrice3]
    let sqrtStartPrice = new BN(0)
    let curve: { sqrtPrice: BN; liquidity: BN }[] = []

    for (let i = 0; i < midPrices.length; i++) {
        const result = getTwoCurve(
            migrateSqrtPrice,
            midPrices[i],
            initialSqrtPrice,
            swapAmount,
            migrationQuoteThresholdInLamport
        )
        if (result.isOk) {
            curve = result.curve
            sqrtStartPrice = result.sqrtStartPrice
            break
        }
    }

    let totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdInLamport,
        sqrtStartPrice,
        curve,
        lockedVesting,
        migrationOption,
        totalLeftover,
        migrationFee.feePercentage
    )

    if (totalDynamicSupply.gt(totalSupply)) {
        // precision loss is used for leftover
        let leftOverDelta = totalDynamicSupply.sub(totalSupply)
        if (!leftOverDelta.lt(totalLeftover)) {
            throw new Error('leftOverDelta must be less than totalLeftover')
        }
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                ...baseFee,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(
                      baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter
                          ? baseFeeParams.rateLimiterParam.baseFeeBps
                          : baseFeeParams.feeSchedulerParam.endingFeeBps
                  )
                : null,
        },
        activationType,
        collectFeeMode,
        migrationOption,
        tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold: migrationQuoteThresholdInLamport,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        sqrtStartPrice,
        lockedVesting,
        migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        creatorTradingFeePercentage,
        migratedPoolFee: {
            collectFeeMode: migratedPoolFeeParams.collectFeeMode,
            dynamicFee: migratedPoolFeeParams.dynamicFee,
            poolFeeBps: migratedPoolFeeParams.poolFeeBps,
        },
        padding: [],
        curve,
        tokenUpdateAuthority,
        migrationFee,
    }
    return instructionParams
}

/**
 * Build a custom curve graph with liquidity weights, changing the curve shape based on the liquidity weights
 * @param buildCurveWithLiquidityWeightsParam - The parameters for the custom constant product curve with liquidity weights
 * @returns The build custom constant product curve with liquidity weights
 */
export function buildCurveWithLiquidityWeights(
    buildCurveWithLiquidityWeightsParam: BuildCurveWithLiquidityWeightsParams
): ConfigParameters {
    let {
        totalTokenSupply,
        migrationOption,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        migrationFeeOption,
        tokenType,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        creatorTradingFeePercentage,
        leftover,
        initialMarketCap,
        migrationMarketCap,
        liquidityWeights,
        migrationFee,
        tokenUpdateAuthority,
        baseFeeParams,
        migratedPoolFee,
    } = buildCurveWithLiquidityWeightsParam

    const baseFee = getBaseFeeParams(
        baseFeeParams,
        tokenQuoteDecimal,
        activationType
    )

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = buildCurveWithLiquidityWeightsParam.lockedVestingParam

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const migratedPoolFeeParams = getMigratedPoolFeeParams(
        migrationOption,
        migrationFeeOption,
        migratedPoolFee
    )

    // 1. finding Pmax and Pmin
    let pMin = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    let pMax = getSqrtPriceFromMarketCap(
        migrationMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    // find q^16 = pMax / pMin
    let priceRatio = new Decimal(pMax.toString()).div(
        new Decimal(pMin.toString())
    )
    let qDecimal = priceRatio.pow(new Decimal(1).div(new Decimal(16)))

    // finding all prices
    let sqrtPrices = []
    let currentPrice = pMin
    for (let i = 0; i < 17; i++) {
        sqrtPrices.push(currentPrice)
        currentPrice = convertDecimalToBN(
            qDecimal.mul(new Decimal(currentPrice.toString()))
        )
    }

    let totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    let totalLeftover = convertToLamports(leftover, tokenBaseDecimal)
    let totalVestingAmount = getTotalVestingAmount(lockedVesting)

    let totalSwapAndMigrationAmount = totalSupply
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    // Swap_Amount = sum(li * (1/p(i-1) - 1/pi))
    // Quote_Amount = sum(li * (pi-p(i-1)))
    // Quote_Amount * (1-migrationFee/100) / Base_Amount = Pmax ^ 2

    // -> Base_Amount = Quote_Amount * (1-migrationFee) / Pmax ^ 2
    // -> Swap_Amount + Base_Amount = sum(li * (1/p(i-1) - 1/pi)) + sum(li * (pi-p(i-1))) * (1-migrationFee/100) / Pmax ^ 2
    // l0 * sum_factor = Swap_Amount + Base_Amount
    // => l0 * sum_factor = sum(li * (1/p(i-1) - 1/pi)) + sum(li * (pi-p(i-1))) * (1-migrationFee/100) / Pmax ^ 2
    // => l0 = (Swap_Amount + Base_Amount ) / sum_factor
    let sumFactor = new Decimal(0)
    let pmaxWeight = new Decimal(pMax.toString())
    let migrationFeeFactor = new Decimal(100)
        .sub(new Decimal(migrationFee.feePercentage))
        .div(new Decimal(100))
    for (let i = 1; i < 17; i++) {
        let pi = new Decimal(sqrtPrices[i].toString())
        let piMinus = new Decimal(sqrtPrices[i - 1].toString())
        let k = new Decimal(liquidityWeights[i - 1])
        let w1 = pi.sub(piMinus).div(pi.mul(piMinus))
        let w2 = pi
            .sub(piMinus)
            .mul(migrationFeeFactor)
            .div(pmaxWeight.mul(pmaxWeight))
        let weight = k.mul(w1.add(w2))
        sumFactor = sumFactor.add(weight)
    }
    let l1 = new Decimal(totalSwapAndMigrationAmount.toString()).div(sumFactor)

    // construct curve
    let curve = []
    for (let i = 0; i < 16; i++) {
        let k = new Decimal(liquidityWeights[i])
        let liquidity = convertDecimalToBN(l1.mul(k))
        let sqrtPrice = i < 15 ? sqrtPrices[i + 1] : pMax
        curve.push({
            sqrtPrice,
            liquidity,
        })
    }
    // reverse to calculate swap amount and migration amount
    let swapBaseAmount = getBaseTokenForSwap(pMin, pMax, curve)
    let swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        pMin,
        curve
    )

    let migrationAmount = totalSwapAndMigrationAmount.sub(swapBaseAmountBuffer)

    let migrationQuoteAmount = migrationAmount.mul(pMax).mul(pMax).shrn(128)
    let migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            new Decimal(migrationQuoteAmount.toString()),
            new Decimal(migrationFee.feePercentage)
        )
    let migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold
    )

    // sanity check
    let totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdInLamport,
        pMin,
        curve,
        lockedVesting,
        migrationOption,
        totalLeftover,
        migrationFee.feePercentage
    )

    if (totalDynamicSupply.gt(totalSupply)) {
        // precision loss is used for leftover
        let leftOverDelta = totalDynamicSupply.sub(totalSupply)
        if (!leftOverDelta.lt(totalLeftover)) {
            throw new Error('leftOverDelta must be less than totalLeftover')
        }
    }

    const instructionParams: ConfigParameters = {
        poolFees: {
            baseFee: {
                ...baseFee,
            },
            dynamicFee: dynamicFeeEnabled
                ? getDynamicFeeParams(
                      baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter
                          ? baseFeeParams.rateLimiterParam.baseFeeBps
                          : baseFeeParams.feeSchedulerParam.endingFeeBps
                  )
                : null,
        },
        activationType: activationType,
        collectFeeMode: collectFeeMode,
        migrationOption: migrationOption,
        tokenType: tokenType,
        tokenDecimal: tokenBaseDecimal,
        migrationQuoteThreshold: migrationQuoteThresholdInLamport,
        partnerLpPercentage: partnerLpPercentage,
        creatorLpPercentage: creatorLpPercentage,
        partnerLockedLpPercentage: partnerLockedLpPercentage,
        creatorLockedLpPercentage: creatorLockedLpPercentage,
        sqrtStartPrice: pMin,
        lockedVesting,
        migrationFeeOption: migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: totalSupply,
            postMigrationTokenSupply: totalSupply,
        },
        creatorTradingFeePercentage,
        migratedPoolFee: {
            collectFeeMode: migratedPoolFeeParams.collectFeeMode,
            dynamicFee: migratedPoolFeeParams.dynamicFee,
            poolFeeBps: migratedPoolFeeParams.poolFeeBps,
        },
        padding: [],
        curve,
        migrationFee,
        tokenUpdateAuthority,
    }
    return instructionParams
}
