import {
    ActivationType,
    BaseFee,
    BaseFeeMode,
    BaseFeeParams,
    DammV2BaseFeeMode,
    DynamicFeeParameters,
    MigratedPoolFeeConfig,
    MigratedPoolFeeResult,
    MigratedPoolMarketCapFeeSchedulerParameters,
    MigrationFeeOption,
    MigrationOption,
} from '../types'
import {
    BIN_STEP_BPS_DEFAULT,
    BIN_STEP_BPS_U128_DEFAULT,
    DEFAULT_MIGRATED_POOL_FEE_PARAMS,
    DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
    DYNAMIC_FEE_DECAY_PERIOD_DEFAULT,
    DYNAMIC_FEE_FILTER_PERIOD_DEFAULT,
    DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT,
    DYNAMIC_FEE_ROUNDING_OFFSET,
    DYNAMIC_FEE_SCALING_FACTOR,
    MAX_BASIS_POINT,
    MAX_DYNAMIC_FEE_PERCENT,
    MAX_FEE_BPS,
    MAX_PRICE_CHANGE_BPS_DEFAULT,
    MAX_RATE_LIMITER_DURATION_IN_SECONDS,
    MAX_RATE_LIMITER_DURATION_IN_SLOTS,
    MIN_FEE_BPS,
    ONE_Q64,
    U16_MAX,
} from '../constants'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    bpsToFeeNumerator,
    convertToLamports,
    feeNumeratorToBps,
} from './utils'
import { computeSqrtPriceStepBps } from './price'
import { getFeeNumeratorOnExponentialFeeScheduler } from '../math/poolFees/feeScheduler'
import { getMaxIndex } from '../math/poolFees/rateLimiter'
import { ProgramError } from '../math/errors'

function assertFeeBpsRange(name: string, bps: number): void {
    if (bps < MIN_FEE_BPS || bps > MAX_FEE_BPS) {
        throw new Error(
            `${name} must be between ${MIN_FEE_BPS} and ${MAX_FEE_BPS} bps`
        )
    }
}

/**
 * Largest reduction factor whose fee after numberOfPeriod periods of the
 * program's Q64 decay is still at or above minBaseFeeNumerator.
 */
function exponentialReductionFactor(
    maxBaseFeeNumerator: BN,
    minBaseFeeNumerator: BN,
    numberOfPeriod: number
): BN {
    const ratio = new Decimal(minBaseFeeNumerator.toString()).div(
        new Decimal(maxBaseFeeNumerator.toString())
    )
    const decayBase = ratio.pow(new Decimal(1).div(numberOfPeriod))
    let reductionFactor = new BN(
        new Decimal(MAX_BASIS_POINT)
            .mul(new Decimal(1).sub(decayBase))
            .floor()
            .toFixed()
    )
    if (reductionFactor.isNeg()) {
        reductionFactor = new BN(0)
    } else if (reductionFactor.gtn(MAX_BASIS_POINT)) {
        reductionFactor = new BN(MAX_BASIS_POINT)
    }
    const feeAt = (factor: BN) =>
        getFeeNumeratorOnExponentialFeeScheduler(
            maxBaseFeeNumerator,
            factor,
            numberOfPeriod
        )

    while (
        reductionFactor.gtn(0) &&
        feeAt(reductionFactor).lt(minBaseFeeNumerator)
    ) {
        reductionFactor = reductionFactor.subn(1)
    }
    while (reductionFactor.ltn(MAX_BASIS_POINT)) {
        const nextFee = feeAt(reductionFactor.addn(1))
        if (nextFee.lt(minBaseFeeNumerator)) {
            break
        }
        reductionFactor = reductionFactor.addn(1)
    }
    if (reductionFactor.isZero()) {
        throw new Error(
            'endingBaseFeeBps is too close to startingBaseFeeBps for numberOfPeriod periods of exponential decay'
        )
    }
    return reductionFactor
}

/**
 * Build a fee scheduler that decays from startingBaseFeeBps to endingBaseFeeBps
 * over numberOfPeriod periods of floor(totalDuration / numberOfPeriod) each.
 * A constant fee takes numberOfPeriod 0 and totalDuration 0.
 */
export function getFeeSchedulerParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    baseFeeMode: BaseFeeMode,
    numberOfPeriod: number,
    totalDuration: number
): BaseFee {
    if (
        baseFeeMode !== BaseFeeMode.FeeSchedulerLinear &&
        baseFeeMode !== BaseFeeMode.FeeSchedulerExponential
    ) {
        throw new Error(ProgramError.InvalidBaseFeeMode)
    }
    assertFeeBpsRange('startingBaseFeeBps', startingBaseFeeBps)
    assertFeeBpsRange('endingBaseFeeBps', endingBaseFeeBps)
    if (endingBaseFeeBps > startingBaseFeeBps) {
        throw new Error(
            'endingBaseFeeBps must be less than or equal to startingBaseFeeBps'
        )
    }

    if (startingBaseFeeBps === endingBaseFeeBps) {
        if (numberOfPeriod !== 0 || totalDuration !== 0) {
            throw new Error(
                'numberOfPeriod and totalDuration must both be zero when the fee is constant'
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

    if (numberOfPeriod <= 0 || totalDuration <= 0) {
        throw new Error(
            'numberOfPeriod and totalDuration must both be greater than zero'
        )
    }
    if (numberOfPeriod > U16_MAX) {
        throw new Error(`numberOfPeriod must be at most ${U16_MAX}`)
    }
    const periodFrequency = Math.floor(totalDuration / numberOfPeriod)
    if (periodFrequency === 0) {
        throw new Error('totalDuration must be at least numberOfPeriod')
    }

    const maxBaseFeeNumerator = bpsToFeeNumerator(startingBaseFeeBps)
    const minBaseFeeNumerator = bpsToFeeNumerator(endingBaseFeeBps)
    const reductionFactor =
        baseFeeMode === BaseFeeMode.FeeSchedulerLinear
            ? maxBaseFeeNumerator.sub(minBaseFeeNumerator).divn(numberOfPeriod)
            : exponentialReductionFactor(
                  maxBaseFeeNumerator,
                  minBaseFeeNumerator,
                  numberOfPeriod
              )

    return {
        cliffFeeNumerator: maxBaseFeeNumerator,
        firstFactor: numberOfPeriod,
        secondFactor: new BN(periodFrequency),
        thirdFactor: reductionFactor,
        baseFeeMode,
    }
}

/** Ending fee in basis points, using the program's floor(numerator * 10_000 / FEE_DENOMINATOR). */
export function calculateFeeSchedulerEndingBaseFeeBps(
    cliffFeeNumerator: number,
    numberOfPeriod: number,
    periodFrequency: number,
    reductionFactor: number,
    baseFeeMode: BaseFeeMode
): number {
    if (numberOfPeriod === 0 || periodFrequency === 0) {
        return numeratorToBps(cliffFeeNumerator)
    }

    const baseFeeNumerator =
        baseFeeMode === BaseFeeMode.FeeSchedulerLinear
            ? cliffFeeNumerator - numberOfPeriod * reductionFactor
            : getFeeNumeratorOnExponentialFeeScheduler(
                  new BN(Math.floor(cliffFeeNumerator)),
                  new BN(Math.floor(reductionFactor)),
                  Math.floor(numberOfPeriod)
              ).toNumber()

    return numeratorToBps(baseFeeNumerator)
}

// a linear schedule that underflows reads as 0 bps rather than a negative number
function numeratorToBps(numerator: number): number {
    if (!Number.isFinite(numerator) || numerator <= 0) {
        return 0
    }
    return feeNumeratorToBps(new BN(Math.floor(numerator)))
}

/**
 * Build rate limiter parameters.
 * @deprecated The program rejects BaseFeeMode.RateLimiter for new configs.
 */
export function getRateLimiterParams(
    baseFeeBps: number,
    feeIncrementBps: number,
    referenceAmount: number,
    maxLimiterDuration: number,
    tokenQuoteDecimal: number,
    activationType: ActivationType
): BaseFee {
    if (
        baseFeeBps <= 0 ||
        feeIncrementBps <= 0 ||
        referenceAmount <= 0 ||
        maxLimiterDuration <= 0
    ) {
        throw new Error('All rate limiter parameters must be greater than zero')
    }
    assertFeeBpsRange('baseFeeBps', baseFeeBps)
    if (feeIncrementBps > MAX_FEE_BPS) {
        throw new Error(`feeIncrementBps must be at most ${MAX_FEE_BPS} bps`)
    }

    const cliffFeeNumerator = bpsToFeeNumerator(baseFeeBps)
    if (getMaxIndex(cliffFeeNumerator, new BN(feeIncrementBps)).isZero()) {
        throw new Error('Fee increment is too large for the given base fee')
    }

    const maxDuration =
        activationType === ActivationType.Slot
            ? MAX_RATE_LIMITER_DURATION_IN_SLOTS
            : MAX_RATE_LIMITER_DURATION_IN_SECONDS
    if (maxLimiterDuration > maxDuration) {
        throw new Error(`maxLimiterDuration must be at most ${maxDuration}`)
    }

    return {
        cliffFeeNumerator,
        firstFactor: feeIncrementBps,
        secondFactor: new BN(maxLimiterDuration),
        thirdFactor: convertToLamports(referenceAmount, tokenQuoteDecimal),
        baseFeeMode: BaseFeeMode.RateLimiter,
    }
}

/**
 * Dynamic fee parameters that add up to MAX_DYNAMIC_FEE_PERCENT of the base fee
 * at a price move of maxPriceChangeBps, using the program's bin step and
 * volatility defaults.
 */
export function getDynamicFeeParams(
    baseFeeBps: number,
    maxPriceChangeBps: number = MAX_PRICE_CHANGE_BPS_DEFAULT
): DynamicFeeParameters {
    if (maxPriceChangeBps > MAX_PRICE_CHANGE_BPS_DEFAULT) {
        throw new Error(
            `maxPriceChangeBps must be at most ${MAX_PRICE_CHANGE_BPS_DEFAULT}`
        )
    }

    const priceRatio = maxPriceChangeBps / MAX_BASIS_POINT + 1
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
    const maxVolatilityAccumulator = deltaBinId.muln(MAX_BASIS_POINT)
    const squareVfaBin = maxVolatilityAccumulator
        .mul(new BN(BIN_STEP_BPS_DEFAULT))
        .pow(new BN(2))

    const maxDynamicFeeNumerator = bpsToFeeNumerator(baseFeeBps)
        .muln(MAX_DYNAMIC_FEE_PERCENT)
        .divn(100)
    const variableFeeControl = maxDynamicFeeNumerator
        .mul(DYNAMIC_FEE_SCALING_FACTOR)
        .sub(DYNAMIC_FEE_ROUNDING_OFFSET)
        .div(squareVfaBin)

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

/** The fee the pre-migration pool ends on, which the migrated pool starts from. */
export function getStartingBaseFeeBpsFromBaseFeeParams(
    baseFeeParams: BaseFeeParams
): number {
    return baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter
        ? baseFeeParams.rateLimiterParam.baseFeeBps
        : baseFeeParams.feeSchedulerParam.endingFeeBps
}

/**
 * Build the DAMM v2 market cap fee scheduler for a migrated pool: the fee
 * decays from startingBaseFeeBps to endingBaseFeeBps over numberOfPeriod price
 * steps spanning priceMultiple times the migration price, and expires to the
 * ending fee after schedulerExpirationDuration seconds.
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
        dammV2BaseFeeMode !== DammV2BaseFeeMode.FeeMarketCapSchedulerLinear &&
        dammV2BaseFeeMode !== DammV2BaseFeeMode.FeeMarketCapSchedulerExponential
    ) {
        throw new Error(
            'dammV2BaseFeeMode must be FeeMarketCapSchedulerLinear or FeeMarketCapSchedulerExponential'
        )
    }
    if (numberOfPeriod <= 0 || numberOfPeriod > U16_MAX) {
        throw new Error(`numberOfPeriod must be between 1 and ${U16_MAX}`)
    }
    if (startingBaseFeeBps > MAX_FEE_BPS) {
        throw new Error(`startingBaseFeeBps must be at most ${MAX_FEE_BPS} bps`)
    }
    if (startingBaseFeeBps <= endingBaseFeeBps) {
        throw new Error(
            'startingBaseFeeBps must be greater than endingBaseFeeBps'
        )
    }
    if (priceMultiple <= 1) {
        throw new Error('priceMultiple must be greater than 1')
    }
    if (schedulerExpirationDuration <= 0) {
        throw new Error('schedulerExpirationDuration must be greater than zero')
    }

    const maxBaseFeeNumerator = bpsToFeeNumerator(startingBaseFeeBps)
    const minBaseFeeNumerator = bpsToFeeNumerator(endingBaseFeeBps)
    const reductionFactor =
        dammV2BaseFeeMode === DammV2BaseFeeMode.FeeMarketCapSchedulerLinear
            ? maxBaseFeeNumerator.sub(minBaseFeeNumerator).divn(numberOfPeriod)
            : exponentialReductionFactor(
                  maxBaseFeeNumerator,
                  minBaseFeeNumerator,
                  numberOfPeriod
              )

    return {
        numberOfPeriod,
        sqrtPriceStepBps: computeSqrtPriceStepBps(
            priceMultiple,
            numberOfPeriod
        ),
        schedulerExpirationDuration,
        reductionFactor,
    }
}

/** Fee scheduler parameters for a new config; RateLimiter is rejected. */
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
 * Migrated pool fee parameters for a DAMM v2 migration. A fixed
 * MigrationFeeOption uses a preset DAMM v2 config, so the program requires
 * every migrated pool fee field to be zero; Customizable takes migratedPoolFee.
 */
export function getMigratedPoolFeeParams(
    migrationOption: MigrationOption,
    migrationFeeOption: MigrationFeeOption,
    migratedPoolFee?: MigratedPoolFeeConfig
): MigratedPoolFeeResult {
    if (migrationOption === MigrationOption.MET_DAMM) {
        throw new Error(
            'MigrationOption.MET_DAMM (DAMM v1) is deprecated. New configs must use MigrationOption.MET_DAMM_V2.'
        )
    }

    if (migrationFeeOption !== MigrationFeeOption.Customizable) {
        if (
            migratedPoolFee?.marketCapFeeSchedulerParams ||
            (migratedPoolFee?.baseFeeMode !== undefined &&
                migratedPoolFee.baseFeeMode !==
                    DammV2BaseFeeMode.FeeTimeSchedulerLinear)
        ) {
            throw new Error(
                'migratedPoolFee.baseFeeMode and marketCapFeeSchedulerParams require MigrationFeeOption.Customizable'
            )
        }
        return {
            migratedPoolFee: DEFAULT_MIGRATED_POOL_FEE_PARAMS,
            migratedPoolBaseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            migratedPoolMarketCapFeeSchedulerParams:
                DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
            migrationFeeOption,
            compoundingFeeBps: 0,
        }
    }

    if (migratedPoolFee?.poolFeeBps === undefined) {
        throw new Error(
            'migratedPoolFee.poolFeeBps is required when migrationFeeOption is Customizable'
        )
    }

    const baseFeeMode =
        migratedPoolFee.baseFeeMode ?? DammV2BaseFeeMode.FeeTimeSchedulerLinear
    const scheduler = migratedPoolFee.marketCapFeeSchedulerParams
    const isMarketCapMode =
        baseFeeMode === DammV2BaseFeeMode.FeeMarketCapSchedulerLinear ||
        baseFeeMode === DammV2BaseFeeMode.FeeMarketCapSchedulerExponential
    if (Boolean(scheduler) !== isMarketCapMode) {
        throw new Error(
            'marketCapFeeSchedulerParams must be set exactly when baseFeeMode is a market cap scheduler'
        )
    }

    return {
        migratedPoolFee: {
            collectFeeMode: migratedPoolFee.collectFeeMode,
            dynamicFee: migratedPoolFee.dynamicFee,
            poolFeeBps: migratedPoolFee.poolFeeBps,
        },
        migratedPoolBaseFeeMode: baseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams: scheduler
            ? getMigratedPoolMarketCapFeeSchedulerParams(
                  migratedPoolFee.poolFeeBps,
                  scheduler.endingBaseFeeBps,
                  baseFeeMode,
                  scheduler.numberOfPeriod,
                  scheduler.priceMultiple,
                  scheduler.schedulerExpirationDuration
              )
            : DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
        migrationFeeOption,
        compoundingFeeBps: migratedPoolFee.compoundingFeeBps ?? 0,
    }
}
