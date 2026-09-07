import BN from 'bn.js'
import {
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
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
    MAX_LOCK_DURATION_IN_SECONDS,
    U16_MAX,
    U24_MAX,
    U128_MAX,
} from '../constants'
import {
    NATIVE_MINT_2022,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
    ActivationType,
    BaseFeeMode,
    CollectFeeMode,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    DynamicFeeParameters,
    LiquidityVestingInfoParameters,
    LockedVestingParameters,
    MigratedCollectFeeMode,
    MigratedPoolFee,
    MigratedPoolMarketCapFeeSchedulerParameters,
    MigrationFeeOption,
    MigrationOption,
    PoolFeeParameters,
    TokenDecimal,
    TokenType,
    TokenAuthorityOption,
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

const DAMM_V2_MIN_FEE_NUMERATOR = 100_000
const DAMM_V2_MAX_FEE_NUMERATOR = 990_000_000

/**
 * Reject deprecated rate-limiter and DAMM v1 options for new configs and pools.
 * Existing on-chain configs/pools are unaffected.
 */
export function assertConfigAllowsNewPool(params: {
    baseFeeMode: number
    migrationOption: number
}): void {
    if (params.baseFeeMode === BaseFeeMode.RateLimiter) {
        throw new Error(
            'BaseFeeMode.RateLimiter is deprecated. New configs and pools must use FeeSchedulerLinear or FeeSchedulerExponential. Existing rate-limiter pools are unaffected.'
        )
    }

    if (params.migrationOption === MigrationOption.MET_DAMM) {
        throw new Error(
            'MigrationOption.MET_DAMM (DAMM v1) is deprecated. New configs and pools must use MigrationOption.MET_DAMM_V2. Existing DAMM v1 pools can still migrate.'
        )
    }
}

/**
 * Validate base fee, scheduler, rate-limiter, and dynamic fee settings for a pool config.
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

    // validate dynamic fee if it exists
    if (!validateDynamicFee(poolFees.dynamicFee ?? undefined)) {
        return false
    }

    return true
}

/**
 * Validate fee scheduler parameters and resulting fee bounds.
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

    // validate fee fractions - check if within valid range
    if (
        minFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        maxFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        return false
    }

    return true
}

/**
 * Validate rate-limiter parameters and activation duration bounds.
 */
export function validateFeeRateLimiter(
    cliffFeeNumerator: BN,
    feeIncrementBps: BN,
    maxLimiterDuration: BN,
    referenceAmount: BN,
    collectFeeMode: CollectFeeMode,
    activationType: ActivationType
): boolean {
    // can only be applied in quote token collect fee mode
    if (collectFeeMode !== CollectFeeMode.QuoteToken) {
        return false
    }

    if (
        cliffFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        cliffFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
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

    // validate max fee (more amount, then more fee)
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
 * Return whether the DBC collect fee mode is supported.
 */
export function validateCollectFeeMode(
    collectFeeMode: CollectFeeMode
): boolean {
    return [CollectFeeMode.QuoteToken, CollectFeeMode.OutputToken].includes(
        collectFeeMode
    )
}

/**
 * Return whether the selected migration path supports the base token type.
 */
export function validateMigrationAndTokenType(
    migrationOption: MigrationOption,
    tokenType: TokenType
): boolean {
    if (migrationOption === MigrationOption.MET_DAMM) {
        return tokenType === TokenType.SPLToken
    }
    return true
}

/**
 * Return whether the activation type is supported.
 */
export function validateActivationType(
    activationType: ActivationType
): boolean {
    return [ActivationType.Slot, ActivationType.Timestamp].includes(
        activationType
    )
}

/**
 * Return whether the migration fee option is supported for the migration path.
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

    // customizable migration fee option is only allowed for MET_DAMM_V2 migration
    if (migrationFeeOption === MigrationFeeOption.Customizable) {
        return migrationOption === MigrationOption.MET_DAMM_V2
    }

    return validOptions.includes(migrationFeeOption)
}

/**
 * Return whether the token decimal is within the supported range.
 */
export function validateTokenDecimals(tokenDecimal: TokenDecimal): boolean {
    return tokenDecimal >= TokenDecimal.SIX && tokenDecimal <= TokenDecimal.NINE
}

/**
 * Return whether all liquidity distribution percentages sum to 100.
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
 * Validate curve point ordering, liquidity, and supported sqrt price bounds.
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
 * Validate token supply can cover swap, migration, vesting, and leftover requirements.
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

    // check if leftoverReceiver is a PublicKey instance
    if (!(leftoverReceiver instanceof PublicKey)) {
        return false
    }

    // check if leftoverReceiver is not the default public key (all zeros)
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
 * Return whether the token authority option is supported.
 */
export function validateTokenAuthorityOptions(
    option: TokenAuthorityOption
): boolean {
    return [
        TokenAuthorityOption.CreatorUpdateAuthority,
        TokenAuthorityOption.Immutable,
        TokenAuthorityOption.PartnerUpdateAuthority,
        TokenAuthorityOption.CreatorUpdateAndMintAuthority,
        TokenAuthorityOption.PartnerUpdateAndMintAuthority,
    ].includes(option)
}

/**
 * Return whether the token authority option grants mint authority to the creator or partner.
 */
export function hasMintAuthority(option: TokenAuthorityOption): boolean {
    return (
        option === TokenAuthorityOption.CreatorUpdateAndMintAuthority ||
        option === TokenAuthorityOption.PartnerUpdateAndMintAuthority
    )
}

/**
 * Return whether a transfer-hook program is not DBC, SPL Token, SPL Token-2022, or the default pubkey.
 */
export function validateTransferHookProgram(
    transferHookProgram: PublicKey | undefined
): boolean {
    if (!transferHookProgram) {
        return false
    }
    if (!(transferHookProgram instanceof PublicKey)) {
        return false
    }
    if (transferHookProgram.equals(PublicKey.default)) {
        return false
    }
    if (transferHookProgram.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)) {
        return false
    }
    if (transferHookProgram.equals(TOKEN_PROGRAM_ID)) {
        return false
    }
    if (transferHookProgram.equals(TOKEN_2022_PROGRAM_ID)) {
        return false
    }
    return true
}

/**
 * Return whether a transfer-hook program is valid and resolves to an executable account.
 */
export async function validateTransferHookProgramExecutable(
    connection: Connection,
    transferHookProgram: PublicKey
): Promise<boolean> {
    if (!validateTransferHookProgram(transferHookProgram)) {
        return false
    }
    const accountInfo = await connection.getAccountInfo(transferHookProgram)
    if (!accountInfo) {
        return false
    }
    return accountInfo.executable
}

/**
 * Return whether a quote mint passes the sync portion of the supported quote mint check.
 */
export function validateQuoteMintBasic(quoteMint: PublicKey): boolean {
    if (!quoteMint || quoteMint.equals(PublicKey.default)) {
        return false
    }
    if (quoteMint.equals(NATIVE_MINT_2022)) {
        return false
    }
    return true
}

/**
 * Return whether the pool creation fee is zero or within the supported lamport range.
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
 * Return whether liquidity vesting info is disabled or internally consistent.
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

    const totalBpsAfterCliff =
        vestingInfo.bpsPerPeriod * vestingInfo.numberOfPeriods
    if (totalBpsAfterCliff > U16_MAX) {
        return false
    }

    const totalVestedLiquidity = U128_MAX.mul(
        new BN(vestingInfo.vestingPercentage)
    ).div(new BN(100))
    const totalVestingLiquidityAfterCliff = totalVestedLiquidity
        .mul(new BN(totalBpsAfterCliff))
        .div(new BN(MAX_BASIS_POINT))
    const liquidityPerPeriod =
        vestingInfo.numberOfPeriods > 0
            ? totalVestingLiquidityAfterCliff.div(
                  new BN(vestingInfo.numberOfPeriods)
              )
            : new BN(0)

    let effectiveNumberOfPeriods = vestingInfo.numberOfPeriods
    let effectiveFrequency = vestingInfo.frequency
    let effectiveCliffDuration = vestingInfo.cliffDurationFromMigrationTime

    if (liquidityPerPeriod.gt(new BN(0))) {
        if (vestingInfo.numberOfPeriods === 0) {
            return false
        }

        if (vestingInfo.frequency === 0) {
            return false
        }
    } else {
        effectiveNumberOfPeriods = 0
        effectiveFrequency = 0
        effectiveCliffDuration = Math.max(effectiveCliffDuration, 1)
    }

    const totalPeriodicLiquidity = liquidityPerPeriod.mul(
        new BN(effectiveNumberOfPeriods)
    )
    if (totalPeriodicLiquidity.gt(totalVestedLiquidity)) {
        return false
    }

    const cliffUnlockLiquidity = totalVestedLiquidity.sub(
        totalPeriodicLiquidity
    )
    const vestingDuration =
        effectiveCliffDuration + effectiveFrequency * effectiveNumberOfPeriods

    return (
        vestingDuration <= MAX_LOCK_DURATION_IN_SECONDS &&
        cliffUnlockLiquidity.add(totalPeriodicLiquidity).gt(new BN(0))
    )
}

/**
 * Validate that at least `MIN_LOCKED_LIQUIDITY_BPS` is locked one day after migration.
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

export function validateMigratedCollectFeeMode(
    collectFeeMode: number
): boolean {
    return Object.values(MigratedCollectFeeMode).includes(collectFeeMode)
}

export function validateCompoundingFeeBps(
    collectFeeMode: number,
    compoundingFeeBps: number
): boolean {
    if (collectFeeMode === MigratedCollectFeeMode.Compounding) {
        return compoundingFeeBps > 0 && compoundingFeeBps <= MAX_BASIS_POINT
    }
    return compoundingFeeBps === 0
}

export function validateMigratedPoolFee(
    migratedPoolFee: MigratedPoolFee,
    migrationOption?: MigrationOption,
    migrationFeeOption?: MigrationFeeOption,
    migratedPoolMarketCapFeeSchedulerParams?: MigratedPoolMarketCapFeeSchedulerParameters,
    compoundingFeeBps?: number,
    migratedPoolBaseFeeMode: DammV2BaseFeeMode = DammV2BaseFeeMode.FeeTimeSchedulerLinear
): boolean {
    const effectiveCompoundingFeeBps = compoundingFeeBps ?? 0

    const isMarketCapFeeSchedulerParamsZero = () => {
        if (!migratedPoolMarketCapFeeSchedulerParams) return true
        return (
            migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod === 0 &&
            migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps === 0 &&
            migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration ===
                0 &&
            migratedPoolMarketCapFeeSchedulerParams.reductionFactor.eq(
                new BN(0)
            )
        )
    }

    // migrated pool fee is considered unset
    const isNone = () => {
        return (
            migratedPoolFee.collectFeeMode === 0 &&
            migratedPoolFee.dynamicFee === 0 &&
            migratedPoolFee.poolFeeBps === 0 &&
            effectiveCompoundingFeeBps === 0 &&
            migratedPoolBaseFeeMode ===
                DammV2BaseFeeMode.FeeTimeSchedulerLinear &&
            isMarketCapFeeSchedulerParamsZero()
        )
    }

    // check if migration fee option and migration option is provided
    if (migrationOption !== undefined && migrationFeeOption !== undefined) {
        // for MeteoraDamm migration, migratedPoolFee must be empty
        if (migrationOption === MigrationOption.MET_DAMM) {
            return isNone()
        }

        // for DammV2 migration
        if (migrationOption === MigrationOption.MET_DAMM_V2) {
            // Fixed migration fee options use a preconfigured DAMM v2 config;
            // custom migrated-pool fee settings are only valid with Customizable.
            if (migrationFeeOption !== MigrationFeeOption.Customizable) {
                return isNone()
            }
        }
    }

    // if migratedPoolFee is none, it's valid
    if (isNone()) {
        return true
    }

    // validate pool fee BPS (between 10 and 1000 basis points)
    if (
        migratedPoolFee.poolFeeBps < MIN_MIGRATED_POOL_FEE_BPS ||
        migratedPoolFee.poolFeeBps > MAX_MIGRATED_POOL_FEE_BPS
    ) {
        return false
    }

    // validate collect fee mode (0 = QuoteToken, 1 = OutputToken, 2 = Compounding)
    if (!validateMigratedCollectFeeMode(migratedPoolFee.collectFeeMode)) {
        return false
    }

    // validate compounding fee BPS consistency with collect fee mode
    if (
        !validateCompoundingFeeBps(
            migratedPoolFee.collectFeeMode,
            effectiveCompoundingFeeBps
        )
    ) {
        return false
    }

    // validate dynamic fee (0 = Disable, 1 = Enable)
    if (
        migratedPoolFee.dynamicFee !== DammV2DynamicFeeMode.Disabled &&
        migratedPoolFee.dynamicFee !== DammV2DynamicFeeMode.Enabled
    ) {
        return false
    }

    if (
        migrationOption === undefined ||
        migrationOption === MigrationOption.MET_DAMM_V2
    ) {
        try {
            validateMigratedPoolBaseFeeMode(
                migratedPoolBaseFeeMode,
                migratedPoolMarketCapFeeSchedulerParams ?? {
                    numberOfPeriod: 0,
                    sqrtPriceStepBps: 0,
                    schedulerExpirationDuration: 0,
                    reductionFactor: new BN(0),
                },
                migrationOption,
                migratedPoolFee.poolFeeBps
            )
        } catch {
            return false
        }
    }

    return true
}

/**
 * Validate config parameters and throw the first actionable error encountered.
 */
export function validateConfigParameters(
    configParam: Omit<
        CreateConfigParams,
        'config' | 'feeClaimer' | 'quoteMint' | 'payer' | 'tokenBadge'
    >,
    options:
        | boolean
        | {
              isTransferHook?: boolean
              transferHookProgram?: PublicKey
          } = false
) {
    const { isTransferHook, transferHookProgram } =
        typeof options === 'boolean'
            ? { isTransferHook: options, transferHookProgram: undefined }
            : {
                  isTransferHook: options.isTransferHook ?? false,
                  transferHookProgram: options.transferHookProgram,
              }

    assertConfigAllowsNewPool({
        baseFeeMode: configParam.poolFees?.baseFee?.baseFeeMode,
        migrationOption: configParam.migrationOption,
    })

    // pool fees validation
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

    // dbc collect fee mode validation
    if (!validateCollectFeeMode(configParam.collectFeeMode)) {
        throw new Error('Invalid collect fee mode')
    }

    // update token authority option validation
    if (!validateTokenAuthorityOptions(configParam.tokenUpdateAuthority)) {
        throw new Error('Invalid option for token update authority')
    }
    if (!isTransferHook && hasMintAuthority(configParam.tokenUpdateAuthority)) {
        throw new Error(
            'Mint authority token update options are only supported for transfer-hook configs'
        )
    }

    // transfer-hook config requires Token2022 base mint
    if (isTransferHook && configParam.tokenType !== TokenType.Token2022) {
        throw new Error(
            'Transfer-hook configs require tokenType to be Token2022'
        )
    }

    // transfer-hook program validation
    if (isTransferHook && transferHookProgram !== undefined) {
        if (!validateTransferHookProgram(transferHookProgram)) {
            throw new Error(
                'Invalid transfer hook program: cannot be the DBC program, SPL Token, SPL Token-2022, or the default pubkey'
            )
        }
    }

    // migration and token type validation
    if (
        !validateMigrationAndTokenType(
            configParam.migrationOption,
            configParam.tokenType
        )
    ) {
        throw new Error('Token type must be SPL for MeteoraDamm migration')
    }

    // activation type validation
    if (!validateActivationType(configParam.activationType)) {
        throw new Error('Invalid activation type')
    }

    // migration fee validation
    if (
        !validateMigrationFeeOption(
            configParam.migrationFeeOption,
            configParam.migrationOption
        )
    ) {
        throw new Error('Invalid migration fee option')
    }

    // migration fee percentages validation
    if (!validateMigrationFee(configParam.migrationFee)) {
        throw new Error('Invalid migration fee')
    }

    // creator trading fee percentage validation
    if (
        configParam.creatorTradingFeePercentage < 0 ||
        configParam.creatorTradingFeePercentage > 100
    ) {
        throw new Error(
            'Creator trading fee percentage must be between 0 and 100'
        )
    }

    // token decimals validation
    if (!validateTokenDecimals(configParam.tokenDecimal)) {
        throw new Error('Token decimal must be between 6 and 9')
    }

    // get vesting percentages (default to 0 if not provided)
    const partnerVestingPercentage =
        configParam.partnerLiquidityVestingInfo?.vestingPercentage ?? 0
    const creatorVestingPercentage =
        configParam.creatorLiquidityVestingInfo?.vestingPercentage ?? 0

    // lp percentages validation
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

    // pool creation fee validation
    if (!validatePoolCreationFee(configParam.poolCreationFee)) {
        throw new Error(
            `Pool creation fee must be 0 or between ${MIN_POOL_CREATION_FEE} and ${MAX_POOL_CREATION_FEE} lamports`
        )
    }

    // liquidity vesting info validation based on migration option
    if (configParam.migrationOption === MigrationOption.MET_DAMM) {
        // for MeteoraDamm migration, vesting info must be zero/empty
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
        // for DammV2 migration, validate vesting info if provided
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

    // migration sqrt price validation
    const sqrtMigrationPrice = getMigrationThresholdPrice(
        configParam.migrationQuoteThreshold,
        configParam.sqrtStartPrice,
        configParam.curve
    )
    if (sqrtMigrationPrice.gte(new BN(MAX_SQRT_PRICE))) {
        throw new Error('Migration sqrt price exceeds maximum')
    }

    // reject degenerate curves that yield no swap or migration base liquidity
    const swapBaseAmountForCurve = getBaseTokenForSwap(
        configParam.sqrtStartPrice,
        sqrtMigrationPrice,
        configParam.curve
    )
    const migrationBaseAmountForCurve = getMigrationBaseToken(
        convertDecimalToBN(
            getMigrationQuoteAmountFromMigrationQuoteThreshold(
                new Decimal(configParam.migrationQuoteThreshold.toString()),
                configParam.migrationFee.feePercentage
            )
        ),
        sqrtMigrationPrice,
        configParam.migrationOption
    )
    if (
        swapBaseAmountForCurve.lte(new BN(0)) ||
        migrationBaseAmountForCurve.lte(new BN(0))
    ) {
        throw new Error(
            'Invalid curve: swap base amount and migration base amount must both be greater than 0'
        )
    }

    // the program requires at least 10% (1000 BPS) of liquidity to be locked at day 1
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

    // migration quote threshold validation
    if (configParam.migrationQuoteThreshold.lte(new BN(0))) {
        throw new Error('Migration quote threshold must be greater than 0')
    }

    // price validation
    if (
        new BN(configParam.sqrtStartPrice).lt(new BN(MIN_SQRT_PRICE)) ||
        new BN(configParam.sqrtStartPrice).gte(new BN(MAX_SQRT_PRICE))
    ) {
        throw new Error('Invalid sqrt start price')
    }

    // migrated pool fee validation
    if (configParam.migratedPoolFee) {
        if (
            !validateMigratedPoolFee(
                configParam.migratedPoolFee,
                configParam.migrationOption,
                configParam.migrationFeeOption,
                configParam.migratedPoolMarketCapFeeSchedulerParams,
                configParam.compoundingFeeBps,
                configParam.migratedPoolBaseFeeMode
            )
        ) {
            throw new Error('Invalid migrated pool fee parameters')
        }
    }

    // migrated pool base fee mode and market cap fee scheduler params validation (DAMM V2 only)
    if (configParam.migrationOption === MigrationOption.MET_DAMM_V2) {
        validateMigratedPoolBaseFeeMode(
            configParam.migratedPoolBaseFeeMode,
            configParam.migratedPoolMarketCapFeeSchedulerParams,
            configParam.migrationOption,
            configParam.migratedPoolFee.poolFeeBps
        )

        // poolFeeBps is required when marketCapFeeSchedulerParams is configured
        validateMarketCapFeeSchedulerRequiresPoolFeeBps(
            configParam.migratedPoolMarketCapFeeSchedulerParams,
            configParam.migratedPoolFee
        )
    }

    // curve validation
    if (!validateCurve(configParam.curve, configParam.sqrtStartPrice)) {
        throw new Error('Invalid curve')
    }

    // locked vesting validation
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

    // token supply validation
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
 * Return whether a pool creation token type matches its config.
 */
export function validateBaseTokenType(
    baseTokenType: TokenType,
    poolConfig: PoolConfig
): boolean {
    return baseTokenType === poolConfig.tokenType
}

/**
 * Validate that an owner has enough SOL or token balance for a swap.
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
 * Validate that a swap amount is greater than zero.
 */
export function validateSwapAmount(amountIn: BN): boolean {
    if (amountIn.lte(new BN(0))) {
        throw new Error('Swap amount must be greater than 0')
    }
    return true
}

/**
 * Validate DAMM v2 migrated-pool base fee modes and market-cap scheduler requirements.
 */
export function validateMigratedPoolBaseFeeMode(
    migratedPoolBaseFeeMode: DammV2BaseFeeMode,
    migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParameters,
    migrationOption?: MigrationOption,
    poolFeeBps = MIN_MIGRATED_POOL_FEE_BPS
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
        // validate that all required params are provided
        if (
            migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod <= 0 ||
            migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps <= 0 ||
            migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration <=
                0 ||
            migratedPoolMarketCapFeeSchedulerParams.reductionFactor.lte(
                new BN(0)
            )
        ) {
            throw new Error(
                `For FeeMarketCapSchedulerLinear (3) and FeeMarketCapSchedulerExponential (4) modes, ` +
                    `if using dynamic fee scheduling, numberOfPeriod, sqrtPriceStepBps, and ` +
                    `schedulerExpirationDuration must all be greater than 0, and reductionFactor must be greater than 0.`
            )
        }

        const schedulerMode =
            migratedPoolBaseFeeMode ===
            DammV2BaseFeeMode.FeeMarketCapSchedulerLinear
                ? BaseFeeMode.FeeSchedulerLinear
                : BaseFeeMode.FeeSchedulerExponential
        const cliffFeeNumerator = toNumerator(
            new BN(poolFeeBps),
            new BN(FEE_DENOMINATOR)
        )
        const minFeeNumerator = getFeeSchedulerMinBaseFeeNumerator(
            cliffFeeNumerator,
            migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod,
            migratedPoolMarketCapFeeSchedulerParams.reductionFactor,
            schedulerMode
        )

        if (
            minFeeNumerator.lt(new BN(DAMM_V2_MIN_FEE_NUMERATOR)) ||
            cliffFeeNumerator.gt(new BN(DAMM_V2_MAX_FEE_NUMERATOR))
        ) {
            throw new Error('Invalid market cap fee scheduler fee bounds')
        }

        return true
    }

    // unknown mode
    throw new Error(
        `Unknown migratedPoolBaseFeeMode: ${migratedPoolBaseFeeMode}`
    )
}

/**
 * Validate that market-cap fee scheduling has a starting migrated pool fee.
 */
export function validateMarketCapFeeSchedulerRequiresPoolFeeBps(
    migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParameters,
    migratedPoolFee: MigratedPoolFee | undefined
): boolean {
    const isMarketCapFeeSchedulerConfigured =
        migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod > 0 ||
        migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps > 0 ||
        migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration >
            0 ||
        !migratedPoolMarketCapFeeSchedulerParams.reductionFactor.eq(new BN(0))

    if (isMarketCapFeeSchedulerConfigured) {
        if (!migratedPoolFee || migratedPoolFee.poolFeeBps === 0) {
            throw new Error(
                'When marketCapFeeSchedulerParams is configured, migratedPoolFee.poolFeeBps is required and must be greater than 0. ' +
                    'The poolFeeBps serves as the starting (cliff) fee for the market cap fee scheduler.'
            )
        }
    }

    return true
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
    if (
        migrationFee.feePercentage === 0 &&
        migrationFee.creatorFeePercentage !== 0
    ) {
        throw new Error(
            'Migration creator fee percentage must be 0 when migration fee percentage is 0'
        )
    }
    return true
}
