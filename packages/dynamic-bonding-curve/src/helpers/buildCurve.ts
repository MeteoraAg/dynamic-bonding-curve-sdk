import Decimal from 'decimal.js'
import BN from 'bn.js'
import {
    type ConfigParameters,
    type BuildCurveParams,
    BuildCurveWithMarketCapParams,
    BuildCurveWithLiquidityWeightsParams,
    BuildCurveWithTwoSegmentsParams,
    BaseFeeMode,
    BuildCurveWithMidPriceParams,
    BuildCurveWithCustomSqrtPricesParams,
    BuildCurveWithThreeSegmentsParams,
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
    getThreeCurve,
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

    // mid_price1 = sqrt(p1 * p2)
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

    let midPrices = [midSqrtPrice3, midSqrtPrice2, midSqrtPrice1]
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
 * Build a custom constant product curve with a mid price. This will create a two segment curve with a start price -> mid price, and a mid price -> migration price.
 * @param buildCurveWithMidPriceParam - The parameters for the custom constant product curve with a mid price
 * @returns The build custom constant product curve by mid price
 */
export function buildCurveWithMidPrice(
    buildCurveWithMidPriceParam: BuildCurveWithMidPriceParams
): ConfigParameters {
    const {
        totalTokenSupply,
        initialMarketCap,
        migrationMarketCap,
        midPrice,
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
    } = buildCurveWithMidPriceParam

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
    } = buildCurveWithMidPriceParam.lockedVestingParam

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

    const midSqrtPrice = getSqrtPriceFromPrice(
        midPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    let sqrtStartPrice = new BN(0)
    let curve: { sqrtPrice: BN; liquidity: BN }[] = []

    const result = getTwoCurve(
        migrateSqrtPrice,
        midSqrtPrice,
        initialSqrtPrice,
        swapAmount,
        migrationQuoteThresholdInLamport
    )
    curve = result.curve
    sqrtStartPrice = result.sqrtStartPrice

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
        let w1 = pi.sub(piMinus).div(pi.mul(piMinus)) // 1/piMinus - 1/pi
        let w2 = pi
            .sub(piMinus) // pi - piMinus
            .mul(migrationFeeFactor) // (1-migrationFee/100)
            .div(pmaxWeight.mul(pmaxWeight)) // pmax^2
        let weight = k.mul(w1.add(w2)) // k x (w1 + w2)
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

/**
 * Build a custom curve with custom sqrt prices instead of liquidity weights.
 * This allows you to specify exactly what price points you want in your curve.
 *
 * @param buildCurveWithCustomSqrtPricesParam - The parameters for the custom curve with sqrt prices
 * @returns The build custom constant product curve with custom sqrt prices
 *
 * @remarks
 * The sqrtPrices array must:
 * - Be in ascending order
 * - Have at least 2 elements (start and end price)
 * - The first price will be the starting price (pMin)
 * - The last price will be the migration price (pMax)
 *
 * The liquidityWeights array (if provided):
 * - Must have length = sqrtPrices.length - 1
 * - Each weight determines how much liquidity is allocated to that price segment
 * - If not provided, liquidity is distributed evenly across all segments
 *
 * Example:
 * sqrtPrices = [p0, p1, p2, p3] creates 3 segments:
 * - Segment 0: p0 to p1 with weight[0]
 * - Segment 1: p1 to p2 with weight[1]
 * - Segment 2: p2 to p3 with weight[2]
 */
export function buildCurveWithCustomSqrtPrices(
    buildCurveWithCustomSqrtPricesParam: BuildCurveWithCustomSqrtPricesParams
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
        sqrtPrices,
        liquidityWeights,
        migrationFee,
        tokenUpdateAuthority,
        baseFeeParams,
        migratedPoolFee,
    } = buildCurveWithCustomSqrtPricesParam

    if (sqrtPrices.length < 2) {
        throw new Error('sqrtPrices array must have at least 2 elements')
    }

    // validate sqrtPrices are in ascending order
    for (let i = 1; i < sqrtPrices.length; i++) {
        if (sqrtPrices[i].lte(sqrtPrices[i - 1])) {
            throw new Error('sqrtPrices must be in ascending order')
        }
    }

    // if liquidity weights not provided, use equal distribution
    if (!liquidityWeights) {
        const numSegments = sqrtPrices.length - 1
        liquidityWeights = Array(numSegments).fill(1)
    } else if (liquidityWeights.length !== sqrtPrices.length - 1) {
        throw new Error(
            'liquidityWeights length must equal sqrtPrices.length - 1'
        )
    }

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
    } = buildCurveWithCustomSqrtPricesParam.lockedVestingParam

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

    // pMin and pMax from the provided sqrtPrices array
    let pMin = sqrtPrices[0]
    let pMax = sqrtPrices[sqrtPrices.length - 1]

    let totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    let totalLeftover = convertToLamports(leftover, tokenBaseDecimal)
    let totalVestingAmount = getTotalVestingAmount(lockedVesting)

    let totalSwapAndMigrationAmount = totalSupply
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    // calculate the sum factor for liquidity distribution
    // l0 * sum_factor = sum(li * (1/p(i-1) - 1/pi)) + sum(li * (pi-p(i-1))) * (1-migrationFee/100) / Pmax ^ 2
    let sumFactor = new Decimal(0)
    let pmaxWeight = new Decimal(pMax.toString())
    let migrationFeeFactor = new Decimal(100)
        .sub(new Decimal(migrationFee.feePercentage))
        .div(new Decimal(100))

    const numSegments = sqrtPrices.length - 1

    for (let i = 0; i < numSegments; i++) {
        let pi = new Decimal(sqrtPrices[i + 1].toString())
        let piMinus = new Decimal(sqrtPrices[i].toString())
        let k = new Decimal(liquidityWeights[i])

        // w1 = (pi - piMinus) / (pi * piMinus) represents the base token contribution
        let w1 = pi.sub(piMinus).div(pi.mul(piMinus))

        // w2 = (pi - piMinus) * (1 - migrationFee) / pMax^2 represents the quote token contribution
        let w2 = pi
            .sub(piMinus)
            .mul(migrationFeeFactor)
            .div(pmaxWeight.mul(pmaxWeight))

        let weight = k.mul(w1.add(w2))
        sumFactor = sumFactor.add(weight)
    }

    // calculate base liquidity l1
    let l1 = new Decimal(totalSwapAndMigrationAmount.toString()).div(sumFactor)

    // construct curve
    let curve = []
    for (let i = 0; i < numSegments; i++) {
        let k = new Decimal(liquidityWeights[i])
        let liquidity = convertDecimalToBN(l1.mul(k))
        let sqrtPrice = sqrtPrices[i + 1]
        curve.push({
            sqrtPrice,
            liquidity,
        })
    }

    // calculate migration amounts
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

/* Build a 3-phase bonding curve with custom price points and token allocation
 *
 * This creates a curve with 3 distinct phases, each with its own price range
 * and token allocation.
 *
 * @param buildCurveWithThreeSegmentsParam - The parameters for the 3-phase curve
 * @returns The ConfigParameters for DBC pool creation
 *
 * @example
 * ```typescript
 * const config = buildCurveWithThreeSegments({
 *   totalTokenSupply: 1_000_000_000,
 *   initialMarketCap: 1_000_000,      // $1M initial
 *   migrationMarketCap: 1_000_000_000, // $1B migration
 *   phase1EndPrice: 1.05,              // End of phase 1 at $1.05
 *   phase2EndPrice: 2.00,              // End of phase 2 at $2.00
 *   tokenAllocation: [50, 25, 25],     // 50% phase 1, 25% phase 2, 25% phase 3
 *   // ... other base params
 * })
 * ```
 */
export function buildCurveWithThreeSegments(
    buildCurveWithThreeSegmentsParam: BuildCurveWithThreeSegmentsParams
): ConfigParameters {
    const {
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        tokenType,
        tokenUpdateAuthority,
        initialMarketCap,
        migrationMarketCap,
        leftover,
        migrationOption,
        migrationFeeOption,
        migrationFee,
        migratedPoolFee,
        partnerLpPercentage,
        creatorLpPercentage,
        partnerLockedLpPercentage,
        creatorLockedLpPercentage,
        creatorTradingFeePercentage,
        activationType,
        collectFeeMode,
        dynamicFeeEnabled,
        baseFeeParams,
        phase1EndPrice,
        phase2EndPrice,
        tokenAllocation,
    } = buildCurveWithThreeSegmentsParam

    // validate token allocation
    const [phase1Percent, phase2Percent, phase3Percent] = tokenAllocation
    if (phase1Percent + phase2Percent + phase3Percent != 100) {
        throw new Error(
            `Token allocation must sum to 100, got ${phase1Percent + phase2Percent + phase3Percent}`
        )
    }

    // validate price progression
    const initialPrice = initialMarketCap / totalTokenSupply
    const migrationPrice = migrationMarketCap / totalTokenSupply
    if (phase1EndPrice <= initialPrice) {
        throw new Error(
            `phase1EndPrice (${phase1EndPrice}) must be greater than initial price (${initialPrice})`
        )
    }
    if (phase2EndPrice <= phase1EndPrice) {
        throw new Error(
            `phase2EndPrice (${phase2EndPrice}) must be greater than phase1EndPrice (${phase1EndPrice})`
        )
    }
    if (phase2EndPrice >= migrationPrice) {
        throw new Error(
            `phase2EndPrice (${phase2EndPrice}) must be less than migration price (${migrationPrice}). ` +
            `Increase migrationMarketCap or decrease phase2EndPrice.`
        )
    }

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
    } = buildCurveWithThreeSegmentsParam.lockedVestingParam

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

    // calculate total supply in lamports
    const totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    // calculate initial and migration sqrt prices from market cap
    const initialSqrtPrice = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const migrationSqrtPrice = getSqrtPriceFromMarketCap(
        migrationMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    // calculate phase boundary sqrt prices from explicit prices
    const phase1SqrtPrice = getSqrtPriceFromPrice(
        phase1EndPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const phase2SqrtPrice = getSqrtPriceFromPrice(
        phase2EndPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

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
        )

    const migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    const migrationQuoteAmountInLamport = fromDecimalToBN(
        migrationQuoteAmount.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    // calculate migration base amount
    const migrationBaseAmount = getMigrationBaseToken(
        migrationQuoteAmountInLamport,
        migrationSqrtPrice,
        migrationOption
    )

    // calculate swap amount (tokens available on curve)
    const swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    // use getThreeCurve to solve the 3 liquidities
    // Parameters: P0 (initial) < P1 (phase1End) < P2 (phase2End) < P3 (migration)
    const result = getThreeCurve(
        initialSqrtPrice,
        phase1SqrtPrice,
        phase2SqrtPrice,
        migrationSqrtPrice,
        swapAmount,
        tokenAllocation
    )

    if (!result.isOk) {
        throw new Error(
            `Failed to build 3-phase curve ${result.error || 'Invalid configuration'}`
        )
    }

    const { curve, sqrtStartPrice } = result

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
