import type { Accounts, BN, IdlAccounts, IdlTypes } from '@coral-xyz/anchor'
import type { DynamicBondingCurve } from './idl/dynamic-bonding-curve/idl'
import type { Keypair, PublicKey, Transaction } from '@solana/web3.js'

/////////////////
// IX ACCOUNTS //
/////////////////

export type ClaimCreatorTradingFeeAccounts = Accounts<
    DynamicBondingCurve['instructions']['0']
>['claimCreatorTradingFee']

export type ClaimProtocolFeeAccounts = Accounts<
    DynamicBondingCurve['instructions']['1']
>['claimProtocolFee']

export type ClaimTradingFeeAccounts = Accounts<
    DynamicBondingCurve['instructions']['2']
>['claimTradingFee']

export type CloseClaimFeeOperatorAccounts = Accounts<
    DynamicBondingCurve['instructions']['3']
>['closeClaimFeeOperator']

export type CreateClaimFeeOperatorAccounts = Accounts<
    DynamicBondingCurve['instructions']['4']
>['createClaimFeeOperator']

export type CreateConfigAccounts = Accounts<
    DynamicBondingCurve['instructions']['5']
>['createConfig']

export type CreateLockerAccounts = Accounts<
    DynamicBondingCurve['instructions']['6']
>['createLocker']

export type CreatePartnerMetadata = Accounts<
    DynamicBondingCurve['instructions']['7']
>['createPartnerMetadata']

export type CreateVirtualPoolMetadata = Accounts<
    DynamicBondingCurve['instructions']['8']
>['createVirtualPoolMetadata']

export type CreatorWithdrawSurplusAccounts = Accounts<
    DynamicBondingCurve['instructions']['9']
>['creatorWithdrawSurplus']

export type InitializeVirtualPoolWithSplTokenAccounts = Accounts<
    DynamicBondingCurve['instructions']['10']
>['initializeVirtualPoolWithSplToken']

export type InitializeVirtualPoolWithToken2022Accounts = Accounts<
    DynamicBondingCurve['instructions']['11']
>['initializeVirtualPoolWithToken2022']

export type MigrateMeteoraDammAccounts = Accounts<
    DynamicBondingCurve['instructions']['12']
>['migrateMeteoraDamm']

export type MigrateMeteoraDammClaimLpTokenAccounts = Accounts<
    DynamicBondingCurve['instructions']['13']
>['migrateMeteoraDammClaimLpToken']

export type MigrateMeteoraDammLockLpTokenAccounts = Accounts<
    DynamicBondingCurve['instructions']['14']
>['migrateMeteoraDammLockLpToken']

export type MigrationDammV2Accounts = Accounts<
    DynamicBondingCurve['instructions']['15']
>['migrationDammV2']

export type MigrationDammV2CreateMetadataAccounts = Accounts<
    DynamicBondingCurve['instructions']['16']
>['migrationDammV2CreateMetadata']

export type MigrationMeteoraDammCreateMetadataAccounts = Accounts<
    DynamicBondingCurve['instructions']['17']
>['migrationMeteoraDammCreateMetadata']

export type PartnerWithdrawSurplusAccounts = Accounts<
    DynamicBondingCurve['instructions']['18']
>['partnerWithdrawSurplus']

export type SwapAccounts = Accounts<
    DynamicBondingCurve['instructions']['20']
>['swap']

export type TransferPoolCreatorAccounts = Accounts<
    DynamicBondingCurve['instructions']['21']
>['transferPoolCreator']

export type WithdrawLeftoverAccounts = Accounts<
    DynamicBondingCurve['instructions']['22']
>['withdrawLeftover']

///////////////
// IDL Types //
///////////////

export type ConfigParameters = IdlTypes<DynamicBondingCurve>['configParameters']
export type LockedVestingParameters =
    IdlTypes<DynamicBondingCurve>['lockedVestingParams']
export type InitializePoolParameters =
    IdlTypes<DynamicBondingCurve>['initializePoolParameters']
export type SwapParameters = IdlTypes<DynamicBondingCurve>['swapParameters']
export type PoolFeeParameters =
    IdlTypes<DynamicBondingCurve>['poolFeeParameters']
export type DynamicFeeParameters =
    IdlTypes<DynamicBondingCurve>['dynamicFeeParameters']
export type LiquidityDistributionParameters =
    IdlTypes<DynamicBondingCurve>['liquidityDistributionParameters']
export type PoolFeesConfig = IdlTypes<DynamicBondingCurve>['poolFeesConfig']
export type DynamicFeeConfig = IdlTypes<DynamicBondingCurve>['dynamicFeeConfig']
export type BaseFeeConfig = IdlTypes<DynamicBondingCurve>['baseFeeConfig']
export type PoolFees = IdlTypes<DynamicBondingCurve>['poolFees']
export type PoolMetrics = IdlTypes<DynamicBondingCurve>['poolMetrics']
export type SwapResult = IdlTypes<DynamicBondingCurve>['swapResult']
export type CreatePartnerMetadataParameters =
    IdlTypes<DynamicBondingCurve>['createPartnerMetadataParameters']
export type CreateVirtualPoolMetadataParameters =
    IdlTypes<DynamicBondingCurve>['createVirtualPoolMetadataParameters']

//////////////////
// IDL ACCOUNTS //
//////////////////

export type ClaimFeeOperator =
    IdlAccounts<DynamicBondingCurve>['claimFeeOperator']
export type Config = IdlAccounts<DynamicBondingCurve>['config']
export type MeteoraDammMigrationMetadata =
    IdlAccounts<DynamicBondingCurve>['meteoraDammMigrationMetadata']
export type MeteoraDammV2MigrationMetadata =
    IdlAccounts<DynamicBondingCurve>['meteoraDammV2Metadata']
export type LockEscrow = IdlAccounts<DynamicBondingCurve>['lockEscrow']
export type VolatilityTracker =
    IdlTypes<DynamicBondingCurve>['volatilityTracker']
export type VirtualPool = IdlAccounts<DynamicBondingCurve>['virtualPool']
export type PoolConfig = IdlAccounts<DynamicBondingCurve>['poolConfig']
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
    OnlyQuote = 0,
    Both = 1,
}

export enum MigrationOption {
    MET_DAMM = 0,
    MET_DAMM_V2 = 1,
}

export enum GetFeeMode {
    QuoteToken = 0,
    OutputToken = 1,
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
    Mutable = 0,
    Immutable = 1,
}

///////////
// TYPES //
///////////

export type CreateConfigParam = Omit<
    CreateConfigAccounts,
    'program' | 'eventAuthority' | 'systemProgram'
> &
    ConfigParameters

export type CreateDammV1MigrationMetadataParam = {
    payer: PublicKey
    virtualPool: PublicKey
    config: PublicKey
}

export type CreateDammV2MigrationMetadataParam =
    CreateDammV1MigrationMetadataParam

export type BaseFee = {
    cliffFeeNumerator: BN
    firstFactor: number // feeScheduler: numberOfPeriod, rateLimiter: feeIncrementBps
    secondFactor: BN // feeScheduler: periodFrequency, rateLimiter: maxLimiterDuration
    thirdFactor: BN // feeScheduler: reductionFactor, rateLimiter: referenceAmount
    baseFeeMode: BaseFeeMode
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

export type BuildCurveBaseParam = {
    totalTokenSupply: number
    migrationOption: MigrationOption
    tokenBaseDecimal: TokenDecimal
    tokenQuoteDecimal: TokenDecimal
    lockedVestingParam: LockedVestingParams
    baseFeeParams: BaseFeeParams
    dynamicFeeEnabled: boolean
    activationType: ActivationType
    collectFeeMode: CollectFeeMode
    migrationFeeOption: MigrationFeeOption
    tokenType: TokenType
    partnerLpPercentage: number
    creatorLpPercentage: number
    partnerLockedLpPercentage: number
    creatorLockedLpPercentage: number
    creatorTradingFeePercentage: number
    leftover: number
    tokenUpdateAuthority: number
    migrationFee: {
        feePercentage: number
        creatorFeePercentage: number
    }
}

export type BuildCurveParam = BuildCurveBaseParam & {
    percentageSupplyOnMigration: number
    migrationQuoteThreshold: number
}

export type BuildCurveWithMarketCapParam = BuildCurveBaseParam & {
    initialMarketCap: number
    migrationMarketCap: number
}

export type BuildCurveWithTwoSegmentsParam = BuildCurveBaseParam & {
    initialMarketCap: number
    migrationMarketCap: number
    percentageSupplyOnMigration: number
}

export type BuildCurveWithLiquidityWeightsParam = BuildCurveBaseParam & {
    initialMarketCap: number
    migrationMarketCap: number
    liquidityWeights: number[]
}

export type BuildCurveWithFlatSegmentParam = BuildCurveBaseParam & {
    initialMarketCap: number
    migrationMarketCap: number
    percentageSupplyOnMigration: number
    flatSegmentPercentage: number
}

export type InitializePoolBaseParam = {
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

export type CreatePoolParam = {
    name: string
    symbol: string
    uri: string
    payer: PublicKey
    poolCreator: PublicKey
    config: PublicKey
    baseMint: PublicKey
}

export type CreateConfigAndPoolParam = CreateConfigParam & {
    createPoolParam: {
        name: string
        symbol: string
        uri: string
        poolCreator: PublicKey
        baseMint: PublicKey
    }
}

export type CreateConfigAndPoolWithFirstBuyParam = CreateConfigAndPoolParam & {
    swapBuyParam: {
        buyAmount: BN
        minimumAmountOut: BN
        referralTokenAccount: PublicKey | null
    }
}

export type CreatePoolWithFirstBuyParam = {
    createPoolParam: CreatePoolParam
    buyAmount: BN
    minimumAmountOut: BN
    referralTokenAccount: PublicKey | null
}

export type SwapParam = {
    owner: PublicKey
    pool: PublicKey
    amountIn: BN
    minimumAmountOut: BN
    swapBaseForQuote: boolean
    referralTokenAccount: PublicKey | null
}

export type SwapQuoteParam = {
    virtualPool: VirtualPool
    config: PoolConfig
    swapBaseForQuote: boolean
    amountIn: BN
    slippageBps?: number
    hasReferral: boolean
    currentPoint: BN
}

export type SwapQuoteExactInParam = {
    virtualPool: VirtualPool
    config: PoolConfig
    currentPoint: BN
}

export type MigrateToDammV1Param = {
    payer: PublicKey
    virtualPool: PublicKey
    dammConfig: PublicKey
}

export type MigrateToDammV2Param = MigrateToDammV1Param

export type MigrateToDammV2Response = {
    transaction: Transaction
    firstPositionNftKeypair: Keypair
    secondPositionNftKeypair: Keypair
}

export type DammLpTokenParam = {
    payer: PublicKey
    virtualPool: PublicKey
    dammConfig: PublicKey
    isPartner: boolean
}

export type CreateLockerParam = {
    payer: PublicKey
    virtualPool: PublicKey
}

export type ClaimTradingFeeParam = {
    feeClaimer: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver?: PublicKey
    tempWSolAcc?: PublicKey
}

export type ClaimTradingFee2Param = {
    feeClaimer: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver: PublicKey
}

export type ClaimPartnerTradingFeeWithQuoteMintNotSolParam = {
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

export type ClaimPartnerTradingFeeWithQuoteMintSolParam =
    ClaimPartnerTradingFeeWithQuoteMintNotSolParam & {
        tempWSolAcc: PublicKey
    }

export type ClaimCreatorTradingFeeParam = {
    creator: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver?: PublicKey
    tempWSolAcc?: PublicKey
}

export type ClaimCreatorTradingFee2Param = {
    creator: PublicKey
    payer: PublicKey
    pool: PublicKey
    maxBaseAmount: BN
    maxQuoteAmount: BN
    receiver: PublicKey
}

export type ClaimCreatorTradingFeeWithQuoteMintNotSolParam = {
    creator: PublicKey
    payer: PublicKey
    feeReceiver: PublicKey
    pool: PublicKey
    poolState: VirtualPool
    poolConfigState: PoolConfig
    tokenBaseProgram: PublicKey
    tokenQuoteProgram: PublicKey
}

export type ClaimCreatorTradingFeeWithQuoteMintSolParam =
    ClaimCreatorTradingFeeWithQuoteMintNotSolParam & {
        tempWSolAcc: PublicKey
    }

export type PartnerWithdrawSurplusParam = {
    feeClaimer: PublicKey
    virtualPool: PublicKey
}

export type CreatorWithdrawSurplusParam = {
    creator: PublicKey
    virtualPool: PublicKey
}

export type WithdrawLeftoverParam = {
    payer: PublicKey
    virtualPool: PublicKey
}

export type CreateVirtualPoolMetadataParam = {
    virtualPool: PublicKey
    name: string
    website: string
    logo: string
    creator: PublicKey
    payer: PublicKey
}

export type CreatePartnerMetadataParam = {
    name: string
    website: string
    logo: string
    feeClaimer: PublicKey
    payer: PublicKey
}

export type TransferPoolCreatorParam = {
    virtualPool: PublicKey
    creator: PublicKey
    newCreator: PublicKey
}

export type WithdrawMigrationFeeParam = {
    virtualPool: PublicKey
    sender: PublicKey // sender is creator or partner
    feePayer?: PublicKey
}

////////////////
// INTERFACES //
////////////////

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

export interface QuoteResult {
    amountOut: BN
    minimumAmountOut: BN
    nextSqrtPrice: BN
    fee: {
        trading: BN
        protocol: BN
        referral?: BN
    }
    price: {
        beforeSwap: BN
        afterSwap: BN
    }
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
}
