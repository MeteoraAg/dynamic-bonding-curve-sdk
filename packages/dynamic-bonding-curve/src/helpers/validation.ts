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
    MAX_BASE_TRANSFER_FEE_BPS,
    MAX_LOCK_DURATION_IN_SECONDS,
    U16_MAX,
    U24_MAX,
    U64_MAX,
} from '../constants'
import { getBaseTransferFee, type EpochTransferFee } from '../math/transferFee'
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token'
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
    TransferFeeWithheldAuthority,
    MigratedTransferFeeAuthorityOption,
    type CreateConfigParams,
    type TransferFeeParameters,
} from '../types'
import { Connection, PublicKey } from '@solana/web3.js'
import {
    getMigrationBaseToken,
    getMigrationQuoteAmountFromThreshold,
    getMigrationThresholdPrice,
    getSwapAmountWithBuffer,
    getTotalTokenSupply,
    validateCompoundingMigrationDeposit,
} from './migration'
import { getBaseTokenForSwap } from './price'
import {
    calculateLockedLiquidityBpsAtTime,
    getDammV2VestingParameters,
    getTotalVestingAmount,
} from './vesting'
import { ProgramError } from '../math/errors'
import { isDefaultLockedVesting } from './utils'
import {
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
    MIN_FEE_NUMERATOR,
} from '../constants'
import { getFeeSchedulerMinBaseFeeNumerator } from '../math/poolFees/feeScheduler'
import { toNumerator } from '../math/utilsMath'

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

/** Validate base fee, scheduler, and dynamic fee settings for a pool config. */
function validatePoolFees(poolFees: PoolFeeParameters): boolean {
    if (poolFees.baseFee.cliffFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR))) {
        return false
    }

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
    } else {
        return false
    }

    if (!validateDynamicFee(poolFees.dynamicFee)) {
        return false
    }

    return true
}

/** Validate fee scheduler parameters and resulting fee bounds. */
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
    if (
        minFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        cliffFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        return false
    }

    return true
}

function validateDynamicFee(dynamicFee: DynamicFeeParameters | null): boolean {
    if (!dynamicFee) return true

    if (dynamicFee.binStep !== BIN_STEP_BPS_DEFAULT) return false
    if (!dynamicFee.binStepU128.eq(BIN_STEP_BPS_U128_DEFAULT)) return false
    if (dynamicFee.filterPeriod >= dynamicFee.decayPeriod) return false
    if (dynamicFee.reductionFactor > MAX_BASIS_POINT) return false
    if (dynamicFee.variableFeeControl > U24_MAX) return false
    if (dynamicFee.maxVolatilityAccumulator > U24_MAX) return false

    return true
}

function validateCollectFeeMode(collectFeeMode: CollectFeeMode): boolean {
    return [CollectFeeMode.QuoteToken, CollectFeeMode.OutputToken].includes(
        collectFeeMode
    )
}

function validateTokenType(tokenType: TokenType): boolean {
    return [TokenType.SPLToken, TokenType.Token2022].includes(tokenType)
}

function validateMigrationOption(migrationOption: MigrationOption): boolean {
    return [MigrationOption.MET_DAMM, MigrationOption.MET_DAMM_V2].includes(
        migrationOption
    )
}

function validateActivationType(activationType: ActivationType): boolean {
    return [ActivationType.Slot, ActivationType.Timestamp].includes(
        activationType
    )
}

function validateMigrationFeeOption(
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

function validateTokenDecimals(tokenDecimal: TokenDecimal): boolean {
    return tokenDecimal >= TokenDecimal.SIX && tokenDecimal <= TokenDecimal.NINE
}

function validateLPPercentages(
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
    if (curve.length === 0 || curve.length > MAX_CURVE_POINT) {
        return false
    }

    let previousSqrtPrice = sqrtStartPrice
    for (const point of curve) {
        if (
            point.sqrtPrice.lte(previousSqrtPrice) ||
            point.liquidity.lte(new BN(0))
        ) {
            return false
        }
        previousSqrtPrice = point.sqrtPrice
    }

    return previousSqrtPrice.lte(MAX_SQRT_PRICE)
}

/**
 * Validate token supply can cover swap, migration, vesting, and leftover requirements.
 */
function validateTokenSupply(
    tokenSupply: {
        preMigrationTokenSupply: BN
        postMigrationTokenSupply: BN
    },
    swapBaseAmount: BN,
    migrationBaseAmount: BN,
    lockedVesting: LockedVestingParameters,
    swapBaseAmountBuffer: BN
): boolean {
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
            tokenSupply.postMigrationTokenSupply
        ) ||
        tokenSupply.postMigrationTokenSupply.gt(
            tokenSupply.preMigrationTokenSupply
        ) ||
        minimumBaseSupplyWithBuffer.gt(tokenSupply.preMigrationTokenSupply)
    )
}

/** Return whether the token authority option is supported. */
function validateTokenAuthorityOptions(option: TokenAuthorityOption): boolean {
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
    transferHookProgram: PublicKey
): boolean {
    return ![
        PublicKey.default,
        DYNAMIC_BONDING_CURVE_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        TOKEN_2022_PROGRAM_ID,
    ].some((program) => program.equals(transferHookProgram))
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
 * Return whether the pool creation fee is zero or within the supported lamport range.
 */
function validatePoolCreationFee(poolCreationFee: BN): boolean {
    if (poolCreationFee.eq(new BN(0))) {
        return true
    }

    return (
        poolCreationFee.gte(new BN(MIN_POOL_CREATION_FEE)) &&
        poolCreationFee.lte(new BN(MAX_POOL_CREATION_FEE))
    )
}

function isZeroLiquidityVestingInfo(
    vestingInfo: LiquidityVestingInfoParameters
): boolean {
    return (
        vestingInfo.vestingPercentage === 0 &&
        vestingInfo.bpsPerPeriod === 0 &&
        vestingInfo.numberOfPeriods === 0 &&
        vestingInfo.cliffDurationFromMigrationTime === 0 &&
        vestingInfo.frequency === 0
    )
}

/**
 * Return whether liquidity vesting info is disabled or internally consistent.
 */
function validateLiquidityVestingInfo(
    vestingInfo: LiquidityVestingInfoParameters
): boolean {
    if (isZeroLiquidityVestingInfo(vestingInfo)) {
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

    const {
        totalVestedLiquidity,
        liquidityPerPeriod,
        numberOfPeriods,
        frequency,
        cliffDuration,
    } = getDammV2VestingParameters(vestingInfo)

    if (liquidityPerPeriod.gt(new BN(0)) && vestingInfo.frequency === 0) {
        return false
    }

    const totalPeriodicLiquidity = liquidityPerPeriod.mul(
        new BN(numberOfPeriods)
    )
    if (totalPeriodicLiquidity.gt(totalVestedLiquidity)) {
        return false
    }

    const vestingDuration = cliffDuration + frequency * numberOfPeriods

    return (
        vestingDuration <= MAX_LOCK_DURATION_IN_SECONDS &&
        totalVestedLiquidity.gt(new BN(0))
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

function isZeroMarketCapFeeScheduler(
    params: MigratedPoolMarketCapFeeSchedulerParameters
): boolean {
    return (
        params.numberOfPeriod === 0 &&
        params.sqrtPriceStepBps === 0 &&
        params.schedulerExpirationDuration === 0 &&
        params.reductionFactor.isZero()
    )
}

function validateMigratedCollectFeeMode(collectFeeMode: number): boolean {
    return Object.values(MigratedCollectFeeMode).includes(collectFeeMode)
}

export function validateCompoundingFeeBps(
    collectFeeMode: number,
    compoundingFeeBps: number
): boolean {
    if (collectFeeMode === MigratedCollectFeeMode.Compounding) {
        return compoundingFeeBps >= 0 && compoundingFeeBps <= MAX_BASIS_POINT
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

    // the program's MigratedPoolFeeValidator::is_none
    const isNone = () =>
        migratedPoolFee.collectFeeMode === 0 &&
        migratedPoolFee.dynamicFee === 0 &&
        migratedPoolFee.poolFeeBps === 0 &&
        effectiveCompoundingFeeBps === 0 &&
        migratedPoolBaseFeeMode === DammV2BaseFeeMode.FeeTimeSchedulerLinear &&
        (!migratedPoolMarketCapFeeSchedulerParams ||
            isZeroMarketCapFeeScheduler(
                migratedPoolMarketCapFeeSchedulerParams
            ))

    // fixed migration fee options use a preset DAMM v2 config
    if (
        migrationOption !== undefined &&
        migrationFeeOption !== undefined &&
        migrationFeeOption !== MigrationFeeOption.Customizable
    ) {
        return isNone()
    }

    const requiresMigratedPoolFee =
        migrationOption === MigrationOption.MET_DAMM_V2 &&
        migrationFeeOption === MigrationFeeOption.Customizable
    if (!requiresMigratedPoolFee && isNone()) {
        return true
    }

    if (
        migratedPoolFee.poolFeeBps < MIN_MIGRATED_POOL_FEE_BPS ||
        migratedPoolFee.poolFeeBps > MAX_MIGRATED_POOL_FEE_BPS
    ) {
        return false
    }

    if (!validateMigratedCollectFeeMode(migratedPoolFee.collectFeeMode)) {
        return false
    }

    if (
        !validateCompoundingFeeBps(
            migratedPoolFee.collectFeeMode,
            effectiveCompoundingFeeBps
        )
    ) {
        return false
    }

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
        return (
            findMigratedPoolBaseFeeModeError(
                migratedPoolBaseFeeMode,
                migratedPoolMarketCapFeeSchedulerParams ?? {
                    numberOfPeriod: 0,
                    sqrtPriceStepBps: 0,
                    schedulerExpirationDuration: 0,
                    reductionFactor: new BN(0),
                },
                migratedPoolFee.poolFeeBps
            ) === undefined
        )
    }

    return true
}

/**
 * Check createConfig2 transfer fee parameters the way the program does.
 * feeClaimer, when given, must not be the default pubkey for a partner authority.
 */
export function validateTransferFeeParameters(
    transferFeeParameters: TransferFeeParameters,
    tokenType: number,
    feeClaimer?: PublicKey
): void {
    const {
        transferFeeBasisPoints,
        withheldAuthority,
        migratedTransferFeeAuthorityOption,
    } = transferFeeParameters

    if (tokenType !== TokenType.Token2022) {
        throw new Error('Base transfer fee requires token type Token2022')
    }
    if (
        transferFeeBasisPoints < 0 ||
        transferFeeBasisPoints > MAX_BASE_TRANSFER_FEE_BPS ||
        ![
            TransferFeeWithheldAuthority.Partner,
            TransferFeeWithheldAuthority.Creator,
        ].includes(withheldAuthority) ||
        ![
            MigratedTransferFeeAuthorityOption.Immutable,
            MigratedTransferFeeAuthorityOption.RevokeZeroFee,
            MigratedTransferFeeAuthorityOption.Creator,
            MigratedTransferFeeAuthorityOption.Partner,
        ].includes(migratedTransferFeeAuthorityOption)
    ) {
        throw new Error(ProgramError.InvalidTransferFeeParameters)
    }
    if (
        transferFeeBasisPoints === 0 &&
        (migratedTransferFeeAuthorityOption ===
            MigratedTransferFeeAuthorityOption.Immutable ||
            migratedTransferFeeAuthorityOption ===
                MigratedTransferFeeAuthorityOption.RevokeZeroFee)
    ) {
        throw new Error(ProgramError.InvalidTransferFeeParameters)
    }

    const isPartnerAuthority =
        withheldAuthority === TransferFeeWithheldAuthority.Partner ||
        migratedTransferFeeAuthorityOption ===
            MigratedTransferFeeAuthorityOption.Partner
    if (isPartnerAuthority && feeClaimer?.equals(PublicKey.default)) {
        throw new Error(ProgramError.InvalidFeeClaimer)
    }
}

function validateTransferFeeConfigMode(configParam: {
    tokenSupply: CreateConfigParams['tokenSupply']
    lockedVesting: CreateConfigParams['lockedVesting']
    migrationFeeOption: number
    migratedPoolFee: { collectFeeMode: number }
}): void {
    const tokenSupply = configParam.tokenSupply
    if (
        !tokenSupply ||
        !tokenSupply.preMigrationTokenSupply.eq(
            tokenSupply.postMigrationTokenSupply
        )
    ) {
        throw new Error('Transfer fee configs require a constant token supply')
    }
    if (!isDefaultLockedVesting(configParam.lockedVesting)) {
        throw new Error('Transfer fee configs cannot include locked vesting')
    }
    if (configParam.migrationFeeOption !== MigrationFeeOption.Customizable) {
        throw new Error(
            'Transfer fee configs require MigrationFeeOption.Customizable'
        )
    }
    if (
        configParam.migratedPoolFee.collectFeeMode !==
        MigratedCollectFeeMode.Compounding
    ) {
        throw new Error(
            'Transfer fee configs require MigratedCollectFeeMode.Compounding'
        )
    }
}

/**
 * Validate config parameters and throw the first actionable error encountered.
 */
export function validateConfigParameters(
    configParam: Omit<
        CreateConfigParams,
        'config' | 'feeClaimer' | 'quoteMint' | 'payer' | 'tokenBadge'
    >,
    options: {
        isTransferHook?: boolean
        transferHookProgram?: PublicKey
        transferFeeParameters?: TransferFeeParameters | null
        quoteMintHasTransferFee?: boolean
        quoteEpochTransferFee?: EpochTransferFee | null
        feeClaimer?: PublicKey
    } = {}
): void {
    const {
        isTransferHook = false,
        transferHookProgram,
        transferFeeParameters,
        quoteMintHasTransferFee = false,
        quoteEpochTransferFee = null,
        feeClaimer,
    } = options

    assertConfigAllowsNewPool({
        baseFeeMode: configParam.poolFees.baseFee.baseFeeMode,
        migrationOption: configParam.migrationOption,
    })
    if (!validatePoolFees(configParam.poolFees)) {
        throw new Error('Invalid pool fees')
    }

    if (!validateCollectFeeMode(configParam.collectFeeMode)) {
        throw new Error(ProgramError.InvalidCollectFeeMode)
    }

    if (!validateTokenAuthorityOptions(configParam.tokenUpdateAuthority)) {
        throw new Error('Invalid option for token update authority')
    }
    if (!isTransferHook && hasMintAuthority(configParam.tokenUpdateAuthority)) {
        throw new Error(
            'Mint authority token update options are only supported for transfer-hook configs'
        )
    }

    if (isTransferHook && configParam.tokenType !== TokenType.Token2022) {
        throw new Error(
            'Transfer-hook configs require tokenType to be Token2022'
        )
    }

    if (isTransferHook && transferHookProgram !== undefined) {
        if (!validateTransferHookProgram(transferHookProgram)) {
            throw new Error(
                'Invalid transfer hook program: cannot be the DBC program, SPL Token, SPL Token-2022, or the default pubkey'
            )
        }
    }

    if (!validateMigrationOption(configParam.migrationOption)) {
        throw new Error(ProgramError.InvalidMigrationOption)
    }

    if (!validateTokenType(configParam.tokenType)) {
        throw new Error(ProgramError.InvalidTokenType)
    }

    if (!validateActivationType(configParam.activationType)) {
        throw new Error(ProgramError.InvalidActivationType)
    }

    if (
        !validateMigrationFeeOption(
            configParam.migrationFeeOption,
            configParam.migrationOption
        )
    ) {
        throw new Error(ProgramError.InvalidMigrationFeeOption)
    }

    validateMigrationFee(configParam.migrationFee)

    if (
        configParam.creatorTradingFeePercentage < 0 ||
        configParam.creatorTradingFeePercentage > 100
    ) {
        throw new Error(
            'Creator trading fee percentage must be between 0 and 100'
        )
    }

    if (!validateTokenDecimals(configParam.tokenDecimal)) {
        throw new Error(ProgramError.InvalidTokenDecimals)
    }

    if (
        !validateLPPercentages(
            configParam.partnerLiquidityPercentage,
            configParam.partnerPermanentLockedLiquidityPercentage,
            configParam.creatorLiquidityPercentage,
            configParam.creatorPermanentLockedLiquidityPercentage,
            configParam.partnerLiquidityVestingInfo.vestingPercentage,
            configParam.creatorLiquidityVestingInfo.vestingPercentage
        )
    ) {
        throw new Error('Sum of LP percentages must equal 100')
    }

    if (!validatePoolCreationFee(configParam.poolCreationFee)) {
        throw new Error(
            `Pool creation fee must be 0 or between ${MIN_POOL_CREATION_FEE} and ${MAX_POOL_CREATION_FEE} lamports`
        )
    }

    if (
        !validateLiquidityVestingInfo(configParam.partnerLiquidityVestingInfo)
    ) {
        throw new Error('Invalid partner liquidity vesting info')
    }
    if (
        !validateLiquidityVestingInfo(configParam.creatorLiquidityVestingInfo)
    ) {
        throw new Error('Invalid creator liquidity vesting info')
    }

    // curve shape is checked before any curve math runs on it
    if (configParam.migrationQuoteThreshold.lte(new BN(0))) {
        throw new Error(ProgramError.InvalidQuoteThreshold)
    }
    if (
        configParam.sqrtStartPrice.lt(MIN_SQRT_PRICE) ||
        configParam.sqrtStartPrice.gte(MAX_SQRT_PRICE)
    ) {
        throw new Error(ProgramError.InvalidCurve)
    }
    if (!validateCurve(configParam.curve, configParam.sqrtStartPrice)) {
        throw new Error(ProgramError.InvalidCurve)
    }

    const sqrtMigrationPrice = getMigrationThresholdPrice(
        configParam.migrationQuoteThreshold,
        configParam.sqrtStartPrice,
        configParam.curve
    )
    if (sqrtMigrationPrice.gte(MAX_SQRT_PRICE)) {
        throw new Error(ProgramError.InvalidCurve)
    }

    const swapBaseAmountForCurve = getBaseTokenForSwap(
        configParam.sqrtStartPrice,
        sqrtMigrationPrice,
        configParam.curve
    )
    if (swapBaseAmountForCurve.gt(U64_MAX)) {
        throw new Error(ProgramError.TypeCastFailed)
    }
    const migratedCollectFeeMode = configParam.migratedPoolFee.collectFeeMode
    const migrationBaseAmountForCurve = getMigrationBaseToken(
        getMigrationQuoteAmountFromThreshold(
            configParam.migrationQuoteThreshold,
            configParam.migrationFee.feePercentage
        ),
        sqrtMigrationPrice,
        configParam.migrationOption,
        migratedCollectFeeMode
    )
    if (
        swapBaseAmountForCurve.lte(new BN(0)) ||
        migrationBaseAmountForCurve.lte(new BN(0))
    ) {
        throw new Error(ProgramError.InvalidCurve)
    }

    const lockedBpsAtDay1 = calculateLockedLiquidityBpsAtTime(
        configParam.partnerPermanentLockedLiquidityPercentage,
        configParam.creatorPermanentLockedLiquidityPercentage,
        configParam.partnerLiquidityVestingInfo,
        configParam.creatorLiquidityVestingInfo,
        SECONDS_PER_DAY
    )
    if (lockedBpsAtDay1 < MIN_LOCKED_LIQUIDITY_BPS) {
        throw new Error(
            `At least ${MIN_LOCKED_LIQUIDITY_BPS} bps of migrated liquidity must be locked at day 1, got ${lockedBpsAtDay1} bps`
        )
    }

    // runs before the boolean validateMigratedPoolFee so its message is kept
    validateMigratedPoolBaseFeeMode(
        configParam.migratedPoolBaseFeeMode,
        configParam.migratedPoolMarketCapFeeSchedulerParams,
        configParam.migratedPoolFee.poolFeeBps
    )
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
        throw new Error(ProgramError.InvalidMigratedPoolFee)
    }

    if (!isDefaultLockedVesting(configParam.lockedVesting)) {
        const totalAmount = getTotalVestingAmount(configParam.lockedVesting)
        if (
            configParam.lockedVesting.frequency.isZero() ||
            totalAmount.isZero() ||
            totalAmount.gt(U64_MAX)
        ) {
            throw new Error(ProgramError.InvalidVestingParameters)
        }
    }

    if (configParam.tokenSupply) {
        if (configParam.leftoverReceiver.equals(PublicKey.default)) {
            throw new Error(ProgramError.InvalidLeftoverAddress)
        }
        const swapBaseAmountBuffer = getSwapAmountWithBuffer(
            swapBaseAmountForCurve,
            configParam.sqrtStartPrice,
            configParam.curve
        )
        if (
            !validateTokenSupply(
                configParam.tokenSupply,
                swapBaseAmountForCurve,
                migrationBaseAmountForCurve,
                configParam.lockedVesting,
                swapBaseAmountBuffer
            )
        ) {
            throw new Error(ProgramError.InvalidTokenSupply)
        }
    }

    // Token-2022 rejects the default pubkey as an authority
    if (
        feeClaimer?.equals(PublicKey.default) &&
        configParam.tokenType === TokenType.Token2022 &&
        (configParam.tokenUpdateAuthority ===
            TokenAuthorityOption.PartnerUpdateAuthority ||
            configParam.tokenUpdateAuthority ===
                TokenAuthorityOption.PartnerUpdateAndMintAuthority)
    ) {
        throw new Error(ProgramError.InvalidFeeClaimer)
    }

    if (transferFeeParameters) {
        validateTransferFeeParameters(
            transferFeeParameters,
            configParam.tokenType,
            feeClaimer
        )
    }
    // 0 bps still creates a TransferFeeConfig
    if (transferFeeParameters != null || quoteMintHasTransferFee) {
        validateTransferFeeConfigMode(configParam)
    }

    if (migratedCollectFeeMode === MigratedCollectFeeMode.Compounding) {
        validateCompoundingMigrationDeposit({
            migrationQuoteThreshold: configParam.migrationQuoteThreshold,
            migrationFeePercentage: configParam.migrationFee.feePercentage,
            migrationSqrtPrice: sqrtMigrationPrice,
            baseTransferFee: getBaseTransferFee(
                transferFeeParameters?.transferFeeBasisPoints ?? 0
            ),
            quoteTransferFee: quoteEpochTransferFee,
        })
    }
}

export function validateSwapAmount(amountIn: BN): void {
    if (amountIn.lte(new BN(0))) {
        throw new Error(ProgramError.AmountIsZero)
    }
}

/**
 * Describe why a migrated pool's base fee mode and market-cap scheduler
 * parameters are invalid, or return undefined when they are valid.
 */
function findMigratedPoolBaseFeeModeError(
    migratedPoolBaseFeeMode: DammV2BaseFeeMode,
    migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParameters,
    poolFeeBps: number
): string | undefined {
    if (migratedPoolBaseFeeMode === DammV2BaseFeeMode.RateLimiter) {
        return 'DammV2BaseFeeMode.RateLimiter is not supported for a migrated pool'
    }

    // time schedulers are a fixed fee on the migrated pool
    if (
        migratedPoolBaseFeeMode === DammV2BaseFeeMode.FeeTimeSchedulerLinear ||
        migratedPoolBaseFeeMode ===
            DammV2BaseFeeMode.FeeTimeSchedulerExponential
    ) {
        return isZeroMarketCapFeeScheduler(
            migratedPoolMarketCapFeeSchedulerParams
        )
            ? undefined
            : 'migratedPoolMarketCapFeeSchedulerParams must be zero for a time scheduler base fee mode'
    }

    if (
        migratedPoolBaseFeeMode ===
            DammV2BaseFeeMode.FeeMarketCapSchedulerLinear ||
        migratedPoolBaseFeeMode ===
            DammV2BaseFeeMode.FeeMarketCapSchedulerExponential
    ) {
        if (
            migratedPoolMarketCapFeeSchedulerParams.numberOfPeriod <= 0 ||
            migratedPoolMarketCapFeeSchedulerParams.sqrtPriceStepBps <= 0 ||
            migratedPoolMarketCapFeeSchedulerParams.schedulerExpirationDuration <=
                0 ||
            migratedPoolMarketCapFeeSchedulerParams.reductionFactor.lte(
                new BN(0)
            )
        ) {
            return 'numberOfPeriod, sqrtPriceStepBps, schedulerExpirationDuration, and reductionFactor must all be greater than zero for a market cap scheduler base fee mode'
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

        return minFeeNumerator.lt(new BN(DAMM_V2_MIN_FEE_NUMERATOR)) ||
            cliffFeeNumerator.gt(new BN(DAMM_V2_MAX_FEE_NUMERATOR))
            ? 'Invalid market cap fee scheduler fee bounds'
            : undefined
    }

    return `Unknown migratedPoolBaseFeeMode: ${migratedPoolBaseFeeMode}`
}

function validateMigratedPoolBaseFeeMode(
    migratedPoolBaseFeeMode: DammV2BaseFeeMode,
    migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParameters,
    poolFeeBps: number
): void {
    const error = findMigratedPoolBaseFeeModeError(
        migratedPoolBaseFeeMode,
        migratedPoolMarketCapFeeSchedulerParams,
        poolFeeBps
    )
    if (error !== undefined) {
        throw new Error(error)
    }
}

function validateMigrationFee(migrationFee: {
    feePercentage: number
    creatorFeePercentage: number
}): void {
    if (
        !Number.isInteger(migrationFee.feePercentage) ||
        !Number.isInteger(migrationFee.creatorFeePercentage)
    ) {
        throw new Error(
            'Migration fee percentage and creator fee percentage must be whole numbers'
        )
    }
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
}
