import {
    BaseFee,
    DynamicFeeParameters,
    BaseFeeMode,
    MigrationOption,
    ActivationType,
    MigratedPoolFeeConfig,
    MigrationFeeOption,
    DammV2BaseFeeMode,
    MigratedPoolMarketCapFeeSchedulerParameters,
    BaseFeeParams,
    MigratedPoolFeeResult,
} from '../types'
import {
    BIN_STEP_BPS_DEFAULT,
    BIN_STEP_BPS_U128_DEFAULT,
    DEFAULT_MIGRATED_POOL_FEE_PARAMS,
    DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
    DYNAMIC_FEE_DECAY_PERIOD_DEFAULT,
    DYNAMIC_FEE_FILTER_PERIOD_DEFAULT,
    DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT,
    FEE_DENOMINATOR,
    MAX_BASIS_POINT,
    MAX_FEE_BPS,
    MAX_FEE_NUMERATOR,
    MAX_PRICE_CHANGE_BPS_DEFAULT,
    MAX_RATE_LIMITER_DURATION_IN_SECONDS,
    MAX_RATE_LIMITER_DURATION_IN_SLOTS,
    MIN_FEE_BPS,
    MIN_FEE_NUMERATOR,
    ONE_Q64,
} from '../constants'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import { bpsToFeeNumerator, convertToLamports } from './utils'
import { computeSqrtPriceStepBps } from './price'
/**
 * Get the fee scheduler parameters
 * @param {number} startingBaseFeeBps - Starting fee in basis points
 * @param {number} endingBaseFeeBps - Ending fee in basis points
 * @param {BaseFeeMode} baseFeeMode - Mode for fee reduction (Linear or Exponential)
 * @param {number} numberOfPeriod - Number of periods over which to schedule fee reduction
 * @param {BN} totalDuration - Total duration of the fee scheduler
 *
 * @returns {BaseFee}
 */
export function getFeeSchedulerParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    baseFeeMode: BaseFeeMode,
    numberOfPeriod: number,
    totalDuration: number
): BaseFee {
    if (startingBaseFeeBps == endingBaseFeeBps) {
        if (numberOfPeriod != 0 || totalDuration != 0) {
            throw new Error(
                'numberOfPeriod and totalDuration must both be zero'
            )
        }

        return {
            cliffFeeNumerator: bpsToFeeNumerator(startingBaseFeeBps),
            firstFactor: 0,
            secondFactor: new BN(0),
            thirdFactor: new BN(0),
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        }
    }

    if (numberOfPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    if (startingBaseFeeBps > MAX_FEE_BPS) {
        throw new Error(
            `startingBaseFeeBps (${startingBaseFeeBps} bps) exceeds maximum allowed value of ${MAX_FEE_BPS} bps`
        )
    }

    if (endingBaseFeeBps < MIN_FEE_BPS) {
        throw new Error(
            `endingBaseFeeBps (${endingBaseFeeBps} bps) is less than minimum allowed value of ${MIN_FEE_BPS} bps`
        )
    }

    if (endingBaseFeeBps > startingBaseFeeBps) {
        throw new Error(
            'endingBaseFeeBps bps must be less than or equal to startingBaseFeeBps bps'
        )
    }

    if (numberOfPeriod == 0 || totalDuration == 0) {
        throw new Error(
            'numberOfPeriod and totalDuration must both greater than zero'
        )
    }

    const maxBaseFeeNumerator = bpsToFeeNumerator(startingBaseFeeBps)

    const minBaseFeeNumerator = bpsToFeeNumerator(endingBaseFeeBps)

    const periodFrequency = new BN(totalDuration / numberOfPeriod)

    let reductionFactor: BN
    if (baseFeeMode == BaseFeeMode.FeeSchedulerLinear) {
        const totalReduction = maxBaseFeeNumerator.sub(minBaseFeeNumerator)
        reductionFactor = totalReduction.divn(numberOfPeriod)
    } else {
        const ratio = new Decimal(minBaseFeeNumerator.toString()).div(
            new Decimal(maxBaseFeeNumerator.toString())
        )
        const decayBase = ratio.pow(new Decimal(1).div(numberOfPeriod))
        reductionFactor = new BN(
            new Decimal(MAX_BASIS_POINT)
                .mul(new Decimal(1).sub(decayBase))
                .floor()
                .toFixed()
        )
    }

    return {
        cliffFeeNumerator: maxBaseFeeNumerator,
        firstFactor: numberOfPeriod,
        secondFactor: periodFrequency,
        thirdFactor: reductionFactor,
        baseFeeMode,
    }
}

/**
 * Calculate the ending base fee of fee scheduler in basis points
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param numberOfPeriod - The number of period
 * @param reductionFactor - The reduction factor
 * @param feeSchedulerMode - The fee scheduler mode
 * @returns The minimum base fee in basis points
 */
export function calculateFeeSchedulerEndingBaseFeeBps(
    cliffFeeNumerator: number,
    numberOfPeriod: number,
    periodFrequency: number,
    reductionFactor: number,
    baseFeeMode: BaseFeeMode
): number {
    if (numberOfPeriod === 0 || periodFrequency === 0) {
        return (cliffFeeNumerator / FEE_DENOMINATOR) * MAX_BASIS_POINT
    }

    let baseFeeNumerator: number
    if (baseFeeMode == BaseFeeMode.FeeSchedulerLinear) {
        // linear mode
        baseFeeNumerator = cliffFeeNumerator - numberOfPeriod * reductionFactor
    } else {
        // exponential mode
        const decayRate = new Decimal(1).sub(
            new Decimal(reductionFactor).div(MAX_BASIS_POINT)
        )
        baseFeeNumerator = new Decimal(cliffFeeNumerator)
            .mul(decayRate.pow(numberOfPeriod))
            .toNumber()
    }

    // ensure base fee is not negative
    return Math.max(0, (baseFeeNumerator / FEE_DENOMINATOR) * MAX_BASIS_POINT)
}

/**
 * Get the rate limiter parameters.
 * @deprecated New configs cannot use RateLimiter. Kept for quoting existing rate-limiter pools.
 * @param baseFeeBps - The base fee in basis points
 * @param feeIncrementBps - The fee increment in basis points
 * @param referenceAmount - The reference amount
 * @param maxLimiterDuration - The max rate limiter duration
 * @param tokenQuoteDecimal - The token quote decimal
 * @param activationType - The activation type
 * @returns The rate limiter parameters
 */
export function getRateLimiterParams(
    baseFeeBps: number,
    feeIncrementBps: number,
    referenceAmount: number,
    maxLimiterDuration: number,
    tokenQuoteDecimal: number,
    activationType: ActivationType
): BaseFee {
    const cliffFeeNumerator = bpsToFeeNumerator(baseFeeBps)
    const feeIncrementNumerator = bpsToFeeNumerator(feeIncrementBps)

    if (
        baseFeeBps <= 0 ||
        feeIncrementBps <= 0 ||
        referenceAmount <= 0 ||
        maxLimiterDuration <= 0
    ) {
        throw new Error('All rate limiter parameters must be greater than zero')
    }

    if (baseFeeBps > MAX_FEE_BPS) {
        throw new Error(
            `Base fee (${baseFeeBps} bps) exceeds maximum allowed value of ${MAX_FEE_BPS} bps`
        )
    }

    if (baseFeeBps < MIN_FEE_BPS) {
        throw new Error(
            `Base fee (${baseFeeBps} bps) is less than minimum allowed value of ${MIN_FEE_BPS} bps`
        )
    }

    if (feeIncrementBps > MAX_FEE_BPS) {
        throw new Error(
            `Fee increment (${feeIncrementBps} bps) exceeds maximum allowed value of ${MAX_FEE_BPS} bps`
        )
    }

    if (feeIncrementNumerator.gte(new BN(FEE_DENOMINATOR))) {
        throw new Error(
            'Fee increment numerator must be less than FEE_DENOMINATOR'
        )
    }

    const deltaNumerator = new BN(MAX_FEE_NUMERATOR).sub(cliffFeeNumerator)
    const maxIndex = deltaNumerator.div(feeIncrementNumerator)
    if (maxIndex.lt(new BN(1))) {
        throw new Error('Fee increment is too large for the given base fee')
    }

    if (
        cliffFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        cliffFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        throw new Error('Base fee must be between 0.01% and 99%')
    }

    const maxDuration =
        activationType === ActivationType.Slot
            ? MAX_RATE_LIMITER_DURATION_IN_SLOTS
            : MAX_RATE_LIMITER_DURATION_IN_SECONDS

    if (maxLimiterDuration > maxDuration) {
        throw new Error(
            `Max duration exceeds maximum allowed value of ${maxDuration}`
        )
    }

    const referenceAmountInLamports = convertToLamports(
        referenceAmount,
        tokenQuoteDecimal
    )

    return {
        cliffFeeNumerator,
        firstFactor: feeIncrementBps,
        secondFactor: new BN(maxLimiterDuration),
        thirdFactor: new BN(referenceAmountInLamports),
        baseFeeMode: BaseFeeMode.RateLimiter,
    }
}

/**
 * Get the dynamic fee parameters (20% of base fee)
 * @param baseFeeBps - The base fee in basis points
 * @param maxPriceChangeBps - The max price change in basis points
 * @returns The dynamic fee parameters
 */
export function getDynamicFeeParams(
    baseFeeBps: number,
    maxPriceChangeBps: number = MAX_PRICE_CHANGE_BPS_DEFAULT // default 15%
): DynamicFeeParameters {
    if (maxPriceChangeBps > MAX_PRICE_CHANGE_BPS_DEFAULT) {
        throw new Error(
            `maxPriceChangeBps (${maxPriceChangeBps} bps) must be less than or equal to ${MAX_PRICE_CHANGE_BPS_DEFAULT}`
        )
    }

    const priceRatio = maxPriceChangeBps / MAX_BASIS_POINT + 1
    // Q64
    const sqrtPriceRatioQ64 = new BN(
        Decimal.sqrt(priceRatio.toString())
            .mul(Decimal.pow(2, 64))
            .floor()
            .toFixed()
    )
    const deltaBinId = sqrtPriceRatioQ64
        .sub(ONE_Q64)
        .div(BIN_STEP_BPS_U128_DEFAULT)
        .muln(2)

    const maxVolatilityAccumulator = new BN(deltaBinId.muln(MAX_BASIS_POINT))

    const squareVfaBin = maxVolatilityAccumulator
        .mul(new BN(BIN_STEP_BPS_DEFAULT))
        .pow(new BN(2))

    const baseFeeNumerator = new BN(bpsToFeeNumerator(baseFeeBps))
    const maxDynamicFeeNumerator = baseFeeNumerator.muln(20).divn(100) // default max dynamic fee = 20% of base fee.
    const vFee = maxDynamicFeeNumerator
        .mul(new BN(100_000_000_000))
        .sub(new BN(99_999_999_999))

    const variableFeeControl = vFee.div(squareVfaBin)

    return {
        binStep: BIN_STEP_BPS_DEFAULT,
        binStepU128: BIN_STEP_BPS_U128_DEFAULT,
        filterPeriod: DYNAMIC_FEE_FILTER_PERIOD_DEFAULT,
        decayPeriod: DYNAMIC_FEE_DECAY_PERIOD_DEFAULT,
        reductionFactor: DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT,
        maxVolatilityAccumulator: maxVolatilityAccumulator.toNumber(),
        variableFeeControl: variableFeeControl.toNumber(),
    }
}
/**
 * Derive the starting base fee BPS from baseFeeParams
 * For FeeSchedulerLinear/FeeSchedulerExponential: uses endingFeeBps (the fee at end of pre-migration curve)
 * For RateLimiter: uses baseFeeBps (the cliff fee)
 * @param baseFeeParams - The base fee parameters from the pre-migration pool
 * @returns The starting base fee in basis points for the migrated pool
 */
export function getStartingBaseFeeBpsFromBaseFeeParams(
    baseFeeParams: BaseFeeParams
): number {
    if (baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter) {
        return baseFeeParams.rateLimiterParam.baseFeeBps
    } else {
        return baseFeeParams.feeSchedulerParam.endingFeeBps
    }
}

/**
 * Get the migrated pool market cap fee scheduler parameters
 * @param startingBaseFeeBps - Starting (max) fee in basis points
 * @param endingBaseFeeBps - Ending (min) fee in basis points
 * @param baseFeeMode - Linear or exponential decay
 * @param numberOfPeriod - Number of fee reduction periods
 * @param priceMultiple - Target spot-price multiple from the initial price (e.g. 1000 for 1000x). Must be > 1.
 * @param schedulerExpirationDuration - Seconds after which the schedule expires to the ending fee regardless of price
 * @returns The migrated pool market cap fee scheduler parameters
 */
export function getMigratedPoolMarketCapFeeSchedulerParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    dammV2BaseFeeMode: DammV2BaseFeeMode,
    numberOfPeriod: number,
    priceMultiple: number,
    schedulerExpirationDuration: number
): MigratedPoolMarketCapFeeSchedulerParameters {
    if (
        dammV2BaseFeeMode === DammV2BaseFeeMode.FeeTimeSchedulerLinear ||
        dammV2BaseFeeMode === DammV2BaseFeeMode.FeeTimeSchedulerExponential
    ) {
        return DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
    }

    if (dammV2BaseFeeMode === DammV2BaseFeeMode.RateLimiter) {
        throw new Error(
            'RateLimiter is not supported for DAMM v2 migration. Use either FeeMarketCapSchedulerLinear or FeeMarketCapSchedulerExponential instead.'
        )
    }

    if (numberOfPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    const poolMaxFeeBps = MAX_FEE_BPS

    if (startingBaseFeeBps <= endingBaseFeeBps) {
        throw new Error(
            `startingBaseFeeBps (${startingBaseFeeBps} bps) must be greater than endingBaseFeeBps (${endingBaseFeeBps} bps)`
        )
    }

    if (priceMultiple <= 1) {
        throw new Error('priceMultiple must be greater than 1')
    }

    if (startingBaseFeeBps > poolMaxFeeBps) {
        throw new Error(
            `startingBaseFeeBps (${startingBaseFeeBps} bps) exceeds maximum allowed value of ${poolMaxFeeBps} bps`
        )
    }

    if (schedulerExpirationDuration == 0) {
        throw new Error('schedulerExpirationDuration must be greater than zero')
    }

    const sqrtPriceStepBps = computeSqrtPriceStepBps(
        priceMultiple,
        numberOfPeriod
    )

    const maxBaseFeeNumerator = bpsToFeeNumerator(startingBaseFeeBps)
    const minBaseFeeNumerator = bpsToFeeNumerator(endingBaseFeeBps)

    let reductionFactor: BN

    if (dammV2BaseFeeMode === DammV2BaseFeeMode.FeeMarketCapSchedulerLinear) {
        const totalReduction = maxBaseFeeNumerator.sub(minBaseFeeNumerator)
        reductionFactor = totalReduction.divn(numberOfPeriod)
    } else if (
        dammV2BaseFeeMode === DammV2BaseFeeMode.FeeMarketCapSchedulerExponential
    ) {
        const ratio =
            minBaseFeeNumerator.toNumber() / maxBaseFeeNumerator.toNumber()
        const decayBase = Math.pow(ratio, 1 / numberOfPeriod)
        reductionFactor = new BN(MAX_BASIS_POINT * (1 - decayBase))
    } else {
        throw new Error(
            'Migrated market-cap fee scheduler requires a market-cap scheduler base fee mode'
        )
    }

    return {
        numberOfPeriod,
        sqrtPriceStepBps,
        schedulerExpirationDuration,
        reductionFactor,
    }
}

/**
 * Check if rate limiter should be applied based on pool configuration and state
 * @param baseFeeMode - The base fee mode
 * @param swapBaseForQuote - Whether the swap is from base to quote
 * @param currentPoint - The current point
 * @param activationPoint - The activation point
 * @param maxLimiterDuration - The maximum limiter duration
 * @returns Whether rate limiter should be applied
 */
export function checkRateLimiterApplied(
    baseFeeMode: BaseFeeMode,
    swapBaseForQuote: boolean,
    currentPoint: BN,
    activationPoint: BN,
    maxLimiterDuration: BN
): boolean {
    return (
        baseFeeMode === BaseFeeMode.RateLimiter &&
        !swapBaseForQuote &&
        currentPoint.gte(activationPoint) &&
        currentPoint.lte(activationPoint.add(maxLimiterDuration))
    )
}

/**
 * Get base fee parameters based on the base fee mode
 * @param baseFeeParams - The base fee parameters
 * @returns The base fee parameters
 */
export function getBaseFeeParams(baseFeeParams: BaseFeeParams): BaseFee {
    if (baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter) {
        throw new Error(
            'BaseFeeMode.RateLimiter is deprecated. New configs must use FeeSchedulerLinear or FeeSchedulerExponential.'
        )
    }

    const { startingFeeBps, endingFeeBps, numberOfPeriod, totalDuration } =
        baseFeeParams.feeSchedulerParam

    return getFeeSchedulerParams(
        startingFeeBps,
        endingFeeBps,
        baseFeeParams.baseFeeMode,
        numberOfPeriod,
        totalDuration
    )
}

/**
 * Get migrated pool fee parameters based on migration options
 * @param migrationOption - The migration option (DAMM or DAMM_V2)
 * @param migrationFeeOption - The fee option (fixed rates 0-5 or customizable)
 * @param migratedPoolFee - Optional custom migrated pool fee parameters (only used with DAMM_V2 + Customizable)
 * @returns Migrated pool fee parameters with appropriate defaults
 */
export function getMigratedPoolFeeParams(
    migrationOption: MigrationOption,
    migrationFeeOption: MigrationFeeOption,
    migratedPoolFee?: MigratedPoolFeeConfig,
    baseFeeParams?: BaseFeeParams
): MigratedPoolFeeResult {
    const defaultResult: MigratedPoolFeeResult = {
        migratedPoolFee: DEFAULT_MIGRATED_POOL_FEE_PARAMS,
        migratedPoolBaseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
        migratedPoolMarketCapFeeSchedulerParams:
            DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
        migrationFeeOption,
        compoundingFeeBps: 0,
    }

    if (migrationOption === MigrationOption.MET_DAMM) {
        throw new Error(
            'MigrationOption.MET_DAMM (DAMM v1) is deprecated. New configs must use MigrationOption.MET_DAMM_V2.'
        )
    }

    // for DAMM_V2: use custom parameters based on configuration
    if (migrationOption === MigrationOption.MET_DAMM_V2) {
        const baseFeeMode =
            migratedPoolFee?.baseFeeMode ??
            DammV2BaseFeeMode.FeeTimeSchedulerLinear

        // when marketCapFeeSchedulerParams is configured, use custom values
        if (migratedPoolFee?.marketCapFeeSchedulerParams && baseFeeParams) {
            const schedulerParams = getMigratedPoolMarketCapFeeSchedulerParams(
                migratedPoolFee.poolFeeBps,
                migratedPoolFee.marketCapFeeSchedulerParams.endingBaseFeeBps,
                baseFeeMode,
                migratedPoolFee.marketCapFeeSchedulerParams.numberOfPeriod,
                migratedPoolFee.marketCapFeeSchedulerParams.priceMultiple,
                migratedPoolFee.marketCapFeeSchedulerParams
                    .schedulerExpirationDuration
            )

            return {
                migratedPoolFee: {
                    collectFeeMode: migratedPoolFee.collectFeeMode,
                    dynamicFee: migratedPoolFee.dynamicFee,
                    poolFeeBps: migratedPoolFee.poolFeeBps,
                },
                migratedPoolBaseFeeMode: baseFeeMode,
                migratedPoolMarketCapFeeSchedulerParams: schedulerParams,
                migrationFeeOption: MigrationFeeOption.Customizable,
                compoundingFeeBps: migratedPoolFee.compoundingFeeBps ?? 0,
            }
        }

        // use custom parameters if Customizable option is selected
        if (migrationFeeOption === MigrationFeeOption.Customizable) {
            if (migratedPoolFee?.poolFeeBps === undefined) {
                throw new Error(
                    'migratedPoolFee.poolFeeBps is required when migrationFeeOption is Customizable'
                )
            }
            return {
                migratedPoolFee: {
                    collectFeeMode:
                        migratedPoolFee?.collectFeeMode ??
                        DEFAULT_MIGRATED_POOL_FEE_PARAMS.collectFeeMode,
                    dynamicFee:
                        migratedPoolFee?.dynamicFee ??
                        DEFAULT_MIGRATED_POOL_FEE_PARAMS.dynamicFee,
                    poolFeeBps:
                        migratedPoolFee?.poolFeeBps ??
                        DEFAULT_MIGRATED_POOL_FEE_PARAMS.poolFeeBps,
                },
                migratedPoolBaseFeeMode: baseFeeMode,
                migratedPoolMarketCapFeeSchedulerParams:
                    DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
                migrationFeeOption: MigrationFeeOption.Customizable,
                compoundingFeeBps: migratedPoolFee?.compoundingFeeBps ?? 0,
            }
        }

        // for fixed fee options (0-5), use defaults but preserve baseFeeMode if provided
        return {
            migratedPoolFee: DEFAULT_MIGRATED_POOL_FEE_PARAMS,
            migratedPoolBaseFeeMode: baseFeeMode,
            migratedPoolMarketCapFeeSchedulerParams:
                DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
            migrationFeeOption,
            compoundingFeeBps: 0,
        }
    }

    return defaultResult
}
