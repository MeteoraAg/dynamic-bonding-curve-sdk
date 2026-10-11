import Decimal from 'decimal.js'
import BN from 'bn.js'
import {
    TokenDecimal,
    type BaseFee,
    type BuildCurveBaseParams,
    type BuildCurveParams,
    type BuildCurveWithCustomSqrtPricesParams,
    type BuildCurveWithLiquidityWeightsParams,
    type BuildCurveWithMarketCapParams,
    type BuildCurveWithMidPriceParams,
    type BuildCurveWithTwoSegmentsParams,
    type ConfigParameters,
    type LiquidityVestingInfoParameters,
    type LockedVestingParameters,
    type MigratedPoolFeeResult,
} from '../types'
import {
    DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS,
    MAX_CURVE_POINT,
    MAX_SQRT_PRICE,
} from '../constants'
import {
    calculateAdjustedPercentageSupplyOnMigration,
    getFirstCurve,
    getMigrationBaseToken,
    getMigrationBaseWeight,
    getMigrationQuoteAmount,
    getMigrationQuoteAmountFromMigrationBase,
    getMigrationQuoteAmountFromMigrationQuoteThreshold,
    getMigrationQuoteAmountFromThreshold,
    getMigrationQuoteThresholdFromMigrationQuoteAmount,
    getPercentageSupplyOnMigration,
    getSwapAmountWithBuffer,
    getTotalSupplyFromCurve,
    getTwoCurve,
} from './migration'
import {
    getBaseFeeParams,
    getDynamicFeeParams,
    getMigratedPoolFeeParams,
    getStartingBaseFeeBpsFromBaseFeeParams,
} from './feeParams'
import {
    getBaseTokenForSwap,
    getSqrtPriceFromMarketCap,
    getSqrtPriceFromPrice,
} from './price'
import {
    getLiquidityVestingInfoParams,
    getLockedVestingParams,
    getTotalVestingAmount,
} from './vesting'
import { getInitialLiquidityFromDeltaBase } from '../math/curve'
import { convertToLamports, fromDecimalToBN } from './utils'

type CurveInputs = {
    baseFee: BaseFee
    lockedVestingParams: LockedVestingParameters
    partnerLiquidityVestingInfo: LiquidityVestingInfoParameters
    creatorLiquidityVestingInfo: LiquidityVestingInfoParameters
    poolCreationFeeInLamports: BN
    migratedPoolFeeResult: MigratedPoolFeeResult
    totalSupply: BN
    totalLeftover: BN
    totalVestingAmount: BN
}

type CurveResult = {
    migrationQuoteThreshold: BN
    sqrtStartPrice: BN
    curve: ConfigParameters['curve']
}

/** The config fields every builder derives the same way from its base params. */
function prepareCurveInputs(params: BuildCurveBaseParams): CurveInputs {
    const { token, fee, migration, liquidityDistribution, lockedVesting } =
        params

    const lockedVestingParams = getLockedVestingParams(
        lockedVesting.totalLockedVestingAmount,
        lockedVesting.numberOfVestingPeriod,
        lockedVesting.cliffUnlockAmount,
        lockedVesting.totalVestingDuration,
        lockedVesting.cliffDurationFromMigrationTime,
        token.tokenBaseDecimal
    )
    const liquidityVestingInfo = (
        vesting = DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS
    ) =>
        getLiquidityVestingInfoParams(
            vesting.vestingPercentage,
            vesting.bpsPerPeriod,
            vesting.numberOfPeriods,
            vesting.cliffDurationFromMigrationTime,
            vesting.totalDuration
        )

    return {
        baseFee: getBaseFeeParams(fee.baseFeeParams),
        lockedVestingParams,
        partnerLiquidityVestingInfo: liquidityVestingInfo(
            liquidityDistribution.partnerLiquidityVestingInfoParams
        ),
        creatorLiquidityVestingInfo: liquidityVestingInfo(
            liquidityDistribution.creatorLiquidityVestingInfoParams
        ),
        poolCreationFeeInLamports: convertToLamports(
            fee.poolCreationFee,
            TokenDecimal.NINE
        ),
        migratedPoolFeeResult: getMigratedPoolFeeParams(
            migration.migrationOption,
            migration.migrationFeeOption,
            migration.migratedPoolFee
        ),
        totalSupply: convertToLamports(
            token.totalTokenSupply,
            token.tokenBaseDecimal
        ),
        totalLeftover: convertToLamports(
            token.leftover,
            token.tokenBaseDecimal
        ),
        totalVestingAmount: getTotalVestingAmount(lockedVestingParams),
    }
}

function toConfigParameters(
    params: BuildCurveBaseParams,
    inputs: CurveInputs,
    result: CurveResult
): ConfigParameters {
    const { token, fee, migration, liquidityDistribution } = params
    const { migratedPoolFeeResult } = inputs

    return {
        poolFees: {
            baseFee: { ...inputs.baseFee },
            dynamicFee: fee.dynamicFeeEnabled
                ? getDynamicFeeParams(
                      getStartingBaseFeeBpsFromBaseFeeParams(fee.baseFeeParams)
                  )
                : null,
        },
        collectFeeMode: fee.collectFeeMode,
        migrationOption: migration.migrationOption,
        activationType: params.activationType,
        tokenType: token.tokenType,
        tokenDecimal: token.tokenBaseDecimal,
        partnerLiquidityPercentage:
            liquidityDistribution.partnerLiquidityPercentage,
        partnerPermanentLockedLiquidityPercentage:
            liquidityDistribution.partnerPermanentLockedLiquidityPercentage,
        creatorLiquidityPercentage:
            liquidityDistribution.creatorLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage:
            liquidityDistribution.creatorPermanentLockedLiquidityPercentage,
        migrationQuoteThreshold: result.migrationQuoteThreshold,
        sqrtStartPrice: result.sqrtStartPrice,
        lockedVesting: inputs.lockedVestingParams,
        migrationFeeOption: migratedPoolFeeResult.migrationFeeOption,
        tokenSupply: {
            preMigrationTokenSupply: inputs.totalSupply,
            postMigrationTokenSupply: inputs.totalSupply,
        },
        creatorTradingFeePercentage: fee.creatorTradingFeePercentage,
        tokenUpdateAuthority: token.tokenAuthorityOption,
        migrationFee: migration.migrationFee,
        migratedPoolFee: migratedPoolFeeResult.migratedPoolFee,
        poolCreationFee: inputs.poolCreationFeeInLamports,
        partnerLiquidityVestingInfo: inputs.partnerLiquidityVestingInfo,
        creatorLiquidityVestingInfo: inputs.creatorLiquidityVestingInfo,
        migratedPoolBaseFeeMode: migratedPoolFeeResult.migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams:
            migratedPoolFeeResult.migratedPoolMarketCapFeeSchedulerParams,
        enableFirstSwapWithMinFee: fee.enableFirstSwapWithMinFee,
        compoundingFeeBps: migratedPoolFeeResult.compoundingFeeBps,
        padding: [],
        curve: result.curve,
    }
}

// The program reserves the migration base at its own migration price; the
// base it needs beyond the builder's estimate must fit in the leftover
// (process_create_config.rs: minimum supply <= pre_migration_token_supply).
function finishCurve(
    params: BuildCurveBaseParams,
    inputs: CurveInputs,
    result: CurveResult
): ConfigParameters {
    const totalDynamicSupply = getTotalSupplyFromCurve(
        result.migrationQuoteThreshold,
        result.sqrtStartPrice,
        result.curve,
        inputs.lockedVestingParams,
        params.migration.migrationOption,
        inputs.totalLeftover,
        params.migration.migrationFee.feePercentage,
        inputs.migratedPoolFeeResult.migratedPoolFee.collectFeeMode
    )
    if (totalDynamicSupply.sub(inputs.totalSupply).gt(inputs.totalLeftover)) {
        throw new Error(
            'leftover is too small to cover the migration base rounding'
        )
    }
    return toConfigParameters(params, inputs, result)
}

function assertPositiveSwapAmount(swapAmount: BN): void {
    if (swapAmount.lte(new BN(0))) {
        throw new Error(
            'migration base, locked vesting and leftover exceed the total supply'
        )
    }
}

/** Build config parameters for a single curve segment constant product curve. */
export function buildCurve(params: BuildCurveParams): ConfigParameters {
    const { tokenBaseDecimal, tokenQuoteDecimal, totalTokenSupply } =
        params.token
    const { migrationOption, migrationFee } = params.migration
    const { percentageSupplyOnMigration, migrationQuoteThreshold } = params
    const inputs = prepareCurveInputs(params)
    const migratedCollectFeeMode =
        inputs.migratedPoolFeeResult.migratedPoolFee.collectFeeMode

    const migrationBaseSupply = new Decimal(totalTokenSupply)
        .mul(new Decimal(percentageSupplyOnMigration))
        .div(new Decimal(100))
    const migrationQuoteAmount =
        getMigrationQuoteAmountFromMigrationQuoteThreshold(
            new Decimal(migrationQuoteThreshold),
            migrationFee.feePercentage
        )
    const migrationPrice = migrationQuoteAmount.div(migrationBaseSupply)
    const migrationQuoteThresholdInLamport = convertToLamports(
        migrationQuoteThreshold,
        tokenQuoteDecimal
    )
    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    const migrationBaseAmount = getMigrationBaseToken(
        getMigrationQuoteAmountFromThreshold(
            migrationQuoteThresholdInLamport,
            migrationFee.feePercentage
        ),
        migrateSqrtPrice,
        migrationOption,
        migratedCollectFeeMode
    )

    const swapAmount = inputs.totalSupply
        .sub(migrationBaseAmount)
        .sub(inputs.totalVestingAmount)
        .sub(inputs.totalLeftover)
    assertPositiveSwapAmount(swapAmount)

    const { sqrtStartPrice, curve } = getFirstCurve(
        migrateSqrtPrice,
        swapAmount,
        migrationQuoteThresholdInLamport
    )

    // the supply the program does not reserve goes into a last segment up to MAX_SQRT_PRICE
    const totalDynamicSupply = getTotalSupplyFromCurve(
        migrationQuoteThresholdInLamport,
        sqrtStartPrice,
        curve,
        inputs.lockedVestingParams,
        migrationOption,
        inputs.totalLeftover,
        migrationFee.feePercentage,
        migratedCollectFeeMode
    )
    const lastLiquidity = getInitialLiquidityFromDeltaBase(
        inputs.totalSupply.sub(totalDynamicSupply),
        MAX_SQRT_PRICE,
        migrateSqrtPrice
    )
    if (!lastLiquidity.isZero()) {
        curve.push({ sqrtPrice: MAX_SQRT_PRICE, liquidity: lastLiquidity })
    }

    return toConfigParameters(params, inputs, {
        migrationQuoteThreshold: migrationQuoteThresholdInLamport,
        sqrtStartPrice,
        curve,
    })
}

/**
 * Build config parameters from initial and migration market caps for a single
 * curve segment constant product curve.
 */
export function buildCurveWithMarketCap(
    params: BuildCurveWithMarketCapParams
): ConfigParameters {
    const {
        token,
        migration,
        lockedVesting,
        initialMarketCap,
        migrationMarketCap,
    } = params
    const { migrationFee } = migration

    const lockedVestingParams = getLockedVestingParams(
        lockedVesting.totalLockedVestingAmount,
        lockedVesting.numberOfVestingPeriod,
        lockedVesting.cliffUnlockAmount,
        lockedVesting.totalVestingDuration,
        lockedVesting.cliffDurationFromMigrationTime,
        token.tokenBaseDecimal
    )
    const totalLeftover = convertToLamports(
        token.leftover,
        token.tokenBaseDecimal
    )
    const totalSupply = convertToLamports(
        token.totalTokenSupply,
        token.tokenBaseDecimal
    )

    const percentageSupplyOnMigration =
        migrationFee.feePercentage > 0
            ? calculateAdjustedPercentageSupplyOnMigration(
                  initialMarketCap,
                  migrationMarketCap,
                  migrationFee,
                  lockedVestingParams,
                  totalLeftover,
                  totalSupply
              )
            : getPercentageSupplyOnMigration(
                  new Decimal(initialMarketCap),
                  new Decimal(migrationMarketCap),
                  lockedVestingParams,
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
        ...params,
        percentageSupplyOnMigration,
        migrationQuoteThreshold,
    })
}

/** Migration price, threshold and swap amount for a market-cap-driven two-segment curve. */
function marketCapCurveInputs(
    params: BuildCurveBaseParams,
    inputs: CurveInputs,
    initialMarketCap: number,
    migrationMarketCap: number,
    percentageSupplyOnMigration: number
) {
    const { tokenBaseDecimal, tokenQuoteDecimal, totalTokenSupply } =
        params.token
    const { migrationOption, migrationFee } = params.migration

    const migrationQuoteAmount = getMigrationQuoteAmount(
        new Decimal(migrationMarketCap),
        new Decimal(percentageSupplyOnMigration)
    )
    const migrationQuoteThreshold =
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            migrationQuoteAmount,
            new Decimal(migrationFee.feePercentage)
        )
    const migrationBaseSupply = new Decimal(totalTokenSupply)
        .mul(new Decimal(percentageSupplyOnMigration))
        .div(new Decimal(100))
    const migrationPrice = migrationQuoteAmount.div(migrationBaseSupply)
    const migrationQuoteThresholdInLamport = fromDecimalToBN(
        migrationQuoteThreshold.mul(new Decimal(10 ** tokenQuoteDecimal))
    )
    const migrateSqrtPrice = getSqrtPriceFromPrice(
        migrationPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    const migrationBaseAmount = getMigrationBaseToken(
        getMigrationQuoteAmountFromThreshold(
            migrationQuoteThresholdInLamport,
            migrationFee.feePercentage
        ),
        migrateSqrtPrice,
        migrationOption,
        inputs.migratedPoolFeeResult.migratedPoolFee.collectFeeMode
    )

    const swapAmount = inputs.totalSupply
        .sub(migrationBaseAmount)
        .sub(inputs.totalVestingAmount)
        .sub(inputs.totalLeftover)
    assertPositiveSwapAmount(swapAmount)

    const initialSqrtPrice = getSqrtPriceFromMarketCap(
        initialMarketCap,
        totalTokenSupply,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )

    return {
        migrationQuoteThresholdInLamport,
        migrateSqrtPrice,
        initialSqrtPrice,
        swapAmount,
    }
}

/** Build config parameters for a two-segment curve. */
export function buildCurveWithTwoSegments(
    params: BuildCurveWithTwoSegmentsParams
): ConfigParameters {
    const {
        initialMarketCap,
        migrationMarketCap,
        percentageSupplyOnMigration,
    } = params
    const inputs = prepareCurveInputs(params)
    const {
        migrationQuoteThresholdInLamport,
        migrateSqrtPrice,
        initialSqrtPrice,
        swapAmount,
    } = marketCapCurveInputs(
        params,
        inputs,
        initialMarketCap,
        migrationMarketCap,
        percentageSupplyOnMigration
    )

    const p1 = new Decimal(initialSqrtPrice.toString())
    const p2 = new Decimal(migrateSqrtPrice.toString())
    // candidate mid prices, tried in order: (p1^3 * p2)^(1/4), (p1 * p2^3)^(1/4), sqrt(p1 * p2)
    const midSqrtPrices = [
        p1.pow(3).mul(p2).pow(0.25),
        p1.mul(p2.pow(3)).pow(0.25),
        p1.mul(p2).sqrt(),
    ].map((price) => fromDecimalToBN(price))

    const twoCurve = midSqrtPrices
        .map((midSqrtPrice) =>
            getTwoCurve(
                migrateSqrtPrice,
                midSqrtPrice,
                initialSqrtPrice,
                swapAmount,
                migrationQuoteThresholdInLamport
            )
        )
        .find((result) => result.isOk)
    if (!twoCurve) {
        throw new Error(
            'no mid price gives a two-segment curve with positive liquidity'
        )
    }

    return finishCurve(params, inputs, {
        migrationQuoteThreshold: migrationQuoteThresholdInLamport,
        sqrtStartPrice: twoCurve.sqrtStartPrice,
        curve: twoCurve.curve,
    })
}

/**
 * Build config parameters for a two-segment constant product curve that
 * passes through a mid price.
 */
export function buildCurveWithMidPrice(
    params: BuildCurveWithMidPriceParams
): ConfigParameters {
    const { tokenBaseDecimal, tokenQuoteDecimal } = params.token
    const {
        initialMarketCap,
        migrationMarketCap,
        midPrice,
        percentageSupplyOnMigration,
    } = params
    const inputs = prepareCurveInputs(params)
    const {
        migrationQuoteThresholdInLamport,
        migrateSqrtPrice,
        initialSqrtPrice,
        swapAmount,
    } = marketCapCurveInputs(
        params,
        inputs,
        initialMarketCap,
        migrationMarketCap,
        percentageSupplyOnMigration
    )

    const midSqrtPrice = getSqrtPriceFromPrice(
        midPrice.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    const result = getTwoCurve(
        migrateSqrtPrice,
        midSqrtPrice,
        initialSqrtPrice,
        swapAmount,
        migrationQuoteThresholdInLamport
    )
    if (!result.isOk) {
        throw new Error(
            'midPrice does not give a two-segment curve with positive liquidity'
        )
    }

    return finishCurve(params, inputs, {
        migrationQuoteThreshold: migrationQuoteThresholdInLamport,
        sqrtStartPrice: result.sqrtStartPrice,
        curve: result.curve,
    })
}

/**
 * Size the liquidity of each segment between consecutive sqrt prices by its
 * weight so the swap base plus the migration base equals the supply left after
 * vesting and leftover, then derive the migration quote threshold the curve
 * reaches at the last price.
 */
function segmentedCurve(
    params: BuildCurveBaseParams,
    inputs: CurveInputs,
    sqrtPrices: BN[],
    liquidityWeights: number[]
): CurveResult {
    const { migrationOption, migrationFee } = params.migration
    const migratedCollectFeeMode =
        inputs.migratedPoolFeeResult.migratedPoolFee.collectFeeMode
    const pMin = sqrtPrices[0]
    const pMax = sqrtPrices[sqrtPrices.length - 1]

    const totalSwapAndMigrationAmount = inputs.totalSupply
        .sub(inputs.totalVestingAmount)
        .sub(inputs.totalLeftover)
    assertPositiveSwapAmount(totalSwapAndMigrationAmount)

    // Swap_Amount = sum(li * (1/p(i-1) - 1/pi))
    // Quote_Amount = sum(li * (pi - p(i-1)))
    // Base_Amount = Quote_Amount * (1 - migrationFee/100) * migration_base_weight
    // li = l1 * ki, so l1 = (Swap_Amount + Base_Amount) / sum(ki * (w1 + w2))
    const migrationBaseWeight = getMigrationBaseWeight(
        pMax,
        migrationOption,
        migratedCollectFeeMode
    )
    const migrationFeeFactor = new Decimal(100)
        .sub(new Decimal(migrationFee.feePercentage))
        .div(new Decimal(100))
    let sumFactor = new Decimal(0)
    for (let i = 1; i < sqrtPrices.length; i++) {
        const pi = new Decimal(sqrtPrices[i].toString())
        const piMinus = new Decimal(sqrtPrices[i - 1].toString())
        const w1 = pi.sub(piMinus).div(pi.mul(piMinus))
        const w2 = pi
            .sub(piMinus)
            .mul(migrationFeeFactor)
            .mul(migrationBaseWeight)
        sumFactor = sumFactor.add(
            new Decimal(liquidityWeights[i - 1]).mul(w1.add(w2))
        )
    }
    const l1 = new Decimal(totalSwapAndMigrationAmount.toString()).div(
        sumFactor
    )

    const curve = liquidityWeights.map((weight, i) => ({
        sqrtPrice: sqrtPrices[i + 1],
        liquidity: fromDecimalToBN(l1.mul(new Decimal(weight))),
    }))

    const swapBaseAmount = getBaseTokenForSwap(pMin, pMax, curve)
    const migrationAmount = totalSwapAndMigrationAmount.sub(
        getSwapAmountWithBuffer(swapBaseAmount, pMin, curve)
    )
    const migrationQuoteAmount = getMigrationQuoteAmountFromMigrationBase(
        migrationAmount,
        pMax,
        migrationOption,
        migratedCollectFeeMode
    )
    const migrationQuoteThreshold = fromDecimalToBN(
        getMigrationQuoteThresholdFromMigrationQuoteAmount(
            new Decimal(migrationQuoteAmount.toString()),
            new Decimal(migrationFee.feePercentage)
        )
    )

    return { migrationQuoteThreshold, sqrtStartPrice: pMin, curve }
}

/**
 * Build config parameters for a sixteen-segment constant product curve whose
 * segment shape is controlled by liquidity weights. The segment prices share
 * one ratio from the initial to the migration market cap.
 */
export function buildCurveWithLiquidityWeights(
    params: BuildCurveWithLiquidityWeightsParams
): ConfigParameters {
    const { tokenBaseDecimal, tokenQuoteDecimal, totalTokenSupply } =
        params.token
    const { initialMarketCap, migrationMarketCap, liquidityWeights } = params
    if (liquidityWeights.length !== MAX_CURVE_POINT) {
        throw new Error(`liquidityWeights must have ${MAX_CURVE_POINT} entries`)
    }
    const inputs = prepareCurveInputs(params)

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

    // q^16 = pMax / pMin
    const q = new Decimal(pMax.toString())
        .div(new Decimal(pMin.toString()))
        .pow(new Decimal(1).div(MAX_CURVE_POINT))
    const sqrtPrices = [pMin]
    for (let i = 1; i < MAX_CURVE_POINT; i++) {
        sqrtPrices.push(
            fromDecimalToBN(q.mul(new Decimal(sqrtPrices[i - 1].toString())))
        )
    }
    sqrtPrices.push(pMax)

    return finishCurve(
        params,
        inputs,
        segmentedCurve(params, inputs, sqrtPrices, liquidityWeights)
    )
}

/**
 * Build config parameters for a constant product curve with up to sixteen
 * segments at the given ascending sqrt prices. The first price is the start
 * price and the last is the migration price. liquidityWeights, one per
 * segment, default to equal weights.
 */
export function buildCurveWithCustomSqrtPrices(
    params: BuildCurveWithCustomSqrtPricesParams
): ConfigParameters {
    const { sqrtPrices } = params

    if (sqrtPrices.length < 2) {
        throw new Error('sqrtPrices array must have at least 2 elements')
    }
    if (sqrtPrices.length - 1 > MAX_CURVE_POINT) {
        throw new Error(
            `sqrtPrices must have at most ${MAX_CURVE_POINT + 1} elements`
        )
    }
    for (let i = 1; i < sqrtPrices.length; i++) {
        if (sqrtPrices[i].lte(sqrtPrices[i - 1])) {
            throw new Error('sqrtPrices must be in ascending order')
        }
    }
    const liquidityWeights =
        params.liquidityWeights ?? Array(sqrtPrices.length - 1).fill(1)
    if (liquidityWeights.length !== sqrtPrices.length - 1) {
        throw new Error(
            'liquidityWeights length must equal sqrtPrices.length - 1'
        )
    }

    const inputs = prepareCurveInputs(params)
    return finishCurve(
        params,
        inputs,
        segmentedCurve(params, inputs, sqrtPrices, liquidityWeights)
    )
}
