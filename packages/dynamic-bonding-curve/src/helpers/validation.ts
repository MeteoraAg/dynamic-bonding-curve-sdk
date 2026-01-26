import BN from 'bn.js'
import {
    MAX_CREATOR_MIGRATION_FEE_PERCENTAGE,
    MAX_CURVE_POINT,
    MAX_MIGRATED_POOL_FEE_BPS,
    MAX_MIGRATION_FEE_PERCENTAGE,
    MAX_SQRT_PRICE,
    MIN_MIGRATED_POOL_FEE_BPS,
    MIN_SQRT_PRICE,
    MIN_POOL_CREATION_FEE,
    MAX_POOL_CREATION_FEE,
    MIN_LOCKED_LIQUIDITY_BPS,
    SECONDS_PER_DAY,
    BIN_STEP_BPS_U128_DEFAULT,
    BIN_STEP_BPS_DEFAULT,
    MAX_BASIS_POINT,
    U24_MAX,
} from '../constants'
import {
    ActivationType,
    BaseFeeMode,
    CollectFeeMode,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    DynamicFeeParameters,
    LiquidityVestingInfoParameters,
    LockedVestingParameters,
    MigratedPoolFee,
    MigratedPoolMarketCapFeeSchedulerParameters,
    MigrationFeeOption,
    MigrationOption,
    PoolFeeParameters,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
    type CreateConfigParams,
    type PoolConfig,
} from '../types'
import { Connection, PublicKey } from '@solana/web3.js'
import {
    calculateLockedLiquidityBpsAtTime,
    getBaseTokenForSwap,
    getMigrationBaseToken,
    getMigrationQuoteAmountFromMigrationQuoteThreshold,
    getMigrationThresholdPrice,
    getSwapAmountWithBuffer,
    getTotalTokenSupply,
} from './common'
import {
    convertDecimalToBN,
    isDefaultLockedVesting,
    isNativeSol,
} from './utils'
import Decimal from 'decimal.js'
import {
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
    MAX_RATE_LIMITER_DURATION_IN_SECONDS,
    MAX_RATE_LIMITER_DURATION_IN_SLOTS,
    MIN_FEE_NUMERATOR,
} from '../constants'
import {
    getFeeNumeratorFromIncludedAmount,
    getFeeSchedulerMaxBaseFeeNumerator,
    getFeeSchedulerMinBaseFeeNumerator,
    toNumerator,
} from '../math'

/**
 * Validate the pool fees
 * @param poolFees - The pool fees
 * @param collectFeeMode - The collect fee mode
 * @param activationType - The activation type
 * @returns true if the pool fees are valid, false otherwise
 */
export function validatePoolFees(
    poolFees: PoolFeeParameters,
    collectFeeMode: CollectFeeMode,
    activationType: ActivationType
): boolean {
    if (!poolFees) return false

    // check base fee if it exists
    if (poolFees.baseFee) {
        if (poolFees.baseFee.cliffFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR))) {
            return false
        }

        // validate fee scheduler if it exists
        if (
            poolFees.baseFee.baseFeeMode === BaseFeeMode.FeeSchedulerLinear ||
            poolFees.baseFee.baseFeeMode === BaseFeeMode.FeeSchedulerExponential
        ) {
            if (
                !validateFeeScheduler(
                    poolFees.baseFee.firstFactor,
                    new BN(poolFees.baseFee.secondFactor),
                    new BN(poolFees.baseFee.thirdFactor),
                    poolFees.baseFee.cliffFeeNumerator,
                    poolFees.baseFee.baseFeeMode
                )
            ) {
                return false
            }
        }

        // validate fee rate limiter if it exists
        if (poolFees.baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
            if (
                !validateFeeRateLimiter(
                    poolFees.baseFee.cliffFeeNumerator,
                    new BN(poolFees.baseFee.firstFactor),
                    new BN(poolFees.baseFee.secondFactor),
                    new BN(poolFees.baseFee.thirdFactor),
                    collectFeeMode,
                    activationType
                )
            ) {
                return false
            }
        }
    }

    return true
}

/**
 * Validate fee scheduler parameters
 * @param numberOfPeriod Number of periods
 * @param periodFrequency Period frequency
 * @param reductionFactor Reduction factor
 * @param cliffFeeNumerator Cliff fee numerator
 * @returns Validation result
 */
export function validateFeeScheduler(
    numberOfPeriod: number,
    periodFrequency: BN,
    reductionFactor: BN,
    cliffFeeNumerator: BN,
    baseFeeMode: BaseFeeMode
): boolean {
    if (
        !periodFrequency.eq(new BN(0)) ||
        numberOfPeriod !== 0 ||
        !reductionFactor.eq(new BN(0))
    ) {
        if (
            numberOfPeriod === 0 ||
            periodFrequency.eq(new BN(0)) ||
            reductionFactor.eq(new BN(0))
        ) {
            return false
        }
    }

    const minFeeNumerator = getFeeSchedulerMinBaseFeeNumerator(
        cliffFeeNumerator,
        numberOfPeriod,
        reductionFactor,
        baseFeeMode
    )
    const maxFeeNumerator =
        getFeeSchedulerMaxBaseFeeNumerator(cliffFeeNumerator)

    // Validate fee fractions - check if within valid range
    if (
        minFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        maxFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        return false
    }

    return true
}

/**
 * Validate rate limiter parameters
 * @param cliffFeeNumerator - Cliff fee numerator
 * @param feeIncrementBps - Fee increment bps
 * @param maxLimiterDuration - Max limiter duration
 * @param referenceAmount - Reference amount
 * @param collectFeeMode - Collect fee mode
 * @param activationType - Activation type (slot or timestamp)
 * @returns Validation result
 */
export function validateFeeRateLimiter(
    cliffFeeNumerator: BN,
    feeIncrementBps: BN,
    maxLimiterDuration: BN,
    referenceAmount: BN,
    collectFeeMode: CollectFeeMode,
    activationType: ActivationType
): boolean {
    // Can only be applied in quote token collect fee mode
    if (collectFeeMode !== CollectFeeMode.QuoteToken) {
        return false
    }

    const isZeroRateLimiter =
        referenceAmount.eq(new BN(0)) &&
        maxLimiterDuration.eq(new BN(0)) &&
        feeIncrementBps.eq(new BN(0))

    if (isZeroRateLimiter) {
        return true
    }

    const isNonZeroRateLimiter =
        referenceAmount.gt(new BN(0)) &&
        maxLimiterDuration.gt(new BN(0)) &&
        feeIncrementBps.gt(new BN(0))

    if (!isNonZeroRateLimiter) {
        return false
    }

    const maxLimiterDurationLimit =
        activationType === ActivationType.Slot
            ? new BN(MAX_RATE_LIMITER_DURATION_IN_SLOTS)
            : new BN(MAX_RATE_LIMITER_DURATION_IN_SECONDS)

    if (maxLimiterDuration.gt(maxLimiterDurationLimit)) {
        return false
    }

    const feeIncrementNumerator = toNumerator(
        feeIncrementBps,
        new BN(FEE_DENOMINATOR)
    )
    if (feeIncrementNumerator.gte(new BN(FEE_DENOMINATOR))) {
        return false
    }

    if (
        cliffFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        cliffFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        return false
    }

    // Validate max fee (more amount, then more fee)
    const minFeeNumerator = getFeeNumeratorFromIncludedAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        new BN(0)
    )
    const maxFeeNumerator = getFeeNumeratorFromIncludedAmount(
        cliffFeeNumerator,
        referenceAmount,
        feeIncrementBps,
        new BN(Number.MAX_SAFE_INTEGER)
    )

    return (
        minFeeNumerator.gte(new BN(MIN_FEE_NUMERATOR)) &&
        maxFeeNumerator.lte(new BN(MAX_FEE_NUMERATOR))
    )
}

export function validateDynamicFee(
    dynamicFee: DynamicFeeParameters | undefined
): boolean {
    if (!dynamicFee) return true // Optional field

    if (dynamicFee.binStep !== BIN_STEP_BPS_DEFAULT) return false
    if (!dynamicFee.binStepU128.eq(BIN_STEP_BPS_U128_DEFAULT)) return false
    if (dynamicFee.filterPeriod >= dynamicFee.decayPeriod) return false
    if (dynamicFee.reductionFactor > MAX_BASIS_POINT) return false
    if (dynamicFee.variableFeeControl > U24_MAX) return false
    if (dynamicFee.maxVolatilityAccumulator > U24_MAX) return false

    return true
}

/**
 * Validate the collect fee mode
 * @param collectFeeMode - The collect fee mode
 * @returns true if the collect fee mode is valid, false otherwise
 */
export function validateCollectFeeMode(
    collectFeeMode: CollectFeeMode
): boolean {
    return [CollectFeeMode.QuoteToken, CollectFeeMode.OutputToken].includes(
        collectFeeMode
    )
}

/**
 * Validate the migration and token type
 * @param migrationOption - The migration option
 * @param tokenType - The token type
 * @returns true if the migration and token type are valid, false otherwise
 */
export function validateMigrationAndTokenType(
    migrationOption: MigrationOption,
    tokenType: TokenType
): boolean {
    if (migrationOption === MigrationOption.MET_DAMM) {
        return tokenType === TokenType.SPL
    }
    return true
}

/**
 * Validate the activation type
 * @param activationType - The activation type
 * @returns true if the activation type is valid, false otherwise
 */
export function validateActivationType(
    activationType: ActivationType
): boolean {
    return [ActivationType.Slot, ActivationType.Timestamp].includes(
        activationType
    )
}

/**
 * Validate the migration fee option
 * @param migrationFeeOption - The migration fee option
 * @param migrationOption - The migration option
 * @returns true if the migration fee option is valid, false otherwise
 */
export function validateMigrationFeeOption(
    migrationFeeOption: MigrationFeeOption,
    migrationOption?: MigrationOption
): boolean {
    const validOptions = [
        MigrationFeeOption.FixedBps25,
        MigrationFeeOption.FixedBps30,
        MigrationFeeOption.FixedBps100,
        MigrationFeeOption.FixedBps200,
        MigrationFeeOption.FixedBps400,
        MigrationFeeOption.FixedBps600,
    ]

    // Customizable is only allowed for MET_DAMM_V2 migration
    if (migrationFeeOption === MigrationFeeOption.Customizable) {
        return migrationOption === MigrationOption.MET_DAMM_V2
    }

    return validOptions.includes(migrationFeeOption)
}

/**
 * Validate the token decimals
 * @param tokenDecimal - The token decimal
 * @returns true if the token decimal is valid, false otherwise
 */
export function validateTokenDecimals(tokenDecimal: TokenDecimal): boolean {
    return tokenDecimal >= TokenDecimal.SIX && tokenDecimal <= TokenDecimal.NINE
}

/**
 * Validate the LP percentages
 * @param partnerLiquidityPercentage - The partner liquidity percentage
 * @param partnerPermanentLockedLiquidityPercentage - The partner permanent locked liquidity percentage
 * @param creatorLiquidityPercentage - The creator liquidity percentage
 * @param creatorPermanentLockedLiquidityPercentage - The creator permanent locked liquidity percentage
 * @param partnerVestingPercentage - The partner vesting percentage (optional, defaults to 0)
 * @param creatorVestingPercentage - The creator vesting percentage (optional, defaults to 0)
 * @returns true if the LP percentages are valid, false otherwise
 */
export function validateLPPercentages(
    partnerLiquidityPercentage: number,
    partnerPermanentLockedLiquidityPercentage: number,
    creatorLiquidityPercentage: number,
    creatorPermanentLockedLiquidityPercentage: number,
    partnerVestingPercentage: number,
    creatorVestingPercentage: number
): boolean {
    const totalLPPercentage =
        partnerLiquidityPercentage +
        partnerPermanentLockedLiquidityPercentage +
        creatorLiquidityPercentage +
        creatorPermanentLockedLiquidityPercentage +
        partnerVestingPercentage +
        creatorVestingPercentage
    return totalLPPercentage === 100
}

/**
 * Validate the curve
 * @param curve - The curve
 * @param sqrtStartPrice - The sqrt start price
 * @returns true if the curve is valid, false otherwise
 */
export function validateCurve(
    curve: Array<{ sqrtPrice: BN; liquidity: BN }>,
    sqrtStartPrice: BN
): boolean {
    if (!curve || curve.length === 0 || curve.length > MAX_CURVE_POINT) {
        return false
    }

    // first curve point validation
    if (
        curve[0]?.sqrtPrice.lte(sqrtStartPrice) ||
        curve[0]?.liquidity.lte(new BN(0)) ||
        curve[0]?.sqrtPrice.gt(new BN(MAX_SQRT_PRICE))
    ) {
        return false
    }

    // validate curve points are in ascending order and have positive liquidity
    for (let i = 1; i < curve.length; i++) {
        const currentPoint = curve[i]
        const previousPoint = curve[i - 1]

        if (!currentPoint || !previousPoint) {
            return false
        }

        if (
            currentPoint.sqrtPrice.lte(previousPoint.sqrtPrice) ||
            currentPoint.liquidity.lte(new BN(0))
        ) {
            return false
        }
    }

    // validate last curve point
    return !curve[curve.length - 1]?.sqrtPrice.gt(new BN(MAX_SQRT_PRICE))
}

/**
 * Validate token supply
 * @param tokenSupply - The token supply
 * @param leftoverReceiver - The leftover receiver
 * @param swapBaseAmount - The swap base amount
 * @param migrationBaseAmount - The migration base amount
 * @param lockedVesting - The locked vesting parameters
 * @param swapBaseAmountBuffer - The swap base amount buffer
 * @returns true if the token supply is valid, false otherwise
 */
export function validateTokenSupply(
    tokenSupply: {
        preMigrationTokenSupply: BN
        postMigrationTokenSupply: BN
    },
    leftoverReceiver: PublicKey,
    swapBaseAmount: BN,
    migrationBaseAmount: BN,
    lockedVesting: LockedVestingParameters,
    swapBaseAmountBuffer: BN
): boolean {
    if (!tokenSupply) return true

    if (!leftoverReceiver) {
        return false
    }

    // Check if it's a PublicKey instance
    if (!(leftoverReceiver instanceof PublicKey)) {
        return false
    }

    // Check if it's not the default public key (all zeros)
    if (leftoverReceiver.equals(PublicKey.default)) {
        return false
    }

    const minimumBaseSupplyWithBuffer = getTotalTokenSupply(
        swapBaseAmountBuffer,
        migrationBaseAmount,
        lockedVesting
    )

    const minimumBaseSupplyWithoutBuffer = getTotalTokenSupply(
        swapBaseAmount,
        migrationBaseAmount,
        lockedVesting
    )

    return !(
        minimumBaseSupplyWithoutBuffer.gt(
            new BN(tokenSupply.postMigrationTokenSupply)
        ) ||
        new BN(tokenSupply.postMigrationTokenSupply).gt(
            new BN(tokenSupply.preMigrationTokenSupply)
        ) ||
        minimumBaseSupplyWithBuffer.gt(
            new BN(tokenSupply.preMigrationTokenSupply)
        )
    )
}

/**
 * Validate the update authority option
 * @param option  - The update authority option
 * @returns true if the token update authority option is valid, false otherwise
 */
export function validateTokenUpdateAuthorityOptions(
    option: TokenUpdateAuthorityOption
): boolean {
    return [
        TokenUpdateAuthorityOption.CreatorUpdateAuthority,
        TokenUpdateAuthorityOption.Immutable,
        TokenUpdateAuthorityOption.PartnerUpdateAuthority,
        TokenUpdateAuthorityOption.CreatorUpdateAndMintAuthority,
        TokenUpdateAuthorityOption.PartnerUpdateAndMintAuthority,
    ].includes(option)
}

/**
 * Validate pool creation fee
 * @param poolCreationFee - The pool creation fee in lamports
 * @returns true if the pool creation fee is valid, false otherwise
 */
export function validatePoolCreationFee(poolCreationFee: BN): boolean {
    if (poolCreationFee.eq(new BN(0))) {
        return true
    }

    return (
        poolCreationFee.gte(new BN(MIN_POOL_CREATION_FEE)) &&
        poolCreationFee.lte(new BN(MAX_POOL_CREATION_FEE))
    )
}

/**
 * Validate the liquidity vesting info parameters
 * @param vestingInfo - The liquidity vesting info parameters
 * @returns true if valid, false otherwise
 */
export function validateLiquidityVestingInfo(
    vestingInfo: LiquidityVestingInfoParameters
): boolean {
    const isZero =
        vestingInfo.vestingPercentage === 0 &&
        vestingInfo.bpsPerPeriod === 0 &&
        vestingInfo.numberOfPeriods === 0 &&
        vestingInfo.cliffDurationFromMigrationTime === 0 &&
        vestingInfo.frequency === 0

    if (isZero) {
        return true
    }

    if (
        vestingInfo.vestingPercentage < 0 ||
        vestingInfo.vestingPercentage > 100
    ) {
        return false
    }

    if (vestingInfo.vestingPercentage > 0 && vestingInfo.frequency === 0) {
        return false
    }

    return true
}

/**
 * Validate that the minimum locked liquidity requirement is met at day 1
 * The program requires at least MIN_LOCKED_LIQUIDITY_BPS (1000 = 10%) to be locked at SECONDS_PER_DAY (86400 seconds) after migration.
 * @param partnerPermanentLockedLiquidityPercentage - Partner's permanently locked liquidity percentage
 * @param creatorPermanentLockedLiquidityPercentage - Creator's permanently locked liquidity percentage
 * @param partnerLiquidityVestingInfo - Partner's liquidity vesting info (optional)
 * @param creatorLiquidityVestingInfo - Creator's liquidity vesting info (optional)
 * @returns true if the minimum locked liquidity requirement is met, false otherwise
 */
export function validateMinimumLockedLiquidity(
    partnerPermanentLockedLiquidityPercentage: number,
    creatorPermanentLockedLiquidityPercentage: number,
    partnerLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined,
    creatorLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined
): boolean {
    const lockedBpsAtDay1 = calculateLockedLiquidityBpsAtTime(
        partnerPermanentLockedLiquidityPercentage,
        creatorPermanentLockedLiquidityPercentage,
        partnerLiquidityVestingInfo,
        creatorLiquidityVestingInfo,
        SECONDS_PER_DAY
    )

    return lockedBpsAtDay1 >= MIN_LOCKED_LIQUIDITY_BPS
}

export function validateMigratedPoolFee(
    migratedPoolFee: MigratedPoolFee,
    migrationOption?: MigrationOption,
    migrationFeeOption?: MigrationFeeOption
): boolean {
    // check if migratedPoolFee is empty (all fields are 0)
    const isEmpty = () => {
        return (
            migratedPoolFee.collectFeeMode === 0 &&
            migratedPoolFee.dynamicFee === 0 &&
            migratedPoolFee.poolFeeBps === 0
        )
    }

    // check if migration fee option and migration option is provided
    if (migrationOption !== undefined && migrationFeeOption !== undefined) {
        // For MeteoraDamm migration, migratedPoolFee must be empty
        if (migrationOption === MigrationOption.MET_DAMM) {
            return isEmpty()
        }

        // For DammV2 migration
        if (migrationOption === MigrationOption.MET_DAMM_V2) {
            // If using fixed fee options (0-5), migratedPoolFee must be empty
            if (migrationFeeOption !== MigrationFeeOption.Customizable) {
                return isEmpty()
            }
        }
    }

    // If migratedPoolFee is empty, it's valid (for when it must be empty)
    if (isEmpty()) {
        return true
    }

    // Validate pool fee BPS (between 10 and 1000 basis points)
    if (
        migratedPoolFee.poolFeeBps < MIN_MIGRATED_POOL_FEE_BPS ||
        migratedPoolFee.poolFeeBps > MAX_MIGRATED_POOL_FEE_BPS
    ) {
        return false
    }

    // Validate collect fee mode (0 = QuoteToken, 1 = OutputToken)
    if (!validateCollectFeeMode(migratedPoolFee.collectFeeMode)) {
        return false
    }

    // Validate dynamic fee (0 = Disable, 1 = Enable)
    if (
        migratedPoolFee.dynamicFee !== DammV2DynamicFeeMode.Disabled &&
        migratedPoolFee.dynamicFee !== DammV2DynamicFeeMode.Enabled
    ) {
        return false
    }

    return true
}

/**
 * Validate the config parameters
 * @param configParam - The config parameters
 */
export function validateConfigParameters(
    configParam: Omit<
        CreateConfigParams,
        'config' | 'feeClaimer' | 'quoteMint' | 'payer'
    >
) {
    // Pool fees validation
    if (!configParam.poolFees) {
        throw new Error('Pool fees are required')
    }
    if (
        !validatePoolFees(
            configParam.poolFees,
            configParam.collectFeeMode,
            configParam.activationType
        )
    ) {
        throw new Error('Invalid pool fees')
    }

    // DBC collect fee mode validation
    if (!validateCollectFeeMode(configParam.collectFeeMode)) {
        throw new Error('Invalid collect fee mode')
    }

    // Update token authority option validation
    if (
        !validateTokenUpdateAuthorityOptions(configParam.tokenUpdateAuthority)
    ) {
        throw new Error('Invalid option for token update authority')
    }

    // Migration and token type validation
    if (
        !validateMigrationAndTokenType(
            configParam.migrationOption,
            configParam.tokenType
        )
    ) {
        throw new Error('Token type must be SPL for MeteoraDamm migration')
    }

    // Activation type validation
    if (!validateActivationType(configParam.activationType)) {
        throw new Error('Invalid activation type')
    }

    // Migration fee validation
    if (
        !validateMigrationFeeOption(
            configParam.migrationFeeOption,
            configParam.migrationOption
        )
    ) {
        throw new Error('Invalid migration fee option')
    }

    // Migration fee percentages validation
    if (!validateMigrationFee(configParam.migrationFee)) {
        throw new Error('Invalid migration fee')
    }

    // Creator trading fee percentage validation
    if (
        configParam.creatorTradingFeePercentage < 0 ||
        configParam.creatorTradingFeePercentage > 100
    ) {
        throw new Error(
            'Creator trading fee percentage must be between 0 and 100'
        )
    }

    // Token decimals validation
    if (!validateTokenDecimals(configParam.tokenDecimal)) {
        throw new Error('Token decimal must be between 6 and 9')
    }

    // Get vesting percentages (default to 0 if not provided)
    const partnerVestingPercentage =
        configParam.partnerLiquidityVestingInfo?.vestingPercentage ?? 0
    const creatorVestingPercentage =
        configParam.creatorLiquidityVestingInfo?.vestingPercentage ?? 0

    // LP percentages validation
    if (
        !validateLPPercentages(
            configParam.partnerLiquidityPercentage,
            configParam.partnerPermanentLockedLiquidityPercentage,
            configParam.creatorLiquidityPercentage,
            configParam.creatorPermanentLockedLiquidityPercentage,
            partnerVestingPercentage,
            creatorVestingPercentage
        )
    ) {
        throw new Error('Sum of LP percentages must equal 100')
    }

    // Pool creation fee validation
    if (!validatePoolCreationFee(configParam.poolCreationFee)) {
        throw new Error(
            `Pool creation fee must be 0 or between ${MIN_POOL_CREATION_FEE} and ${MAX_POOL_CREATION_FEE} lamports`
        )
    }

    // Liquidity vesting info validation based on migration option
    if (configParam.migrationOption === MigrationOption.MET_DAMM) {
        // For MeteoraDamm migration, vesting info must be zero/empty
        const isPartnerVestingZero =
            !configParam.partnerLiquidityVestingInfo ||
            (configParam.partnerLiquidityVestingInfo.vestingPercentage === 0 &&
                configParam.partnerLiquidityVestingInfo.bpsPerPeriod === 0 &&
                configParam.partnerLiquidityVestingInfo.numberOfPeriods === 0 &&
                configParam.partnerLiquidityVestingInfo
                    .cliffDurationFromMigrationTime === 0 &&
                configParam.partnerLiquidityVestingInfo.frequency === 0)

        const isCreatorVestingZero =
            !configParam.creatorLiquidityVestingInfo ||
            (configParam.creatorLiquidityVestingInfo.vestingPercentage === 0 &&
                configParam.creatorLiquidityVestingInfo.bpsPerPeriod === 0 &&
                configParam.creatorLiquidityVestingInfo.numberOfPeriods === 0 &&
                configParam.creatorLiquidityVestingInfo
                    .cliffDurationFromMigrationTime === 0 &&
                configParam.creatorLiquidityVestingInfo.frequency === 0)

        if (!isPartnerVestingZero || !isCreatorVestingZero) {
            throw new Error(
                'Liquidity vesting is not supported for MeteoraDamm migration'
            )
        }
    } else if (configParam.migrationOption === MigrationOption.MET_DAMM_V2) {
        // For DammV2 migration, validate vesting info if provided
        if (configParam.partnerLiquidityVestingInfo) {
            if (
                !validateLiquidityVestingInfo(
                    configParam.partnerLiquidityVestingInfo
                )
            ) {
                throw new Error('Invalid partner liquidity vesting info')
            }
        }
        if (configParam.creatorLiquidityVestingInfo) {
            if (
                !validateLiquidityVestingInfo(
                    configParam.creatorLiquidityVestingInfo
                )
            ) {
                throw new Error('Invalid creator liquidity vesting info')
            }
        }
    }

    // Migration sqrt price validation
    const sqrtMigrationPrice = getMigrationThresholdPrice(
        configParam.migrationQuoteThreshold,
        configParam.sqrtStartPrice,
        configParam.curve
    )
    if (sqrtMigrationPrice.gte(new BN(MAX_SQRT_PRICE))) {
        throw new Error('Migration sqrt price exceeds maximum')
    }

    // The program requires at least 10% (1000 BPS) of liquidity to be locked at day 1
    if (
        !validateMinimumLockedLiquidity(
            configParam.partnerPermanentLockedLiquidityPercentage,
            configParam.creatorPermanentLockedLiquidityPercentage,
            configParam.partnerLiquidityVestingInfo,
            configParam.creatorLiquidityVestingInfo
        )
    ) {
        const lockedBpsAtDay1 = calculateLockedLiquidityBpsAtTime(
            configParam.partnerPermanentLockedLiquidityPercentage,
            configParam.creatorPermanentLockedLiquidityPercentage,
            configParam.partnerLiquidityVestingInfo,
            configParam.creatorLiquidityVestingInfo,
            SECONDS_PER_DAY
        )
        throw new Error(
            `Invalid migration locked liquidity. At least ${MIN_LOCKED_LIQUIDITY_BPS} BPS (10%) must be locked at day 1. ` +
                `Current locked liquidity at day 1: ${lockedBpsAtDay1} BPS. ` +
                `Consider increasing permanent locked liquidity percentage or extending vesting duration/cliff.`
        )
    }

    // Migration quote threshold validation
    if (configParam.migrationQuoteThreshold.lte(new BN(0))) {
        throw new Error('Migration quote threshold must be greater than 0')
    }

    // Price validation
    if (
        new BN(configParam.sqrtStartPrice).lt(new BN(MIN_SQRT_PRICE)) ||
        new BN(configParam.sqrtStartPrice).gte(new BN(MAX_SQRT_PRICE))
    ) {
        throw new Error('Invalid sqrt start price')
    }

    // Migrated pool fee validation
    if (configParam.migratedPoolFee) {
        if (
            !validateMigratedPoolFee(
                configParam.migratedPoolFee,
                configParam.migrationOption,
                configParam.migrationFeeOption
            )
        ) {
            throw new Error('Invalid migrated pool fee parameters')
        }
    }

    // Migrated pool base fee mode and market cap fee scheduler params validation (DAMM V2 only)
    if (configParam.migrationOption === MigrationOption.MET_DAMM_V2) {
        validateMigratedPoolBaseFeeMode(
            configParam.migratedPoolBaseFeeMode,
            configParam.migratedPoolMarketCapFeeSchedulerParams,
            configParam.migrationOption
        )
    }

    // Curve validation
    if (!validateCurve(configParam.curve, configParam.sqrtStartPrice)) {
        throw new Error('Invalid curve')
    }

    // Locked vesting validation
    if (!isDefaultLockedVesting(configParam.lockedVesting)) {
        try {
            const totalAmount = configParam.lockedVesting.cliffUnlockAmount.add(
                configParam.lockedVesting.amountPerPeriod.mul(
                    new BN(configParam.lockedVesting.numberOfPeriod)
                )
            )
            if (
                configParam.lockedVesting.frequency.eq(new BN(0)) ||
                totalAmount.eq(new BN(0))
            ) {
                throw new Error('Invalid vesting parameters')
            }
        } catch (error) {
            throw new Error(`Invalid vesting parameters ${error}`)
        }
    }

    // Token supply validation
    if (configParam.tokenSupply) {
        const sqrtMigrationPrice = getMigrationThresholdPrice(
            configParam.migrationQuoteThreshold,
            configParam.sqrtStartPrice,
            configParam.curve
        )

        const swapBaseAmount = getBaseTokenForSwap(
            configParam.sqrtStartPrice,
            sqrtMigrationPrice,
            configParam.curve
        )

        const migrationBaseAmount = getMigrationBaseToken(
            convertDecimalToBN(
                getMigrationQuoteAmountFromMigrationQuoteThreshold(
                    new Decimal(configParam.migrationQuoteThreshold.toString()),
                    configParam.migrationFee.feePercentage
                )
            ),
            sqrtMigrationPrice,
            configParam.migrationOption
        )

        const swapBaseAmountBuffer = getSwapAmountWithBuffer(
            swapBaseAmount,
            configParam.sqrtStartPrice,
            configParam.curve
        )

        if (
            !validateTokenSupply(
                configParam.tokenSupply,
                new PublicKey(configParam.leftoverReceiver),
                swapBaseAmount,
                migrationBaseAmount,
                configParam.lockedVesting,
                swapBaseAmountBuffer
            )
        ) {
            throw new Error('Invalid token supply')
        }
    }
}

/**
 * Validate that the base token type matches the pool config token type
 * @param baseTokenType - The base token type from create pool parameters
 * @param poolConfig - The pool config state
 * @returns true if the token types match, false otherwise
 */
export function validateBaseTokenType(
    baseTokenType: TokenType,
    poolConfig: PoolConfig
): boolean {
    return baseTokenType === poolConfig.tokenType
}

/**
 * Validate that the user has sufficient balance for the swap
 * @param connection - The Solana connection
 * @param owner - The owner's public key
 * @param inputMint - The mint of the input token
 * @param amountIn - The input amount for the swap
 * @param inputTokenAccount - The token account to check balance for
 * @returns true if the balance is sufficient, throws error if insufficient
 */
export async function validateBalance(
    connection: Connection,
    owner: PublicKey,
    inputMint: PublicKey,
    amountIn: BN,
    inputTokenAccount: PublicKey
): Promise<boolean> {
    const isSOLInput = isNativeSol(inputMint)

    if (isSOLInput) {
        const balance = await connection.getBalance(owner)
        const requiredBalance = BigInt(amountIn.toString()) + BigInt(10000000) // Add 0.01 SOL for fees and rent

        if (balance < Number(requiredBalance)) {
            throw new Error(
                `Insufficient SOL balance. Required: ${requiredBalance.toString()} lamports, Found: ${balance} lamports`
            )
        }
    } else {
        try {
            const tokenBalance =
                await connection.getTokenAccountBalance(inputTokenAccount)
            const balance = new BN(tokenBalance.value.amount)

            if (balance.lt(amountIn)) {
                throw new Error(
                    `Insufficient token balance. Required: ${amountIn.toString()}, Found: ${balance.toString()}`
                )
            }
        } catch (error) {
            throw new Error(
                `Failed to fetch token balance or token account doesn't exist ${error}`
            )
        }
    }

    return true
}

/**
 * Validate that the swap amount is valid
 * @param amountIn - The input amount for the swap
 * @returns true if the amount is valid, throws error if invalid
 */
export function validateSwapAmount(amountIn: BN): boolean {
    if (amountIn.lte(new BN(0))) {
        throw new Error('Swap amount must be greater than 0')
    }
    return true
}

/**
 * Validate the migrated pool base fee mode and market cap fee scheduler params
 * @param migratedPoolBaseFeeMode - The base fee mode for the migrated pool
 * @param migratedPoolMarketCapFeeSchedulerParams - The market cap fee scheduler params
 * @param migrationOption - The migration option (optional - only validates for DAMM V2)
 * @returns true if valid
 * @throws Error if invalid
 */
export function validateMigratedPoolBaseFeeMode(
    migratedPoolBaseFeeMode: DammV2BaseFeeMode,
    migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParameters,
    migrationOption?: MigrationOption
): boolean {
    // only validate for DAMM V2 migration
    if (
        migrationOption !== undefined &&
        migrationOption !== MigrationOption.MET_DAMM_V2
    ) {
        return true
    }

    // mode 2 (RateLimiter) is not supported for DAMM V2 migration
    if (migratedPoolBaseFeeMode === DammV2BaseFeeMode.RateLimiter) {
        throw new Error(
            'RateLimiter (mode 2) is not supported for DAMM V2 migration. ' +
                'Use FeeTimeSchedulerLinear (0), FeeTimeSchedulerExponential (1), ' +
                'FeeMarketCapSchedulerLinear (3), or FeeMarketCapSchedulerExponential (4) instead.'
        )
    }

    const isFixedFeeParams =
        migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod === 0 &&
        migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps === 0 &&
        migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration ===
            0 &&
        migratedPoolMarketCapFeeSchedulerParams.reductionFactor.eq(new BN(0))

    // modes 0 and 1 (time-based schedulers) only work as fixed fee
    if (
        migratedPoolBaseFeeMode === DammV2BaseFeeMode.FeeTimeSchedulerLinear ||
        migratedPoolBaseFeeMode ===
            DammV2BaseFeeMode.FeeTimeSchedulerExponential
    ) {
        if (!isFixedFeeParams) {
            throw new Error(
                `FeeTimeSchedulerLinear (0) and FeeTimeSchedulerExponential (1) modes ` +
                    `only work as fixed fee for migrated pools. All market cap fee scheduler params must be 0: ` +
                    `numberOfPeriod, sqrtPriceStepBps, schedulerExpirationDuration, and reductionFactor.`
            )
        }
        return true
    }

    // modes 3 and 4 (market cap-based schedulers) require full validation
    if (
        migratedPoolBaseFeeMode ===
            DammV2BaseFeeMode.FeeMarketCapSchedulerLinear ||
        migratedPoolBaseFeeMode ===
            DammV2BaseFeeMode.FeeMarketCapSchedulerExponential
    ) {
        // for market cap modes, params should NOT all be zero (otherwise use time-based modes)
        if (isFixedFeeParams) {
            // allow fixed fee params for market cap modes too (they will behave as fixed fee)
            return true
        }

        // validate that all required params are provided
        if (
            migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod <= 0 ||
            migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps <= 0 ||
            migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration <=
                0
        ) {
            throw new Error(
                `For FeeMarketCapSchedulerLinear (3) and FeeMarketCapSchedulerExponential (4) modes, ` +
                    `if using dynamic fee scheduling, numberOfPeriod, sqrtPriceStepBps, and ` +
                    `schedulerExpirationDuration must all be greater than 0.`
            )
        }

        return true
    }

    // unknown mode
    throw new Error(
        `Unknown migratedPoolBaseFeeMode: ${migratedPoolBaseFeeMode}`
    )
}

export function validateMigrationFee(migrationFee: {
    feePercentage: number
    creatorFeePercentage: number
}): boolean {
    // check integer-ness (rust u8 types are whole numbers)
    if (
        !Number.isInteger(migrationFee.feePercentage) ||
        !Number.isInteger(migrationFee.creatorFeePercentage)
    ) {
        throw new Error(
            'Migration fee percentage and creator fee percentage must be whole numbers (no decimals allowed)'
        )
    }
    // Check u8 boundaries
    if (
        migrationFee.feePercentage < 0 ||
        migrationFee.feePercentage > MAX_MIGRATION_FEE_PERCENTAGE
    ) {
        throw new Error(
            `Migration fee percentage must be between 0 and ${MAX_MIGRATION_FEE_PERCENTAGE}`
        )
    }
    if (
        migrationFee.creatorFeePercentage < 0 ||
        migrationFee.creatorFeePercentage > MAX_CREATOR_MIGRATION_FEE_PERCENTAGE
    ) {
        throw new Error(
            `Migration creator fee percentage must be between 0 and ${MAX_CREATOR_MIGRATION_FEE_PERCENTAGE}`
        )
    }
    return true
}
