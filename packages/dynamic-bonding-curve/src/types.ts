import type { BN, Program } from '@coral-xyz/anchor'
import type { DynamicBondingCurve } from './idl/dynamic-bonding-curve/idl'
import type { Keypair, PublicKey, Transaction } from '@solana/web3.js'

export type DynamicCurveProgram = Program<DynamicBondingCurve>

/////////////////
// IX ACCOUNTS //
/////////////////

/**
 * Accounts for the `createConfig` instruction (IX 7)
 */
export interface CreateConfigAccounts {
    /** The config account to create (writable, signer) */
    config: PublicKey
    /** Partner address that receives trading fees */
    feeClaimer: PublicKey
    /** Address to receive extra base tokens after migration (for fixed supply tokens) */
    leftoverReceiver: PublicKey
    /** Quote token mint address */
    quoteMint: PublicKey
    /** Transaction payer (writable, signer) */
    payer: PublicKey
    /** System program */
    systemProgram: PublicKey
    /** Event authority PDA */
    eventAuthority: PublicKey
    /** DBC program */
    program: PublicKey
}

/**
 * Accounts for the `initializeVirtualPoolWithSplToken` instruction (IX 13)
 */
export interface InitializeSplPoolAccounts {
    /** Pool config account */
    config: PublicKey
    /** Pool authority (fixed address) */
    poolAuthority: PublicKey
    /** Pool creator (signer) */
    creator: PublicKey
    /** Base token mint (writable, signer) */
    baseMint: PublicKey
    /** Quote token mint */
    quoteMint: PublicKey
    /** Virtual pool account to create (writable) */
    pool: PublicKey
    /** Base token vault (writable) */
    baseVault: PublicKey
    /** Quote token vault (writable) */
    quoteVault: PublicKey
    /** Token metadata account (writable, optional) */
    mintMetadata?: PublicKey
    /** Metadata program */
    metadataProgram: PublicKey
    /** Transaction payer (writable, signer) */
    payer: PublicKey
    /** Quote token program */
    tokenQuoteProgram: PublicKey
    /** SPL Token program */
    tokenProgram: PublicKey
    /** System program */
    systemProgram: PublicKey
    /** Event authority PDA */
    eventAuthority: PublicKey
    /** DBC program */
    program: PublicKey
}

/**
 * Accounts for the `initializeVirtualPoolWithToken2022` instruction (IX 14)
 */
export interface InitializeToken2022PoolAccounts {
    /** Pool config account */
    config: PublicKey
    /** Pool authority (fixed address) */
    poolAuthority: PublicKey
    /** Pool creator (signer) */
    creator: PublicKey
    /** Base token mint (writable, signer) */
    baseMint: PublicKey
    /** Quote token mint */
    quoteMint: PublicKey
    /** Virtual pool account to create (writable) */
    pool: PublicKey
    /** Base token vault (writable) */
    baseVault: PublicKey
    /** Quote token vault (writable) */
    quoteVault: PublicKey
    /** Transaction payer (writable, signer) */
    payer: PublicKey
    /** Quote token program (Token2022) */
    tokenQuoteProgram: PublicKey
    /** Token2022 program */
    tokenProgram: PublicKey
    /** System program */
    systemProgram: PublicKey
    /** Event authority PDA */
    eventAuthority: PublicKey
    /** DBC program */
    program: PublicKey
}

/**
 * Accounts for the `migrationMeteoraDammCreateMetadata` instruction (IX 20)
 */
export interface CreateDammV1MigrationMetadataAccounts {
    /** The virtual pool being migrated */
    virtualPool: PublicKey
    /** Pool config account */
    config: PublicKey
    /** Migration metadata account to create (writable) */
    migrationMetadata: PublicKey
    /** Transaction payer (writable, signer) */
    payer: PublicKey
    /** System program */
    systemProgram: PublicKey
    /** Event authority PDA */
    eventAuthority: PublicKey
    /** DBC program */
    program: PublicKey
}

///////////////
// IDL TYPES //
///////////////

/**
 * Base fee configuration for pool
 */
export interface BaseFeeConfig {
    /** Base fee numerator in bps (basis points) */
    cliffFeeNumerator: BN
    /** Second factor for fee calculation */
    secondFactor: BN
    /** Third factor for fee calculation */
    thirdFactor: BN
    /** First factor for fee calculation */
    firstFactor: number
    /** Base fee mode: 0=Scheduler Linear, 1=Scheduler Exponential, 2=Rate Limiter, etc. */
    baseFeeMode: number
}

/**
 * Base fee parameters for pool creation
 */
export interface BaseFeeParameters {
    /** Base fee numerator in bps */
    cliffFeeNumerator: BN
    /** First factor for fee calculation */
    firstFactor: number
    /** Second factor for fee calculation */
    secondFactor: BN
    /** Third factor for fee calculation */
    thirdFactor: BN
    /** Base fee mode */
    baseFeeMode: number
}

/**
 * Dynamic fee configuration for pool
 */
export interface DynamicFeeConfig {
    /** Whether dynamic fee is initialized (0=no, 1=yes) */
    initialized: number
    /** Maximum volatility accumulator value */
    maxVolatilityAccumulator: number
    /** Variable fee control parameter */
    variableFeeControl: number
    /** Bin step for price movement */
    binStep: number
    /** Filter period in slots/seconds */
    filterPeriod: number
    /** Decay period in slots/seconds */
    decayPeriod: number
    /** Reduction factor per period */
    reductionFactor: number
    /** Bin step as u128 fixed point */
    binStepU128: BN
}

/**
 * Dynamic fee parameters for pool creation
 */
export interface DynamicFeeParameters {
    /** Bin step for price movement */
    binStep: number
    /** Bin step as u128 fixed point */
    binStepU128: BN
    /** Filter period in slots/seconds */
    filterPeriod: number
    /** Decay period in slots/seconds */
    decayPeriod: number
    /** Reduction factor per period */
    reductionFactor: number
    /** Maximum volatility accumulator value */
    maxVolatilityAccumulator: number
    /** Variable fee control parameter */
    variableFeeControl: number
}

/**
 * Pool fee configuration combining base and dynamic fees
 */
export interface PoolFeesConfig {
    /** Base fee configuration */
    baseFee: BaseFeeConfig
    /** Dynamic fee configuration */
    dynamicFee: DynamicFeeConfig
}

/**
 * Pool fee parameters for creation
 */
export interface PoolFeeParameters {
    /** Base fee parameters */
    baseFee: BaseFeeParameters
    /** Dynamic fee parameters (optional) */
    dynamicFee?: DynamicFeeParameters | null
}

/**
 * Liquidity distribution at a specific price point
 */
export interface LiquidityDistributionParameters {
    /** Price point as sqrt(price) in Q64.64 format */
    sqrtPrice: BN
    /** Liquidity amount at this price point */
    liquidity: BN
}

/**
 * Liquidity distribution configuration for the bonding curve
 */
export interface LiquidityDistributionConfig {
    /** Price point as sqrt(price) in Q64.64 format */
    sqrtPrice: BN
    /** Liquidity amount at this price point */
    liquidity: BN
}

/**
 * Liquidity vesting information parameters
 */
export interface LiquidityVestingInfoParams {
    /** Whether this vesting schedule is initialized */
    isInitialized: number
    /** Percentage of liquidity subject to vesting (0-100) */
    vestingPercentage: number
    /** Basis points released per period (0-10000) */
    bpsPerPeriod: number
    /** Number of vesting periods */
    numberOfPeriods: number
    /** Cliff duration from migration time in seconds */
    cliffDurationFromMigrationTime: number
    /** Frequency of vesting periods in seconds */
    frequency: number
}

/**
 * Locked vesting configuration (strict vesting schedule)
 */
export interface LockedVestingConfig {
    /** Amount released per vesting period */
    amountPerPeriod: BN
    /** Cliff duration from migration time in seconds */
    cliffDurationFromMigrationTime: BN
    /** Frequency of vesting periods in seconds */
    frequency: BN
    /** Total number of vesting periods */
    numberOfPeriod: BN
    /** Amount unlocked at cliff */
    cliffUnlockAmount: BN
}

/**
 * Locked vesting parameters for pool creation
 */
export interface LockedVestingParameters {
    /** Total amount per vesting period */
    amountPerPeriod: BN
    /** Cliff duration from migration time in seconds */
    cliffDurationFromMigrationTime: BN
    /** Frequency of vesting periods in seconds */
    frequency: BN
    /** Total number of vesting periods */
    numberOfPeriod: BN
    /** Amount unlocked at cliff */
    cliffUnlockAmount: BN
}

/**
 * Pool metrics tracking aggregate fees
 */
export interface PoolMetrics {
    /** Total accumulated protocol base fees */
    totalProtocolBaseFee: BN
    /** Total accumulated protocol quote fees */
    totalProtocolQuoteFee: BN
    /** Total accumulated trading base fees */
    totalTradingBaseFee: BN
    /** Total accumulated trading quote fees */
    totalTradingQuoteFee: BN
}

/**
 * Token supply parameters
 */
export interface TokenSupplyParams {
    /** Total token supply before migration */
    preMigrationTokenSupply: BN
    /** Total token supply after migration */
    postMigrationTokenSupply: BN
}

/**
 * Migration fee breakdown
 */
export interface MigrationFeeOnChain {
    /** Overall migration fee percentage (0-100) */
    feePercentage: number
    /** Creator's share of migration fee (0-100) */
    creatorFeePercentage: number
}

/**
 * Initialize pool parameters
 */
export interface InitializePoolParameters {
    /** Pool name */
    name: string
    /** Pool symbol */
    symbol: string
    /** Pool URI/metadata URI */
    uri: string
}

/**
 * Create partner metadata parameters
 */
export interface CreatePartnerMetadataParameters {
    /** Partner name */
    name: string
    /** Partner website URL */
    website: string
    /** Partner logo URL */
    logo: string
}

/**
 * Migrated pool fee configuration for DAMM v2 pools
 */
export interface MigratedPoolFee {
    /** Fee collection mode: 0=QuoteToken, 1=OutputToken, 2=Compounding */
    collectFeeMode: number
    /** Dynamic fee mode for migrated pool */
    dynamicFee: number
    /** Pool fee in basis points */
    poolFeeBps: number
}

/**
 * Migrated pool market cap fee scheduler parameters
 */
export interface MigratedPoolMarketCapFeeSchedulerParameters {
    /** Number of fee reduction periods */
    numberOfPeriod: number
    /** Basis points per sqrt price step */
    sqrtPriceStepBps: number
    /** Scheduler expiration duration in seconds */
    schedulerExpirationDuration: number
    /** Fee reduction factor per period */
    reductionFactor: BN
}

/**
 * Configuration parameters for pool creation (all parameters needed to initialize a pool)
 */
export interface ConfigParameters {
    /** Pool fee configuration */
    poolFees: PoolFeeParameters
    /** Fee collection mode: 0=QuoteToken, 1=OutputToken */
    collectFeeMode: number
    /** Migration option: 0=DAMM v1, 1=DAMM v2 */
    migrationOption: number
    /** Activation type: 0=Slot, 1=Timestamp */
    activationType: number
    /** Base token type: 0=SPL, 1=Token2022 */
    tokenType: number
    /** Base token decimals */
    tokenDecimal: number
    /** Partner liquidity percentage of migrated supply */
    partnerLiquidityPercentage: number
    /** Partner permanently locked liquidity percentage */
    partnerPermanentLockedLiquidityPercentage: number
    /** Creator liquidity percentage of migrated supply */
    creatorLiquidityPercentage: number
    /** Creator permanently locked liquidity percentage */
    creatorPermanentLockedLiquidityPercentage: number
    /** Migration quote threshold (in quote token units) */
    migrationQuoteThreshold: BN
    /** Starting price as sqrt(price) in Q64.64 */
    sqrtStartPrice: BN
    /** Locked vesting configuration */
    lockedVesting: LockedVestingConfig
    /** Migration fee option: 0-5=Fixed, 6=Customizable */
    migrationFeeOption: number
    /** Token supply parameters (optional) */
    tokenSupply?: TokenSupplyParams | null
    /** Creator trading fee percentage (0-100) */
    creatorTradingFeePercentage: number
    /** Token update authority option */
    tokenUpdateAuthority: number
    /** Migration fee configuration */
    migrationFee: MigrationFeeOnChain
    /** Migrated pool fee configuration */
    migratedPoolFee: MigratedPoolFee
    /** Pool creation fee in lamports */
    poolCreationFee: BN
    /** Partner liquidity vesting information */
    partnerLiquidityVestingInfo: LiquidityVestingInfoParams
    /** Creator liquidity vesting information */
    creatorLiquidityVestingInfo: LiquidityVestingInfoParams
    /** Migrated pool base fee mode */
    migratedPoolBaseFeeMode: number
    /** Migrated pool market cap fee scheduler parameters */
    migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParameters
    /** Whether creator's first swap gets minimum fee */
    enableFirstSwapWithMinFee: boolean
    /** Compounding fee in basis points (for DAMM v2 Compounding mode) */
    compoundingFeeBps: number
    /** Bonding curve segments (up to 20 price points) */
    curve: LiquidityDistributionParameters[]
}

/**
 * Swap result with fee breakdown
 */
export interface SwapResult {
    /** Actual input amount swapped */
    actualInputAmount: BN
    /** Output amount received */
    outputAmount: BN
    /** Next sqrt price after swap */
    nextSqrtPrice: BN
    /** Trading fee amount */
    tradingFee: BN
    /** Protocol fee amount */
    protocolFee: BN
    /** Referral fee amount */
    referralFee: BN
}

/**
 * Swap result for swap2 instruction (with separate fee handling)
 */
export interface SwapResult2 {
    /** Input amount with fee included */
    includedFeeInputAmount: BN
    /** Input amount with fee excluded */
    excludedFeeInputAmount: BN
    /** Amount remaining after partial fill */
    amountLeft: BN
    /** Output amount received */
    outputAmount: BN
    /** Next sqrt price after swap */
    nextSqrtPrice: BN
    /** Trading fee amount */
    tradingFee: BN
    /** Protocol fee amount */
    protocolFee: BN
    /** Referral fee amount */
    referralFee: BN
}

/**
 * Volatility tracker for dynamic fee calculation
 */
export interface VolatilityTracker {
    /** Unix timestamp of last update */
    lastUpdateTimestamp: BN
    /** Reference sqrt price for volatility calculation */
    sqrtPriceReference: BN
    /** Accumulated volatility */
    volatilityAccumulator: BN
    /** Reference volatility */
    volatilityReference: BN
}

//////////////////
// IDL ACCOUNTS //
//////////////////

/**
 * Pool configuration account - stores all static and semi-static pool parameters
 */
export interface PoolConfig {
    /** Quote token mint address */
    quoteMint: PublicKey
    /** Partner/fee claimer address that receives trading fees */
    feeClaimer: PublicKey
    /** Address to receive leftover base tokens after migration (for fixed supply tokens) */
    leftoverReceiver: PublicKey
    /** Pool fee configuration */
    poolFees: PoolFeesConfig
    /** Partner liquidity vesting information */
    partnerLiquidityVestingInfo: LiquidityVestingInfoParams
    /** Creator liquidity vesting information */
    creatorLiquidityVestingInfo: LiquidityVestingInfoParams
    /** Fee collection mode: 0=QuoteToken, 1=OutputToken */
    collectFeeMode: number
    /** Migration option: 0=DAMM v1, 1=DAMM v2 */
    migrationOption: number
    /** Activation type: 0=Slot, 1=Timestamp */
    activationType: number
    /** Base token decimals */
    tokenDecimal: number
    /** Config version number */
    version: number
    /** Base token type: 0=SPL, 1=Token2022 */
    tokenType: number
    /** Quote token flag */
    quoteTokenFlag: number
    /** Partner permanently locked liquidity percentage */
    partnerPermanentLockedLiquidityPercentage: number
    /** Partner liquidity percentage of migrated supply */
    partnerLiquidityPercentage: number
    /** Creator permanently locked liquidity percentage */
    creatorPermanentLockedLiquidityPercentage: number
    /** Creator liquidity percentage of migrated supply */
    creatorLiquidityPercentage: number
    /** Migration fee option: 0-5=Fixed, 6=Customizable */
    migrationFeeOption: number
    /** Token supply flag: 0=dynamic, 1=fixed */
    fixedTokenSupplyFlag: number
    /** Creator trading fee percentage */
    creatorTradingFeePercentage: number
    /** Token update authority option */
    tokenUpdateAuthority: number
    /** Migration fee percentage */
    migrationFeePercentage: number
    /** Creator's share of migration fee percentage */
    creatorMigrationFeePercentage: number
    /** Amount of base tokens available for swaps */
    swapBaseAmount: BN
    /** Quote reserve threshold needed to trigger migration */
    migrationQuoteThreshold: BN
    /** Base reserve threshold at migration point */
    migrationBaseThreshold: BN
    /** Sqrt price at migration point */
    migrationSqrtPrice: BN
    /** Locked vesting configuration */
    lockedVestingConfig: LockedVestingConfig
    /** Total token supply before migration */
    preMigrationTokenSupply: BN
    /** Total token supply after migration */
    postMigrationTokenSupply: BN
    /** Migrated pool fee collection mode: 0=QuoteToken, 1=OutputToken, 2=Compounding */
    migratedCollectFeeMode: number
    /** Migrated pool dynamic fee mode */
    migratedDynamicFee: number
    /** Migrated pool fee in basis points */
    migratedPoolFeeBps: number
    /** Migrated pool base fee mode */
    migratedPoolBaseFeeMode: number
    /** Whether creator's first swap gets minimum fee */
    enableFirstSwapWithMinFee: number
    /** Compounding fee in basis points (for DAMM v2 Compounding mode) */
    migratedCompoundingFeeBps: number
    /** Pool creation fee in lamports */
    poolCreationFee: BN
    /** Starting price as sqrt(price) in Q64.64 */
    sqrtStartPrice: BN
    /** Bonding curve segments (up to 20 price points) */
    curve: LiquidityDistributionConfig[]
}

/**
 * Virtual pool account - stores dynamic pool state (reserves, fees, prices)
 */
export interface VirtualPool {
    /** Volatility tracker for dynamic fee calculation */
    volatilityTracker: VolatilityTracker
    /** Pool configuration account address */
    config: PublicKey
    /** Pool creator address */
    creator: PublicKey
    /** Base token mint address */
    baseMint: PublicKey
    /** Base token vault address */
    baseVault: PublicKey
    /** Quote token vault address */
    quoteVault: PublicKey
    /** Current base token reserve */
    baseReserve: BN
    /** Current quote token reserve */
    quoteReserve: BN
    /** Accumulated protocol base fees */
    protocolBaseFee: BN
    /** Accumulated protocol quote fees */
    protocolQuoteFee: BN
    /** Accumulated partner base fees */
    partnerBaseFee: BN
    /** Accumulated partner quote fees */
    partnerQuoteFee: BN
    /** Current price as sqrt(price) in Q64.64 */
    sqrtPrice: BN
    /** Slot or timestamp when pool becomes active */
    activationPoint: BN
    /** Pool type: 0=SPL Token, 1=Token2022 */
    poolType: number
    /** Whether pool has been migrated: 0=no, 1=yes */
    isMigrated: number
    /** Whether partner has withdrawn surplus: 0=no, 1=yes */
    isPartnerWithdrawSurplus: number
    /** Whether protocol has withdrawn surplus: 0=no, 1=yes */
    isProtocolWithdrawSurplus: number
    /** Current migration progress (0-100) */
    migrationProgress: number
    /** Whether leftover tokens have been withdrawn: 0=no, 1=yes */
    isWithdrawLeftover: number
    /** Whether creator has withdrawn surplus: 0=no, 1=yes */
    isCreatorWithdrawSurplus: number
    /** Migration fee withdrawal status */
    migrationFeeWithdrawStatus: number
    /** Pool usage metrics */
    metrics: PoolMetrics
    /** Unix timestamp when bonding curve was completed */
    finishCurveTimestamp: BN
    /** Accumulated creator base fees */
    creatorBaseFee: BN
    /** Accumulated creator quote fees */
    creatorQuoteFee: BN
    /** Pool creation fee claim status flags */
    creationFeeBits: number
}

/**
 * Migration metadata for DAMM v1 liquidity migration
 */
export interface MeteoraDammMigrationMetadata {
    /** The virtual pool being migrated */
    virtualPool: PublicKey
    /** Partner address */
    partner: PublicKey
    /** LP token mint from the migrated DAMM v1 pool */
    lpMint: PublicKey
    /** Partner's locked LP token amount */
    partnerLockedLiquidity: BN
    /** Partner's claimable LP token amount */
    partnerLiquidity: BN
    /** Creator's locked LP token amount */
    creatorLockedLiquidity: BN
    /** Creator's claimable LP token amount */
    creatorLiquidity: BN
    /** Whether creator's liquidity is locked: 0=no, 1=yes */
    creatorLockedStatus: number
    /** Whether partner's liquidity is locked: 0=no, 1=yes */
    partnerLockedStatus: number
    /** Whether creator has claimed LP tokens: 0=no, 1=yes */
    creatorClaimStatus: number
    /** Whether partner has claimed LP tokens: 0=no, 1=yes */
    partnerClaimStatus: number
}

/**
 * Lock escrow account for locking LP tokens
 */
export interface LockEscrow {
    /** The pool this lock escrow belongs to */
    pool: PublicKey
    /** Owner of this lock escrow */
    owner: PublicKey
    /** Token account holding the locked LP tokens */
    escrowVault: PublicKey
    /** PDA bump seed */
    bump: number
    /** Total LP tokens locked in this escrow */
    totalLockedAmount: BN
    /** LP tokens per base token at lock time */
    lpPerToken: BN
    /** Pending unclaimed fees */
    unclaimedFeePending: BN
    /** Accumulated fees in token A */
    aFee: BN
    /** Accumulated fees in token B */
    bFee: BN
}

/**
 * Partner metadata account
 */
export interface PartnerMetadata {
    /** Fee claimer address (partner) */
    feeClaimer: PublicKey
    /** Partner name */
    name: string
    /** Partner website URL */
    website: string
    /** Partner logo URL */
    logo: string
}

/**
 * Virtual pool metadata account
 */
export interface VirtualPoolMetadata {
    /** The virtual pool this metadata belongs to */
    virtualPool: PublicKey
    /** Project name */
    name: string
    /** Project website URL */
    website: string
    /** Project logo URL */
    logo: string
}

///////////
// ENUMS //
///////////

export enum ActivationType {
    Slot = 0,
    Timestamp = 1,
}

export enum TokenType {
    SPL = 0,
    Token2022 = 1,
}

export enum CollectFeeMode {
    QuoteToken = 0,
    OutputToken = 1,
}

export enum MigratedCollectFeeMode {
    QuoteToken = 0,
    OutputToken = 1,
    Compounding = 2,
}

export enum DammV2DynamicFeeMode {
    Disabled = 0,
    Enabled = 1,
}

export enum DammV2BaseFeeMode {
    // fee = cliff_fee_numerator - passed_period * reduction_factor
    // passed_period = (current_point - activation_point) / period_frequency
    FeeTimeSchedulerLinear = 0,
    // fee = cliff_fee_numerator * (1-reduction_factor/10_000)^passed_period
    FeeTimeSchedulerExponential = 1,
    // rate limiter
    RateLimiter = 2,
    // fee = cliff_fee_numerator - passed_period * reduction_factor
    // passed_period = changed_price / sqrt_price_step_bps
    // passed_period = (current_sqrt_price - init_sqrt_price) * 10_000 / init_sqrt_price / sqrt_price_step_bps
    FeeMarketCapSchedulerLinear = 3,
    // fee = cliff_fee_numerator * (1-reduction_factor/10_000)^passed_period
    FeeMarketCapSchedulerExponential = 4,
}

export enum MigrationOption {
    MET_DAMM = 0,
    MET_DAMM_V2 = 1,
}

export enum BaseFeeMode {
    FeeSchedulerLinear = 0,
    FeeSchedulerExponential = 1,
    RateLimiter = 2,
}

export enum MigrationFeeOption {
    FixedBps25 = 0,
    FixedBps30 = 1,
    FixedBps100 = 2,
    FixedBps200 = 3,
    FixedBps400 = 4,
    FixedBps600 = 5,
    Customizable = 6, // only for DAMM v2
}

export enum TokenDecimal {
    SIX = 6,
    SEVEN = 7,
    EIGHT = 8,
    NINE = 9,
}

export enum TradeDirection {
    BaseToQuote = 0,
    QuoteToBase = 1,
}

export enum Rounding {
    Up,
    Down,
}

export enum TokenUpdateAuthorityOption {
    // Creator has permission to update update_authority
    CreatorUpdateAuthority = 0,
    // No one has permission to update the authority
    Immutable = 1,
    // Partner has permission to update update_authority
    PartnerUpdateAuthority = 2,
    // Creator has permission as mint_authority and update_authority
    CreatorUpdateAndMintAuthority = 3,
    // Partner has permission as mint_authority and update_authority
    PartnerUpdateAndMintAuthority = 4,
}

export enum SwapMode {
    ExactIn = 0,
    PartialFill = 1,
    ExactOut = 2,
}

///////////
// TYPES //
///////////

export type CreateConfigParams = Omit<
    CreateConfigAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
> &
    ConfigParameters

export type CreateDammV1MigrationMetadataParams = Omit<
    CreateDammV1MigrationMetadataAccounts,
    'program' | 'eventAuthority' | 'systemProgram' | 'migrationMetadata'
>

// firstFactor - feeScheduler: numberOfPeriod, rateLimiter: feeIncrementBps
// secondFactor - feeScheduler: periodFrequency, rateLimiter: maxLimiterDuration
// thirdFactor - feeScheduler: reductionFactor, rateLimiter: referenceAmount
// baseFeeMode - BaseFeeMode
export type BaseFee = Omit<BaseFeeConfig, 'padding0'>

export type TokenConfig = {
    tokenType: TokenType
    tokenBaseDecimal: TokenDecimal
    tokenQuoteDecimal: TokenDecimal
    tokenUpdateAuthority: TokenUpdateAuthorityOption
    totalTokenSupply: number
    leftover: number
}

export type FeeSchedulerParams = {
    startingFeeBps: number
    endingFeeBps: number
    numberOfPeriod: number
    totalDuration: number
}

export type RateLimiterParams = {
    baseFeeBps: number
    feeIncrementBps: number
    referenceAmount: number
    maxLimiterDuration: number
}

export type BaseFeeParams =
    | {
          baseFeeMode:
              | BaseFeeMode.FeeSchedulerLinear
              | BaseFeeMode.FeeSchedulerExponential
          feeSchedulerParam: FeeSchedulerParams
      }
    | {
          baseFeeMode: BaseFeeMode.RateLimiter
          rateLimiterParam: RateLimiterParams
      }

export type FeeConfig = {
    baseFeeParams: BaseFeeParams
    dynamicFeeEnabled: boolean
    collectFeeMode: CollectFeeMode
    creatorTradingFeePercentage: number
    poolCreationFee: number
    enableFirstSwapWithMinFee: boolean
}

export type MigrationFee = {
    feePercentage: number
    creatorFeePercentage: number
}

export type MigratedPoolFeeConfig = {
    collectFeeMode: MigratedCollectFeeMode
    dynamicFee: DammV2DynamicFeeMode
    poolFeeBps: number
    compoundingFeeBps?: number
    baseFeeMode?: DammV2BaseFeeMode
    marketCapFeeSchedulerParams?: MigratedPoolMarketCapFeeSchedulerParams
}

export type MigrationConfig = {
    migrationOption: MigrationOption
    migrationFeeOption: MigrationFeeOption
    migrationFee: MigrationFee
    migratedPoolFee?: MigratedPoolFeeConfig
}

export type LiquidityVestingInfoParams_Input = {
    vestingPercentage: number
    bpsPerPeriod: number
    numberOfPeriods: number
    cliffDurationFromMigrationTime: number
    totalDuration: number
}

export type LiquidityDistributionConfig_Input = {
    partnerPermanentLockedLiquidityPercentage: number
    partnerLiquidityPercentage: number
    partnerLiquidityVestingInfoParams?: LiquidityVestingInfoParams_Input
    creatorPermanentLockedLiquidityPercentage: number
    creatorLiquidityPercentage: number
    creatorLiquidityVestingInfoParams?: LiquidityVestingInfoParams_Input
}

export type LockedVestingParams = {
    totalLockedVestingAmount: number
    numberOfVestingPeriod: number
    cliffUnlockAmount: number
    totalVestingDuration: number
    cliffDurationFromMigrationTime: number
}

export type BuildCurveBaseParams = {
    token: TokenConfig
    fee: FeeConfig
    migration: MigrationConfig
    liquidityDistribution: LiquidityDistributionConfig_Input
    lockedVesting: LockedVestingParams
    activationType: ActivationType
}

export type BuildCurveParams = BuildCurveBaseParams & {
    percentageSupplyOnMigration: number
    migrationQuoteThreshold: number
}

export type BuildCurveWithMarketCapParams = BuildCurveBaseParams & {
    initialMarketCap: number
    migrationMarketCap: number
}

export type BuildCurveWithTwoSegmentsParams = BuildCurveBaseParams & {
    initialMarketCap: number
    migrationMarketCap: number
    percentageSupplyOnMigration: number
}

export type BuildCurveWithMidPriceParams = BuildCurveBaseParams & {
    initialMarketCap: number
    migrationMarketCap: number
    midPrice: number
    percentageSupplyOnMigration: number
}

export type BuildCurveWithLiquidityWeightsParams = BuildCurveBaseParams & {
    initialMarketCap: number
    migrationMarketCap: number
    liquidityWeights: number[]
}

export type BuildCurveWithCustomSqrtPricesParams = BuildCurveBaseParams & {
    sqrtPrices: BN[] // Array of custom sqrt prices (must be in ascending order)
    liquidityWeights?: number[] // Optional weights for each segment. If not provided, liquidity is distributed evenly
}

export type InitializePoolBaseParams = {
    name: string
    symbol: string
    uri: string
    pool: PublicKey
    config: PublicKey
    payer: PublicKey
    poolCreator: PublicKey
    baseMint: PublicKey
    baseVault: PublicKey
    quoteVault: PublicKey
    quoteMint: PublicKey
    mintMetadata?: PublicKey
}

export type CreatePoolParams = {
    name: string
    symbol: string
    uri: string
    payer: PublicKey
    poolCreator: PublicKey
    config: PublicKey
    baseMint: PublicKey
}

export type CreateConfigAndPoolParams = CreateConfigParams & {
    preCreatePoolParam: PreCreatePoolParams
}

export type CreateConfigAndPoolWithFirstBuyParams =
    CreateConfigAndPoolParams & {
        firstBuyParam?: FirstBuyParams
    }

export type CreatePoolWithFirstBuyParams = {
    createPoolParam: CreatePoolParams
    firstBuyParam?: FirstBuyParams
}

export type CreatePoolWithPartnerAndCreatorFirstBuyParams = {
    createPoolParam: CreatePoolParams
    partnerFirstBuyParam?: PartnerFirstBuyParams
    creatorFirstBuyParam?: CreatorFirstBuyParams
}

export type PreCreatePoolParams = {
    name: string
    symbol: string
    uri: string
    poolCreator: PublicKey
    baseMint: PublicKey
}

export type FirstBuyParams = {
    buyer: PublicKey
    receiver?: PublicKey
    buyAmount: BN
    minimumAmountOut: BN
    referralTokenAccount: PublicKey | null
}

export type PartnerFirstBuyParams = {
    partner: PublicKey
    receiver: PublicKey
    buyAmount: BN
    minimumAmountOut: BN
    referralTokenAccount: PublicKey | null
}

export type CreatorFirstBuyParams = {
    creator: PublicKey
    receiver: PublicKey
    buyAmount: BN
    minimumAmountOut: BN
    referralTokenAccount: PublicKey | null
}

export type SwapParams = {
    owner: PublicKey
    pool: PublicKey
    amountIn: BN
    minimumAmountOut: BN
    swapBaseForQuote: boolean
    referralTokenAccount: PublicKey | null
    payer?: PublicKey
}

export type Swap2Params = {
    owner: PublicKey
    pool: PublicKey
    swapBaseForQuote: boolean
    referralTokenAccount: PublicKey | null
    payer?: PublicKey
} & (
    | {
          swapMode: SwapMode.ExactIn
          amountIn: BN
          minimumAmountOut: BN
      }
    | {
          swapMode: SwapMode.PartialFill
          amountIn: BN
          minimumAmountOut: BN
      }
    | {
          swapMode: SwapMode.ExactOut
          amountOut: BN
          maximumAmountIn: BN
      }
)

export type SwapQuoteParams = {
    virtualPool: VirtualPool
    config: PoolConfig
    swapBaseForQuote: boolean
    amountIn: BN
    slippageBps?: number
    hasReferral: boolean
    eligibleForFirstSwapWithMinFee: boolean // only for creator to bundle swap in initialize pool instruction to avoid anti sniper suite fee
    currentPoint: BN
}

export type SwapQuote2Params = {
    virtualPool: VirtualPool
    config: PoolConfig
    swapBaseForQuote: boolean
    hasReferral: boolean
    eligibleForFirstSwapWithMinFee: boolean // only for creator to bundle swap in initialize pool instruction to avoid anti sniper suite fee
    currentPoint: BN
    slippageBps?: number
} & (
    | {
          swapMode: SwapMode.ExactIn
          amountIn: BN
      }
    | {
          swapMode: SwapMode.PartialFill
          amountIn: BN
      }
    | {
          swapMode: SwapMode.ExactOut
          amountOut: BN
      }
)

export type MigrateToDammV1Params = {
    payer: PublicKey
    virtualPool: PublicKey
    dammConfig: PublicKey
}

export type MigrateToDammV2Params = MigrateToDammV1Params

export type MigrateToDammV2Response = {
    transaction: Transaction
    firstPositionNftKeypair: Keypair
    secondPositionNftKeypair: Keypair
}

export type DammLpTokenParams = {
    payer: PublicKey
    virtualPool: PublicKey
    dammConfig: PublicKey
    isPartner: boolean
}

export type CreateLockerParams = {
    payer: PublicKey
    virtualPool: PublicKey
}

export type ClaimTradingFeeParams = {
    feeClaimer: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver?: PublicKey
    tempWSolAcc?: PublicKey
}

export type ClaimTradingFee2Params = {
    feeClaimer: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver: PublicKey
}

export type ClaimPartnerTradingFeeWithQuoteMintNotSolParams = {
    feeClaimer: PublicKey
    payer: PublicKey
    feeReceiver: PublicKey
    config: PublicKey
    pool: PublicKey
    poolState: VirtualPool
    poolConfigState: PoolConfig
    tokenBaseProgram: PublicKey
    tokenQuoteProgram: PublicKey
}

export type ClaimPartnerTradingFeeWithQuoteMintSolParams =
    ClaimPartnerTradingFeeWithQuoteMintNotSolParams & {
        tempWSolAcc: PublicKey
    }

export type ClaimCreatorTradingFeeParams = {
    creator: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver?: PublicKey
    tempWSolAcc?: PublicKey
}

export type ClaimCreatorTradingFee2Params = {
    creator: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver: PublicKey
}

export type ClaimCreatorTradingFeeWithQuoteMintNotSolParams = {
    creator: PublicKey
    payer: PublicKey
    feeReceiver: PublicKey
    pool: PublicKey
    poolState: VirtualPool
    poolConfigState: PoolConfig
    tokenBaseProgram: PublicKey
    tokenQuoteProgram: PublicKey
}

export type ClaimCreatorTradingFeeWithQuoteMintSolParams =
    ClaimCreatorTradingFeeWithQuoteMintNotSolParams & {
        tempWSolAcc: PublicKey
    }

export type PartnerWithdrawSurplusParams = {
    feeClaimer: PublicKey
    virtualPool: PublicKey
}

export type CreatorWithdrawSurplusParams = {
    creator: PublicKey
    virtualPool: PublicKey
}

export type WithdrawLeftoverParams = {
    payer: PublicKey
    virtualPool: PublicKey
}

export type CreateVirtualPoolMetadataParams = {
    virtualPool: PublicKey
    name: string
    website: string
    logo: string
    creator: PublicKey
    payer: PublicKey
}

export type CreatePartnerMetadataParams = {
    name: string
    website: string
    logo: string
    feeClaimer: PublicKey
    payer: PublicKey
}

export type TransferPoolCreatorParams = {
    virtualPool: PublicKey
    creator: PublicKey
    newCreator: PublicKey
}

export type WithdrawMigrationFeeParams = {
    virtualPool: PublicKey
    sender: PublicKey // sender is creator or partner
}

export type ClaimPartnerPoolCreationFeeParams = {
    virtualPool: PublicKey
    feeReceiver: PublicKey
}

export type MigratedPoolFeeResult = {
    migratedPoolFee: {
        collectFeeMode: MigratedCollectFeeMode
        dynamicFee: DammV2DynamicFeeMode
        poolFeeBps: number
    }
    migratedPoolBaseFeeMode: DammV2BaseFeeMode
    migratedPoolMarketCapFeeSchedulerParams: MigratedPoolMarketCapFeeSchedulerParameters
    migrationFeeOption: MigrationFeeOption
    compoundingFeeBps: number
}

////////////////
// INTERFACES //
////////////////

export interface BaseFeeHandler {
    validate(
        collectFeeMode: CollectFeeMode,
        activationType: ActivationType
    ): boolean
    getMinBaseFeeNumerator(): BN
    getBaseFeeNumeratorFromIncludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN,
        tradeDirection: TradeDirection,
        includedFeeAmount: BN
    ): BN
    getBaseFeeNumeratorFromExcludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN,
        tradeDirection: TradeDirection,
        excludedFeeAmount: BN
    ): BN
}

export interface FeeResult {
    amount: BN
    protocolFee: BN
    tradingFee: BN
    referralFee: BN
}

export interface FeeMode {
    feesOnInput: boolean
    feesOnBaseToken: boolean
    hasReferral: boolean
}

export interface SwapQuoteResult extends SwapResult {
    minimumAmountOut: BN
}

export interface SwapQuote2Result extends SwapResult2 {
    minimumAmountOut?: BN
    maximumAmountIn?: BN
}

export interface FeeOnAmountResult {
    amount: BN
    protocolFee: BN
    tradingFee: BN
    referralFee: BN
}

export interface PrepareSwapParams {
    inputMint: PublicKey
    outputMint: PublicKey
    inputTokenProgram: PublicKey
    outputTokenProgram: PublicKey
}

export interface SwapAmount {
    outputAmount: BN
    nextSqrtPrice: BN
    amountLeft: BN
}
