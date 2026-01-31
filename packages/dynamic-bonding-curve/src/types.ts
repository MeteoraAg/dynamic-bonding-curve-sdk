import type {
    Accounts,
    BN,
    IdlAccounts,
    IdlTypes,
    Program,
} from '@coral-xyz/anchor'
import type { DynamicBondingCurve } from './idl/dynamic-bonding-curve/idl'
import type { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurve as DynamicBondingCurveIDL } from './idl/dynamic-bonding-curve/idl'

export type DynamicCurveProgram = Program<DynamicBondingCurveIDL>

/////////////////
// IX ACCOUNTS //
/////////////////

export type CreateConfigAccounts = Accounts<
    DynamicBondingCurve['instructions']['7']
>['createConfig']

export type CreateDammV1MigrationMetadataAccounts = Accounts<
    DynamicBondingCurve['instructions']['19']
>['migrationMeteoraDammCreateMetadata']

export type InitializeSplPoolAccounts = Accounts<
    DynamicBondingCurve['instructions']['12']
>['initializeVirtualPoolWithSplToken']

export type InitializeToken2022PoolAccounts = Accounts<
    DynamicBondingCurve['instructions']['13']
>['initializeVirtualPoolWithToken2022']

///////////////
// IDL Types //
///////////////

export type ConfigParameters = IdlTypes<DynamicBondingCurve>['configParameters']
export type LockedVestingParameters =
    IdlTypes<DynamicBondingCurve>['lockedVestingParams']

export type InitializePoolParameters =
    IdlTypes<DynamicBondingCurve>['initializePoolParameters']

export type PoolFeeParameters =
    IdlTypes<DynamicBondingCurve>['poolFeeParameters']

export type DynamicFeeParameters =
    IdlTypes<DynamicBondingCurve>['dynamicFeeParameters']

export type LiquidityDistributionParameters =
    IdlTypes<DynamicBondingCurve>['liquidityDistributionParameters']

export type MigratedPoolMarketCapFeeSchedulerParameters =
    IdlTypes<DynamicBondingCurve>['migratedPoolMarketCapFeeSchedulerParams']

export type LiquidityVestingInfoParameters =
    IdlTypes<DynamicBondingCurve>['liquidityVestingInfoParams']

export type CreatePartnerMetadataParameters =
    IdlTypes<DynamicBondingCurve>['createPartnerMetadataParameters']

export type PoolFeesConfig = IdlTypes<DynamicBondingCurve>['poolFeesConfig']

export type BaseFeeConfig = IdlTypes<DynamicBondingCurve>['baseFeeConfig']

export type DynamicFeeConfig = IdlTypes<DynamicBondingCurve>['dynamicFeeConfig']

export type MigratedPoolFee = IdlTypes<DynamicBondingCurve>['migratedPoolFee']

export type SwapResult = IdlTypes<DynamicBondingCurve>['swapResult']

export type SwapResult2 = IdlTypes<DynamicBondingCurve>['swapResult2']

export type VolatilityTracker =
    IdlTypes<DynamicBondingCurve>['volatilityTracker']

//////////////////
// IDL ACCOUNTS //
//////////////////

export type PoolConfig = IdlAccounts<DynamicBondingCurve>['poolConfig']

export type VirtualPool = IdlAccounts<DynamicBondingCurve>['virtualPool']

export type MeteoraDammMigrationMetadata =
    IdlAccounts<DynamicBondingCurve>['meteoraDammMigrationMetadata']

export type LockEscrow = IdlAccounts<DynamicBondingCurve>['lockEscrow']

export type PartnerMetadata =
    IdlAccounts<DynamicBondingCurve>['partnerMetadata']

export type VirtualPoolMetadata =
    IdlAccounts<DynamicBondingCurve>['virtualPoolMetadata']

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

export type LockedVestingParams = {
    totalLockedVestingAmount: number
    numberOfVestingPeriod: number
    cliffUnlockAmount: number
    totalVestingDuration: number
    cliffDurationFromMigrationTime: number
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

export type BuildCurveBaseParams = {
    totalTokenSupply: number
    tokenType: TokenType
    tokenBaseDecimal: TokenDecimal
    tokenQuoteDecimal: TokenDecimal
    tokenUpdateAuthority: number
    lockedVestingParams: LockedVestingParams
    leftover: number
    baseFeeParams: BaseFeeParams
    dynamicFeeEnabled: boolean
    activationType: ActivationType
    collectFeeMode: CollectFeeMode
    creatorTradingFeePercentage: number
    poolCreationFee: number
    migrationOption: MigrationOption
    migrationFeeOption: MigrationFeeOption
    migrationFee: {
        feePercentage: number
        creatorFeePercentage: number
    }
    partnerPermanentLockedLiquidityPercentage: number
    partnerLiquidityPercentage: number
    creatorPermanentLockedLiquidityPercentage: number
    creatorLiquidityPercentage: number
    enableFirstSwapWithMinFee: boolean
    partnerLiquidityVestingInfoParams?: LiquidityVestingInfoParams
    creatorLiquidityVestingInfoParams?: LiquidityVestingInfoParams
    migratedPoolFee?: {
        collectFeeMode: CollectFeeMode
        dynamicFee: DammV2DynamicFeeMode
        poolFeeBps: number
    }
    migratedPoolBaseFeeMode?: DammV2BaseFeeMode
    migratedPoolMarketCapFeeSchedulerParams?: MigratedPoolMarketCapFeeSchedulerParams
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

export type LiquidityVestingInfoParams = Omit<
    LiquidityVestingInfoParameters,
    'frequency'
> & { totalDuration: number }

export type MigratedPoolMarketCapFeeSchedulerParams = Omit<
    MigratedPoolMarketCapFeeSchedulerParameters,
    'reductionFactor'
> & {
    endingBaseFeeBps: number
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
