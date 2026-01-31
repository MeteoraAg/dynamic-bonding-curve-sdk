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
    TokenDecimal,
} from '../types'
import {
    DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS,
    DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
    MAX_SQRT_PRICE,
} from '../constants'
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
    calculateAdjustedPercentageSupplyOnMigration,
    getLiquidityVestingInfoParams,
    getMigratedPoolMarketCapFeeSchedulerParams,
    getStartingBaseFeeBpsFromBaseFeeParams,
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
    const {
        totalTokenSupply,
        tokenType,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        tokenUpdateAuthority,
        lockedVestingParams,
        leftover,
        baseFeeParams,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        creatorTradingFeePercentage,
        poolCreationFee,
        migrationOption,
        migrationFeeOption,
        migrationFee,
        partnerPermanentLockedLiquidityPercentage,
        partnerLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        partnerLiquidityVestingInfoParams,
        creatorLiquidityVestingInfoParams,
        migratedPoolFee,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams,
        enableFirstSwapWithMinFee,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
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
    } = lockedVestingParams

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const partnerVestingParams =
        partnerLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: partnerVestingPercentage,
        bpsPerPeriod: partnerBpsPerPeriod,
        numberOfPeriods: partnerNumberOfPeriods,
        cliffDurationFromMigrationTime: partnerCliffDurationFromMigrationTime,
        totalDuration: partnerTotalDuration,
    } = partnerVestingParams

    const partnerLiquidityVestingInfo = getLiquidityVestingInfoParams(
        partnerVestingPercentage,
        partnerBpsPerPeriod,
        partnerNumberOfPeriods,
        partnerCliffDurationFromMigrationTime,
        partnerTotalDuration
    )

    const creatorVestingParams =
        creatorLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: creatorVestingPercentage,
        bpsPerPeriod: creatorBpsPerPeriod,
        numberOfPeriods: creatorNumberOfPeriods,
        cliffDurationFromMigrationTime: creatorCliffDurationFromMigrationTime,
        totalDuration: creatorTotalDuration,
    } = creatorVestingParams

    const creatorLiquidityVestingInfo = getLiquidityVestingInfoParams(
        creatorVestingPercentage,
        creatorBpsPerPeriod,
        creatorNumberOfPeriods,
        creatorCliffDurationFromMigrationTime,
        creatorTotalDuration
    )

    const poolCreationFeeInLamports = convertToLamports(
        poolCreationFee,
        TokenDecimal.NINE
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

    const migrationQuoteThresholdInLamport = convertToLamports(
        migrationQuoteThreshold,
        tokenQuoteDecimal
    )

    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)

    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const migrationQuoteAmountInLamport = fromDecimalToBN(
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
        collectFeeMode,
        migrationOption,
        activationType,
        tokenType,
        tokenDecimal: tokenBaseDecimal,
        partnerLiquidityPercentage,
        partnerPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        migrationQuoteThreshold: migrationQuoteThresholdInLamport,
        sqrtStartPrice,
        lockedVesting,
        migrationFeeOption,
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
        poolCreationFee: poolCreationFeeInLamports,
        partnerLiquidityVestingInfo,
        creatorLiquidityVestingInfo,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams:
            migratedPoolMarketCapFeeSchedulerParams
                ? getMigratedPoolMarketCapFeeSchedulerParams(
                      getStartingBaseFeeBpsFromBaseFeeParams(baseFeeParams),
                      migratedPoolMarketCapFeeSchedulerParams.endingBaseFeeBps,
                      migratedPoolBaseFeeMode,
                      migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod,
                      migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps,
                      migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration
                  )
                : DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
        enableFirstSwapWithMinFee,
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
        totalTokenSupply,
        tokenBaseDecimal,
        lockedVestingParams,
        leftover,
        migrationFee,
        initialMarketCap,
        migrationMarketCap,
    } = buildCurveWithMarketCapParam

    const {
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
    } = lockedVestingParams

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

    const percentageSupplyOnMigration =
        migrationFee.feePercentage > 0
            ? calculateAdjustedPercentageSupplyOnMigration(
                  initialMarketCap,
                  migrationMarketCap,
                  migrationFee,
                  lockedVesting,
                  totalLeftover,
                  totalSupply
              )
            : getPercentageSupplyOnMigration(
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
        tokenType,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        tokenUpdateAuthority,
        leftover,
        lockedVestingParams,
        baseFeeParams,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        creatorTradingFeePercentage,
        poolCreationFee,
        migrationOption,
        migrationFeeOption,
        migrationFee,
        partnerPermanentLockedLiquidityPercentage,
        partnerLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        partnerLiquidityVestingInfoParams,
        creatorLiquidityVestingInfoParams,
        migratedPoolFee,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams,
        enableFirstSwapWithMinFee,
        initialMarketCap,
        migrationMarketCap,
        percentageSupplyOnMigration,
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
    } = lockedVestingParams

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const partnerVestingParams =
        partnerLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: partnerVestingPercentage,
        bpsPerPeriod: partnerBpsPerPeriod,
        numberOfPeriods: partnerNumberOfPeriods,
        cliffDurationFromMigrationTime: partnerCliffDurationFromMigrationTime,
        totalDuration: partnerTotalDuration,
    } = partnerVestingParams

    const partnerLiquidityVestingInfo = getLiquidityVestingInfoParams(
        partnerVestingPercentage,
        partnerBpsPerPeriod,
        partnerNumberOfPeriods,
        partnerCliffDurationFromMigrationTime,
        partnerTotalDuration
    )

    const creatorVestingParams =
        creatorLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: creatorVestingPercentage,
        bpsPerPeriod: creatorBpsPerPeriod,
        numberOfPeriods: creatorNumberOfPeriods,
        cliffDurationFromMigrationTime: creatorCliffDurationFromMigrationTime,
        totalDuration: creatorTotalDuration,
    } = creatorVestingParams

    const creatorLiquidityVestingInfo = getLiquidityVestingInfoParams(
        creatorVestingPercentage,
        creatorBpsPerPeriod,
        creatorNumberOfPeriods,
        creatorCliffDurationFromMigrationTime,
        creatorTotalDuration
    )

    const poolCreationFeeInLamports = convertToLamports(
        poolCreationFee,
        TokenDecimal.NINE
    )

    const migratedPoolFeeParams = getMigratedPoolFeeParams(
        migrationOption,
        migrationFeeOption,
        migratedPoolFee
    )

    const migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    const totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    const migrationQuoteAmount = getMigrationQuoteAmount(
        new Decimal(migrationMarketCap),
        new Decimal(percentageSupplyOnMigration)
    )
    const migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            migrationQuoteAmount,
            new Decimal(migrationFee.feePercentage)
        )

    const migrationPrice = migrationQuoteAmount.div(
        new Decimal(migrationBaseSupply.toString())
    )

    const migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    const migrationQuoteAmountInLamport = fromDecimalToBN(
        migrationQuoteAmount.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const migrationBaseAmount = getMigrationBaseToken(
        migrationQuoteAmountInLamport,
        migrateSqrtPrice,
        migrationOption
    )

    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)

    const swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    const initialSqrtPrice = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    // mid_price1 = sqrt(p1 * p2)
    const midSqrtPriceDecimal1 = new Decimal(migrateSqrtPrice.toString())
        .mul(new Decimal(initialSqrtPrice.toString()))
        .sqrt()
    const midSqrtPrice1 = new BN(midSqrtPriceDecimal1.floor().toFixed())

    // mid_price2 = (p1 * p2^3)^(1/4)
    const numerator1 = new Decimal(initialSqrtPrice.toString())
    const numerator2 = Decimal.pow(migrateSqrtPrice.toString(), 3)
    const product1 = numerator1.mul(numerator2)
    const midSqrtPriceDecimal2 = Decimal.pow(product1, 0.25)
    const midSqrtPrice2 = new BN(midSqrtPriceDecimal2.floor().toFixed())

    // mid_price3 = (p1^3 * p2)^(1/4)
    const numerator3 = Decimal.pow(initialSqrtPrice.toString(), 3)
    const numerator4 = new Decimal(migrateSqrtPrice.toString())
    const product2 = numerator3.mul(numerator4)
    const midSqrtPriceDecimal3 = Decimal.pow(product2, 0.25)
    const midSqrtPrice3 = new BN(midSqrtPriceDecimal3.floor().toFixed())

    const midPrices = [midSqrtPrice3, midSqrtPrice2, midSqrtPrice1]
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

    const totalDynamicSupply = getTotalSupplyFromCurve(
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
        const leftOverDelta = totalDynamicSupply.sub(totalSupply)
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
        partnerLiquidityPercentage,
        partnerPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
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
        poolCreationFee: poolCreationFeeInLamports,
        partnerLiquidityVestingInfo,
        creatorLiquidityVestingInfo,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams:
            migratedPoolMarketCapFeeSchedulerParams
                ? getMigratedPoolMarketCapFeeSchedulerParams(
                      getStartingBaseFeeBpsFromBaseFeeParams(baseFeeParams),
                      migratedPoolMarketCapFeeSchedulerParams.endingBaseFeeBps,
                      migratedPoolBaseFeeMode,
                      migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod,
                      migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps,
                      migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration
                  )
                : DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
        enableFirstSwapWithMinFee,
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
        tokenType,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        tokenUpdateAuthority,
        lockedVestingParams,
        leftover,
        baseFeeParams,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        creatorTradingFeePercentage,
        poolCreationFee,
        migrationOption,
        migrationFeeOption,
        migrationFee,
        partnerPermanentLockedLiquidityPercentage,
        partnerLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        partnerLiquidityVestingInfoParams,
        creatorLiquidityVestingInfoParams,
        migratedPoolFee,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams,
        enableFirstSwapWithMinFee,
        initialMarketCap,
        migrationMarketCap,
        midPrice,
        percentageSupplyOnMigration,
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
    } = lockedVestingParams

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const partnerVestingParams =
        partnerLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: partnerVestingPercentage,
        bpsPerPeriod: partnerBpsPerPeriod,
        numberOfPeriods: partnerNumberOfPeriods,
        cliffDurationFromMigrationTime: partnerCliffDurationFromMigrationTime,
        totalDuration: partnerTotalDuration,
    } = partnerVestingParams

    const partnerLiquidityVestingInfo = getLiquidityVestingInfoParams(
        partnerVestingPercentage,
        partnerBpsPerPeriod,
        partnerNumberOfPeriods,
        partnerCliffDurationFromMigrationTime,
        partnerTotalDuration
    )

    const creatorVestingParams =
        creatorLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: creatorVestingPercentage,
        bpsPerPeriod: creatorBpsPerPeriod,
        numberOfPeriods: creatorNumberOfPeriods,
        cliffDurationFromMigrationTime: creatorCliffDurationFromMigrationTime,
        totalDuration: creatorTotalDuration,
    } = creatorVestingParams

    const creatorLiquidityVestingInfo = getLiquidityVestingInfoParams(
        creatorVestingPercentage,
        creatorBpsPerPeriod,
        creatorNumberOfPeriods,
        creatorCliffDurationFromMigrationTime,
        creatorTotalDuration
    )

    const poolCreationFeeInLamports = convertToLamports(
        poolCreationFee,
        TokenDecimal.NINE
    )

    const migratedPoolFeeParams = getMigratedPoolFeeParams(
        migrationOption,
        migrationFeeOption,
        migratedPoolFee
    )

    const migrationBaseSupply = new BN(totalTokenSupply)
        .mul(new BN(percentageSupplyOnMigration))
        .div(new BN(100))

    const totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    const migrationQuoteAmount = getMigrationQuoteAmount(
        new Decimal(migrationMarketCap),
        new Decimal(percentageSupplyOnMigration)
    )
    const migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            migrationQuoteAmount,
            new Decimal(migrationFee.feePercentage)
        )

    const migrationPrice = migrationQuoteAmount.div(
        new Decimal(migrationBaseSupply.toString())
    )

    const migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    const migrationQuoteAmountInLamport = fromDecimalToBN(
        migrationQuoteAmount.mul(new Decimal(10 ** tokenQuoteDecimal))
    )

    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    const migrationBaseAmount = getMigrationBaseToken(
        migrationQuoteAmountInLamport,
        migrateSqrtPrice,
        migrationOption
    )

    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)

    const swapAmount = totalSupply
        .sub(migrationBaseAmount)
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    const initialSqrtPrice = getSqrtPriceFromMarketCap(
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

    const totalDynamicSupply = getTotalSupplyFromCurve(
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
        const leftOverDelta = totalDynamicSupply.sub(totalSupply)
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
        partnerLiquidityPercentage,
        partnerPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
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
        poolCreationFee: poolCreationFeeInLamports,
        partnerLiquidityVestingInfo,
        creatorLiquidityVestingInfo,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams:
            migratedPoolMarketCapFeeSchedulerParams
                ? getMigratedPoolMarketCapFeeSchedulerParams(
                      getStartingBaseFeeBpsFromBaseFeeParams(baseFeeParams),
                      migratedPoolMarketCapFeeSchedulerParams.endingBaseFeeBps,
                      migratedPoolBaseFeeMode,
                      migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod,
                      migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps,
                      migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration
                  )
                : DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
        enableFirstSwapWithMinFee,
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
    const {
        totalTokenSupply,
        tokenType,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        tokenUpdateAuthority,
        lockedVestingParams,
        leftover,
        baseFeeParams,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        creatorTradingFeePercentage,
        poolCreationFee,
        migrationOption,
        migrationFeeOption,
        migrationFee,
        partnerPermanentLockedLiquidityPercentage,
        partnerLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        partnerLiquidityVestingInfoParams,
        creatorLiquidityVestingInfoParams,
        migratedPoolFee,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams,
        enableFirstSwapWithMinFee,
        initialMarketCap,
        migrationMarketCap,
        liquidityWeights,
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
    } = lockedVestingParams

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const partnerVestingParams =
        partnerLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: partnerVestingPercentage,
        bpsPerPeriod: partnerBpsPerPeriod,
        numberOfPeriods: partnerNumberOfPeriods,
        cliffDurationFromMigrationTime: partnerCliffDurationFromMigrationTime,
        totalDuration: partnerTotalDuration,
    } = partnerVestingParams

    const partnerLiquidityVestingInfo = getLiquidityVestingInfoParams(
        partnerVestingPercentage,
        partnerBpsPerPeriod,
        partnerNumberOfPeriods,
        partnerCliffDurationFromMigrationTime,
        partnerTotalDuration
    )

    const creatorVestingParams =
        creatorLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: creatorVestingPercentage,
        bpsPerPeriod: creatorBpsPerPeriod,
        numberOfPeriods: creatorNumberOfPeriods,
        cliffDurationFromMigrationTime: creatorCliffDurationFromMigrationTime,
        totalDuration: creatorTotalDuration,
    } = creatorVestingParams

    const creatorLiquidityVestingInfo = getLiquidityVestingInfoParams(
        creatorVestingPercentage,
        creatorBpsPerPeriod,
        creatorNumberOfPeriods,
        creatorCliffDurationFromMigrationTime,
        creatorTotalDuration
    )

    const poolCreationFeeInLamports = convertToLamports(
        poolCreationFee,
        TokenDecimal.NINE
    )

    const migratedPoolFeeParams = getMigratedPoolFeeParams(
        migrationOption,
        migrationFeeOption,
        migratedPoolFee
    )

    // 1. finding Pmax and Pmin
    const pMin = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    const pMax = getSqrtPriceFromMarketCap(
        migrationMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    // find q^16 = pMax / pMin
    const priceRatio = new Decimal(pMax.toString()).div(
        new Decimal(pMin.toString())
    )
    const qDecimal = priceRatio.pow(new Decimal(1).div(new Decimal(16)))

    // finding all prices
    const sqrtPrices = []
    let currentPrice = pMin
    for (let i = 0; i < 17; i++) {
        sqrtPrices.push(currentPrice)
        currentPrice = convertDecimalToBN(
            qDecimal.mul(new Decimal(currentPrice.toString()))
        )
    }

    const totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const totalSwapAndMigrationAmount = totalSupply
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
    const pmaxWeight = new Decimal(pMax.toString())
    const migrationFeeFactor = new Decimal(100)
        .sub(new Decimal(migrationFee.feePercentage))
        .div(new Decimal(100))

    for (let i = 1; i < 17; i++) {
        const pi = new Decimal(sqrtPrices[i].toString())
        const piMinus = new Decimal(sqrtPrices[i - 1].toString())
        const k = new Decimal(liquidityWeights[i - 1])
        const w1 = pi.sub(piMinus).div(pi.mul(piMinus)) // 1/piMinus - 1/pi
        const w2 = pi
            .sub(piMinus) // pi - piMinus
            .mul(migrationFeeFactor) // (1-migrationFee/100)
            .div(pmaxWeight.mul(pmaxWeight)) // pmax^2
        const weight = k.mul(w1.add(w2)) // k x (w1 + w2)
        sumFactor = sumFactor.add(weight)
    }
    const l1 = new Decimal(totalSwapAndMigrationAmount.toString()).div(
        sumFactor
    )

    // construct curve
    const curve = []
    for (let i = 0; i < 16; i++) {
        const k = new Decimal(liquidityWeights[i])
        const liquidity = convertDecimalToBN(l1.mul(k))
        const sqrtPrice = i < 15 ? sqrtPrices[i + 1] : pMax
        curve.push({
            sqrtPrice,
            liquidity,
        })
    }
    // reverse to calculate swap amount and migration amount
    const swapBaseAmount = getBaseTokenForSwap(pMin, pMax, curve)
    const swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        pMin,
        curve
    )

    const migrationAmount =
        totalSwapAndMigrationAmount.sub(swapBaseAmountBuffer)

    const migrationQuoteAmount = migrationAmount.mul(pMax).mul(pMax).shrn(128)
    const migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            new Decimal(migrationQuoteAmount.toString()),
            new Decimal(migrationFee.feePercentage)
        )
    const migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold
    )

    // sanity check
    const totalDynamicSupply = getTotalSupplyFromCurve(
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
        const leftOverDelta = totalDynamicSupply.sub(totalSupply)
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
        partnerLiquidityPercentage,
        partnerPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        sqrtStartPrice: pMin,
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
        poolCreationFee: poolCreationFeeInLamports,
        partnerLiquidityVestingInfo,
        creatorLiquidityVestingInfo,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams:
            migratedPoolMarketCapFeeSchedulerParams
                ? getMigratedPoolMarketCapFeeSchedulerParams(
                      getStartingBaseFeeBpsFromBaseFeeParams(baseFeeParams),
                      migratedPoolMarketCapFeeSchedulerParams.endingBaseFeeBps,
                      migratedPoolBaseFeeMode,
                      migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod,
                      migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps,
                      migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration
                  )
                : DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
        enableFirstSwapWithMinFee,
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
    const {
        totalTokenSupply,
        tokenType,
        tokenBaseDecimal,
        tokenQuoteDecimal,
        tokenUpdateAuthority,
        lockedVestingParams,
        leftover,
        baseFeeParams,
        dynamicFeeEnabled,
        activationType,
        collectFeeMode,
        creatorTradingFeePercentage,
        poolCreationFee,
        migrationOption,
        migrationFeeOption,
        migrationFee,
        partnerPermanentLockedLiquidityPercentage,
        partnerLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        partnerLiquidityVestingInfoParams,
        creatorLiquidityVestingInfoParams,
        migratedPoolFee,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams,
        enableFirstSwapWithMinFee,
        sqrtPrices,
    } = buildCurveWithCustomSqrtPricesParam

    let { liquidityWeights } = buildCurveWithCustomSqrtPricesParam

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
    } = lockedVestingParams

    const lockedVesting = getLockedVestingParams(
        totalLockedVestingAmount,
        numberOfVestingPeriod,
        cliffUnlockAmount,
        totalVestingDuration,
        cliffDurationFromMigrationTime,
        tokenBaseDecimal
    )

    const partnerVestingParams =
        partnerLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: partnerVestingPercentage,
        bpsPerPeriod: partnerBpsPerPeriod,
        numberOfPeriods: partnerNumberOfPeriods,
        cliffDurationFromMigrationTime: partnerCliffDurationFromMigrationTime,
        totalDuration: partnerTotalDuration,
    } = partnerVestingParams

    const partnerLiquidityVestingInfo = getLiquidityVestingInfoParams(
        partnerVestingPercentage,
        partnerBpsPerPeriod,
        partnerNumberOfPeriods,
        partnerCliffDurationFromMigrationTime,
        partnerTotalDuration
    )

    const creatorVestingParams =
        creatorLiquidityVestingInfoParams ??
        DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    const {
        vestingPercentage: creatorVestingPercentage,
        bpsPerPeriod: creatorBpsPerPeriod,
        numberOfPeriods: creatorNumberOfPeriods,
        cliffDurationFromMigrationTime: creatorCliffDurationFromMigrationTime,
        totalDuration: creatorTotalDuration,
    } = creatorVestingParams

    const creatorLiquidityVestingInfo = getLiquidityVestingInfoParams(
        creatorVestingPercentage,
        creatorBpsPerPeriod,
        creatorNumberOfPeriods,
        creatorCliffDurationFromMigrationTime,
        creatorTotalDuration
    )

    const poolCreationFeeInLamports = convertToLamports(
        poolCreationFee,
        TokenDecimal.NINE
    )

    const migratedPoolFeeParams = getMigratedPoolFeeParams(
        migrationOption,
        migrationFeeOption,
        migratedPoolFee
    )

    // pMin and pMax from the provided sqrtPrices array
    const pMin = sqrtPrices[0]
    const pMax = sqrtPrices[sqrtPrices.length - 1]

    const totalSupply = convertToLamports(totalTokenSupply, tokenBaseDecimal)
    const totalLeftover = convertToLamports(leftover, tokenBaseDecimal)
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)

    const totalSwapAndMigrationAmount = totalSupply
        .sub(totalVestingAmount)
        .sub(totalLeftover)

    // calculate the sum factor for liquidity distribution
    // l0 * sum_factor = sum(li * (1/p(i-1) - 1/pi)) + sum(li * (pi-p(i-1))) * (1-migrationFee/100) / Pmax ^ 2
    let sumFactor = new Decimal(0)
    const pmaxWeight = new Decimal(pMax.toString())
    const migrationFeeFactor = new Decimal(100)
        .sub(new Decimal(migrationFee.feePercentage))
        .div(new Decimal(100))

    const numSegments = sqrtPrices.length - 1

    for (let i = 0; i < numSegments; i++) {
        const pi = new Decimal(sqrtPrices[i + 1].toString())
        const piMinus = new Decimal(sqrtPrices[i].toString())
        const k = new Decimal(liquidityWeights[i])

        // w1 = (pi - piMinus) / (pi * piMinus) represents the base token contribution
        const w1 = pi.sub(piMinus).div(pi.mul(piMinus))

        // w2 = (pi - piMinus) * (1 - migrationFee) / pMax^2 represents the quote token contribution
        const w2 = pi
            .sub(piMinus)
            .mul(migrationFeeFactor)
            .div(pmaxWeight.mul(pmaxWeight))

        const weight = k.mul(w1.add(w2))
        sumFactor = sumFactor.add(weight)
    }

    // calculate base liquidity l1
    const l1 = new Decimal(totalSwapAndMigrationAmount.toString()).div(
        sumFactor
    )

    // construct curve
    const curve = []
    for (let i = 0; i < numSegments; i++) {
        const k = new Decimal(liquidityWeights[i])
        const liquidity = convertDecimalToBN(l1.mul(k))
        const sqrtPrice = sqrtPrices[i + 1]
        curve.push({
            sqrtPrice,
            liquidity,
        })
    }

    // calculate migration amounts
    const swapBaseAmount = getBaseTokenForSwap(pMin, pMax, curve)
    const swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        pMin,
        curve
    )

    const migrationAmount =
        totalSwapAndMigrationAmount.sub(swapBaseAmountBuffer)

    const migrationQuoteAmount = migrationAmount.mul(pMax).mul(pMax).shrn(128)
    const migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            new Decimal(migrationQuoteAmount.toString()),
            new Decimal(migrationFee.feePercentage)
        )
    const migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold
    )

    // sanity check
    const totalDynamicSupply = getTotalSupplyFromCurve(
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
        const leftOverDelta = totalDynamicSupply.sub(totalSupply)
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
        partnerLiquidityPercentage,
        partnerPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
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
        poolCreationFee: poolCreationFeeInLamports,
        partnerLiquidityVestingInfo,
        creatorLiquidityVestingInfo,
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams:
            migratedPoolMarketCapFeeSchedulerParams
                ? getMigratedPoolMarketCapFeeSchedulerParams(
                      getStartingBaseFeeBpsFromBaseFeeParams(baseFeeParams),
                      migratedPoolMarketCapFeeSchedulerParams.endingBaseFeeBps,
                      migratedPoolBaseFeeMode,
                      migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod,
                      migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps,
                      migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration
                  )
                : DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
        enableFirstSwapWithMinFee,
        padding: [],
        curve,
        migrationFee,
        tokenUpdateAuthority,
    }
    return instructionParams
}
