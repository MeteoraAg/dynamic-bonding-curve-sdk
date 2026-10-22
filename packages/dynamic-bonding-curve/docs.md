# Dynamic Bonding Curve SDK: Function Documentation

## Table of Contents

- [Partner Functions](#partner-functions)
    - [createConfig](#createconfig)
    - [createConfig2](#createconfig2)
    - [createConfigWithTransferHook](#createconfigwithtransferhook)
    - [createConfigAndPool](#createconfigandpool)
    - [createConfigAndPoolWithTransferHook](#createconfigandpoolwithtransferhook)
    - [createConfigAndPoolWithFirstBuy](#createconfigandpoolwithfirstbuy)
    - [createConfigAndPoolWithFirstBuyWithTransferHook](#createconfigandpoolwithfirstbuywithtransferhook)
    - [createPartnerMetadata](#createpartnermetadata)
    - [claimPartnerTradingFee](#claimpartnertradingfee)
    - [claimPartnerTradingFeeToReceiver](#claimpartnertradingfeetoreceiver)
    - [claimPartnerTradingFee2](#claimpartnertradingfee2)
    - [partnerWithdrawSurplus](#partnerwithdrawsurplus)
    - [partnerWithdrawMigrationFee](#partnerwithdrawmigrationfee)
    - [claimPartnerPoolCreationFee](#claimpartnerpoolcreationfee)

- [Build Curve Functions](#build-curve-functions)
    - [buildCurve](#buildcurve)
    - [buildCurveWithMarketCap](#buildcurvewithmarketcap)
    - [buildCurveWithTwoSegments](#buildcurvewithtwosegments)
    - [buildCurveWithMidPrice](#buildcurvewithmidprice)
    - [buildCurveWithLiquidityWeights](#buildcurvewithliquidityweights)
    - [buildCurveWithCustomSqrtPrices](#buildcurvewithcustomsqrtprices)

- [Pool Functions](#pool-functions)
    - [swap](#swap)
    - [swapQuote](#swapquote)
    - [swap2](#swap2)
    - [swap2WithTransferHook](#swap2withtransferhook)
    - [swapQuote2](#swapquote2)
    - [getQuoteFromInputAmount](#getquotefrominputamount)
    - [getQuoteFromOutputAmount](#getquotefromoutputamount)

- [Migration Functions](#migration-functions)
    - [createLocker](#createlocker)
    - [withdrawLeftover](#withdrawleftover)
    - [createDammV1MigrationMetadata](#createdammv1migrationmetadata)
    - [migrateToDammV1](#migratetodammv1)
    - [lockDammV1LpToken](#lockdammv1lptoken)
    - [claimDammV1LpToken](#claimdammv1lptoken)
    - [migrateToDammV2](#migratetodammv2)

- [Creator Functions](#creator-functions)
    - [createPool](#createpool)
    - [createPoolWithTransferHook](#createpoolwithtransferhook)
    - [createPoolWithFirstBuy](#createpoolwithfirstbuy)
    - [createPoolWithFirstBuyWithTransferHook](#createpoolwithfirstbuywithtransferhook)
    - [createPoolWithPartnerAndCreatorFirstBuy](#createpoolwithpartnerandcreatorfirstbuy)
    - [createPoolWithPartnerAndCreatorFirstBuyWithTransferHook](#createpoolwithpartnerandcreatorfirstbuywithtransferhook)
    - [createPoolMetadata](#createpoolmetadata)
    - [claimCreatorTradingFee](#claimcreatortradingfee)
    - [claimCreatorTradingFeeToReceiver](#claimcreatortradingfeetoreceiver)
    - [claimCreatorTradingFee2](#claimcreatortradingfee2)
    - [creatorWithdrawSurplus](#creatorwithdrawsurplus)
    - [creatorWithdrawMigrationFee](#creatorwithdrawmigrationfee)
    - [transferPoolCreator](#transferpoolcreator)

- [State Functions](#state-functions)
    - [getPoolConfig](#getpoolconfig)
    - [getPoolConfigs](#getpoolconfigs)
    - [getPoolConfigsByOwner](#getpoolconfigsbyowner)
    - [getPool](#getpool)
    - [getPools](#getpools)
    - [getPoolsByConfig](#getpoolsbyconfig)
    - [getPoolsByCreator](#getpoolsbycreator)
    - [getPoolByBaseMint](#getpoolbybasemint)
    - [getPoolMigrationQuoteThreshold](#getpoolmigrationquotethreshold)
    - [getPoolQuoteTokenCurveProgress](#getpoolquotetokencurveprogress)
    - [getPoolBaseTokenCurveProgress](#getpoolbasetokencurveprogress)
    - [getPoolMetadata](#getpoolmetadata)
    - [getPartnerMetadata](#getpartnermetadata)
    - [getDammV1MigrationMetadata](#getdammv1migrationmetadata)
    - [getTokenBadge](#gettokenbadge)
    - [isTransferHookConfig](#istransferhookconfig)
    - [isTransferHookPool](#istransferhookpool)
    - [getConfigWithTransferHook](#getconfigwithtransferhook)
    - [getPoolFeeMetrics](#getpoolfeemetrics)
    - [getPoolFeeBreakdown](#getpoolfeebreakdown)
    - [getPoolsFeesByConfig](#getpoolsfeesbyconfig)
    - [getPoolsFeesByCreator](#getpoolsfeesbycreator)
    - [getPoolConfigWithKind](#getpoolconfigwithkind)
    - [getPoolWithKind](#getpoolwithkind)
    - [getPoolSurplus](#getpoolsurplus)

- [Helper Functions](#helper-functions)
    - [deriveDbcPoolAddress](#derivedbcpooladdress)
    - [deriveDammV1PoolAddress](#derivedammv1pooladdress)
    - [deriveDammV2PoolAddress](#derivedammv2pooladdress)
    - [deriveDbcTokenVaultAddress](#derivedbctokenvaultaddress)
    - [deriveTokenBadgeAddress](#derivetokenbadgeaddress)
    - [getCurrentPoint](#getcurrentpoint)
    - [prepareSwapAmountParam](#prepareswapamountparam)
    - [createDbcProgram](#createdbcprogram)
    - [deriveBaseKeyForLocker](#derivebasekeyforlocker)
    - [deriveDammV1MigrationMetadataAddress](#derivedammv1migrationmetadataaddress)
    - [deriveDbcEventAuthority](#derivedbceventauthority)
    - [deriveDbcPoolAuthority](#derivedbcpoolauthority)
    - [deriveDbcPoolMetadata](#derivedbcpoolmetadata)
    - [deriveLockerEscrowAddress](#derivelockerescrowaddress)
    - [derivePartnerMetadata](#derivepartnermetadata)
    - [getTokenBadgeRemainingAccounts](#gettokenbadgeremainingaccounts)
    - [createSqrtPrices](#createsqrtprices)
    - [getBaseTokenForSwap](#getbasetokenforswap)
    - [getPriceFromSqrtPrice](#getpricefromsqrtprice)
    - [getSqrtPriceFromMarketCap](#getsqrtpricefrommarketcap)
    - [getSqrtPriceFromPrice](#getsqrtpricefromprice)
    - [rateLimiterApplied](#ratelimiterapplied)
    - [getSwapQuoteTransferFees](#getswapquotetransferfees)
    - [getTokenProgram](#gettokenprogram)
    - [getTokenType](#gettokentype)
    - [bpsToFeeNumerator](#bpstofeenumerator)
    - [convertToLamports](#converttolamports)
    - [feeNumeratorToBps](#feenumeratortobps)
    - [fromDecimalToBN](#fromdecimaltobn)

- [Calculation Functions](#calculation-functions)
    - [getFeeSchedulerParams](#getfeeschedulerparams)
    - [getRateLimiterParams](#getratelimiterparams)
    - [getDynamicFeeParams](#getdynamicfeeparams)
    - [getLockedVestingParams](#getlockedvestingparams)
    - [getQuoteReserveFromNextSqrtPrice](#getquotereservefromnextsqrtprice)
    - [calculateFeeSchedulerEndingBaseFeeBps](#calculatefeeschedulerendingbasefeebps)
    - [getBaseFeeParams](#getbasefeeparams)
    - [getMigratedPoolFeeParams](#getmigratedpoolfeeparams)
    - [getMigratedPoolMarketCapFeeSchedulerParams](#getmigratedpoolmarketcapfeeschedulerparams)
    - [getStartingBaseFeeBpsFromBaseFeeParams](#getstartingbasefeebpsfrombasefeeparams)
    - [getCurveBreakdown](#getcurvebreakdown)
    - [getMigrationBaseToken](#getmigrationbasetoken)
    - [getMigrationQuoteAmountFromThreshold](#getmigrationquoteamountfromthreshold)
    - [getMigrationThresholdPrice](#getmigrationthresholdprice)
    - [getPercentageSupplyOnMigration](#getpercentagesupplyonmigration)
    - [getTransferFeeMigrationPositionSplit](#gettransferfeemigrationpositionsplit)
    - [getProtocolMigrationFee](#getprotocolmigrationfee)
    - [getSwapAmountWithBuffer](#getswapamountwithbuffer)
    - [getTokenomics](#gettokenomics)
    - [getTotalSupplyFromCurve](#gettotalsupplyfromcurve)
    - [calculateLockedLiquidityBpsAtTime](#calculatelockedliquiditybpsattime)
    - [getLiquidityVestingInfoParams](#getliquidityvestinginfoparams)
    - [getTotalVestingAmount](#gettotalvestingamount)
    - [getVestingLockedLiquidityBpsAtNSeconds](#getvestinglockedliquiditybpsatnseconds)
    - [getSurplusBreakdown](#getsurplusbreakdown)

- [Quote Functions](#quote-functions)
    - [calculateTransferFeeExcludedAmount](#calculatetransferfeeexcludedamount)
    - [calculateTransferFeeIncludedAmount](#calculatetransferfeeincludedamount)
    - [isZeroTransferFee](#iszerotransferfee)
    - [resolveSwapTransferFees](#resolveswaptransferfees)

- [Validation Functions](#validation-functions)
    - [validateCompoundingFeeBps](#validatecompoundingfeebps)
    - [validateConfigParameters](#validateconfigparameters)
    - [validateMigratedPoolFee](#validatemigratedpoolfee)
    - [validateTransferFeeParameters](#validatetransferfeeparameters)

- [Math Functions](#math-functions)
    - [calculateBaseToQuoteFromAmountIn](#calculatebasetoquotefromamountin)
    - [calculateBaseToQuoteFromAmountOut](#calculatebasetoquotefromamountout)
    - [calculateQuoteToBaseFromAmountIn](#calculatequotetobasefromamountin)
    - [calculateQuoteToBaseFromAmountOut](#calculatequotetobasefromamountout)
    - [getSwapResult](#getswapresult)
    - [getSwapResultFromExactInput](#getswapresultfromexactinput)
    - [getSwapResultFromExactOutput](#getswapresultfromexactoutput)
    - [getSwapResultFromPartialInput](#getswapresultfrompartialinput)
    - [getInitialLiquidityFromDeltaQuote](#getinitialliquidityfromdeltaquote)
    - [getInitialLiquidityFromDeltaBase](#getinitialliquidityfromdeltabase)
    - [getDeltaAmountBaseUnsigned](#getdeltaamountbaseunsigned)
    - [getDeltaAmountBaseUnsigned256](#getdeltaamountbaseunsigned256)
    - [getDeltaAmountQuoteUnsigned](#getdeltaamountquoteunsigned)
    - [getDeltaAmountQuoteUnsigned256](#getdeltaamountquoteunsigned256)
    - [getNextSqrtPriceFromInput](#getnextsqrtpricefrominput)
    - [getNextSqrtPriceFromOutput](#getnextsqrtpricefromoutput)
    - [getNextSqrtPriceFromQuoteAmountOutRoundingDown](#getnextsqrtpricefromquoteamountoutroundingdown)
    - [getNextSqrtPriceFromBaseAmountOutRoundingUp](#getnextsqrtpricefrombaseamountoutroundingup)
    - [getNextSqrtPriceFromBaseAmountInRoundingUp](#getnextsqrtpricefrombaseamountinroundingup)
    - [getNextSqrtPriceFromQuoteAmountInRoundingDown](#getnextsqrtpricefromquoteamountinroundingdown)
    - [getFeeMode](#getfeemode)
    - [getTotalFeeNumeratorFromIncludedFeeAmount](#gettotalfeenumeratorfromincludedfeeamount)
    - [getTotalFeeNumeratorFromExcludedFeeAmount](#gettotalfeenumeratorfromexcludedfeeamount)
    - [getTotalFeeNumerator](#gettotalfeenumerator)
    - [getFeeOnAmount](#getfeeonamount)
    - [splitFees](#splitfees)
    - [getExcludedFeeAmount](#getexcludedfeeamount)
    - [getIncludedFeeAmount](#getincludedfeeamount)
    - [pow](#pow)
    - [mulDiv](#muldiv)
    - [toNumerator](#tonumerator)
    - [sqrt](#sqrt)
    - [isZeroTransferFee](#iszerotransferfee)
    - [getBaseTransferFee](#getbasetransferfee)
    - [getEpochTransferFee](#getepochtransferfee)
    - [resolveSwapTransferFees](#resolveswaptransferfees)
    - [calculateTransferFeeExcludedAmount](#calculatetransferfeeexcludedamount)
    - [calculateTransferFeeIncludedAmount](#calculatetransferfeeincludedamount)
    - [getBaseFeeHandler](#getbasefeehandler)
    - [isDynamicFeeEnabled](#isdynamicfeeenabled)
    - [getVariableFeeNumerator](#getvariablefeenumerator)
    - [getFeeSchedulerMinBaseFeeNumerator](#getfeeschedulerminbasefeenumerator)
    - [getBaseFeeNumeratorByPeriod](#getbasefeenumeratorbyperiod)
    - [getFeeNumeratorOnLinearFeeScheduler](#getfeenumeratoronlinearfeescheduler)
    - [getFeeNumeratorOnExponentialFeeScheduler](#getfeenumeratoronexponentialfeescheduler)
    - [getBaseFeeNumerator](#getbasefeenumerator)
    - [isRateLimiterApplied](#isratelimiterapplied)
    - [isZeroRateLimiter](#iszeroratelimiter)
    - [isNonZeroRateLimiter](#isnonzeroratelimiter)
    - [getMaxIndex](#getmaxindex)
    - [getCheckedAmounts](#getcheckedamounts)
    - [getFeeNumeratorFromExcludedAmount](#getfeenumeratorfromexcludedamount)
    - [getRateLimiterExcludedFeeAmount](#getratelimiterexcludedfeeamount)
    - [getMaxOutAmountWithMinBaseFee](#getmaxoutamountwithminbasefee)
    - [liveCurve](#livecurve)
    - [getFeeNumeratorFromIncludedAmount](#getfeenumeratorfromincludedamount)

## Partner Functions

### createConfig

Deprecated: use [createConfig2](#createconfig2). `createConfig` rejects a quote mint with a non-zero transfer fee or a live transfer fee config authority.

Creates a new config key that will dictate the behavior of all pools created with this key. This is where you set the pool fees, migration options, the bonding curve shape, and more.

**Function**

```typescript
createConfig(params: CreateConfigParams): Promise<Transaction>
```

**Parameters**

```typescript
interface CreateConfigParams {
    payer: PublicKey // The wallet paying for the transaction
    config: PublicKey // The config account address (generated by the partner)
    feeClaimer: PublicKey // The wallet that will be able to claim the fee
    leftoverReceiver: PublicKey // The wallet that will receive the bonding curve leftover
    quoteMint: PublicKey // The quote mint address
    tokenBadge?: PublicKey // Optional. Required remaining account when the quote mint is not permissionless-supported
    poolFees: {
        baseFee: {
            cliffFeeNumerator: BN // Initial fee numerator (base fee)
            firstFactor: number // feeScheduler: numberOfPeriod, rateLimiter: feeIncrementBps
            secondFactor: BN // feeScheduler: periodFrequency, rateLimiter: maxLimiterDuration
            thirdFactor: BN // feeScheduler: reductionFactor, rateLimiter: referenceAmount
            baseFeeMode: number // 0: FeeSchedulerLinear, 1: FeeSchedulerExponential. RateLimiter (2) is deprecated for new configs
        }
        dynamicFee: {
            // Optional dynamic fee
            binStep: number // u16 value representing the bin step in bps
            binStepU128: BN // u128 value for a more accurate bin step
            filterPeriod: number // Minimum time that must pass between fee updates
            decayPeriod: number // Period after the volatility starts decaying (must be > filterPeriod)
            reductionFactor: number // Controls how quickly volatility decys over time
            variableFeeControl: number // Multiplier that determines how much volatility affects fees
            maxVolatilityAccumulator: number // Caps the maximum volatility that can be accumulated
        } | null
    }
    collectFeeMode: number // 0: QuoteToken, 1: OutputToken
    migrationOption: number // 1: DAMM v2. DAMM v1 (0) is deprecated for new configs
    activationType: number // 0: Slot, 1: Timestamp
    tokenType: number // 0: SPLToken, 1: Token2022
    tokenDecimal: number // The number of decimals for the token
    partnerLiquidityPercentage: number // The percentage of the LP that will be allocated to the partner in the graduated pool (0-100)
    partnerPermanentLockedLiquidityPercentage: number // The percentage of the locked LP that will be allocated to the partner in the graduated pool (0-100)
    creatorLiquidityPercentage: number // The percentage of the LP that will be allocated to the creator in the graduated pool (0-100)
    creatorPermanentLockedLiquidityPercentage: number // The percentage of the locked LP that will be allocated to the creator in the graduated pool (0-100)
    migrationQuoteThreshold: BN // The quote threshold for migration
    sqrtStartPrice: BN // The starting price of the pool
    lockedVesting: {
        // Optional locked vesting (BN (0) for all fields for no vesting)
        amountPerPeriod: BN // The amount of tokens that will be vested per period
        cliffDurationFromMigrationTime: BN // The duration of the waiting time before the vesting starts
        frequency: BN // The frequency of the vesting
        numberOfPeriod: BN // The number of periods of the vesting
        cliffUnlockAmount: BN // The amount of tokens that will be unlocked when vesting starts
    }
    migrationFeeOption: number // 0: Fixed 25bps, 1: Fixed 30bps, 2: Fixed 100bps, 3: Fixed 200bps, 4: Fixed 400bps, 5: Fixed 600bps, 6: Customizable (only for DAMM v2)
    tokenSupply: {
        // Optional token supply
        preMigrationTokenSupply: BN // The token supply before migration
        postMigrationTokenSupply: BN // The token supply after migration
    } | null
    creatorTradingFeePercentage: number // The percentage of the trading fee that will be allocated to the creator
    tokenAuthorityOption: number // 0 - CreatorUpdateAuthority, 1 - Immutable, 2 - PartnerUpdateAuthority, 3 - CreatorUpdateAndMintAuthority, 4 - PartnerUpdateAndMintAuthority
    migrationFee: {
        // Optional migration fee (set as 0 for feePercentage and creatorFeePercentage for no migration fee)
        feePercentage: number // The percentage of fee taken from migration quote threshold (0-99)
        creatorFeePercentage: number // The fee share percentage for the creator from the migration fee (0-100)
    }
    migratedPoolFee: {
        // Only when migrationOption = MET_DAMM_V2 (1) and migrationFeeOption = Customizable (6)
        collectFeeMode: number // 0: QuoteToken, 1: OutputToken, 2: Compounding
        dynamicFee: number // 0: Disabled, 1: Enabled
        poolFeeBps: number // The pool fee in basis points. Minimum 10, Maximum 1000 bps.
        compoundingFeeBps?: number // 0 to 10_000 when collectFeeMode = 2 (Compounding). 0 collects the trading fee in the quote token. Otherwise must be 0
    }
    poolCreationFee: BN // The pool creation fee
    partnerLiquidityVestingInfo: {
        vestingPercentage: number // The percentage of the liquidity that will be vested
        bpsPerPeriod: number // The basis points per period
        numberOfPeriods: number // The number of periods
        cliffDurationFromMigrationTime: number // The duration of the waiting time before the vesting starts
        frequency: number // The frequency of the vesting
    }
    creatorLiquidityVestingInfo: {
        vestingPercentage: number // The percentage of the liquidity that will be vested
        bpsPerPeriod: number // The basis points per period
        numberOfPeriods: number // The number of periods
        cliffDurationFromMigrationTime: number // The duration of the waiting time before the vesting starts
        frequency: number // The frequency of the vesting
    }
    migratedPoolBaseFeeMode: number // 0: FeeTimeSchedulerLinear, 1: FeeTimeSchedulerExponential, 3: FeeMarketCapSchedulerLinear, 4: FeeMarketCapSchedulerExponential (defaults to FeeTimeSchedulerLinear)
    migratedPoolMarketCapFeeSchedulerParams: {
        // Defaults to all 0. Configure only when migratedPoolBaseFeeMode = FeeMarketCapSchedulerLinear or FeeMarketCapSchedulerExponential
        numberOfPeriod: number // The number of periods
        sqrtPriceStepBps: number // The square root price step in basis points
        schedulerExpirationDuration: number // The scheduler expiration duration in seconds
        reductionFactor: BN // The reduction factor
    }
    enableFirstSwapWithMinFee: boolean // Whether to enable first swap with minimum fee (defaults to false)
    padding: []
    curve: {
        // The curve of the pool
        sqrtPrice: BN // The square root of the curve point price
        liquidity: BN // The liquidity of the curve point
    }[]
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.createConfig({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    config: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
    feeClaimer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    leftoverReceiver: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    quoteMint: new PublicKey('So11111111111111111111111111111111111111112'),
    poolFees: {
        baseFee: {
            cliffFeeNumerator: new BN('25000000'),
            firstFactor: 0,
            secondFactor: new BN('0'),
            thirdFactor: new BN('0'),
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        },
        dynamicFee: {
            binStep: 1,
            binStepU128: new BN('1844674407370955'),
            filterPeriod: 10,
            decayPeriod: 120,
            reductionFactor: 1000,
            variableFeeControl: 100000,
            maxVolatilityAccumulator: 100000,
        },
    },
    activationType: 0,
    collectFeeMode: 0,
    migrationOption: 1,
    tokenType: 0,
    tokenDecimal: 9,
    migrationQuoteThreshold: new BN('1000000000'),
    partnerLiquidityPercentage: 25,
    creatorLiquidityPercentage: 25,
    partnerPermanentLockedLiquidityPercentage: 25,
    creatorPermanentLockedLiquidityPercentage: 25,
    sqrtStartPrice: new BN('58333726687135158'),
    lockedVesting: {
        amountPerPeriod: new BN('0'),
        cliffDurationFromMigrationTime: new BN('0'),
        frequency: new BN('0'),
        numberOfPeriod: new BN('0'),
        cliffUnlockAmount: new BN('0'),
    },
    migrationFeeOption: 0,
    tokenSupply: null,
    creatorTradingFeePercentage: 0,
    tokenAuthorityOption: 0,
    migrationFee: {
        feePercentage: 25,
        creatorFeePercentage: 50,
    },
    poolCreationFee: new BN(1_000_000_000),
    creatorLiquidityVestingInfo: {
        vestingPercentage: 0,
        bpsPerPeriod: 0,
        numberOfPeriods: 0,
        frequency: 0,
        cliffDurationFromMigrationTime: 0,
    },
    partnerLiquidityVestingInfo: {
        vestingPercentage: 0,
        bpsPerPeriod: 0,
        numberOfPeriods: 0,
        frequency: 0,
        cliffDurationFromMigrationTime: 0,
    },
    migratedPoolBaseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
    migratedPoolMarketCapFeeSchedulerParams: {
        numberOfPeriod: 0,
        sqrtPriceStepBps: 0,
        schedulerExpirationDuration: 0,
        reductionFactor: new BN('0'),
    },
    padding: [],
    curve: [
        {
            sqrtPrice: new BN('233334906748540631'),
            liquidity: new BN('622226417996106429201027821619672729'),
        },
        {
            sqrtPrice: new BN('79226673521066979257578248091'),
            liquidity: new BN('1'),
        },
    ],
    enableFirstSwapWithMinFee: false,
    migratedPoolFee: {
        dynamicFee: 0,
        poolFeeBps: 0,
        collectFeeMode: 0,
    },
})
```

**Notes**

When creating a new configuration for a dynamic bonding curve, several validations are performed to ensure the parameters are valid:

**Pool Fees**

- Base fee must have a positive cliff fee numerator
- If using Fee Scheduler (Linear or Exponential):
    - All parameters (firstFactor, secondFactor, thirdFactor) must be set if any are set
    - Cliff fee numerator must be positive
    - For Linear mode, final fee must not be negative
    - Min and max fee numerators must be within valid range (MIN_FEE_NUMERATOR to MAX_FEE_NUMERATOR)
    - Fee numerators must be less than FEE_DENOMINATOR
- If using Rate Limiter:
    - Deprecated for new configs and new pools. Existing rate-limiter pools can still be quoted and swapped.

**Fee Mode**

- Collect fee mode must be either `QuoteToken` (0) or `OutputToken` (1)

**Migration and Token Type**

- New configs must use DAMM v2 (`MigrationOption.MET_DAMM_V2`). DAMM v1 migration is deprecated for new configs and new pools. Existing DAMM v1 pools can still migrate.
- Token-badge remaining account is required when the quote mint is not permissionless-supported. Use `deriveTokenBadgeAddress(quoteMint)` and pass it as `tokenBadge`.
- A quote mint with a zero transfer fee and a revoked transfer fee config authority is permissionless-supported. A fee is zero when its basis points are 0 or its maximum fee is 0. A non-zero transfer fee or a live transfer fee config authority is only accepted by `createConfig2`, and still needs a token badge when the mint is not otherwise permissionless-supported.
- A Token-2022 config whose token update authority is `PartnerUpdateAuthority` or `PartnerUpdateAndMintAuthority` requires a non-default `feeClaimer`.
- `createConfig` and `createConfigWithTransferHook` reject those quote mints. Use `createConfig2`.

**Activation Type**

- Must be either Slot (0) or Timestamp (1)

**Graduated DAMM V1/V2 Pool Fee (migrationFeeOption)**

- Must be a valid option: FixedBps25 (0), FixedBps30 (1), FixedBps100 (2), FixedBps200 (3), FixedBps400 (4), FixedBps600 (5), Customizable (6)
- Customizable (6) is only allowed for DAMM V2 migration
- When `marketCapFeeSchedulerParams` is configured in `migratedPoolFee`, the on-chain program requires `migrationFeeOption` to be `Customizable` (6). The SDK's `buildCurve*` functions handle this automatically by overriding `migrationFeeOption` to `Customizable` when `marketCapFeeSchedulerParams` is present.
- For fixed options (0-5), all `migratedPoolFee` fields must be zero (defaults). Custom values are ignored.

**Migration Fee**

- Migration fee percentage must be between 0 and 99
- Creator fee percentage must be between 0 and 100

**Token Decimals**

- Must be between 6 and 9

**Liquidity Percentages (Graduated pool)**

- The sum of partner liquidity LP, creator liquidity LP, partner locked liquidity LP, creator locked liquidity LP, partner vested liquidity LP and creator vested liquidity LP percentages must equal 100(%).
- Must ensure that there is minimum 1000 bps of locked liquidity after 1 day duration (86400 seconds). The locked liquidity can be vested liquidity or permanently locked liquidity.

**Migration Quote Threshold**

- Must be greater than 0

**Price**

- Square root start price must be within valid range (MIN_SQRT_PRICE to MAX_SQRT_PRICE)

**Curve**

- Must have at least one point and not exceed MAX_CURVE_POINT
- First curve point must have sqrt price greater than sqrt start price and positive liquidity
- Curve points must be in ascending order by sqrt price
- All points must have positive liquidity
- Last point's sqrt price must not exceed MAX_SQRT_PRICE

**Locked Vesting**

- If the values are not all zeros (no Locked Vesting), then:
    - Frequency must be greater than 0
    - Total amount of tokens vested (cliffUnlockAmount + amountPerPeriod \* numberOfPeriod) must be greater than 0

**Token Supply**

- If specified:
    - Leftover receiver must be a valid non-default PublicKey
    - Post-migration supply must not exceed pre-migration supply
    - Pre-migration supply must be sufficient to cover minimum base supply with buffer
    - Post-migration supply must be sufficient to cover minimum base supply without buffer

**Token Update Authority**

- Must be either CreatorUpdateAuthority (0), Immutable (1), PartnerUpdateAuthority (2), CreatorUpdateAndMintAuthority (3), PartnerUpdateAndMintAuthority (4)

**Pool Creation Fee**

- Can be 0.
- If non-zero, must be between `1_000_000` and `100_000_000_000` lamports of SOL

**Migrated Pool Base Fee Mode**

- Must be either `FeeTimeSchedulerLinear` (0), `FeeTimeSchedulerExponential` (1), `FeeMarketCapSchedulerLinear` (3), `FeeMarketCapSchedulerExponential` (4)
- `FeeTimeSchedulerLinear` (0) and `FeeTimeSchedulerExponential` (1) required `migratedPoolMarketCapFeeSchedulerParams` to be all set to 0.
- `FeeMarketCapSchedulerLinear` (3) and `FeeMarketCapSchedulerExponential` (4) required `migratedPoolMarketCapFeeSchedulerParams` to be provided.

- **Migrated Pool MarketCap Fee Scheduler Params**

- If `migratedPoolBaseFeeMode` is `FeeMarketCapSchedulerLinear` or `FeeMarketCapSchedulerExponential`, then `migratedPoolMarketCapFeeSchedulerParams` must be provided. Else set all parameter to 0.

- **Enable First Swap With Minimum Fee**

- Enable only when you want to concatenate a swap instruction with create pool instruction in a single transaction.

**Migrated Pool Fee**

- Configures the graduated pool fee parameters for the migrated DAMM V2 pool.
- Only applies when `migrationOption = MET_DAMM_V2` (1).
- When using `migrationFeeOption = Customizable` (6), you can configure: `collectFeeMode`, `dynamicFee`, `poolFeeBps`, and `compoundingFeeBps`.
- When `marketCapFeeSchedulerParams` is configured:
    - `poolFeeBps` must be greater than 0 (serves as the starting/cliff fee for the market cap scheduler).
    - `baseFeeMode` must be `FeeMarketCapSchedulerLinear` (3) or `FeeMarketCapSchedulerExponential` (4).
    - `endingBaseFeeBps` must be strictly less than the bonding curve's `endingFeeBps`.
- For DAMM V1 migration, all migrated pool fee parameters are ignored.

---

### createConfig2

Creates a config through `create_config2`. This is the instruction that accepts a base-mint transfer fee and a quote mint with a non-zero transfer fee or a live transfer fee config authority.

`createConfig` is deprecated. It still creates a config with no base transfer fee, and the program rejects the quote mints above.

**Function**

```typescript
createConfig2(params: CreateConfig2Params): Promise<Transaction>
```

**Parameters**

`CreateConfig2Params` is `CreateConfigParams` plus:

```typescript
transferFeeParameters?: {
    transferFeeBasisPoints: number // 0 to 1000 (10%). The object always creates a TransferFeeConfig, including at 0
    withheldAuthority: number // 0: Partner, 1: Creator
    migratedTransferFeeAuthorityOption: number // 0: Immutable, 1: RevokeZeroFee, 2: Creator, 3: Partner
} | null
```

Pass `null` or omit the field when the base mint has no transfer fee, including when only the quote mint has one.

`createConfigAndPool` and `createConfigAndPoolWithFirstBuy` always call `createConfig2`. Omitting `transferFeeParameters` is the same as passing `null`.

**Returns**

- A transaction that can be signed and sent to the network. The `config` account must sign.

**Example**

```typescript
const transaction = await client.partner.createConfig2({
    payer,
    config: configKeypair.publicKey,
    feeClaimer,
    leftoverReceiver,
    quoteMint,
    ...configParameters,
    transferFeeParameters: {
        transferFeeBasisPoints: 250,
        withheldAuthority: TransferFeeWithheldAuthority.Partner,
        migratedTransferFeeAuthorityOption:
            MigratedTransferFeeAuthorityOption.Immutable,
    },
})
```

**Notes**

- Passing `transferFeeParameters` requires `tokenType` Token-2022 and basis points of at most 1000. The base mint is created with that fee and `maximumFee = u64::MAX`, and `PoolConfig.transferFeeFlag` is set to 1. This includes 0 basis points. 0 basis points are rejected when `migratedTransferFeeAuthorityOption` is `Immutable` or `RevokeZeroFee`.
- A partner withheld authority or a partner migrated authority requires a non-default `feeClaimer`.
- When `transferFeeParameters` is set, or the quote mint has a non-zero transfer fee or a live transfer fee config authority, the config must use a constant token supply (`preMigrationTokenSupply == postMigrationTokenSupply`), no locked vesting, `MigrationFeeOption.Customizable`, and `MigratedCollectFeeMode.Compounding`.
- New configs are `PoolConfig.version` 1. A legacy config (`version` 0) cannot initialize a pool on a quote mint with a non-zero transfer fee or a live transfer fee config authority. Transfer-hook pool initialization rejects those quote mints at any version.
- A base or quote transfer fee lowers what DAMM v2 receives at migration. The program keeps the migration price at or below the budget ratio by depositing the side that lost the larger share as is and scaling the other side: quote rounds down, base rounds up. The migrated pool starts with less liquidity. The amount not deposited is added to the protocol migration fee.
- Swap quotes read the base transfer fee from `config.transferFeeFlag` unless `baseMint` is passed. Flag 1 means the config created a TransferFeeConfig. For a Token-2022 quote mint they throw unless `quoteMint` and `currentEpoch` are passed. `getSwapQuoteTransferFees(connection, config, { baseMint })` fetches the quote mint, the base mint, and the current epoch. See [swapQuote2](#swapQuote2).

---

### createConfigWithTransferHook

Creates a Token-2022 transfer-hook config. This is the transfer-hook variant of `createConfig` and stores the transfer-hook program in the config account.

**Function**

```typescript
createConfigWithTransferHook(
        params: CreateConfigWithTransferHookParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
type CreateConfigWithTransferHookParams = CreateConfigParams & {
    transferHookProgram: PublicKey // The Token-2022 transfer-hook program for pools created from this config
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const curveConfig = buildCurve({
    // See buildCurve for the full curve configuration.
})

const transaction = await client.partner.createConfigWithTransferHook({
    payer: wallet.publicKey,
    config: configKeypair.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    quoteMint: NATIVE_MINT,
    transferHookProgram: transferHookProgramId,
    ...curveConfig,
})
```

**Notes**

- Use this function for Token-2022 base mints that should run a transfer-hook program on transfers.
- The config's `tokenType` must be `TokenType.Token2022`.
- The config keypair must sign the transaction.

---

### createConfigAndPool

Creates a config key and a token pool in a single transaction.

**Function**

```typescript
createConfigAndPool(
        params: CreateConfigAndPoolParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreateConfigAndPoolParams {
    payer: PublicKey // The wallet paying for the transaction
    config: PublicKey // The config account address (generated by the partner)
    feeClaimer: PublicKey // The wallet that will be able to claim the fee
    leftoverReceiver: PublicKey // The wallet that will receive the bonding curve leftover
    quoteMint: PublicKey // The quote mint address
    tokenBadge?: PublicKey // Optional. Required remaining account when the quote mint is not permissionless-supported
    poolFees: {
        baseFee: {
            cliffFeeNumerator: BN // Initial fee numerator (base fee)
            firstFactor: number // feeScheduler: numberOfPeriod, rateLimiter: feeIncrementBps
            secondFactor: BN // feeScheduler: periodFrequency, rateLimiter: maxLimiterDuration
            thirdFactor: BN // feeScheduler: reductionFactor, rateLimiter: referenceAmount
            baseFeeMode: number // 0: FeeSchedulerLinear, 1: FeeSchedulerExponential. RateLimiter (2) is deprecated for new configs
        }
        dynamicFee: {
            // Optional dynamic fee
            binStep: number // u16 value representing the bin step in bps
            binStepU128: BN // u128 value for a more accurate bin step
            filterPeriod: number // Minimum time that must pass between fee updates
            decayPeriod: number // Period after the volatility starts decaying (must be > filterPeriod)
            reductionFactor: number // Controls how quickly volatility decys over time
            variableFeeControl: number // Multiplier that determines how much volatility affects fees
            maxVolatilityAccumulator: number // Caps the maximum volatility that can be accumulated
        } | null
    }
    collectFeeMode: number // 0: QuoteToken, 1: OutputToken
    migrationOption: number // 1: DAMM v2. DAMM v1 (0) is deprecated for new configs
    activationType: number // 0: Slot, 1: Timestamp
    tokenType: number // 0: SPLToken, 1: Token2022
    tokenDecimal: number // The number of decimals for the token
    partnerLiquidityPercentage: number // The percentage of the LP that will be allocated to the partner in the graduated pool (0-100)
    partnerPermanentLockedLiquidityPercentage: number // The percentage of the locked LP that will be allocated to the partner in the graduated pool (0-100)
    creatorLiquidityPercentage: number // The percentage of the LP that will be allocated to the creator in the graduated pool (0-100)
    creatorPermanentLockedLiquidityPercentage: number // The percentage of the locked LP that will be allocated to the creator in the graduated pool (0-100)
    migrationQuoteThreshold: BN // The quote threshold for migration
    sqrtStartPrice: BN // The starting price of the pool
    lockedVesting: {
        // Optional locked vesting (BN (0) for all fields for no vesting)
        amountPerPeriod: BN // The amount of tokens that will be vested per period
        cliffDurationFromMigrationTime: BN // The duration of the waiting time before the vesting starts
        frequency: BN // The frequency of the vesting
        numberOfPeriod: BN // The number of periods of the vesting
        cliffUnlockAmount: BN // The amount of tokens that will be unlocked when vesting starts
    }
    migrationFeeOption: number // 0: Fixed 25bps, 1: Fixed 30bps, 2: Fixed 100bps, 3: Fixed 200bps, 4: Fixed 400bps, 5: Fixed 600bps, 6: Customizable (only for DAMM v2)
    tokenSupply: {
        // Optional token supply
        preMigrationTokenSupply: BN // The token supply before migration
        postMigrationTokenSupply: BN // The token supply after migration
    } | null
    creatorTradingFeePercentage: number // The percentage of the trading fee that will be allocated to the creator
    tokenAuthorityOption: number // 0 - CreatorUpdateAuthority, 1 - Immutable, 2 - PartnerUpdateAuthority, 3 - CreatorUpdateAndMintAuthority, 4 - PartnerUpdateAndMintAuthority
    migrationFee: {
        // Optional migration fee (set as 0 for feePercentage and creatorFeePercentage for no migration fee)
        feePercentage: number // The percentage of fee taken from migration quote threshold (0-99)
        creatorFeePercentage: number // The fee share percentage for the creator from the migration fee (0-100)
    }
    migratedPoolFee: {
        // Only when migrationOption = MET_DAMM_V2 (1) and migrationFeeOption = Customizable (6)
        collectFeeMode: number // 0: QuoteToken, 1: OutputToken, 2: Compounding
        dynamicFee: number // 0: Disabled, 1: Enabled
        poolFeeBps: number // The pool fee in basis points. Minimum 10, Maximum 1000 bps.
        compoundingFeeBps?: number // 0 to 10_000 when collectFeeMode = 2 (Compounding). 0 collects the trading fee in the quote token. Otherwise must be 0
    }
    migratedPoolBaseFeeMode: number // 0: FeeTimeSchedulerLinear, 1: FeeTimeSchedulerExponential, 3: FeeMarketCapSchedulerLinear, 4: FeeMarketCapSchedulerExponential (defaults to FeeTimeSchedulerLinear)
    migratedPoolMarketCapFeeSchedulerParams: {
        // Defaults to all 0. Configure only when migratedPoolBaseFeeMode = FeeMarketCapSchedulerLinear or FeeMarketCapSchedulerExponential
        numberOfPeriod: number // The number of periods
        sqrtPriceStepBps: number // The square root price step in basis points
        schedulerExpirationDuration: number // The scheduler expiration duration in seconds
        reductionFactor: BN // The reduction factor
    }
    enableFirstSwapWithMinFee: boolean // Whether to enable first swap with minimum fee (defaults to false)
    poolCreationFee: BN // The pool creation fee
    partnerLiquidityVestingInfo: {
        vestingPercentage: number // The percentage of the liquidity that will be vested
        bpsPerPeriod: number // The basis points per period
        numberOfPeriods: number // The number of periods
        cliffDurationFromMigrationTime: number // The duration of the waiting time before the vesting starts
        frequency: number // The frequency of the vesting
    }
    creatorLiquidityVestingInfo: {
        vestingPercentage: number // The percentage of the liquidity that will be vested
        bpsPerPeriod: number // The basis points per period
        numberOfPeriods: number // The number of periods
        cliffDurationFromMigrationTime: number // The duration of the waiting time before the vesting starts
        frequency: number // The frequency of the vesting
    }
    padding: []
    curve: {
        // The curve of the pool
        sqrtPrice: BN // The square root of the curve point price
        liquidity: BN // The liquidity of the curve point
    }[]
    preCreatePoolParam: {
        baseMint: PublicKey // The base mint address (generated by you)
        name: string // The name of the pool
        symbol: string // The symbol of the pool
        uri: string // The uri of the pool
        poolCreator: PublicKey // The pool creator of the transaction
    }
}
```

**Returns**

- A transaction that requires signatures from the payer, the baseMint keypair, and the config keypair before being submitted to the network.

**Example**

```typescript
const transaction = await client.partner.createConfigAndPool({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    config: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
    feeClaimer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    leftoverReceiver: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    quoteMint: new PublicKey('So11111111111111111111111111111111111111112'),
    poolFees: {
        baseFee: {
            cliffFeeNumerator: new BN('25000000'),
            firstFactor: 0,
            secondFactor: new BN('0'),
            thirdFactor: new BN('0'),
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        },
        dynamicFee: {
            binStep: 1,
            binStepU128: new BN('1844674407370955'),
            filterPeriod: 10,
            decayPeriod: 120,
            reductionFactor: 1000,
            variableFeeControl: 100000,
            maxVolatilityAccumulator: 100000,
        },
    },
    activationType: 0,
    collectFeeMode: 0,
    migrationOption: 1,
    tokenType: 0,
    tokenDecimal: 9,
    migrationQuoteThreshold: new BN('1000000000'),
    partnerLiquidityPercentage: 25,
    creatorLiquidityPercentage: 25,
    partnerPermanentLockedLiquidityPercentage: 25,
    creatorPermanentLockedLiquidityPercentage: 25,
    sqrtStartPrice: new BN('58333726687135158'),
    lockedVesting: {
        amountPerPeriod: new BN('0'),
        cliffDurationFromMigrationTime: new BN('0'),
        frequency: new BN('0'),
        numberOfPeriod: new BN('0'),
        cliffUnlockAmount: new BN('0'),
    },
    migrationFeeOption: 0,
    tokenSupply: null,
    creatorTradingFeePercentage: 0,
    tokenAuthorityOption: 0,
    migrationFee: {
        feePercentage: 25,
        creatorFeePercentage: 50,
    },
    poolCreationFee: new BN(1_000_000_000),
    creatorLiquidityVestingInfo: {
        vestingPercentage: 0,
        bpsPerPeriod: 0,
        numberOfPeriods: 0,
        frequency: 0,
        cliffDurationFromMigrationTime: 0,
    },
    partnerLiquidityVestingInfo: {
        vestingPercentage: 0,
        bpsPerPeriod: 0,
        numberOfPeriods: 0,
        frequency: 0,
        cliffDurationFromMigrationTime: 0,
    },
    migratedPoolBaseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
    migratedPoolMarketCapFeeSchedulerParams: {
        numberOfPeriod: 0,
        sqrtPriceStepBps: 0,
        schedulerExpirationDuration: 0,
        reductionFactor: new BN('0'),
    },
    padding: [],
    curve: [
        {
            sqrtPrice: new BN('233334906748540631'),
            liquidity: new BN('622226417996106429201027821619672729'),
        },
        {
            sqrtPrice: new BN('79226673521066979257578248091'),
            liquidity: new BN('1'),
        },
    ],
    enableFirstSwapWithMinFee: false,
    migratedPoolFee: {
        dynamicFee: 0,
        poolFeeBps: 0,
        collectFeeMode: 0,
    },
    preCreatePoolParam: {
        baseMint: new PublicKey('0987654321zyxwvutsrqponmlkjihgfedcba'),
        name: 'Meteora',
        symbol: 'MET',
        uri: 'https://launch.meteora.ag/icons/logo.svg',
        poolCreator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    },
})
```

**Notes**

- The payer must be the same as the payer in the `CreateConfigAndPoolParam` params.
- The poolCreator is required to sign when creating the pool.
- The baseMint token type must be the same as the config key's token type.
- You can use any of the build curve functions to create the curve configuration.

---

### createConfigAndPoolWithTransferHook

Creates a transfer-hook config and initializes a Token-2022 transfer-hook pool in a single transaction.

**Function**

```typescript
createConfigAndPoolWithTransferHook(
        params: CreateConfigAndPoolWithTransferHookParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
type CreateConfigAndPoolWithTransferHookParams =
    CreateConfigWithTransferHookParams & {
        preCreatePoolParam: {
            baseMint: PublicKey // The base mint address (generated by you)
            name: string // The name of the pool
            symbol: string // The symbol of the pool
            uri: string // The URI of the pool
            poolCreator: PublicKey // The pool creator of the transaction
        }
    }
```

**Returns**

- A transaction that requires signatures from the payer, the config keypair, the baseMint keypair, and the poolCreator before being submitted to the network.

**Example**

```typescript
const curveConfig = buildCurve({
    // See buildCurve for the full curve configuration.
})

const transaction = await client.partner.createConfigAndPoolWithTransferHook({
    payer: wallet.publicKey,
    config: configKeypair.publicKey,
    feeClaimer: partner.publicKey,
    leftoverReceiver: partner.publicKey,
    quoteMint: NATIVE_MINT,
    transferHookProgram: transferHookProgramId,
    ...curveConfig,
    preCreatePoolParam: {
        baseMint: baseMintKeypair.publicKey,
        name: 'Meteora',
        symbol: 'MET',
        uri: 'https://launch.meteora.ag/icons/logo.svg',
        poolCreator: poolCreator.publicKey,
    },
})
```

**Notes**

- This function combines `createConfigWithTransferHook` and `createPoolWithTransferHook` into one transaction.
- The config's `tokenType` must be `TokenType.Token2022`.
- The transfer-hook program is initialized on the pool's base mint.

---

### createConfigAndPoolWithFirstBuy

Creates a config key and a token pool and buys the token immediately.

**Function**

```typescript
createConfigAndPoolWithFirstBuy(
        params: CreateConfigAndPoolWithFirstBuyParams
    ): Promise<{
        createConfigTx: Transaction
        createPoolWithFirstBuyTx: Transaction
    }>
```

**Parameters**

```typescript
interface CreateConfigAndPoolWithFirstBuyParams {
    payer: PublicKey // The wallet paying for the transaction
    config: PublicKey // The config account address (generated by the partner)
    feeClaimer: PublicKey // The wallet that will be able to claim the fee
    leftoverReceiver: PublicKey // The wallet that will receive the bonding curve leftover
    quoteMint: PublicKey // The quote mint address
    tokenBadge?: PublicKey // Optional. Required remaining account when the quote mint is not permissionless-supported
    poolFees: {
        baseFee: {
            cliffFeeNumerator: BN // Initial fee numerator (base fee)
            firstFactor: number // feeScheduler: numberOfPeriod, rateLimiter: feeIncrementBps
            secondFactor: BN // feeScheduler: periodFrequency, rateLimiter: maxLimiterDuration
            thirdFactor: BN // feeScheduler: reductionFactor, rateLimiter: referenceAmount
            baseFeeMode: number // 0: FeeSchedulerLinear, 1: FeeSchedulerExponential. RateLimiter (2) is deprecated for new configs
        }
        dynamicFee: {
            // Optional dynamic fee
            binStep: number // u16 value representing the bin step in bps
            binStepU128: BN // u128 value for a more accurate bin step
            filterPeriod: number // Minimum time that must pass between fee updates
            decayPeriod: number // Period after the volatility starts decaying (must be > filterPeriod)
            reductionFactor: number // Controls how quickly volatility decys over time
            variableFeeControl: number // Multiplier that determines how much volatility affects fees
            maxVolatilityAccumulator: number // Caps the maximum volatility that can be accumulated
        } | null
    }
    collectFeeMode: number // 0: QuoteToken, 1: OutputToken
    migrationOption: number // 1: DAMM v2. DAMM v1 (0) is deprecated for new configs
    activationType: number // 0: Slot, 1: Timestamp
    tokenType: number // 0: SPLToken, 1: Token2022
    tokenDecimal: number // The number of decimals for the token
    partnerLiquidityPercentage: number // The percentage of the LP that will be allocated to the partner in the graduated pool (0-100)
    partnerPermanentLockedLiquidityPercentage: number // The percentage of the locked LP that will be allocated to the partner in the graduated pool (0-100)
    creatorLiquidityPercentage: number // The percentage of the LP that will be allocated to the creator in the graduated pool (0-100)
    creatorPermanentLockedLiquidityPercentage: number // The percentage of the locked LP that will be allocated to the creator in the graduated pool (0-100)
    migrationQuoteThreshold: BN // The quote threshold for migration
    sqrtStartPrice: BN // The starting price of the pool
    lockedVesting: {
        // Optional locked vesting (BN (0) for all fields for no vesting)
        amountPerPeriod: BN // The amount of tokens that will be vested per period
        cliffDurationFromMigrationTime: BN // The duration of the waiting time before the vesting starts
        frequency: BN // The frequency of the vesting
        numberOfPeriod: BN // The number of periods of the vesting
        cliffUnlockAmount: BN // The amount of tokens that will be unlocked when vesting starts
    }
    migrationFeeOption: number // 0: Fixed 25bps, 1: Fixed 30bps, 2: Fixed 100bps, 3: Fixed 200bps, 4: Fixed 400bps, 5: Fixed 600bps, 6: Customizable (only for DAMM v2)
    tokenSupply: {
        // Optional token supply
        preMigrationTokenSupply: BN // The token supply before migration
        postMigrationTokenSupply: BN // The token supply after migration
    } | null
    creatorTradingFeePercentage: number // The percentage of the trading fee that will be allocated to the creator
    tokenAuthorityOption: number // 0 - CreatorUpdateAuthority, 1 - Immutable, 2 - PartnerUpdateAuthority, 3 - CreatorUpdateAndMintAuthority, 4 - PartnerUpdateAndMintAuthority
    migrationFee: {
        // Optional migration fee (set as 0 for feePercentage and creatorFeePercentage for no migration fee)
        feePercentage: number // The percentage of fee taken from migration quote threshold (0-99)
        creatorFeePercentage: number // The fee share percentage for the creator from the migration fee (0-100)
    }
    migratedPoolFee: {
        // Only when migrationOption = MET_DAMM_V2 (1) and migrationFeeOption = Customizable (6)
        collectFeeMode: number // 0: QuoteToken, 1: OutputToken, 2: Compounding
        dynamicFee: number // 0: Disabled, 1: Enabled
        poolFeeBps: number // The pool fee in basis points. Minimum 10, Maximum 1000 bps.
        compoundingFeeBps?: number // 0 to 10_000 when collectFeeMode = 2 (Compounding). 0 collects the trading fee in the quote token. Otherwise must be 0
    }
    migratedPoolBaseFeeMode: number // 0: FeeTimeSchedulerLinear, 1: FeeTimeSchedulerExponential, 3: FeeMarketCapSchedulerLinear, 4: FeeMarketCapSchedulerExponential (defaults to FeeTimeSchedulerLinear)
    migratedPoolMarketCapFeeSchedulerParams: {
        // Defaults to all 0. Configure only when migratedPoolBaseFeeMode = FeeMarketCapSchedulerLinear or FeeMarketCapSchedulerExponential
        numberOfPeriod: number // The number of periods
        sqrtPriceStepBps: number // The square root price step in basis points
        schedulerExpirationDuration: number // The scheduler expiration duration in seconds
        reductionFactor: BN // The reduction factor
    }
    enableFirstSwapWithMinFee: boolean // Whether to enable first swap with minimum fee (defaults to false)
    poolCreationFee: BN // The pool creation fee
    partnerLiquidityVestingInfo: {
        vestingPercentage: number // The percentage of the liquidity that will be vested
        bpsPerPeriod: number // The basis points per period
        numberOfPeriods: number // The number of periods
        cliffDurationFromMigrationTime: number // The duration of the waiting time before the vesting starts
        frequency: number // The frequency of the vesting
    }
    creatorLiquidityVestingInfo: {
        vestingPercentage: number // The percentage of the liquidity that will be vested
        bpsPerPeriod: number // The basis points per period
        numberOfPeriods: number // The number of periods
        cliffDurationFromMigrationTime: number // The duration of the waiting time before the vesting starts
        frequency: number // The frequency of the vesting
    }
    padding: []
    curve: {
        // The curve of the pool
        sqrtPrice: BN // The square root of the curve point price
        liquidity: BN // The liquidity of the curve point
    }[]
    preCreatePoolParam: {
        baseMint: PublicKey // The base mint address (generated by you)
        name: string // The name of the pool
        symbol: string // The symbol of the pool
        uri: string // The uri of the pool
        poolCreator: PublicKey // The pool creator of the transaction
    }
    firstBuyParam?: {
        // Optional first buy param
        buyer: PublicKey // The buyer of the transaction
        receiver?: PublicKey // Optional: The receiver of the transaction
        buyAmount: BN // The amount of tokens to buy
        minimumAmountOut: BN // The minimum amount of tokens to receive
        referralTokenAccount: PublicKey | null // The referral token account (optional)
    }
}
```

**Returns**

An object of transactions containing:

- `createConfigTx`: the config creation transaction.
- `createPoolWithFirstBuyTx`: the pool creation transaction, with first-buy instructions included when `firstBuyParam` is provided and `buyAmount > 0`.

**Example**

```typescript
const amountIn = await prepareSwapAmountParam(1, NATIVE_MINT, connection)

const { createConfigTx, createPoolWithFirstBuyTx } =
    await client.partner.createConfigAndPoolWithFirstBuy({
        payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
        config: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
        feeClaimer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
        leftoverReceiver: new PublicKey(
            'boss1234567890abcdefghijklmnopqrstuvwxyz'
        ),
        quoteMint: new PublicKey('So11111111111111111111111111111111111111112'),
        poolFees: {
            baseFee: {
                cliffFeeNumerator: new BN('25000000'),
                firstFactor: 0,
                secondFactor: new BN('0'),
                thirdFactor: new BN('0'),
                baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            },
            dynamicFee: {
                binStep: 1,
                binStepU128: new BN('1844674407370955'),
                filterPeriod: 10,
                decayPeriod: 120,
                reductionFactor: 1000,
                variableFeeControl: 100000,
                maxVolatilityAccumulator: 100000,
            },
        },
        activationType: 0,
        collectFeeMode: 0,
        migrationOption: 1,
        tokenType: 0,
        tokenDecimal: 9,
        migrationQuoteThreshold: new BN('1000000000'),
        partnerLiquidityPercentage: 25,
        creatorLiquidityPercentage: 25,
        partnerPermanentLockedLiquidityPercentage: 25,
        creatorPermanentLockedLiquidityPercentage: 25,
        sqrtStartPrice: new BN('58333726687135158'),
        lockedVesting: {
            amountPerPeriod: new BN('0'),
            cliffDurationFromMigrationTime: new BN('0'),
            frequency: new BN('0'),
            numberOfPeriod: new BN('0'),
            cliffUnlockAmount: new BN('0'),
        },
        migrationFeeOption: 0,
        tokenSupply: null,
        creatorTradingFeePercentage: 0,
        tokenAuthorityOption: 0,
        migrationFee: {
            feePercentage: 25,
            creatorFeePercentage: 50,
        },
        poolCreationFee: new BN(1_000_000_000),
        creatorLiquidityVestingInfo: {
            vestingPercentage: 0,
            bpsPerPeriod: 0,
            numberOfPeriods: 0,
            frequency: 0,
            cliffDurationFromMigrationTime: 0,
        },
        partnerLiquidityVestingInfo: {
            vestingPercentage: 0,
            bpsPerPeriod: 0,
            numberOfPeriods: 0,
            frequency: 0,
            cliffDurationFromMigrationTime: 0,
        },
        migratedPoolBaseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
        migratedPoolMarketCapFeeSchedulerParams: {
            numberOfPeriod: 0,
            sqrtPriceStepBps: 0,
            schedulerExpirationDuration: 0,
            reductionFactor: new BN('0'),
        },
        padding: [],
        curve: [
            {
                sqrtPrice: new BN('233334906748540631'),
                liquidity: new BN('622226417996106429201027821619672729'),
            },
            {
                sqrtPrice: new BN('79226673521066979257578248091'),
                liquidity: new BN('1'),
            },
        ],
        enableFirstSwapWithMinFee: false,
        migratedPoolFee: {
            dynamicFee: 0,
            poolFeeBps: 0,
            collectFeeMode: 0,
        },
        preCreatePoolParam: {
            baseMint: new PublicKey('0987654321zyxwvutsrqponmlkjihgfedcba'),
            name: 'Meteora',
            symbol: 'MET',
            uri: 'https://launch.meteora.ag/icons/logo.svg',
            poolCreator: new PublicKey(
                'boss1234567890abcdefghijklmnopqrstuvwxyz'
            ),
        },
        firstBuyParam: {
            buyer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
            buyAmount: amountIn,
            minimumAmountOut: new BN(1),
            referralTokenAccount: null,
        },
    })
```

**Notes**

- The payer must be the same as the payer in the `CreateConfigAndPoolWithFirstBuyParam` params.
- The `createConfigTx` requires the payer and config to sign the transaction.
- The `createPoolWithFirstBuyTx` requires the payer, poolCreator, and baseMint to sign the transaction. If `firstBuyParam` is provided, it also requires buyer/payer signatures for the appended first-buy instructions.
- If the `firstBuyParam` is not provided, `createPoolWithFirstBuyTx` includes only pool-creation instructions.
- The `receiver` parameter is an optional account. If provided, the token will be sent to the receiver address.

---

### createConfigAndPoolWithFirstBuyWithTransferHook

Creates a transfer-hook config and returns a pool creation transaction that can include an initial transfer-hook buy.

**Function**

```typescript
createConfigAndPoolWithFirstBuyWithTransferHook(
        params: CreateConfigAndPoolWithFirstBuyWithTransferHookParams
    ): Promise<{
        createConfigTx: Transaction
        createPoolWithFirstBuyTx: Transaction
    }>
```

**Parameters**

```typescript
type CreateConfigAndPoolWithFirstBuyWithTransferHookParams =
    CreateConfigAndPoolWithTransferHookParams & {
        firstBuyParam?: {
            buyer: PublicKey // The buyer of the transaction
            receiver?: PublicKey // Optional receiver of the bought tokens
            buyAmount: BN // The quote token amount to spend
            minimumAmountOut: BN // The minimum base token amount to receive
            referralTokenAccount: PublicKey | null // The referral token account (optional)
            transferHookAccountsInfo?: TransferHookAccountsInfo // Optional precomputed transfer-hook account slice info
            transferHookAccounts?: AccountMeta[] // Optional precomputed transfer-hook remaining accounts
        }
    }
```

**Returns**

An object of transactions containing:

- `createConfigTx`: the transfer-hook config creation transaction.
- `createPoolWithFirstBuyTx`: the transfer-hook pool creation transaction, with first-buy instructions included when `firstBuyParam` is provided and `buyAmount > 0`.

**Example**

```typescript
const curveConfig = buildCurve({
    // See buildCurve for the full curve configuration.
})

const { createConfigTx, createPoolWithFirstBuyTx } =
    await client.partner.createConfigAndPoolWithFirstBuyWithTransferHook({
        payer: wallet.publicKey,
        config: configKeypair.publicKey,
        feeClaimer: partner.publicKey,
        leftoverReceiver: partner.publicKey,
        quoteMint: NATIVE_MINT,
        transferHookProgram: transferHookProgramId,
        ...curveConfig,
        preCreatePoolParam: {
            baseMint: baseMintKeypair.publicKey,
            name: 'Meteora',
            symbol: 'MET',
            uri: 'https://launch.meteora.ag/icons/logo.svg',
            poolCreator: poolCreator.publicKey,
        },
        firstBuyParam: {
            buyer: wallet.publicKey,
            buyAmount: amountIn,
            minimumAmountOut: new BN(1),
            referralTokenAccount: null,
        },
    })
```

**Notes**

- If your transfer-hook program requires extra account metas before the first buy, initialize those accounts before sending `createPoolWithFirstBuyTx`.
- `transferHookAccountsInfo` and `transferHookAccounts` are optional; when omitted, the SDK derives the transfer-hook remaining accounts from the base mint.
- The config's `tokenType` must be `TokenType.Token2022`.

---

### createPartnerMetadata

Creates a new partner metadata account. This partner metadata will be tagged to a wallet address that holds the config keys.

**Function**

```typescript
createPartnerMetadata(
        params: CreatePartnerMetadataParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatePartnerMetadataParams {
    name: string // The name of the partner
    website: string // The website of the partner
    logo: string // The logo of the partner
    feeClaimer: PublicKey // The wallet that will be able to claim the fee
    payer: PublicKey // The wallet that will pay for the transaction
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.createPartnerMetadata({
    name: 'Meteora',
    website: 'https://meteora.ag',
    logo: 'https://launch.meteora.ag',
    feeClaimer: wallet.publicKey,
    payer: wallet.publicKey,
})
```

---

### claimPartnerTradingFee

Claims the trading fee for the partner. A partner is the `feeClaimer` in the config key.

**Function**

```typescript
claimPartnerTradingFee(
        params: ClaimPartnerTradingFeeParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface ClaimTradingFeeParams {
    pool: PublicKey // The pool address
    feeClaimer: PublicKey // The wallet that will claim the fee
    payer: PublicKey // The wallet that will pay for the transaction
    maxBaseAmount: BN // The maximum base amount to claim (use 0 to not claim base tokens)
    maxQuoteAmount: BN // The maximum quote amount to claim (use 0 to not claim quote tokens)
    receiver?: PublicKey | null // The wallet that will receive the tokens (optional)
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.claimPartnerTradingFee({
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    feeClaimer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    payer: new PublicKey('payer1234567890abcdefghijklmnopqrstuvwxyz'),
    maxBaseAmount: new BN(1000000),
    maxQuoteAmount: new BN(1000000),
    receiver: new PublicKey('receiver1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The feeClaimer of the pool must be the same as the feeClaimer in the `ClaimTradingFeeParam` params.
- You can indicate maxBaseAmount or maxQuoteAmount to be 0 to not claim Base or Quote tokens respectively.
- With a native SOL quote the fee arrives in the fee claimer's wrapped SOL account and is unwrapped to `receiver`, so the receiver does not sign.

---

### claimPartnerTradingFeeToReceiver

Claims the trading fee for the partner. A partner is the `feeClaimer` in the config key.

**Function**

```typescript
claimPartnerTradingFeeToReceiver(
        params: ClaimPartnerTradingFeeToReceiverParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface ClaimPartnerTradingFee2Params {
    pool: PublicKey // The pool address
    feeClaimer: PublicKey // The wallet that will claim the fee
    payer: PublicKey // The wallet that will pay for the transaction
    maxBaseAmount: BN // The maximum base amount to claim (use 0 to not claim base tokens)
    maxQuoteAmount: BN // The maximum quote amount to claim (use 0 to not claim quote tokens)
    receiver?: PublicKey | null // The wallet that will receive the tokens
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.claimPartnerTradingFeeToReceiver({
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    feeClaimer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    payer: new PublicKey('payer1234567890abcdefghijklmnopqrstuvwxyz'),
    maxBaseAmount: new BN(1000000),
    maxQuoteAmount: new BN(1000000),
    receiver: new PublicKey('receiver1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The feeClaimer of the pool must be the same as the feeClaimer in the `ClaimPartnerTradingFee2Params` params.
- You can indicate maxBaseAmount or maxQuoteAmount to be 0 to not claim Base or Quote tokens respectively.
- Can be used in case the partner is a squad multisig account.

---

### claimPartnerTradingFee2

Claims partner trading fees from a transfer-hook pool. This is the transfer-hook variant of `claimPartnerTradingFeeToReceiver`.

**Function**

```typescript
claimPartnerTradingFee2(
        params: ClaimPartnerTradingFeeToReceiverParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface ClaimPartnerTradingFeeToReceiverParams {
    pool: PublicKey // The pool address
    feeClaimer: PublicKey // The partner fee claimer
    payer: PublicKey // The wallet that will pay for the transaction
    maxBaseAmount: BN // The maximum base amount to claim (use 0 to not claim base tokens)
    maxQuoteAmount: BN // The maximum quote amount to claim (use 0 to not claim quote tokens)
    receiver?: PublicKey | null // The wallet that will receive the tokens
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.claimPartnerTradingFee2({
    pool: poolAddress,
    feeClaimer: partner.publicKey,
    payer: payer.publicKey,
    maxBaseAmount: new BN(1000000),
    maxQuoteAmount: new BN(1000000),
    receiver: receiver.publicKey,
})
```

**Notes**

- Use this function for transfer-hook pools so the transfer-hook remaining accounts are included in the claim instruction.
- The `feeClaimer` must match the config's partner fee claimer.
- You can set `maxBaseAmount` or `maxQuoteAmount` to 0 to skip claiming that token.

---

### partnerWithdrawSurplus

Withdraws the partner's surplus from the pool.

**Function**

```typescript
partnerWithdrawSurplus(
        params: PartnerWithdrawSurplusParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface PartnerWithdrawSurplusParams {
    feeClaimer: PublicKey // The wallet that will claim the fee
    pool: PublicKey // The pool address
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.partnerWithdrawSurplus({
    feeClaimer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
})
```

**Notes**

- The feeClaimer of the pool must be the same as the feeClaimer in the `PartnerWithdrawSurplusParam` params.

---

### partnerWithdrawMigrationFee

Withdraws the partner's migration fee from the pool.

**Function**

```typescript
partnerWithdrawMigrationFee(
        params: WithdrawMigrationFeeParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface WithdrawMigrationFeeParams {
    pool: PublicKey // The pool address
    sender: PublicKey // The wallet that will claim the fee
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.partnerWithdrawMigrationFee({
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    sender: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The sender of the pool must be the same as the partner (`feeClaimer`) in the config key.

---

### claimPartnerPoolCreationFee

Claims the partner's pool creation fee from the pool. (The pool creation fee is paid by the user)

**Function**

```typescript
claimPartnerPoolCreationFee(
        params: ClaimPartnerPoolCreationFeeParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface ClaimPartnerPoolCreationFeeParams {
    pool: PublicKey // The pool address
    feeReceiver: PublicKey // The wallet that will claim the fee
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.partner.claimPartnerPoolCreationFee({
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    feeReceiver: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The signer of the transaction must be the same as the feeClaimer in the `pool`'s config.

---

## Build Curve Functions

### buildCurve

Builds a new constant product curve. This function does the math for you to create a curve structure based on percentage of supply on migration and migration quote threshold.

**Function**

```typescript
function buildCurve(params: BuildCurveParams): ConfigParameters
```

**Parameters**

All `buildCurve*` functions share the same base parameters (`BuildCurveBaseParams`), organized into nested groups:

```typescript
interface BuildCurveParams {
    // Token configuration
    token: {
        tokenType: TokenType // 0: SPLToken, 1: Token2022
        tokenBaseDecimal: TokenDecimal // 6, 7, 8, or 9
        tokenQuoteDecimal: number // The quote mint decimals, for example 9 for SOL or 5 for BONK
        tokenAuthorityOption: TokenAuthorityOption // 0: CreatorUpdateAuthority, 1: Immutable, 2: PartnerUpdateAuthority, 3: CreatorUpdateAndMintAuthority, 4: PartnerUpdateAndMintAuthority
        totalTokenSupply: number // The total token supply
        leftover: number // The leftover amount that can be withdrawn by leftover receiver
    }
    // Fee configuration
    fee: {
        baseFeeParams: BaseFeeParams // Either FeeScheduler or RateLimiter (see below)
        dynamicFeeEnabled: boolean // Whether dynamic fee is enabled
        collectFeeMode: CollectFeeMode // 0: QuoteToken, 1: OutputToken
        creatorTradingFeePercentage: number // The percentage of the trading fee allocated to the creator
        poolCreationFee: number // The pool creation fee paid by the token pool creator (in SOL)
        enableFirstSwapWithMinFee: boolean // Enable only when bundling swap with create pool instruction
    }
    // Migration configuration
    migration: {
        migrationOption: MigrationOption // 1: DAMM V2. DAMM V1 (0) is deprecated for new configs
        migrationFeeOption: MigrationFeeOption // 0-5: Fixed fee options, 6: Customizable (DAMM V2 only)
        migrationFee: {
            feePercentage: number // Percentage of fee taken from migration quote threshold (0-99)
            creatorFeePercentage: number // Fee share percentage for the creator from the migration fee (0-100)
        }
        migratedPoolFee?: {
            // Optional. Configure only for DAMM V2 migration.
            collectFeeMode: MigratedCollectFeeMode // 0: QuoteToken, 1: OutputToken, 2: Compounding
            dynamicFee: DammV2DynamicFeeMode // 0: Disabled, 1: Enabled
            poolFeeBps: number // The pool fee in basis points
            compoundingFeeBps?: number // 0 to 10_000 when collectFeeMode = 2 (Compounding). 0 collects the trading fee in the quote token. Otherwise must be 0
            baseFeeMode?: DammV2BaseFeeMode // 0: FeeTimeSchedulerLinear, 1: FeeTimeSchedulerExponential, 3: FeeMarketCapSchedulerLinear, 4: FeeMarketCapSchedulerExponential
            marketCapFeeSchedulerParams?: {
                // Configure for market cap-based fee scheduling
                endingBaseFeeBps: number // The ending base fee in basis points (must be < bonding curve's endingFeeBps)
                numberOfPeriod: number // The number of periods
                priceMultiple: number // Target spot-price multiple from the initial price
                schedulerExpirationDuration: number // The scheduler expiration duration in seconds
            }
        }
    }
    // Liquidity distribution for the graduated pool
    liquidityDistribution: {
        partnerLiquidityPercentage: number // Partner LP percentage (0-100)
        partnerPermanentLockedLiquidityPercentage: number // Partner permanent locked LP percentage (0-100)
        partnerLiquidityVestingInfoParams?: {
            // Optional partner liquidity vesting (DAMM V2 only)
            vestingPercentage: number
            bpsPerPeriod: number
            numberOfPeriods: number
            cliffDurationFromMigrationTime: number
            totalDuration: number
        }
        creatorLiquidityPercentage: number // Creator LP percentage (0-100)
        creatorPermanentLockedLiquidityPercentage: number // Creator permanent locked LP percentage (0-100)
        creatorLiquidityVestingInfoParams?: {
            // Optional creator liquidity vesting (DAMM V2 only)
            vestingPercentage: number
            bpsPerPeriod: number
            numberOfPeriods: number
            cliffDurationFromMigrationTime: number
            totalDuration: number
        }
    }
    // Locked vesting configuration (set all to 0 for no vesting)
    lockedVesting: {
        totalLockedVestingAmount: number // The total locked vesting amount
        numberOfVestingPeriod: number // The number of vesting periods
        cliffUnlockAmount: number // Tokens unlocked when vesting starts
        totalVestingDuration: number // Total vesting duration in seconds
        cliffDurationFromMigrationTime: number // Wait time before vesting starts in seconds
    }
    activationType: ActivationType // 0: Slot, 1: Timestamp
    // buildCurve-specific parameters:
    percentageSupplyOnMigration: number // The percentage of the supply that will be migrated
    migrationQuoteThreshold: number // The quote threshold for migration (in quote token units)
}
```

**BaseFeeParams** (used by all `buildCurve*` functions):

```typescript
// Either FeeSchedulerLinear/FeeSchedulerExponential mode:
type BaseFeeParams =
    | {
          baseFeeMode:
              | BaseFeeMode.FeeSchedulerLinear
              | BaseFeeMode.FeeSchedulerExponential
          feeSchedulerParam: {
              startingFeeBps: number // The starting fee in basis points
              endingFeeBps: number // The ending fee in basis points
              numberOfPeriod: number // The number of periods
              totalDuration: number // The total duration of the fee scheduler
          }
      }
    // OR RateLimiter mode (deprecated for new configs; existing pools can still be quoted):
    | {
          baseFeeMode: BaseFeeMode.RateLimiter
          rateLimiterParam: {
              baseFeeBps: number // The base fee in basis points
              feeIncrementBps: number // The fee increment in basis points
              referenceAmount: number // The reference amount for rate limiting
              maxLimiterDuration: number // The maximum duration for rate limiting
          }
      }
```

**Returns**

- A `ConfigParameters` object that can be spread into `createConfig`.

**Example**

```typescript
// Example 1: Simple fixed fee option (no custom migrated pool fee needed)
const curveConfig = buildCurve({
    token: {
        tokenType: TokenType.SPLToken,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: false,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.FixedBps100,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 100,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: 25,
    migrationQuoteThreshold: 1,
})

// Example 2: Customizable with market cap fee scheduler
const curveConfigWithScheduler = buildCurve({
    token: {
        tokenType: TokenType.Token2022,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 500,
                endingFeeBps: 100,
                numberOfPeriod: 10,
                totalDuration: 3600,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.FixedBps100, // Will be auto-overridden to Customizable
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 120,
            baseFeeMode: DammV2BaseFeeMode.FeeMarketCapSchedulerLinear,
            marketCapFeeSchedulerParams: {
                endingBaseFeeBps: 25, // Must be less than bonding curve's endingFeeBps (100)
                numberOfPeriod: 100,
                priceMultiple: 1000,
                schedulerExpirationDuration: 1000000,
            },
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 55,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
        partnerLiquidityVestingInfoParams: {
            vestingPercentage: 30,
            bpsPerPeriod: 1000,
            cliffDurationFromMigrationTime: 86400,
            numberOfPeriods: 10,
            totalDuration: 100,
        },
        creatorLiquidityVestingInfoParams: {
            vestingPercentage: 15,
            bpsPerPeriod: 1,
            cliffDurationFromMigrationTime: 86400,
            numberOfPeriods: 10000,
            totalDuration: 333333,
        },
    },
    lockedVesting: {
        totalLockedVestingAmount: 1000000,
        numberOfVestingPeriod: 10,
        cliffUnlockAmount: 0,
        totalVestingDuration: 10000,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    percentageSupplyOnMigration: 10,
    migrationQuoteThreshold: 300,
})

// Use the curve config in createConfig
const transaction = await client.partner.createConfig({
    config: configKeypair.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig,
})
```

**Notes**

- `buildCurve` helps you create a curve structure based on percentage of supply on migration and migration quote threshold.
- If `dynamicFeeEnabled` is true, the dynamic fee will be enabled and capped at 20% of minimum base fee.
- `lockedVesting.totalVestingDuration` and `lockedVesting.cliffDurationFromMigrationTime` are calculated in terms of seconds.
- `feeSchedulerParam.totalDuration` is calculated based on your `activationType` and `activationTime`. Slot is 400ms, Timestamp is 1000ms.
- **Migration Fee Option behavior:**
    - **Fixed options (0-5):** Uses default migrated pool fee parameters. Any custom `migratedPoolFee` values are ignored.
    - **Customizable (6):** Uses your custom `migratedPoolFee` values. Falls back to defaults for any omitted fields (including `compoundingFeeBps`, which defaults to `0`).
    - **Auto-override:** When `marketCapFeeSchedulerParams` is configured inside `migratedPoolFee`, the SDK automatically overrides `migrationFeeOption` to `Customizable` regardless of what you set. This is required by the on-chain program.
- When using `marketCapFeeSchedulerParams`:
    - `baseFeeMode` must be `DammV2BaseFeeMode.FeeMarketCapSchedulerLinear` (3) or `FeeMarketCapSchedulerExponential` (4).
    - `endingBaseFeeBps` must be strictly less than the bonding curve's `baseFeeParams.feeSchedulerParam.endingFeeBps`.
    - `priceMultiple` is required and must be greater than 1.
    - The SDK derives on-chain `sqrtPriceStepBps` from `priceMultiple` and `numberOfPeriod` as `floor((sqrt(priceMultiple) - 1) * 10_000 / numberOfPeriod)`. The program stores it as a u16, so it must be at most 65535: `priceMultiple: 1000` needs at least 5 periods.
    - `poolFeeBps` must be greater than 0.
- If `migratedPoolFee.collectFeeMode = MigratedCollectFeeMode.Compounding` (2), `compoundingFeeBps` must be `>= 0` and `<= 10_000`. `0` collects the trading fee in the quote token. Otherwise `compoundingFeeBps` must be `0`.
- For DAMM V1 migration, all `migratedPoolFee` parameters are ignored and defaults are used.

---

### buildCurveWithMarketCap

Builds a new constant product curve with customisable parameters based on market cap. This function does the math for you to create a curve structure based on initial market cap and migration market cap.

**Function**

```typescript
function buildCurveWithMarketCap(
    params: BuildCurveWithMarketCapParams
): ConfigParameters
```

**Parameters**

```typescript
interface BuildCurveWithMarketCapParams {
    // Inherits all fields from BuildCurveBaseParams (token, fee, migration, liquidityDistribution, lockedVesting, activationType)
    // See buildCurve for the full BuildCurveBaseParams definition.
    token: TokenConfig
    fee: FeeConfig
    migration: MigrationConfig
    liquidityDistribution: LiquidityDistributionConfig
    lockedVesting: LockedVestingParams
    activationType: ActivationType
    // buildCurveWithMarketCap-specific parameters:
    initialMarketCap: number // The initial market cap that your token will start with
    migrationMarketCap: number // The migration market cap that your token will be at migration
}
```

**Returns**

- A `ConfigParameters` object.

**Example**

```typescript
const curveConfig = buildCurveWithMarketCap({
    token: {
        tokenType: TokenType.Token2022,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 120,
                endingFeeBps: 120,
                numberOfPeriod: 0,
                totalDuration: 0,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 120,
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 55,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
        partnerLiquidityVestingInfoParams: {
            vestingPercentage: 30,
            bpsPerPeriod: 1000,
            cliffDurationFromMigrationTime: 86400,
            numberOfPeriods: 10,
            totalDuration: 100,
        },
        creatorLiquidityVestingInfoParams: {
            vestingPercentage: 15,
            bpsPerPeriod: 1,
            cliffDurationFromMigrationTime: 86400,
            numberOfPeriods: 10000,
            totalDuration: 333333,
        },
    },
    lockedVesting: {
        totalLockedVestingAmount: 1000000,
        numberOfVestingPeriod: 10,
        cliffUnlockAmount: 0,
        totalVestingDuration: 10000,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: 100,
    migrationMarketCap: 3000,
})

const transaction = await client.partner.createConfig({
    config: configKeypair.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig,
})
```

**Notes**

- `buildCurveWithMarketCap` helps you create a curve structure based on initial market cap and migration market cap.
- If `dynamicFeeEnabled` is true, the dynamic fee will be enabled and capped at 20% of minimum base fee.
- `lockedVesting.totalVestingDuration` and `lockedVesting.cliffDurationFromMigrationTime` are in seconds.
- `feeSchedulerParam.totalDuration` is based on your `activationType`. Slot is 400ms, Timestamp is 1000ms.
- See [buildCurve](#buildCurve) notes for details on migration fee option behavior and `marketCapFeeSchedulerParams` constraints.

---

### buildCurveWithTwoSegments

Builds a new constant product curve with two segments. This function does the math for you to create a curve structure based on initial market cap, migration market cap and percentage of supply on migration.

**Function**

```typescript
function buildCurveWithTwoSegments(
    params: BuildCurveWithTwoSegmentsParams
): ConfigParameters
```

**Parameters**

```typescript
interface BuildCurveWithTwoSegmentsParams {
    // Inherits all fields from BuildCurveBaseParams (token, fee, migration, liquidityDistribution, lockedVesting, activationType)
    // See buildCurve for the full BuildCurveBaseParams definition.
    token: TokenConfig
    fee: FeeConfig
    migration: MigrationConfig
    liquidityDistribution: LiquidityDistributionConfig
    lockedVesting: LockedVestingParams
    activationType: ActivationType
    // buildCurveWithTwoSegments-specific parameters:
    initialMarketCap: number // The initial market cap that your token will start with
    migrationMarketCap: number // The migration market cap that your token will be at migration
    percentageSupplyOnMigration: number // The percentage of the supply that will be migrated
}
```

**Returns**

- A `ConfigParameters` object.

**Example**

```typescript
const curveConfig = buildCurveWithTwoSegments({
    token: {
        tokenType: TokenType.Token2022,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 120,
                endingFeeBps: 120,
                numberOfPeriod: 0,
                totalDuration: 0,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 120,
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 55,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: 5000,
    migrationMarketCap: 1000000,
    percentageSupplyOnMigration: 10,
})

const transaction = await client.partner.createConfig({
    config: configKeypair.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig,
})
```

**Notes**

- `buildCurveWithTwoSegments` helps you create a curve structure based on initial market cap, migration market cap and percentage of supply on migration.
- If `dynamicFeeEnabled` is true, the dynamic fee will be enabled and capped at 20% of minimum base fee.
- `lockedVesting.totalVestingDuration` and `lockedVesting.cliffDurationFromMigrationTime` are in seconds.
- `feeSchedulerParam.totalDuration` is based on your `activationType`. Slot is 400ms, Timestamp is 1000ms.
- See [buildCurve](#buildCurve) notes for details on migration fee option behavior and `marketCapFeeSchedulerParams` constraints.

---

### buildCurveWithMidPrice

Builds a custom constant product curve with a mid price. This will create a two segment curve with a start price -> mid price, and a mid price -> migration price.

**Function**

```typescript
function buildCurveWithMidPrice(
    params: BuildCurveWithMidPriceParams
): ConfigParameters
```

**Parameters**

```typescript
interface BuildCurveWithMidPriceParams {
    // Inherits all fields from BuildCurveBaseParams (token, fee, migration, liquidityDistribution, lockedVesting, activationType)
    // See buildCurve for the full BuildCurveBaseParams definition.
    token: TokenConfig
    fee: FeeConfig
    migration: MigrationConfig
    liquidityDistribution: LiquidityDistributionConfig
    lockedVesting: LockedVestingParams
    activationType: ActivationType
    // buildCurveWithMidPrice-specific parameters:
    initialMarketCap: number // The initial market cap
    migrationMarketCap: number // The migration market cap
    midPrice: number // The mid price where the curve segments
    percentageSupplyOnMigration: number // The percentage of the supply that will be migrated
}
```

**Returns**

- A `ConfigParameters` object.

**Example**

```typescript
const curveConfig = buildCurveWithMidPrice({
    token: {
        tokenType: TokenType.Token2022,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 120,
                endingFeeBps: 120,
                numberOfPeriod: 0,
                totalDuration: 0,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 120,
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 55,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: 5000,
    migrationMarketCap: 1000000,
    midPrice: 141.75,
    percentageSupplyOnMigration: 20,
})

const transaction = await client.partner.createConfig({
    config: configKeypair.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig,
})
```

**Notes**

- `buildCurveWithMidPrice` helps you create a curve structure based on initial market cap, migration market cap and mid price.
- What does mid price do?
    - The `midPrice` is the price at which the curve will be segmented into two parts between the start price and the migration price.
    - The `percentageSupplyOnMigration` is the percentage of the supply that will be migrated.
- If `dynamicFeeEnabled` is true, the dynamic fee will be enabled and capped at 20% of minimum base fee.
- `lockedVesting.totalVestingDuration` and `lockedVesting.cliffDurationFromMigrationTime` are in seconds.
- `feeSchedulerParam.totalDuration` is based on your `activationType`. Slot is 400ms, Timestamp is 1000ms.
- See [buildCurve](#buildCurve) notes for details on migration fee option behavior and `marketCapFeeSchedulerParams` constraints.

---

### buildCurveWithLiquidityWeights

Builds a super customizable constant product curve graph configuration based on different liquidity weights. This function does the math for you to create a curve structure based on initial market cap, migration market cap and liquidity weights.

**Function**

```typescript
function buildCurveWithLiquidityWeights(
    params: BuildCurveWithLiquidityWeightsParams
): ConfigParameters
```

**Parameters**

```typescript
interface BuildCurveWithLiquidityWeightsParams {
    // Inherits all fields from BuildCurveBaseParams (token, fee, migration, liquidityDistribution, lockedVesting, activationType)
    // See buildCurve for the full BuildCurveBaseParams definition.
    token: TokenConfig
    fee: FeeConfig
    migration: MigrationConfig
    liquidityDistribution: LiquidityDistributionConfig
    lockedVesting: LockedVestingParams
    activationType: ActivationType
    // buildCurveWithLiquidityWeights-specific parameters:
    initialMarketCap: number // The initial market cap
    migrationMarketCap: number // The migration market cap
    liquidityWeights: number[] // The liquidity weights for each segment (max 16 elements)
}
```

**Returns**

- A `ConfigParameters` object.

**Example**

```typescript
let liquidityWeights: number[] = []
for (let i = 0; i < 16; i++) {
    liquidityWeights[i] = new Decimal(1.2).pow(new Decimal(i)).toNumber()
}

const curveConfig = buildCurveWithLiquidityWeights({
    token: {
        tokenType: TokenType.Token2022,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 120,
                endingFeeBps: 120,
                numberOfPeriod: 0,
                totalDuration: 0,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 120,
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 55,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    initialMarketCap: 5000,
    migrationMarketCap: 1000000,
    liquidityWeights,
})

const transaction = await client.partner.createConfig({
    config: configKeypair.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig,
})
```

**Notes**

- `buildCurveWithLiquidityWeights` helps you create a curve structure based on initial market cap, migration market cap and liquidity weights.
- What does liquidity weights do?
    - The `liquidityWeights` is an array of numbers that determines how liquidity is distributed across the curve's price ranges.
    - The maximum number of liquidity weights[i] is `16`.
    - Each element in the array represents the liquidity weight for a specific curve segment (total `16` curve segments).
    - For each segment of the curve, the liquidity is scaled by liquidityWeights[i] (where `i` is the liquidityWeight index).
    - This means that as you move along the curve (from lower to higher price ranges), the liquidity in each curve segment can be controlled.
- Effects of changing liquidity weights
    1. `All liquidityWeights[i] === 1`: All segments have the same liquidity. The curve is linear.
    2. `liquidityWeights[i] < liquidityWeights[i+1]`: Lower liquidity at lower prices. Price moves more at lower prices and less at higher prices.
    3. `liquidityWeights[i] > liquidityWeights[i+1]`: Higher liquidity at lower prices. Price moves less at lower prices and more at higher prices.
- If `dynamicFeeEnabled` is true, the dynamic fee will be enabled and capped at 20% of minimum base fee.
- `lockedVesting.totalVestingDuration` and `lockedVesting.cliffDurationFromMigrationTime` are in seconds.
- `feeSchedulerParam.totalDuration` is based on your `activationType`. Slot is 400ms, Timestamp is 1000ms.
- See [buildCurve](#buildCurve) notes for details on migration fee option behavior and `marketCapFeeSchedulerParams` constraints.

---

### buildCurveWithCustomSqrtPrices

Builds a super customizable constant product curve graph configuration based on custom sqrt prices. This function does the math for you to create a curve structure based on custom sqrt prices and optional liquidity weights.

**Function**

```typescript
function buildCurveWithCustomSqrtPrices(
    params: BuildCurveWithCustomSqrtPricesParams
): ConfigParameters
```

**Parameters**

```typescript
interface BuildCurveWithCustomSqrtPricesParams {
    // Inherits all fields from BuildCurveBaseParams (token, fee, migration, liquidityDistribution, lockedVesting, activationType)
    // See buildCurve for the full BuildCurveBaseParams definition.
    token: TokenConfig
    fee: FeeConfig
    migration: MigrationConfig
    liquidityDistribution: LiquidityDistributionConfig
    lockedVesting: LockedVestingParams
    activationType: ActivationType
    // buildCurveWithCustomSqrtPrices-specific parameters:
    sqrtPrices: BN[] // Array of custom sqrt prices (must be in ascending order, min 2 elements)
    liquidityWeights?: number[] // Optional weights for each segment. Length must be sqrtPrices.length - 1. If not provided, liquidity is distributed evenly.
}
```

**Returns**

- A `ConfigParameters` object.

**Example**

```typescript
const customPrices = [0.000001, 0.00000105, 0.000002, 0.001]
const tokenBaseDecimal = TokenDecimal.SIX
const tokenQuoteDecimal = TokenDecimal.SIX

// convert prices to sqrtPrices
const sqrtPrices = createSqrtPrices(
    customPrices,
    tokenBaseDecimal,
    tokenQuoteDecimal
)

// define custom liquidity weights for custom segments (optional)
// length must be sqrtPrices.length - 1, or leave undefined for even distribution
const liquidityWeights = [2, 1, 1]

const curveConfig = buildCurveWithCustomSqrtPrices({
    token: {
        tokenType: TokenType.Token2022,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.SIX,
        tokenAuthorityOption: TokenAuthorityOption.Immutable,
        totalTokenSupply: 1_000_000_000,
        leftover: 0,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 120,
                endingFeeBps: 120,
                numberOfPeriod: 0,
                totalDuration: 0,
            },
        },
        dynamicFeeEnabled: true,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 120,
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 55,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    sqrtPrices,
    liquidityWeights,
})

const transaction = await client.partner.createConfig({
    config: configKeypair.publicKey,
    feeClaimer: wallet.publicKey,
    leftoverReceiver: wallet.publicKey,
    payer: wallet.publicKey,
    quoteMint: NATIVE_MINT,
    ...curveConfig,
})
```

**Notes**

- `buildCurveWithCustomSqrtPrices` helps you create a curve structure based on custom sqrt prices and optional liquidity weights.
- What does sqrt prices do?
    - The `sqrtPrices` is an array of BN values representing the sqrt prices of the curve segments.
    - The length of the `sqrtPrices` array must be at least 2.
    - The first price will be the starting price (pMin) and the last price will be the migration price (pMax).
    - The prices must be in ascending order.
    - Use `createSqrtPrices()` helper to convert regular prices to sqrt prices.
- What does liquidity weights do?
    - The `liquidityWeights` is an array of numbers that determines how liquidity is distributed across the curve's price ranges.
    - The maximum number of liquidity weights[i] is `16`.
    - Each element in the array represents the liquidity weight for a specific curve segment.
    - If not provided, liquidity is distributed evenly across all segments.
    - The length of the `liquidityWeights` array must be `sqrtPrices.length - 1`.
- Effects of changing liquidity weights
    1. `All liquidityWeights[i] === 1`: All segments have the same liquidity. The curve is linear.
    2. `liquidityWeights[i] < liquidityWeights[i+1]`: Lower liquidity at lower prices. Price moves more at lower prices and less at higher prices.
    3. `liquidityWeights[i] > liquidityWeights[i+1]`: Higher liquidity at lower prices. Price moves less at lower prices and more at higher prices.
- If `dynamicFeeEnabled` is true, the dynamic fee will be enabled and capped at 20% of minimum base fee.
- `lockedVesting.totalVestingDuration` and `lockedVesting.cliffDurationFromMigrationTime` are in seconds.
- `feeSchedulerParam.totalDuration` is based on your `activationType`. Slot is 400ms, Timestamp is 1000ms.
- See [buildCurve](#buildCurve) notes for details on migration fee option behavior and `marketCapFeeSchedulerParams` constraints.

---

## Pool Functions

### swap

Swaps between base and quote or quote and base on the Dynamic Bonding Curve.

**Function**

```typescript
swap(params: SwapParams): Promise<Transaction>
```

**Parameters**

```typescript
interface SwapParams {
    owner: PublicKey // The person swapping the tokens
    amountIn: BN // The amount of quote or base tokens to swap
    minimumAmountOut: BN // The minimum amount of quote or base tokens to receive
    swapBaseForQuote: boolean // Whether to swap base for quote. true = swap base for quote, false = swap quote for base
    poolAddress: PublicKey // The pool address
    referralTokenAccount: PublicKey | null // The referral token account (optional)
    payer?: PublicKey // The payer of the transaction (optional)
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const amountIn = await prepareSwapAmountParam(1, NATIVE_MINT, connection)

const virtualPoolState = await client.state.getPool(poolAddress)
const poolConfigState = await client.state.getPoolConfig(
    virtualPoolState.poolState.config
)
const currentPoint = await getCurrentPoint(
    connection,
    poolConfigState.activationType
)

const quote = client.pool.swapQuote({
    virtualPool: virtualPoolState,
    config: poolConfigState,
    swapBaseForQuote: false,
    amountIn,
    slippageBps: 50,
    hasReferral: false,
    currentPoint,
    swapMode: SwapMode.PartialFill,
})

const transaction = await client.pool.swap({
    owner: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    amountIn: new BN(1000000000),
    minimumAmountOut: new BN(0),
    swapBaseForQuote: false,
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    referralTokenAccount: null,
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The owner must have sufficient balance for the swap.
- For SOL swaps, the owner needs additional SOL for transaction fees (approximately 0.01 SOL).
- When swapping quote for base (buying tokens), set `swapBaseForQuote` to `false`.
- When swapping base for quote (selling tokens), set `swapBaseForQuote` to `true`.
- The `minimumAmountOut` parameter protects against slippage. Set it to a value slightly lower than the expected output.
- The `referralTokenAccount` parameter is an optional token account. If provided, the referral fee will be applied to the transaction.
- If the transaction fails with "insufficient balance", check that you have enough tokens plus fees for the transaction.
- The pool address can be derived using `deriveDbcPoolAddress`.
- The `payer` parameter is optional. If not provided, the owner will be used as the payer to fund ATA creation.

---

### swapQuote

Gets the exact swap out quotation in between quote and base swaps (only ExactIn).

**Function**

```typescript
swapQuote(params: SwapQuoteParams): SwapQuoteResult
```

**Parameters**

```typescript
interface SwapQuoteParams {
    virtualPool: VirtualPool // The virtual pool account state, from client.state.getPool
    config: PoolConfig // The pool config account state, from client.state.getPoolConfig
    swapBaseForQuote: boolean // True for base->quote, false for quote->base
    amountIn: BN // The amount of tokens to swap in
    slippageBps?: number // The slippage in bps
    hasReferral: boolean // Whether to include a referral fee
    currentPoint: BN // The current point
}
```

**Returns**

The exact swap out quotation in between quote and base swaps (only ExactIn).

**Example**

```typescript
const amountIn = await prepareSwapAmountParam(1, NATIVE_MINT, connection)

const virtualPoolState = await client.state.getPool(poolAddress)
const poolConfigState = await client.state.getPoolConfig(
    virtualPoolState.poolState.config
)
const currentPoint = await getCurrentPoint(
    connection,
    poolConfigState.activationType
)

const quote = client.pool.swapQuote({
    virtualPool: virtualPoolState,
    config: poolConfigState,
    swapBaseForQuote: false,
    amountIn,
    slippageBps: 50,
    hasReferral: false,
    currentPoint,
})
```

**Notes**

- `amountIn` is in the smallest unit of the input token (lamports for SOL) and includes any transfer fee on the input mint.
- `minimumAmountOut` is `excludedTransferFeeAmountOut` reduced by `slippageBps`.
- A Token-2022 quote mint needs `quoteMint` and `currentEpoch`; `getSwapQuoteTransferFees` fetches them.

---

### swap2

Swaps between base and quote or quote and base on the Dynamic Bonding Curve with specific swap modes (ExactIn, ExactOut, PartialFill).

**Function**

```typescript
swap2(params: Swap2Params): Promise<Transaction>
```

**Parameters**

```typescript
interface Swap2Params {
    owner: PublicKey // The wallet performing the swap
    pool: PublicKey // The pool address to swap on
    swapBaseForQuote: boolean // True for base->quote, false for quote->base
    referralTokenAccount: PublicKey | null // The referral token account (optional)
    payer?: PublicKey // The payer of the transaction (optional)
} & (
    | {
          swapMode: SwapMode.ExactIn // Swap exact input amount
          amountIn: BN // The exact amount to swap in
          minimumAmountOut: BN // Minimum amount expected out (slippage protection)
      }
    | {
          swapMode: SwapMode.PartialFill // Allow partial fills
          amountIn: BN // The amount to swap in
          minimumAmountOut: BN // Minimum amount expected out (slippage protection)
      }
    | {
          swapMode: SwapMode.ExactOut // Swap for exact output amount
          amountOut: BN // The exact amount desired out
          maximumAmountIn: BN // Maximum amount willing to pay in (slippage protection)
      }
)
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const amountIn = await prepareSwapAmountParam(1, NATIVE_MINT, connection)

const virtualPoolState = await client.state.getPool(poolAddress)
const poolConfigState = await client.state.getPoolConfig(
    virtualPoolState.poolState.config
)
const currentPoint = await getCurrentPoint(
    connection,
    poolConfigState.activationType
)

const quote = client.pool.swapQuote2({
    virtualPool: virtualPoolState,
    config: poolConfigState,
    swapBaseForQuote: false,
    amountIn,
    slippageBps: 50,
    hasReferral: false,
    currentPoint,
    swapMode: SwapMode.PartialFill,
})

const transaction = await client.pool.swap2({
    amountIn,
    minimumAmountOut: quote.minimumAmountOut,
    swapMode: SwapMode.PartialFill,
    swapBaseForQuote: false,
    owner: wallet.publicKey,
    pool: poolAddress,
    referralTokenAccount: null,
    payer: payer.publicKey,
})
```

**Notes**

- The `swapMode` parameter determines the type of swap:
    - `SwapMode.ExactIn`: Swap exact input amount
    - `SwapMode.PartialFill`: Allow partial fills
    - `SwapMode.ExactOut`: Swap for exact output amount
- The `amountIn` is the amount of tokens you want to swap, denominated in the smallest unit and token decimals. (e.g., lamports for SOL).
- The `minimumAmountOut` parameter protects against slippage. Set it to a value slightly lower than the expected output.
- The `maximumAmountIn` parameter protects against slippage. Set it to a value slightly higher than the expected input.
- The `referralTokenAccount` parameter is an optional token account. If provided, the referral fee will be applied to the transaction.
- The `payer` parameter is optional. If not provided, the owner will be used as the payer to fund ATA creation.

---

### swap2WithTransferHook

Swaps on a transfer-hook pool using `SwapMode.ExactIn`, `SwapMode.ExactOut`, or `SwapMode.PartialFill`.

**Function**

```typescript
swap2WithTransferHook(params: Swap2Params): Promise<Transaction>
```

**Parameters**

```typescript
interface Swap2Params {
    owner: PublicKey // The wallet performing the swap
    pool: PublicKey // The pool address to swap on
    swapBaseForQuote: boolean // True for base->quote, false for quote->base
    referralTokenAccount: PublicKey | null // The referral token account (optional)
    payer?: PublicKey // The payer of the transaction (optional)
} & (
    | {
          swapMode: SwapMode.ExactIn // Swap exact input amount
          amountIn: BN // The exact amount to swap in
          minimumAmountOut: BN // Minimum amount expected out (slippage protection)
      }
    | {
          swapMode: SwapMode.PartialFill // Allow partial fills
          amountIn: BN // The amount to swap in
          minimumAmountOut: BN // Minimum amount expected out (slippage protection)
      }
    | {
          swapMode: SwapMode.ExactOut // Swap for exact output amount
          amountOut: BN // The exact amount desired out
          maximumAmountIn: BN // Maximum amount willing to pay in (slippage protection)
      }
)
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const amountIn = await prepareSwapAmountParam(1, NATIVE_MINT, connection)

const quote = client.pool.swapQuote2({
    virtualPool: virtualPoolState,
    config: poolConfigState,
    swapBaseForQuote: false,
    amountIn,
    slippageBps: 50,
    hasReferral: false,
    currentPoint,
    swapMode: SwapMode.ExactIn,
})

const transaction = await client.pool.swap2WithTransferHook({
    amountIn,
    minimumAmountOut: quote.minimumAmountOut,
    swapMode: SwapMode.ExactIn,
    swapBaseForQuote: false,
    owner: wallet.publicKey,
    pool: poolAddress,
    referralTokenAccount: null,
    payer: payer.publicKey,
})
```

**Notes**

- Use this function for pools whose base mint has a Token-2022 transfer hook.
- The SDK derives and appends the transfer-hook remaining accounts for the base mint.
- If `referralTokenAccount` is provided, the SDK includes both base and referral transfer-hook account groups.

---

### swapQuote2

Gets the exact swap out quotation in between quote and base swaps with specific swap modes (ExactIn, ExactOut, PartialFill). `currentPoint` is required. It is the chain's current point and is not taken from `activationPoint`.

**Function**

```typescript
swapQuote2(params: SwapQuote2Params): SwapQuote2Result
```

**Parameters**

```typescript
interface SwapQuote2Params {
    virtualPool: VirtualPool // The virtual pool account state, from client.state.getPool
    config: PoolConfig // The pool config account state, from client.state.getPoolConfig
    swapBaseForQuote: boolean // True for base->quote, false for quote->base
    hasReferral: boolean // Whether to include a referral fee
    currentPoint: BN // The current point
    slippageBps?: number // The slippage in bps
} & (
    | {
          swapMode: SwapMode.ExactIn // Swap exact input amount
          amountIn: BN // The exact amount to swap in
      }
    | {
          swapMode: SwapMode.PartialFill // Allow partial fills
          amountIn: BN // The amount to swap in
      }
    | {
          swapMode: SwapMode.ExactOut // Swap for exact output amount
          amountOut: BN // The exact amount to swap out
      }
)
```

**Returns**

The exact swap out quotation in between quote and base swaps with specific swap modes (ExactIn, ExactOut, PartialFill).

**Example**

```typescript
const amountIn = await prepareSwapAmountParam(1, NATIVE_MINT, connection)

const virtualPoolState = await client.state.getPool(poolAddress)
const poolConfigState = await client.state.getPoolConfig(
    virtualPoolState.poolState.config
)
const currentPoint = await getCurrentPoint(
    connection,
    poolConfigState.activationType
)

const quote = client.pool.swapQuote2({
    virtualPool: virtualPoolState,
    config: poolConfigState,
    swapBaseForQuote: false,
    amountIn,
    slippageBps: 50,
    hasReferral: false,
    currentPoint,
    swapMode: SwapMode.PartialFill,
})
```

**Notes**

- The `swapMode` parameter determines the type of swap:
    - `SwapMode.ExactIn`: Swap exact input amount
    - `SwapMode.PartialFill`: Allow partial fills. The quote throws when rounding reconstructs an input larger than `amountIn`
    - `SwapMode.ExactOut`: Swap for exact output amount
- The `amountIn` is the amount of tokens you want to swap, denominated in the smallest unit and token decimals. (e.g., lamports for SOL).
- The `slippageBps` parameter protects against slippage. Set it to a value slightly lower than the expected output.
- The `referralTokenAccount` parameter is an optional token account. If provided, the referral fee will be applied to the transaction.
- Transfer fees are applied before the curve on the input mint and after the curve on the output mint. `amountIn` and `amountOut` are the amounts the user pays and receives. `includedTransferFeeAmountIn` is what the user pays. `excludedTransferFeeAmountOut` is what the user receives. `minimumAmountOut` and `maximumAmountIn` use those amounts.
- A base transfer fee is read from `config.transferFeeFlag` when `baseMint` is omitted. Flag 1 uses `config.transferFeeBasisPoints` and a maximum fee of `u64::MAX`. Pass `baseMint` to use the mint's epoch fee, or `baseTransferFeeBasisPoints` before the mint exists. `currentEpoch` is required when either mint is set. A fee with basis points of 0 or a maximum fee of 0 charges nothing.
- When `config.quoteTokenFlag` is Token-2022, `quoteMint` and `currentEpoch` are required, because the program applies the quote mint's fee for the current epoch. `getSwapQuoteTransferFees` fetches that mint. Pass the pool's base mint to fetch its epoch fee too. With neither a Token-2022 quote mint nor a base mint, it returns an empty object:

```typescript
const quote = client.pool.swapQuote2({
    virtualPool: virtualPoolState,
    config: poolConfigState,
    swapBaseForQuote: false,
    amountIn,
    slippageBps: 50,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint,
    swapMode: SwapMode.ExactIn,
    ...(await getSwapQuoteTransferFees(connection, poolConfigState, {
        baseMint: virtualPoolState.poolState.baseMint,
    })),
})
```

---

### getQuoteFromInputAmount

Quotes a swap from an input amount before a pool exists. `config` is a `ConfigParameters` value, which is what `buildCurve` returns and what `createConfig` takes. The quote is the pool `initialize_pool` would write at `currentPoint`: sqrt price is `sqrtStartPrice`, volatility is zero, and `hasSwap` is 0. Elapsed time is 0, so a fee scheduler is at the cliff fee.

**Function**

```typescript
getQuoteFromInputAmount(
        params: SimulatedQuoteFromInputAmountParams
    ): SwapQuote2Result
```

**Parameters**

```typescript
type SimulatedQuoteFromInputAmountParams = {
    config: ConfigParameters
    swapBaseForQuote: boolean // True for base->quote, false for quote->base
    amountIn: BN
    swapMode?: SwapMode.ExactIn | SwapMode.PartialFill
    slippageBps?: number
    hasReferral?: boolean
    currentPoint?: BN // Initialization point. Omit to use 0
    eligibleForFirstSwapWithMinFee?: boolean
    quoteTokenFlag?: number // TokenType.Token2022 when the quote mint is Token-2022
} & QuoteTransferFees
```

**Returns**

`SwapQuote2Result`, including `includedFeeInputAmount`, `excludedFeeInputAmount`, `outputAmount`, `amountLeft`, `minimumAmountOut`, fees, and `nextSqrtPrice`.

**Example**

```typescript
const curveConfig = buildCurve({
    // token, fee, migration, liquidity distribution, and activation params
})

const quote = client.pool.getQuoteFromInputAmount({
    config: curveConfig,
    swapBaseForQuote: false, // quote -> base
    amountIn: new BN(10_000_000_000),
    swapMode: SwapMode.ExactIn,
    slippageBps: 100,
})
```

**Notes**

- `migrationSqrtPrice` is computed the way `process_create_config` computes it, from `migrationQuoteThreshold`, `sqrtStartPrice`, and `curve`.
- `SwapMode.ExactIn` throws if the full input cannot be absorbed by the curve. Use `SwapMode.PartialFill` to fill up to the available curve liquidity and inspect `amountLeft`.
- Omit `currentPoint` to use 0 for both the activation point and the current point. A caller-supplied `currentPoint` is used for both, so elapsed time stays 0.
- Pass `baseTransferFeeBasisPoints` when `createConfig2` sets a base transfer fee. Pass `quoteTokenFlag: TokenType.Token2022` for a Token-2022 quote mint; `quoteMint` and `currentEpoch` are then required.
- An existing pool is quoted with `swapQuote2` once the pool exists. This function does not accept a decoded `PoolConfig`.

---

### getQuoteFromOutputAmount

Quotes an exact-out swap before a pool exists, using the same initial pool as `getQuoteFromInputAmount`.

**Function**

```typescript
getQuoteFromOutputAmount(
        params: SimulatedQuoteFromOutputAmountParams
    ): SwapQuote2Result
```

**Parameters**

```typescript
type SimulatedQuoteFromOutputAmountParams = {
    config: ConfigParameters
    swapBaseForQuote: boolean // True for base->quote, false for quote->base
    amountOut: BN
    slippageBps?: number
    hasReferral?: boolean
    currentPoint?: BN // Initialization point. Omit to use 0
    eligibleForFirstSwapWithMinFee?: boolean
    quoteTokenFlag?: number
} & QuoteTransferFees
```

**Returns**

`SwapQuote2Result`, including `includedFeeInputAmount`, `excludedFeeInputAmount`, `outputAmount`, `maximumAmountIn`, fees, and `nextSqrtPrice`.

**Example**

```typescript
const curveConfig = buildCurve({
    // token, fee, migration, liquidity distribution, and activation params
})

const quote = client.pool.getQuoteFromOutputAmount({
    config: curveConfig,
    swapBaseForQuote: false, // quote -> base
    amountOut: new BN(1_000_000_000_000),
    slippageBps: 100,
})

console.log('required input:', quote.includedFeeInputAmount.toString())
console.log('maximum input with slippage:', quote.maximumAmountIn?.toString())
```

**Notes**

- It throws if the requested output is not fillable by the curve.
- Amounts are returned in token base units. Use token decimals when displaying human-readable values.

---

## Migration Functions

### createLocker

Creates a new locker account when migrating from Dynamic Bonding Curve to DAMM V1 or DAMM V2. This function is called when `lockedVestingParam` is enabled in the config key.

**Function**

```typescript
createLocker(params: CreateLockerParams): Promise<Transaction>
```

**Parameters**

```typescript
interface CreateLockerParams {
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.migration.createLocker({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
})
```

**Notes**

- This function is called when `lockedVesting` is enabled in the config key.

---

### withdrawLeftover

Withdraws leftover tokens from the Dynamic Bonding Curve pool.

**Function**

```typescript
withdrawLeftover(
        params: WithdrawLeftoverParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface WithdrawLeftoverParams {
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.migration.withdrawLeftover({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
})
```

**Notes**

- This function is called when there are leftover tokens in the Dynamic Bonding Curve pool after migration.
- The leftover tokens will be sent to the `leftoverReceiver` that was specified in the config key.
- When the base mint charges a transfer fee on the leftover, `leftoverReceiver` must sign the instruction.

---

### createDammV1MigrationMetadata

Creates a new DAMM V1 migration metadata account.

**Function**

```typescript
createDammV1MigrationMetadata(
        params: CreateDammV1MigrationMetadataParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreateDammV1MigrationMetadataParams {
    payer: PublicKey // The payer of the transaction
    virtualPool: PublicKey // The virtual pool address
    config: PublicKey // The config address
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.migration.createDammV1MigrationMetadata({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    virtualPool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    config: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- This function must be called before `migrateToDammV1`.

---

### migrateToDammV1

Migrates the Dynamic Bonding Curve pool to DAMM V1.

**Function**

```typescript
migrateToDammV1(params: MigrateToDammV1Params): Promise<Transaction>
```

**Parameters**

```typescript
interface MigrateToDammV1Params {
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
    dammConfig: PublicKey // The damm graduation fee config address
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.migration.migrateToDammV1({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    dammConfig: new PublicKey('8f848CEy8eY6PhJ3VcemtBDzPPSD4Vq7aJczLZ3o8MmX'),
})
```

**Notes**

- Ensure that when attempting to migrate the virtual pool, all these validation checks have already been met:
    1. The `MigrationFeeOption` must be a valid enum value with a valid base fee in basis points
    2. The pool's config account must have:
        - pool_creator_authority matching the pool_authority key
        - activation_duration set to 0
        - partner_fee_numerator set to 0
        - vault_config_key set to the default Pubkey (all zeros)
    3. The virtual pool's migration progress must be in the LockedVesting state
    4. The pool must be "complete" based on the migration_quote_threshold (checked via is_curve_complete)
    5. The migration option must be valid and specifically set to MeteoraDamm
    6. The account relationships must be valid:
        - virtual_pool must have matching base_vault and quote_vault
        - virtual_pool must have a matching config
        - migration_metadata must have a matching virtual_pool
- You can get the dammConfig key from the [README.md](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/README.md), or you can use `DAMM_V1_MIGRATION_FEE_ADDRESS[i]` to get the dammConfig key address.

---

### lockDammV1LpToken

Locks a DAMM V1 LP token for a partner or creator.

**Function**

```typescript
lockDammV1LpToken(params: DammLpTokenParams): Promise<Transaction>
```

**Parameters**

```typescript
interface DammLpTokenParams {
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
    dammConfig: PublicKey // The damm graduation fee config address
    isPartner: boolean // Whether the LP token is a partner
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.migration.lockDammV1LpToken({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    dammConfig: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
    isPartner: true,
})
```

**Notes**

- This function is called when the `creatorPermanentLockedLiquidityPercentage` or `partnerPermanentLockedLiquidityPercentage` is > 0.
- You can get the dammConfig key from the [README.md](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/README.md), or you can use `DAMM_V1_MIGRATION_FEE_ADDRESS[i]` to get the dammConfig key address.

---

### claimDammV1LpToken

Claims a DAMM V1 LP token for a partner or creator.

**Function**

```typescript
claimDammV1LpToken(params: DammLpTokenParams): Promise<Transaction>
```

**Parameters**

```typescript
interface DammLpTokenParams {
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
    dammConfig: PublicKey // The damm graduation fee config address
    isPartner: boolean // Whether the LP token is a partner
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.migration.claimDammV1LpToken({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    dammConfig: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
    isPartner: true,
})
```

**Notes**

- This function is called when the `creatorLiquidityPercentage` or `partnerLiquiditypercentage` is > 0.
- You can get the dammConfig key from the [README.md](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/README.md), or you can use `DAMM_V1_MIGRATION_FEE_ADDRESS[i]` to get the dammConfig key address.

---

### migrateToDammV2

Migrates the Dynamic Bonding Curve pool to DAMM V2.

**Function**

```typescript
migrateToDammV2(
        params: MigrateToDammV2Params
    ): Promise<MigrateToDammV2Response>
```

**Parameters**

```typescript
interface MigrateToDammV2Params {
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
    dammConfig: PublicKey // The damm graduation fee config address
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.migration.migrateToDammV2({
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    dammConfig: new PublicKey('7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd'),
})
```

**Notes**

- Ensure that when attempting to migrate the virtual pool, all these validation checks have already been met:
    1. The `MigrationFeeOption` must be a valid enum value with a valid base fee in basis points
    2. The pool's config account must have:
        - pool_creator_authority matching the pool_authority key
        - partner_fee_percent set to 0
        - sqrt_min_price equal to MIN_SQRT_PRICE
        - sqrt_max_price equal to MAX_SQRT_PRICE
        - vault_config_key set to the default Pubkey (all zeros)
    3. The virtual pool's migration progress must be in the LockedVesting state
    4. The pool must be "complete" based on the migration_quote_threshold (checked via is_curve_complete)
    5. The migration option must be valid and specifically set to DammV2
    6. The account relationships must be valid:
        - virtual_pool must have matching base_vault and quote_vault
        - virtual_pool must have a matching config
        - migration_metadata must have a matching virtual_pool
        - first_position_nft_mint must not equal second_position_nft_mint
    7. Exactly one remaining account must be provided (for the DAMM V2 config)
- A version 0 config is rejected when the quote mint's current transfer fee is non-zero. Any other version with `transferFeeFlag` 1, or a quote mint that has a transfer fee or a live transfer fee config authority, must use a constant token supply, no locked vesting, `MigrationFeeOption.Customizable`, and `MigratedCollectFeeMode.Compounding`.
- On that path, `getTransferFeeMigrationPositionSplit` returns the second position's numerator and liquidity.
- You can get the dammConfig key from the [README.md](https://github.com/MeteoraAg/dynamic-bonding-curve-sdk/blob/main/packages/dynamic-bonding-curve/README.md), or you can use `DAMM_V2_MIGRATION_FEE_ADDRESS[i]` to get the dammConfig key address.

---

## Creator Functions

### createPool

Creates a new pool with the config key.

**Function**

```typescript
createPool(params: CreatePoolParams): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatePoolParams {
    baseMint: PublicKey // The base mint address (generated by you)
    config: PublicKey // The config account address
    name: string // The name of the pool
    symbol: string // The symbol of the pool
    uri: string // The uri of the pool
    payer: PublicKey // The payer of the transaction
    poolCreator: PublicKey // The pool creator of the transaction
    tokenBadge?: PublicKey // Optional. Required remaining account when the quote mint is not permissionless-supported
}
```

**Returns**

- A transaction that requires signatures from the payer, the baseMint keypair, and the poolCreator before being submitted to the network.

**Example**

```typescript
const transaction = await client.creator.createPool({
    baseMint: new PublicKey('0987654321zyxwvutsrqponmlkjihgfedcba'),
    config: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
    name: 'Meteora',
    symbol: 'MET',
    uri: 'https://launch.meteora.ag',
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    poolCreator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The payer must be the same as the payer in the `CreatePoolParam` params.
- The poolCreator is required to sign when creating the pool.
- The baseMint token type must be the same as the config key's token type.
- Existing configs with `BaseFeeMode.RateLimiter` or `MigrationOption.MET_DAMM` cannot create new pools.
- Pass `tokenBadge` when the quote mint is not permissionless-supported.

---

### createPoolWithTransferHook

Creates a Token-2022 transfer-hook pool from an existing transfer-hook config.

**Function**

```typescript
createPoolWithTransferHook(
        params: CreatePoolWithTransferHookParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatePoolWithTransferHookParams {
    baseMint: PublicKey // The base mint address (generated by you)
    config: PublicKey // The transfer-hook config account address
    name: string // The name of the pool
    symbol: string // The symbol of the pool
    uri: string // The URI of the pool
    payer: PublicKey // The payer of the transaction
    poolCreator: PublicKey // The pool creator of the transaction
    transferHookProgram: PublicKey // The Token-2022 transfer-hook program
}
```

**Returns**

- A transaction that requires signatures from the payer, the baseMint keypair, and the poolCreator before being submitted to the network.

**Example**

```typescript
const transaction = await client.creator.createPoolWithTransferHook({
    baseMint: baseMintKeypair.publicKey,
    config: config.publicKey,
    name: 'Meteora',
    symbol: 'MET',
    uri: 'https://launch.meteora.ag/icons/logo.svg',
    payer: payer.publicKey,
    poolCreator: poolCreator.publicKey,
    transferHookProgram: transferHookProgramId,
})
```

**Notes**

- Use this function with configs created by `createConfigWithTransferHook`.
- The transfer-hook program is initialized on the pool's base mint.
- The config's `tokenType` must be `TokenType.Token2022`.

---

### createPoolWithFirstBuy

Creates a new pool with the config key and buys the token immediately.

**Function**

```typescript
createPoolWithFirstBuy(
        params: CreatePoolWithFirstBuyParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatePoolWithFirstBuyParams {
    createPoolParam: {
        baseMint: PublicKey // The base mint address (generated by you)
        config: PublicKey // The config account address
        name: string // The name of the pool
        symbol: string // The symbol of the pool
        uri: string // The uri of the pool
        payer: PublicKey // The payer of the transaction
        poolCreator: PublicKey // The pool creator of the transaction
    }
    firstBuyParam?: {
        // Optional first buy param
        buyer: PublicKey // The buyer of the transaction
        receiver?: PublicKey // Optional: The receiver of the transaction
        buyAmount: BN // The amount of tokens to buy
        minimumAmountOut: BN // The minimum amount of tokens to receive
        referralTokenAccount: PublicKey | null // The referral token account (optional)
    }
}
```

**Returns**

A transaction containing pool creation instructions, with first-buy instructions included when `firstBuyParam` is provided and `buyAmount > 0`.

**Example**

```typescript
const amountIn = await prepareSwapAmountParam(1, NATIVE_MINT, connection)

const transaction = await client.creator.createPoolWithFirstBuy({
    createPoolParam: {
        baseMint: new PublicKey('0987654321zyxwvutsrqponmlkjihgfedcba'),
        config: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
        name: 'Meteora',
        symbol: 'MET',
        uri: 'https://launch.meteora.ag/icons/logo.svg',
        payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
        poolCreator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    },
    firstBuyParam: {
        buyer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
        buyAmount: amountIn,
        minimumAmountOut: new BN(1),
        referralTokenAccount: null,
    },
})
```

**Notes**

- The `poolCreator` is required to sign when creating the pool.
- The `buyer` is required to sign when `firstBuyParam` is provided.
- The `baseMint` token type must be the same as the config key's token type.
- The `minimumAmountOut` parameter protects against slippage. Set it to a value slightly lower than the expected output.
- The `referralTokenAccount` parameter is an optional token account. If provided, the referral fee will be applied to the transaction.
- The `receiver` parameter is an optional account. If provided, the token will be sent to the receiver address.

---

### createPoolWithFirstBuyWithTransferHook

Creates a transfer-hook pool from an existing config and optionally appends a first buy that supports transfer-hook remaining accounts.

**Function**

```typescript
createPoolWithFirstBuyWithTransferHook(
        params: CreatePoolWithFirstBuyWithTransferHookParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatePoolWithFirstBuyWithTransferHookParams {
    createPoolParam: CreatePoolWithTransferHookParams
    firstBuyParam?: {
        buyer: PublicKey // The buyer of the transaction
        receiver?: PublicKey // Optional receiver of the bought tokens
        buyAmount: BN // The quote token amount to spend
        minimumAmountOut: BN // The minimum base token amount to receive
        referralTokenAccount: PublicKey | null // The referral token account (optional)
        transferHookAccountsInfo?: TransferHookAccountsInfo // Optional precomputed transfer-hook account slice info
        transferHookAccounts?: AccountMeta[] // Optional precomputed transfer-hook remaining accounts
    }
}
```

**Returns**

A transaction containing transfer-hook pool creation instructions, with first-buy instructions included when `firstBuyParam` is provided and `buyAmount > 0`.

**Example**

```typescript
const transaction = await client.creator.createPoolWithFirstBuyWithTransferHook(
    {
        createPoolParam: {
            baseMint: baseMintKeypair.publicKey,
            config: config.publicKey,
            name: 'Meteora',
            symbol: 'MET',
            uri: 'https://launch.meteora.ag/icons/logo.svg',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
            transferHookProgram: transferHookProgramId,
        },
        firstBuyParam: {
            buyer: poolCreator.publicKey,
            buyAmount: amountIn,
            minimumAmountOut: new BN(0),
            referralTokenAccount: null,
        },
    }
)
```

**Notes**

- If your transfer-hook program requires extra account metas before the first buy, initialize those accounts before sending this transaction.
- `transferHookAccountsInfo` and `transferHookAccounts` are optional; when omitted, the SDK derives the transfer-hook remaining accounts from the base mint.
- The `buyer` is required to sign when `firstBuyParam` is provided.

---

### createPoolWithPartnerAndCreatorFirstBuy

Creates a new pool with the config key and buys the token immediately with partner and creator.

**Function**

```typescript
createPoolWithPartnerAndCreatorFirstBuy(
        params: CreatePoolWithPartnerAndCreatorFirstBuyParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatePoolWithPartnerAndCreatorFirstBuyParams {
    createPoolParam: {
        baseMint: PublicKey // The base mint address (generated by you)
        config: PublicKey // The config account address
        name: string // The name of the pool
        symbol: string // The symbol of the pool
        uri: string // The uri of the pool
        payer: PublicKey // The payer of the transaction
        poolCreator: PublicKey // The pool creator of the transaction
    }
    partnerFirstBuyParam?: {
        // Optional partner first buy param
        partner: PublicKey // The launchpad partner
        receiver: PublicKey // The receiver of the transaction
        buyAmount: BN // The amount of tokens to buy
        minimumAmountOut: BN // The minimum amount of tokens to receive
        referralTokenAccount: PublicKey | null // The referral token account (optional)
    }
    creatorFirstBuyParam?: {
        // Optional creator first buy param
        creator: PublicKey // The pool creator
        receiver: PublicKey // The receiver of the transaction
        buyAmount: BN // The amount of tokens to buy
        minimumAmountOut: BN // The minimum amount of tokens to receive
        referralTokenAccount: PublicKey | null // The referral token account (optional)
    }
}
```

**Returns**

A single transaction containing pool creation and optional partner/creator first buy instructions. Partner and creator swap instructions are appended when their corresponding params are provided with `buyAmount > 0`.

**Example**

```typescript
const creatorAmountIn = await prepareSwapAmountParam(
    0.5,
    NATIVE_MINT,
    connection
)
const partnerAmountIn = await prepareSwapAmountParam(
    0.1,
    NATIVE_MINT,
    connection
)

const transaction =
    await client.creator.createPoolWithPartnerAndCreatorFirstBuy({
        createPoolParam: {
            baseMint: new PublicKey('0987654321zyxwvutsrqponmlkjihgfedcba'),
            config: new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
            name: 'Meteora',
            symbol: 'MET',
            uri: 'https://launch.meteora.ag/icons/logo.svg',
            payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
            poolCreator: new PublicKey(
                'boss1234567890abcdefghijklmnopqrstuvwxyz'
            ),
        },
        partnerFirstBuyParam: {
            partner: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
            receiver: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
            buyAmount: partnerAmountIn,
            minimumAmountOut: new BN(1),
            referralTokenAccount: null,
        },
        creatorFirstBuyParam: {
            creator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
            receiver: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
            buyAmount: creatorAmountIn,
            minimumAmountOut: new BN(1),
            referralTokenAccount: null,
        },
    })
```

**Notes**

- The `poolCreator` is required to sign when creating the pool.
- The `partner` is required to sign when `partnerFirstBuyParam` is provided with `buyAmount > 0`.
- The `creator` is required to sign when `creatorFirstBuyParam` is provided with `buyAmount > 0`.
- The `baseMint` token type must be the same as the config key's token type.
- The `minimumAmountOut` parameter protects against slippage. Set it to a value slightly lower than the expected output.
- The `referralTokenAccount` parameter is an optional token account. If provided, the referral fee will be applied to the transaction.

---

### createPoolWithPartnerAndCreatorFirstBuyWithTransferHook

Creates a transfer-hook pool from an existing config and optionally appends partner and creator first buys that support transfer-hook remaining accounts.

**Function**

```typescript
createPoolWithPartnerAndCreatorFirstBuyWithTransferHook(
        params: CreatePoolWithPartnerAndCreatorFirstBuyWithTransferHookParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatePoolWithPartnerAndCreatorFirstBuyWithTransferHookParams {
    createPoolParam: CreatePoolWithTransferHookParams
    partnerFirstBuyParam?: {
        partner: PublicKey // The launchpad partner
        receiver: PublicKey // The receiver of the transaction
        buyAmount: BN // The quote token amount to spend
        minimumAmountOut: BN // The minimum base token amount to receive
        referralTokenAccount: PublicKey | null // The referral token account (optional)
        transferHookAccountsInfo?: TransferHookAccountsInfo // Optional precomputed transfer-hook account slice info
        transferHookAccounts?: AccountMeta[] // Optional precomputed transfer-hook remaining accounts
    }
    creatorFirstBuyParam?: {
        creator: PublicKey // The pool creator
        receiver: PublicKey // The receiver of the transaction
        buyAmount: BN // The quote token amount to spend
        minimumAmountOut: BN // The minimum base token amount to receive
        referralTokenAccount: PublicKey | null // The referral token account (optional)
        transferHookAccountsInfo?: TransferHookAccountsInfo // Optional precomputed transfer-hook account slice info
        transferHookAccounts?: AccountMeta[] // Optional precomputed transfer-hook remaining accounts
    }
}
```

**Returns**

A single transaction containing transfer-hook pool creation and optional partner/creator first buy instructions. Partner and creator swap instructions are appended when their corresponding params are provided with `buyAmount > 0`.

**Example**

```typescript
const transaction =
    await client.creator.createPoolWithPartnerAndCreatorFirstBuyWithTransferHook(
        {
            createPoolParam: {
                baseMint: baseMintKeypair.publicKey,
                config: config.publicKey,
                name: 'Meteora',
                symbol: 'MET',
                uri: 'https://launch.meteora.ag/icons/logo.svg',
                payer: poolCreator.publicKey,
                poolCreator: poolCreator.publicKey,
                transferHookProgram: transferHookProgramId,
            },
            partnerFirstBuyParam: {
                partner: partner.publicKey,
                receiver: partner.publicKey,
                buyAmount: partnerAmountIn,
                minimumAmountOut: new BN(1),
                referralTokenAccount: null,
            },
            creatorFirstBuyParam: {
                creator: poolCreator.publicKey,
                receiver: poolCreator.publicKey,
                buyAmount: creatorAmountIn,
                minimumAmountOut: new BN(1),
                referralTokenAccount: null,
            },
        }
    )
```

**Notes**

- The `partner` is required to sign when `partnerFirstBuyParam` is provided with `buyAmount > 0`.
- The `creator` is required to sign when `creatorFirstBuyParam` is provided with `buyAmount > 0`.
- If your transfer-hook program requires extra account metas before the first buys, initialize those accounts before sending this transaction.
- `transferHookAccountsInfo` and `transferHookAccounts` are optional; when omitted, the SDK derives the transfer-hook remaining accounts from the base mint.

---

### createPoolMetadata

Creates a new pool metadata account.

**Function**

```typescript
createPoolMetadata(
        params: CreateVirtualPoolMetadataParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreateVirtualPoolMetadataParams {
    virtualPool: PublicKey // The virtual pool address
    name: string // The name of the pool
    website: string // The website of the pool
    logo: string // The logo of the pool
    creator: PublicKey // The creator of the pool
    payer: PublicKey // The payer of the transaction
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.creator.createPoolMetadata({
    virtualPool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    creator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    name: 'Meteora',
    website: 'https://launch.meteora.ag',
    logo: 'https://launch.meteora.ag/icons/logo.svg',
    feeClaimer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    payer: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

---

### claimCreatorTradingFee

Claims a creator trading fee. If your pool's config key has `creatorTradingFeePercentage` > 0, you can use this function to claim the trading fee for the pool creator.

**Function**

```typescript
claimCreatorTradingFee(
        params: ClaimCreatorTradingFeeParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface ClaimCreatorTradingFeeParams {
    creator: PublicKey // The creator of the pool
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
    maxBaseAmount: BN // The maximum amount of base tokens to claim
    maxQuoteAmount: BN // The maximum amount of quote tokens to claim
    receiver?: PublicKey | null // The wallet that will receive the tokens (optional)
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.creator.claimCreatorTradingFee({
    creator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    payer: new PublicKey('payer1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    maxBaseAmount: new BN(1000000000),
    maxQuoteAmount: new BN(1000000000),
    receiver: new PublicKey('receiver1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The creator of the pool must be the same as the creator in the `ClaimCreatorTradingFeeParams` params.
- You can indicate maxBaseAmount or maxQuoteAmount to be 0 to not claim Base or Quote tokens respectively.
- With a native SOL quote the fee arrives in the creator's wrapped SOL account and is unwrapped to `receiver`, so the receiver does not sign.

---

### claimCreatorTradingFeeToReceiver

Claims a creator trading fee. If your pool's config key has `creatorTradingFeePercentage` > 0, you can use this function to claim the trading fee for the pool creator.

**Function**

```typescript
claimCreatorTradingFeeToReceiver(
        params: ClaimCreatorTradingFeeToReceiverParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface ClaimCreatorTradingFee2Params {
    creator: PublicKey // The creator of the pool
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
    maxBaseAmount: BN // The maximum amount of base tokens to claim
    maxQuoteAmount: BN // The maximum amount of quote tokens to claim
    receiver?: PublicKey | null // The wallet that will receive the tokens
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.creator.claimCreatorTradingFeeToReceiver({
    creator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    payer: new PublicKey('payer1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    maxBaseAmount: new BN(1000000000),
    maxQuoteAmount: new BN(1000000000),
    receiver: new PublicKey('receiver1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The creator of the pool must be the same as the creator in the `ClaimCreatorTradingFee2Params` params.
- You can indicate maxBaseAmount or maxQuoteAmount to be 0 to not claim Base or Quote tokens respectively.
- Can be used in case the creator is a squad multisig account.

---

### claimCreatorTradingFee2

Claims creator trading fees from a transfer-hook pool. This is the transfer-hook variant of `claimCreatorTradingFeeToReceiver`.

**Function**

```typescript
claimCreatorTradingFee2(
        params: ClaimCreatorTradingFeeToReceiverParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface ClaimCreatorTradingFeeToReceiverParams {
    creator: PublicKey // The creator of the pool
    payer: PublicKey // The payer of the transaction
    pool: PublicKey // The pool address
    maxBaseAmount: BN // The maximum amount of base tokens to claim
    maxQuoteAmount: BN // The maximum amount of quote tokens to claim
    receiver?: PublicKey | null // The wallet that will receive the tokens
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.creator.claimCreatorTradingFee2({
    creator: creator.publicKey,
    payer: payer.publicKey,
    pool: poolAddress,
    maxBaseAmount: new BN(1000000000),
    maxQuoteAmount: new BN(1000000000),
    receiver: receiver.publicKey,
})
```

**Notes**

- Use this function for transfer-hook pools so the transfer-hook remaining accounts are included in the claim instruction.
- The `creator` must match the virtual pool creator.
- You can set `maxBaseAmount` or `maxQuoteAmount` to 0 to skip claiming that token.

---

### creatorWithdrawSurplus

Withdraws surplus tokens from the pool.

**Function**

```typescript
creatorWithdrawSurplus(
        params: CreatorWithdrawSurplusParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface CreatorWithdrawSurplusParams {
    creator: PublicKey // The creator of the pool
    pool: PublicKey // The pool address
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.creator.creatorWithdrawSurplus({
    creator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
})
```

**Notes**

- The creator of the pool must be the same as the creator in the `CreatorWithdrawSurplusParams` params.

---

### creatorWithdrawMigrationFee

Withdraws the creator's migration fee from the pool.

**Function**

```typescript
creatorWithdrawMigrationFee(
        params: WithdrawMigrationFeeParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface WithdrawMigrationFeeParams {
    pool: PublicKey // The pool address
    sender: PublicKey // The wallet that will claim the fee
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.creator.creatorWithdrawMigrationFee({
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    sender: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The sender of the pool must be the same as the creator (`poolCreator`) in the virtual pool.

---

### transferPoolCreator

Transfers the pool creator to a new wallet.

**Function**

```typescript
transferPoolCreator(
        params: TransferPoolCreatorParams
    ): Promise<Transaction>
```

**Parameters**

```typescript
interface TransferPoolCreatorParams {
    pool: PublicKey // The pool address
    creator: PublicKey // The current creator of the pool
    newCreator: PublicKey // The new creator of the pool
}
```

**Returns**

- A transaction that can be signed and sent to the network.

**Example**

```typescript
const transaction = await client.creator.transferPoolCreator({
    pool: new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    creator: new PublicKey('boss1234567890abcdefghijklmnopqrstuvwxyz'),
    newCreator: new PublicKey('newCreator1234567890abcdefghijklmnopqrstuvwxyz'),
})
```

**Notes**

- The creator of the pool must be the signer of the transaction.

---

## State Functions

### getPoolConfig

Gets all details about the config.

**Function**

```typescript
getPoolConfig(
        configAddress: PublicKey | string
    ): Promise<PoolConfig | null>
```

**Parameters**

```typescript
configAddress: PublicKey | string // The address of the config key
```

**Returns**

- A `PoolConfig` object containing the config key details.

**Example**

```typescript
const config = await client.state.getPoolConfig(configAddress)
```

---

### getPoolConfigs

Retrieves all configs.

**Function**

```typescript
getPoolConfigs(): Promise<ProgramAccount<PoolConfig>[]>
```

**Returns**

- An array of configs created by various users.
- Check return type <a href ="https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/sdk-functions#getpoolconfig">here</a>.

**Example**

```typescript
const configs = await client.state.getPoolConfigs()
```

---

### getPoolConfigsByOwner

Retrieves all configs owned by a specific wallet.

**Function**

```typescript
getPoolConfigsByOwner(
        owner: PublicKey | string
    ): Promise<ProgramAccount<PoolConfig>[]>
```

**Parameters**

```typescript
owner: PublicKey | string // The owner's wallet address
```

**Returns**

- An array of configs owned by the specified wallet.
- Check return type <a href ="https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/sdk-functions#getpoolconfig">here</a>.

**Example**

```typescript
const configs = await client.state.getPoolConfigsByOwner(wallet.publicKey)
```

---

### getPool

Gets the details of a specific pool.

**Function**

```typescript
getPool(
        poolAddress: PublicKey | string
    ): Promise<VirtualPool | null>
```

**Parameters**

```typescript
poolAddress: PublicKey | string // The address of the pool
```

**Returns**

- A `VirtualPool` object containing the pool's details, or null if not found.

```typescript
type VolatilityTracker = {
    lastUpdateTimestamp: BN
    padding: number[]
    sqrtPriceReference: BN
    volatilityAccumulator: BN
    volatilityReference: BN
}

type Metrics = {
    totalProtocolBaseFee: BN
    totalProtocolQuoteFee: BN
    totalTradingBaseFee: BN
    totalTradingQuoteFee: BN
}

type VirtualPool = {
    volatilityTracker: VolatilityTracker
    config: PublicKey
    creator: PublicKey
    baseMint: PublicKey
    baseVault: PublicKey
    quoteVault: PublicKey
    baseReserve: BN
    quoteReserve: BN
    protocolBaseFee: BN
    protocolQuoteFee: BN
    partnerBaseFee: BN
    partnerQuoteFee: BN
    sqrtPrice: BN
    activationPoint: BN
    poolType: number
    isMigrated: number
    isPartnerWithdrawSurplus: number
    isProtocolWithdrawSurplus: number
    migrationProgress: number
    isWithdrawLeftover: number
    isCreatorWithdrawSurplus: number
    migrationFeeWithdrawStatus: number
    metrics: Metrics
    finishCurveTimestamp: BN
    creatorBaseFee: BN
    creatorQuoteFee: BN
    padding1: BN[]
}
```

**Example**

```typescript
const pool = await client.state.getPool(poolAddress)
```

---

### getPools

Retrieves all pools.

**Function**

```typescript
getPools(): Promise<ProgramAccount<VirtualPool>[]>
```

**Returns**

- An array of all virtual pools created through DBC.
- Check return type of VirtualPool <a href="https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/sdk-functions#getpool">here</a>.

**Example**

```typescript
const pools = await client.state.getPools()
```

---

### getPoolsByConfig

Retrieves all pools by config key address.

**Function**

```typescript
getPoolsByConfig(
        configAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]>
```

**Parameters**

```typescript
configAddress: PublicKey | string // The address of the config key
```

**Returns**

- It give all `virtual pools` created with a specific config key.
- Check return type of VirtualPool <a href="https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/sdk-functions#getpool">here</a>.

**Example**

```typescript
const pools = await client.state.getPoolsByConfig(configAddress)
```

---

### getPoolsByCreator

Retrieves all pools by creator address.

**Function**

```typescript
getPoolsByCreator(
        creatorAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]>
```

**Parameters**

```typescript
creatorAddress: PublicKey | string // The address of the creator
```

**Returns**

- It give all `virtual pools` created with a specific wallet address.
- Check return type of VirtualPool <a href="https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/sdk-functions#getpool">here</a>.

**Example**

```typescript
const pools = await client.state.getPoolsByCreator(creatorAddress)
```

---

### getPoolByBaseMint

Gets the pool by base mint.

**Function**

```typescript
getPoolByBaseMint(
        baseMint: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool> | null>
```

**Parameters**

```typescript
baseMint: PublicKey | string // The address of the base mint
```

**Returns**

- A `VirtualPool` object containing the pool's details, or null if not found.
- Check return type of VirtualPool <a href="https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/sdk-functions#getpool">here</a>.

**Example**

```typescript
const pool = await client.state.getPoolByBaseMint(baseMint)
```

---

### getPoolMigrationQuoteThreshold

Gets the migration quote threshold for a specific pool.

**Function**

```typescript
getPoolMigrationQuoteThreshold(
        poolAddress: PublicKey | string
    ): Promise<BN>
```

**Parameters**

```typescript
poolAddress: PublicKey | string // The address of the pool
```

**Returns**

- A `BN` object representing the migration quote threshold.

**Example**

```typescript
const threshold = await client.state.getPoolMigrationQuoteThreshold(poolAddress)
```

---

### getPoolQuoteTokenCurveProgress

Gets the progress of the curve by comparing current quote reserve to migration threshold.

**Function**

```typescript
getPoolQuoteTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number>
```

**Parameters**

```typescript
poolAddress: PublicKey | string // The address of the pool
```

**Returns**

- A number between 0 and 1 representing the curve progress.

**Example**

```typescript
const progress = await client.state.getPoolQuoteTokenCurveProgress(poolAddress)
```

---

### getPoolBaseTokenCurveProgress

Gets the progress of the curve based on base tokens sold relative to total base tokens available for trading.

**Function**

```typescript
getPoolBaseTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number>
```

**Parameters**

```typescript
poolAddress: PublicKey | string // The address of the pool
```

**Returns**

- A number between 0 and 1 representing the curve progress.

**Example**

```typescript
const progress = await client.state.getPoolBaseTokenCurveProgress(poolAddress)
```

---

### getPoolMetadata

- Gets the metadata for a specific pool.
- Can only be used if metadata is set using <a href ="https://docs.meteora.ag/developer-guide/guides/dbc/typescript-sdk/sdk-functions#createpoolmetadata">createPoolMetadata</a> function.

**Function**

```typescript
getPoolMetadata(
        poolAddress: PublicKey | string
    ): Promise<VirtualPoolMetadata | null>
```

**Parameters**

```typescript
poolAddress: PublicKey | string // The address of the pool
```

**Returns**

- The pool's `VirtualPoolMetadata`, or `null` when none was created.

```typescript
type VirtualPoolMetadata = {
    virtualPool: PublicKey
    padding: BN[]
    name: string
    website: string
    logo: string
}
```

**Example**

```typescript
const metadata = await client.state.getPoolMetadata(poolAddress)
```

---

### getPartnerMetadata

Gets the metadata for a specific partner.

**Function**

```typescript
getPartnerMetadata(
        partnerAddress: PublicKey | string
    ): Promise<PartnerMetadata | null>
```

**Parameters**

```typescript
partnerAddress: PublicKey | string // The partner's fee claimer address
```

**Returns**

- The partner's `PartnerMetadata`, or `null` when none was created.

```typescript
type partnerMetadata = {
    feeClaimer: PublicKey
    padding: BN[]
    name: string
    website: string
    logo: string
}
```

**Example**

```typescript
const metadata = await client.state.getPartnerMetadata(wallet.publicKey)
```

---

### getDammV1MigrationMetadata

Gets the DAMM V1 migration metadata for a specific pool.

**Function**

```typescript
getDammV1MigrationMetadata(
        poolAddress: PublicKey
    ): Promise<MeteoraDammMigrationMetadata | null>
```

**Parameters**

```typescript
poolAddress: PublicKey // The address of the DBC pool
```

**Returns**

A `MeteoraDammMigrationMetadata` object containing the DAMM V1 migration metadata, or `null` when the pool has none.

```typescript
type meteoraDammMigrationMetadata = {
    virtualPool: PublicKey
    padding0: number | number[]
    partner: PublicKey
    lpMint: PublicKey
    partnerLockedLiquidity: BN
    partnerLiquidity: BN
    creatorLockedLiquidity: BN
    creatorLiquidity: BN
    creatorLockedStatus: number
    partnerLockedStatus: number
    creatorClaimStatus: number
    partnerClaimStatus: number
    padding: number[]
}
```

**Example**

```typescript
const metadata = await client.state.getDammV1MigrationMetadata(poolAddress)
```

---

### getTokenBadge

Fetches the DBC token badge for a mint, if one exists.

**Function**

```typescript
getTokenBadge(
        tokenMint: PublicKey | string
    ): Promise<TokenBadge | null>
```

**Parameters**

```typescript
tokenMint: PublicKey | string // The quote mint whose badge should be fetched
```

**Returns**

- The `TokenBadge` account, or `null` if no badge exists for that mint.

```typescript
type TokenBadge = {
    tokenMint: PublicKey
    padding: number[]
}
```

**Example**

```typescript
const tokenBadge = await client.state.getTokenBadge(quoteMint)
```

---

### isTransferHookConfig

Checks whether a config account is a transfer-hook config.

**Function**

```typescript
isTransferHookConfig(
        configAddress: PublicKey | string
    ): Promise<boolean>
```

**Parameters**

```typescript
configAddress: PublicKey | string // The address of the config account
```

**Returns**

- `true` if the account is a `ConfigWithTransferHook`, `false` otherwise or if the account does not exist.

**Example**

```typescript
const isTransferHookConfig =
    await client.state.isTransferHookConfig(configAddress)
```

---

### isTransferHookPool

Checks whether a pool account is a transfer-hook pool.

**Function**

```typescript
isTransferHookPool(
        poolAddress: PublicKey | string
    ): Promise<boolean>
```

**Parameters**

```typescript
poolAddress: PublicKey | string // The address of the pool account
```

**Returns**

- `true` if the account is a `TransferHookPool`, `false` otherwise or if the account does not exist.

**Example**

```typescript
const isTransferHookPool = await client.state.isTransferHookPool(poolAddress)
```

---

### getConfigWithTransferHook

Fetches a transfer-hook config account, including its transfer hook program.

**Function**

```typescript
getConfigWithTransferHook(
        configAddress: PublicKey | string
    ): Promise<ConfigWithTransferHook | null>
```

**Parameters**

```typescript
configAddress: PublicKey | string // The address of the transfer-hook config account
```

**Returns**

- The `ConfigWithTransferHook` account (`config` and `transferHookProgram`), or `null` if it does not exist.

**Example**

```typescript
const configWithTransferHook =
    await client.state.getConfigWithTransferHook(configAddress)
```

---

### getPoolFeeMetrics

Gets the fee metrics for a specific pool.

**Function**

```typescript
getPoolFeeMetrics(poolAddress: PublicKey | string): Promise<{
        current: {
            partnerBaseFee: BN
            partnerQuoteFee: BN
            creatorBaseFee: BN
            creatorQuoteFee: BN
        }
        total: {
            totalTradingBaseFee: BN
            totalTradingQuoteFee: BN
        }
    }>
```

**Parameters**

```typescript
poolAddress: PublicKey // The address of the pool
```

**Returns**

- An object containing current and total fee metrics for the pool.

```typescript
{
    current: {
        partnerBaseFee: BN
        partnerQuoteFee: BN
        creatorBaseFee: BN
        creatorQuoteFee: BN
    }
    total: {
        totalTradingBaseFee: BN
        totalTradingQuoteFee: BN
    }
}
```

**Example**

```typescript
const metrics = await client.state.getPoolFeeMetrics(poolAddress)
```

---

### getPoolFeeBreakdown

Gets the fee breakdown for a specific pool.

**Function**

```typescript
getPoolFeeBreakdown(poolAddress: PublicKey | string): Promise<{
        creator: {
            unclaimedBaseFee: BN
            unclaimedQuoteFee: BN
            claimedBaseFee: BN
            claimedQuoteFee: BN
            totalBaseFee: BN
            totalQuoteFee: BN
        }
        partner: {
            unclaimedBaseFee: BN
            unclaimedQuoteFee: BN
            claimedBaseFee: BN
            claimedQuoteFee: BN
            totalBaseFee: BN
            totalQuoteFee: BN
        }
    }>
```

**Parameters**

```typescript
poolAddress: PublicKey // The address of the pool
```

**Returns**

- An object containing current and total fee breakdown for the pool.

```typescript
{
    creator: {
        unclaimedBaseFee: BN
        unclaimedQuoteFee: BN
        claimedBaseFee: BN
        claimedQuoteFee: BN
        totalBaseFee: BN
        totalQuoteFee: BN
    }
    partner: {
        unclaimedBaseFee: BN
        unclaimedQuoteFee: BN
        claimedBaseFee: BN
        claimedQuoteFee: BN
        totalBaseFee: BN
        totalQuoteFee: BN
    }
}
```

**Example**

```typescript
const breakdown = await client.state.getPoolFeeBreakdown(poolAddress)
```

---

### getPoolsFeesByConfig

Gets all fees for pools linked to a specific config key.

**Function**

```typescript
getPoolsFeesByConfig(
        configAddress: PublicKey | string
    ): Promise<PoolFeeSummary[]>
```

**Parameters**

```typescript
configAddress: PublicKey // The address of the pool config
```

**Returns**

- An array of objects containing quote fee metrics for each pool.

```typescript
type FeeMetrics = {
    poolAddress: PublicKey
    partnerBaseFee: BN
    partnerQuoteFee: BN
    creatorBaseFee: BN
    creatorQuoteFee: BN
    totalTradingBaseFee: BN
    totalTradingQuoteFee: BN
}
```

**Example**

```typescript
const fees = await client.state.getPoolsFeesByConfig(configAddress)
```

---

### getPoolsFeesByCreator

Gets all fees for pools linked to a specific creator.

**Function**

```typescript
getPoolsFeesByCreator(
        creatorAddress: PublicKey | string
    ): Promise<PoolFeeSummary[]>
```

**Parameters**

```typescript
creatorAddress: PublicKey // The address of the creator
```

**Returns**

- An array of objects containing quote fee metrics for each pool.

```typescript
type FeeMetrics = {
    poolAddress: PublicKey
    partnerBaseFee: BN
    partnerQuoteFee: BN
    creatorBaseFee: BN
    creatorQuoteFee: BN
    totalTradingBaseFee: BN
    totalTradingQuoteFee: BN
}
```

**Example**

```typescript
const fees = await client.state.getPoolsFeesByCreator(creatorAddress)
```

---

### getPoolConfigWithKind

Fetch a config and say which account variant holds it.

**Function**

```typescript
getPoolConfigWithKind(configAddress: PublicKey | string): Promise<{
        poolConfig: PoolConfig
        transferHookConfig: ConfigWithTransferHook | null
    } | null>
```

---

### getPoolWithKind

Fetch a pool and say whether it is the transfer-hook variant.

**Function**

```typescript
getPoolWithKind(poolAddress: PublicKey | string): Promise<{
        virtualPool: VirtualPool
        isTransferHookPool: boolean
    } | null>
```

---

### getPoolSurplus

The surplus split the program pays on partnerWithdrawSurplus and creatorWithdrawSurplus, and whether each side has already withdrawn.

**Function**

```typescript
getPoolSurplus(poolAddress: PublicKey | string): Promise<{
        total: BN
        partner: BN
        creator: BN
        protocol: BN
        partnerWithdrawn: boolean
        creatorWithdrawn: boolean
    }>
```

---

## Helper Functions

### deriveDbcPoolAddress

Derives the address of a Dynamic Bonding Curve pool.

**Function**

```typescript
function deriveDbcPoolAddress(
    quoteMint: PublicKey,
    baseMint: PublicKey,
    config: PublicKey
): PublicKey
```

**Parameters**

```typescript
quoteMint: PublicKey // The quote mint
baseMint: PublicKey // The base mint
config: PublicKey // The config
```

**Returns**

- The address of the Dynamic Bonding Curve pool.

**Example**

```typescript
const dbcPoolAddress = deriveDbcPoolAddress(
    new PublicKey('abcdefghijklmnopqrstuvwxyz1234567890'),
    new PublicKey('1234567890abcdefghijklmnopqrstuvwxyz'),
    new PublicKey('config1234567890abcdefghijklmnopqrstuvwxyz')
)
```

---

### deriveDammV1PoolAddress

Derives the address of a DAMM V1 pool.

**Function**

```typescript
function deriveDammV1PoolAddress(
    config: PublicKey,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey
): PublicKey
```

**Parameters**

```typescript
dammConfig: PublicKey // The DAMM V1 graduation config key (retrievable from the README.md)
tokenAMint: PublicKey // The A token mint
tokenBMint: PublicKey // The B token mint
```

**Returns**

- The address of the DAMM V1 pool.

**Example**

```typescript
const poolConfig = await client.state.getPoolConfig(configAddress)

const dammV1PoolAddress = deriveDammV1PoolAddress(
    DAMM_V1_MIGRATION_FEE_ADDRESS[poolConfig.migrationFeeOption],
    new PublicKey('tokenA1234567890abcdefghijklmnopqrstuvwxyz'),
    new PublicKey('tokenB1234567890abcdefghijklmnopqrstuvwxyz')
)
```

---

### deriveDammV2PoolAddress

Derives the address of a DAMM V2 pool.

**Function**

```typescript
function deriveDammV2PoolAddress(
    config: PublicKey,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey
): PublicKey
```

**Parameters**

```typescript
dammConfig: PublicKey // The DAMM V2 graduation config key (retrievable from the README.md)
tokenAMint: PublicKey // The A token mint
tokenBMint: PublicKey // The B token mint
```

**Returns**

- The address of the DAMM V2 pool.

**Example**

```typescript
const poolConfig = await client.state.getPoolConfig(configAddress)

const dammV2PoolAddress = deriveDammV2PoolAddress(
    DAMM_V2_MIGRATION_FEE_ADDRESS[poolConfig.migrationFeeOption],
    new PublicKey('tokenA1234567890abcdefghijklmnopqrstuvwxyz'),
    new PublicKey('tokenB1234567890abcdefghijklmnopqrstuvwxyz')
)
```

---

### deriveDbcTokenVaultAddress

Derives the address of a DBC token vault.

**Function**

```typescript
function deriveDbcTokenVaultAddress(pool: PublicKey, mint: PublicKey): PublicKey
```

**Parameters**

```typescript
pool: PublicKey // The pool address
mint: PublicKey // The mint address
```

**Returns**

- The address of the DBC token vault.

**Example**

```typescript
const dbcTokenVaultAddress = deriveDbcTokenVaultAddress(
    new PublicKey('pool1234567890abcdefghijklmnopqrstuvwxyz'),
    new PublicKey('token1234567890abcdefghijklmnopqrstuvwxyz')
)
```

---

### deriveTokenBadgeAddress

Derives the DBC token badge PDA for a mint. Pass this as `tokenBadge` when creating a config or pool whose quote mint is not permissionless-supported.

**Function**

```typescript
function deriveTokenBadgeAddress(tokenMint: PublicKey): PublicKey
```

**Parameters**

```typescript
tokenMint: PublicKey // The token mint
```

**Returns**

- The token badge address.

**Example**

```typescript
const tokenBadge = deriveTokenBadgeAddress(quoteMint)

const transaction = await client.partner.createConfig({
    // ...
    quoteMint,
    tokenBadge,
    ...curveConfig,
})
```

---

### getCurrentPoint

The current slot, or the block time of the current slot, depending on activationType.

**Function**

```typescript
function getCurrentPoint(
    connection: Connection,
    activationType: ActivationType
): Promise<BN>
```

---

### prepareSwapAmountParam

Convert a UI amount to lamports using the mint's on-chain decimals.

**Function**

```typescript
function prepareSwapAmountParam(
    amount: number,
    mintAddress: PublicKey,
    connection: Connection
): Promise<BN>
```

---

### createDbcProgram

An Anchor client for the DBC program.

**Function**

```typescript
function createDbcProgram(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<DynamicBondingCurve>
```

---

### deriveBaseKeyForLocker

The base key the program uses for a pool's locker escrow.

**Function**

```typescript
function deriveBaseKeyForLocker(virtualPool: PublicKey): PublicKey
```

---

### deriveDammV1MigrationMetadataAddress

See the source in `src/helpers/pda.ts`.

**Function**

```typescript
function deriveDammV1MigrationMetadataAddress(virtualPool: PublicKey): PublicKey
```

---

### deriveDbcEventAuthority

See the source in `src/helpers/pda.ts`.

**Function**

```typescript
function deriveDbcEventAuthority(): PublicKey
```

---

### deriveDbcPoolAuthority

See the source in `src/helpers/pda.ts`.

**Function**

```typescript
function deriveDbcPoolAuthority(): PublicKey
```

---

### deriveDbcPoolMetadata

See the source in `src/helpers/pda.ts`.

**Function**

```typescript
function deriveDbcPoolMetadata(pool: PublicKey): PublicKey
```

---

### deriveLockerEscrowAddress

The locker escrow for a base key, see deriveBaseKeyForLocker.

**Function**

```typescript
function deriveLockerEscrowAddress(base: PublicKey): PublicKey
```

---

### derivePartnerMetadata

See the source in `src/helpers/pda.ts`.

**Function**

```typescript
function derivePartnerMetadata(feeClaimer: PublicKey): PublicKey
```

---

### getTokenBadgeRemainingAccounts

Remaining accounts for the optional DBC token badge (index 0).

**Function**

```typescript
function getTokenBadgeRemainingAccounts(tokenBadge?: PublicKey): AccountMeta[]
```

---

### createSqrtPrices

Q64 sqrt prices of base token prices in quote tokens.

**Function**

```typescript
function createSqrtPrices(
    prices: number[],
    tokenBaseDecimal: TokenDecimal,
    tokenQuoteDecimal: number
): BN[]
```

---

### getBaseTokenForSwap

Base tokens sold from sqrtStartPrice to sqrtMigrationPrice, rounded up per segment like the program's get_base_token_for_swap.

**Function**

```typescript
function getBaseTokenForSwap(
    sqrtStartPrice: BN,
    sqrtMigrationPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN
```

---

### getPriceFromSqrtPrice

Price of one base token in quote tokens: (sqrtPrice / 2^64)^2 \* 10^(baseDecimal - quoteDecimal).

**Function**

```typescript
function getPriceFromSqrtPrice(
    sqrtPrice: BN,
    tokenBaseDecimal: TokenDecimal,
    tokenQuoteDecimal: number
): Decimal
```

---

### getSqrtPriceFromMarketCap

Q64 sqrt price at which totalSupply base tokens are worth marketCap quote tokens.

**Function**

```typescript
function getSqrtPriceFromMarketCap(
    marketCap: number,
    totalSupply: number,
    tokenBaseDecimal: number,
    tokenQuoteDecimal: number
): BN
```

---

### getSqrtPriceFromPrice

Q64 sqrt price of a base token price in quote tokens, rounded down.

**Function**

```typescript
function getSqrtPriceFromPrice(
    price: string,
    tokenBaseDecimal: number,
    tokenQuoteDecimal: number
): BN
```

---

### rateLimiterApplied

Whether the rate limiter applies to a swap right now, for callers who build the swap instruction themselves and have to pass the instructions sysvar.

**Function**

```typescript
function rateLimiterApplied(params: {
    connection: Connection
    baseFee: BaseFee
    activationType: ActivationType
    activationPoint: BN
    swapBaseForQuote: boolean
}): Promise<boolean>
```

---

### getSwapQuoteTransferFees

The quote mint, optional base mint and current epoch a swap quote on an existing pool needs. Empty when the quote mint is SPL Token and no baseMint is given, since neither side can then carry a transfer fee.

**Function**

```typescript
function getSwapQuoteTransferFees(
    connection: Connection,
    config: Pick<PoolConfig, 'quoteMint' | 'quoteTokenFlag'>,
    options: { commitment?: Commitment; baseMint?: PublicKey } = {}
): Promise<QuoteTransferFees>
```

---

### getTokenProgram

The token program for a DBC token type or token flag.

**Function**

```typescript
function getTokenProgram(tokenType: TokenType): PublicKey
```

---

### getTokenType

The DBC token type of an existing mint, from the program that owns it.

**Function**

```typescript
function getTokenType(
    connection: Connection,
    tokenMint: PublicKey,
    commitment: Commitment = 'confirmed'
): Promise<TokenType>
```

---

### bpsToFeeNumerator

Basis points in [0, 10_000] as a fee numerator over FEE_DENOMINATOR.

**Function**

```typescript
function bpsToFeeNumerator(bps: number): BN
```

---

### convertToLamports

A UI amount in lamports, rounded down.

**Function**

```typescript
function convertToLamports(amount: number | string, tokenDecimal: number): BN
```

---

### feeNumeratorToBps

A fee numerator over FEE_DENOMINATOR as basis points, rounded down.

**Function**

```typescript
function feeNumeratorToBps(feeNumerator: BN): number
```

---

### fromDecimalToBN

A Decimal as a BN, rounded down.

**Function**

```typescript
function fromDecimalToBN(value: Decimal): BN
```

---

## Calculation Functions

### getFeeSchedulerParams

Gets the fee scheduler parameters for a specific pool config.

**Function**

```typescript
function getFeeSchedulerParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    baseFeeMode: BaseFeeMode,
    numberOfPeriod: number,
    totalDuration: number
): BaseFee
```

**Parameters**

```typescript
startingFeeBps: number // The starting fee in basis points
endingFeeBps: number // The ending fee in basis points
feeSchedulerMode: number // 0: Linear, 1: Exponential
numberOfPeriod: number // The number of periods
totalDuration: number // The total duration of the fee scheduler
```

**Returns**

- A `BaseFee` object containing the calculated fee scheduler parameters.

```typescript
type BaseFee = {
    cliffFeeNumerator: BN
    firstFactor: number
    secondFactor: BN
    thirdFactor: BN
    baseFeeMode: BaseFeeMode
}
```

**Example**

```typescript
const baseFeeParams = getFeeSchedulerParams(5000, 100, 1, 600, 600)
```

**Notes**

- The `totalDuration` is the total duration of the fee scheduler. It must be calculated based on your `activationType`. If you use `ActivationType.Slot`, the `totalDuration` is denominated in terms of 400ms (slot). If you use `ActivationType.Timestamp`, the `totalDuration` is denominated in terms of 1000ms (timestamp).
- `startingFeeBps` must always be greater than or equal to `endingFeeBps`.
- `totalDuration` must always be greater than or equal to `numberOfPeriod`.

---

### getRateLimiterParams

Builds rate limiter parameters. Deprecated: the program rejects `BaseFeeMode.RateLimiter` for new configs.

**Function**

```typescript
function getRateLimiterParams(
    baseFeeBps: number,
    feeIncrementBps: number,
    referenceAmount: number,
    maxLimiterDuration: number,
    tokenQuoteDecimal: number,
    activationType: ActivationType
): BaseFee
```

**Parameters**

```typescript
baseFeeBps: number // The base fee in basis points
feeIncrementBps: number // The fee increment in basis points
referenceAmount: number // The reference amount (in terms of quote token)
maxLimiterDuration: number // The max rate limiter duration
tokenQuoteDecimal: number // The quote mint decimals
activationType: ActivationType // The activation type
```

**Returns**

- A `BaseFee` object containing the calculated rate limiter parameters.

```typescript
type BaseFeeParams = {
    cliffFeeNumerator: BN
    firstFactor: number
    secondFactor: BN
    thirdFactor: BN
    baseFeeMode: BaseFeeMode
}
```

**Example**

```typescript
const baseFeeParams = getRateLimiterParams(
    100,
    100,
    referenceAmount: 1, // 1 SOL
    maxLimiterDuration: 600, // 600 slots
    TokenDecimal.NINE,
    ActivationType.Slot
)
```

**Notes**

- Deprecated for new configs and new pools. Existing rate-limiter pools can still be quoted and swapped.
- The `maxLimiterDuration` is the max duration of the rate limiter. It must be calculated based on your `activationType`. If you use `ActivationType.Slot`, the `maxLimiterDuration` is denominated in terms of 400ms (slot). If you use `ActivationType.Timestamp`, the `maxLimiterDuration` is denominated in terms of 1000ms (timestamp).
- `referenceAmount` must always be greater than 0. This parameter takes into account the quoteMint decimals. For example, if you use `TokenDecimal.NINE`, the `referenceAmount` must be 1 (1 SOL).
- `maxLimiterDuration` must always be greater than 0.
- `activationType` must always be greater than 0.
- `baseFeeBps` must always be greater than 0.

---

### getDynamicFeeParams

Gets the dynamic fee parameters for a specific pool. Calculated the fee based on the minimum base fee (capped at 20% of base fee). Please note that the maxPriceChangeBps must be less than or equal to 1500 (15%).

**Function**

```typescript
function getDynamicFeeParams(
    baseFeeBps: number,
    maxPriceChangeBps: number = MAX_PRICE_CHANGE_BPS_DEFAULT
): DynamicFeeParameters
```

**Parameters**

```typescript
baseFeeBps: number // The base fee in basis points
maxPriceChangeBps: number // The maximum price change in basis points
```

**Returns**

- A `DynamicFeeParams` object containing the calculated dynamic fee parameters.

```typescript
type dynamicFeeParameters = {
    binStep: number
    binStepU128: BN
    filterPeriod: number
    decayPeriod: number
    reductionFactor: number
    maxVolatilityAccumulator: number
    variableFeeControl: number
}
```

**Example**

```typescript
const dynamicFeeParams = getDynamicFeeParams(5000, 1500)
```

---

### getLockedVestingParams

Gets the locked vesting parameters for a specific pool.

**Function**

```typescript
function getLockedVestingParams(
    totalLockedVestingAmount: number,
    numberOfVestingPeriod: number,
    cliffUnlockAmount: number,
    totalVestingDuration: number,
    cliffDurationFromMigrationTime: number,
    tokenBaseDecimal: TokenDecimal
): LockedVestingParameters
```

**Parameters**

```typescript
totalLockedVestingAmount: number // The total locked vesting amount
numberOfVestingPeriod: number // The number of vesting periods
cliffUnlockAmount: number // The amount of tokens that will be unlocked when vesting starts
totalVestingDuration: number // The total vesting duration in seconds
cliffDurationFromMigrationTime: number // The duration of the waiting time before the vesting starts
tokenBaseDecimal: TokenDecimal // The number of decimals for the base token
```

**Returns**

- A `LockedVestingParams` object containing the calculated locked vesting parameters.

```typescript
type LockedVestingParams = {
    amountPerPeriod: BN
    cliffDurationFromMigrationTime: BN
    frequency: BN
    numberOfPeriod: BN
    cliffUnlockAmount: BN
}
```

**Example**

```typescript
const lockedVestingParams = getLockedVestingParams(
    100000000,
    600,
    1000,
    600,
    600,
    6
)
```

**Notes**

- The `totalVestingDuration` is the total duration of the vesting. It must be calculated in terms of seconds => 1000ms (timestamp).

---

### getQuoteReserveFromNextSqrtPrice

Gets the quote reserve from the next sqrt price instead of getting from the pool state.

**Function**

```typescript
function getQuoteReserveFromNextSqrtPrice(
    nextSqrtPrice: BN,
    config: Pick<PoolConfig, 'curve' | 'sqrtStartPrice'>
): BN
```

**Parameters**

```typescript
nextSqrtPrice: BN // The next sqrt price that you can fetch from swap cpi logs
config: PoolConfig // The pool config
```

**Returns**

- A `BN` object containing the calculated quote reserve.

**Example**

```typescript
const poolConfig = await client.state.getPoolConfig(configAddress)

const quoteReserve = getQuoteReserveFromNextSqrtPrice(
    new BN('13663931917038696'),
    poolConfig
)
```

**Notes**

- The `nextSqrtPrice` is the next sqrt price that you can fetch from swap cpi logs.
- The `config` is the pool config that the token pool used to launch.

### calculateFeeSchedulerEndingBaseFeeBps

Ending fee in basis points, using the program's floor(numerator \* 10_000 / FEE_DENOMINATOR).

**Function**

```typescript
function calculateFeeSchedulerEndingBaseFeeBps(
    cliffFeeNumerator: number,
    numberOfPeriod: number,
    periodFrequency: number,
    reductionFactor: number,
    baseFeeMode: BaseFeeMode
): number
```

---

### getBaseFeeParams

Fee scheduler parameters for a new config; RateLimiter is rejected.

**Function**

```typescript
function getBaseFeeParams(baseFeeParams: BaseFeeParams): BaseFee
```

---

### getMigratedPoolFeeParams

Migrated pool fee parameters for a DAMM v2 migration. A fixed MigrationFeeOption uses a preset DAMM v2 config, so the program requires every migrated pool fee field to be zero; Customizable takes migratedPoolFee.

**Function**

```typescript
function getMigratedPoolFeeParams(
    migrationOption: MigrationOption,
    migrationFeeOption: MigrationFeeOption,
    migratedPoolFee?: MigratedPoolFeeConfig
): MigratedPoolFeeResult
```

---

### getMigratedPoolMarketCapFeeSchedulerParams

Build the DAMM v2 market cap fee scheduler for a migrated pool: the fee decays from startingBaseFeeBps to endingBaseFeeBps over numberOfPeriod price steps spanning priceMultiple times the migration price, and expires to the ending fee after schedulerExpirationDuration seconds.

**Function**

```typescript
function getMigratedPoolMarketCapFeeSchedulerParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    dammV2BaseFeeMode: DammV2BaseFeeMode,
    numberOfPeriod: number,
    priceMultiple: number,
    schedulerExpirationDuration: number
): MigratedPoolMarketCapFeeSchedulerParameters
```

---

### getStartingBaseFeeBpsFromBaseFeeParams

The fee the pre-migration pool ends on, which the migrated pool starts from.

**Function**

```typescript
function getStartingBaseFeeBpsFromBaseFeeParams(
    baseFeeParams: BaseFeeParams
): number
```

---

### getCurveBreakdown

Split a migration quote threshold across the curve segments. A segment holds L \* (√P_upper - √P_lower) quote, rounded up like the program. Segments past the threshold get zero, and finalSqrtPrice is where the threshold is reached.

**Function**

```typescript
function getCurveBreakdown(
    migrationQuoteThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): {
    segmentAmounts: BN[]
    finalSqrtPrice: BN
    totalAmount: BN
}
```

---

### getMigrationBaseToken

Get the base token for migration

**Function**

```typescript
function getMigrationBaseToken(
    migrationQuoteAmount: BN,
    sqrtMigrationPrice: BN,
    migrationOption: MigrationOption,
    migratedCollectFeeMode: MigratedCollectFeeMode = MigratedCollectFeeMode.QuoteToken
): BN
```

---

### getMigrationQuoteAmountFromThreshold

Get the quote amount a migration threshold deposits into the migrated pool

**Function**

```typescript
function getMigrationQuoteAmountFromThreshold(
    migrationQuoteThreshold: BN,
    migrationFeePercentage: number
): BN
```

---

### getMigrationThresholdPrice

The sqrt price at which the curve has taken migrationThreshold quote, the program's get_migration_threshold_price (Rounding::Up per segment).

**Function**

```typescript
function getMigrationThresholdPrice(
    migrationThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN
```

---

### getPercentageSupplyOnMigration

Percentage of the supply on migration for a market cap pair without a migration fee.

**Function**

```typescript
function getPercentageSupplyOnMigration(
    initialMarketCap: Decimal,
    migrationMarketCap: Decimal,
    lockedVesting: LockedVestingParameters,
    totalLeftover: BN,
    totalTokenSupply: BN
): number
```

---

### getTransferFeeMigrationPositionSplit

Liquidity moved into the second DAMM v2 position on a transfer-fee migration. The percentage is the configured share, not the sum of the rounded liquidity buckets.

**Function**

```typescript
function getTransferFeeMigrationPositionSplit(params: {
    distributableLiquidity: BN
    partnerLiquidityPercentage: number
    partnerPermanentLockedLiquidityPercentage: number
    partnerVestingPercentage: number
}): TransferFeeMigrationPositionSplit
```

---

### getProtocolMigrationFee

Calculates the protocol migration fee for both base and quote tokens.

**Function**

```typescript
function getProtocolMigrationFee(
    depositBaseAmount: BN,
    depositQuoteAmount: BN,
    migrationSqrtPrice: BN,
    migrationFeeBps: number,
    migrationOption: MigrationOption,
    migratedCollectFeeMode: MigratedCollectFeeMode = MigratedCollectFeeMode.QuoteToken
): [BN, BN]
```

---

### getSwapAmountWithBuffer

Get the swap amount with buffer

**Function**

```typescript
function getSwapAmountWithBuffer(
    swapBaseAmount: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN
```

---

### getTokenomics

Supply split for a market cap pair: bonding curve, migration, leftover and locked vesting.

**Function**

```typescript
function getTokenomics(
    initialMarketCap: Decimal,
    migrationMarketCap: Decimal,
    totalLockedVestingAmount: BN,
    totalLeftover: BN,
    totalTokenSupply: BN
): {
    bondingCurveSupply: BN
    migrationSupply: BN
    leftoverSupply: BN
    lockedVestingSupply: BN
}
```

---

### getTotalSupplyFromCurve

Get the total supply from curve

**Function**

```typescript
function getTotalSupplyFromCurve(
    migrationQuoteThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>,
    lockedVesting: LockedVestingParameters,
    migrationOption: MigrationOption,
    leftover: BN,
    migrationFeePercent: number,
    migratedCollectFeeMode: MigratedCollectFeeMode = MigratedCollectFeeMode.QuoteToken
): BN
```

---

### calculateLockedLiquidityBpsAtTime

Calculate the locked liquidity BPS at a given time (in seconds) after migration

**Function**

```typescript
function calculateLockedLiquidityBpsAtTime(
    partnerPermanentLockedLiquidityPercentage: number,
    creatorPermanentLockedLiquidityPercentage: number,
    partnerLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined,
    creatorLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined,
    elapsedSeconds: number
): number
```

---

### getLiquidityVestingInfoParams

See the source in `src/helpers/vesting.ts`.

**Function**

```typescript
function getLiquidityVestingInfoParams(
    vestingPercentage: number,
    bpsPerPeriod: number,
    numberOfPeriods: number,
    cliffDurationFromMigrationTime: number,
    totalDuration: number
): LiquidityVestingInfoParameters
```

---

### getTotalVestingAmount

Get the total vesting amount

**Function**

```typescript
function getTotalVestingAmount(lockedVesting: LockedVestingParameters): BN
```

---

### getVestingLockedLiquidityBpsAtNSeconds

Calculate the locked liquidity BPS for a single vesting info at a given time.

**Function**

```typescript
function getVestingLockedLiquidityBpsAtNSeconds(
    vestingInfo: LiquidityVestingInfoParameters | undefined,
    nSeconds: number
): number
```

---

### getSurplusBreakdown

The surplus the program pays out once the curve is complete: the quote reserve above the migration threshold. Partner and creator share PARTNER_AND_CREATOR_SURPLUS_SHARE percent of it, split by the creator trading fee percentage with the creator rounded down, and the protocol keeps the rest. Every amount is zero before the curve completes.

**Function**

```typescript
function getSurplusBreakdown(
    quoteReserve: BN,
    migrationQuoteThreshold: BN,
    creatorTradingFeePercentage: number
): { total: BN; partner: BN; creator: BN; protocol: BN }
```

---

## Quote Functions

### calculateTransferFeeExcludedAmount

The amount received after the transfer fee and the fee; spl-token-2022's calculate_fee.

**Function**

```typescript
function calculateTransferFeeExcludedAmount(
    transferFee: EpochTransferFee | null,
    includedAmount: BN
): TransferFeeAmount
```

---

### calculateTransferFeeIncludedAmount

The amount to send so that excludedAmount arrives after the transfer fee, and the fee; the program's calculate_transfer_fee_included_amount.

**Function**

```typescript
function calculateTransferFeeIncludedAmount(
    transferFee: EpochTransferFee | null,
    excludedAmount: BN
): TransferFeeAmount
```

---

### isZeroTransferFee

Token-2022 charges min(amount \* bps / 10_000, maximumFee), so either being zero means no fee.

**Function**

```typescript
function isZeroTransferFee(
    transferFee: {
        transferFeeBasisPoints: number
        maximumFee: BN | bigint
    } | null
): boolean
```

---

### resolveSwapTransferFees

The transfer fees on the input and output side of a swap. The base fee comes from baseMint, then baseTransferFeeBasisPoints, then the config; the quote fee has to come from the quote mint account.

**Function**

```typescript
function resolveSwapTransferFees(
    config: Pick<
        QuotePoolConfig,
        | 'quoteTokenFlag'
        | 'quoteMint'
        | 'transferFeeFlag'
        | 'transferFeeBasisPoints'
    >,
    swapBaseForQuote: boolean,
    transferFees?: QuoteTransferFees
): { input: EpochTransferFee | null; output: EpochTransferFee | null }
```

---

## Validation Functions

### validateCompoundingFeeBps

See the source in `src/helpers/validation.ts`.

**Function**

```typescript
function validateCompoundingFeeBps(
    collectFeeMode: number,
    compoundingFeeBps: number
): boolean
```

---

### validateConfigParameters

Validate config parameters and throw the first actionable error encountered.

**Function**

```typescript
function validateConfigParameters(
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
): void
```

---

### validateMigratedPoolFee

See the source in `src/helpers/validation.ts`.

**Function**

```typescript
function validateMigratedPoolFee(
    migratedPoolFee: MigratedPoolFee,
    migrationOption?: MigrationOption,
    migrationFeeOption?: MigrationFeeOption,
    migratedPoolMarketCapFeeSchedulerParams?: MigratedPoolMarketCapFeeSchedulerParameters,
    compoundingFeeBps?: number,
    migratedPoolBaseFeeMode: DammV2BaseFeeMode = DammV2BaseFeeMode.FeeTimeSchedulerLinear
): boolean
```

---

### validateTransferFeeParameters

Check createConfig2 transfer fee parameters the way the program does. feeClaimer, when given, must not be the default pubkey for a partner authority.

**Function**

```typescript
function validateTransferFeeParameters(
    transferFeeParameters: TransferFeeParameters,
    tokenType: number,
    feeClaimer?: PublicKey
): void
```

---

## Math Functions

Ports of the program's curve, fee and swap math (dynamic-bonding-curve 0.2.2), published as `@meteora-ag/dynamic-bonding-curve-sdk/math`:

```typescript
import {
    getFeeMode,
    getSwapResult,
} from '@meteora-ag/dynamic-bonding-curve-sdk/math'
```

### calculateBaseToQuoteFromAmountIn

Quote received for amountIn base, walking the curve down from currentSqrtPrice.

**Function**

```typescript
function calculateBaseToQuoteFromAmountIn(
    configState: Curve,
    currentSqrtPrice: BN,
    amountIn: BN
): SwapAmount
```

---

### calculateBaseToQuoteFromAmountOut

Base needed for outAmount quote, walking the curve down from currentSqrtPrice.

**Function**

```typescript
function calculateBaseToQuoteFromAmountOut(
    configState: Curve,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmountFromOutput
```

---

### calculateQuoteToBaseFromAmountIn

Base received for amountIn quote, walking the curve up to stopSqrtPrice.

**Function**

```typescript
function calculateQuoteToBaseFromAmountIn(
    configState: Pick<QuotePoolConfig, 'curve'>,
    currentSqrtPrice: BN,
    amountIn: BN,
    stopSqrtPrice: BN
): SwapAmount
```

---

### calculateQuoteToBaseFromAmountOut

Quote needed for outAmount base, walking the curve up from currentSqrtPrice.

**Function**

```typescript
function calculateQuoteToBaseFromAmountOut(
    configState: Pick<QuotePoolConfig, 'curve'>,
    currentSqrtPrice: BN,
    outAmount: BN
): SwapAmountFromOutput
```

---

### getSwapResult

The legacy swap result shape, derived like the program's SwapResult2::get_swap_result.

**Function**

```typescript
function getSwapResult(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult
```

---

### getSwapResultFromExactInput

The program's get_swap_result_from_exact_input.

**Function**

```typescript
function getSwapResultFromExactInput(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2
```

---

### getSwapResultFromExactOutput

The program's get_swap_result_from_exact_output.

**Function**

```typescript
function getSwapResultFromExactOutput(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountOut: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2
```

---

### getSwapResultFromPartialInput

The program's get_swap_result_from_partial_input.

**Function**

```typescript
function getSwapResultFromPartialInput(
    virtualPool: QuoteVirtualPool,
    config: QuotePoolConfig,
    amountIn: BN,
    feeMode: FeeMode,
    tradeDirection: TradeDirection,
    currentPoint: BN,
    eligibleForFirstSwapWithMinFee: boolean
): SwapResult2
```

---

### getInitialLiquidityFromDeltaQuote

L = Δb / (√P_upper - √P_lower), rounded down, bounded by u128.

**Function**

```typescript
function getInitialLiquidityFromDeltaQuote(
    quoteAmount: BN,
    sqrtMinPrice: BN,
    sqrtPrice: BN
): BN
```

---

### getInitialLiquidityFromDeltaBase

L = Δa _ √P_lower _ √P_upper / (√P_upper - √P_lower), rounded down.

**Function**

```typescript
function getInitialLiquidityFromDeltaBase(
    baseAmount: BN,
    sqrtMaxPrice: BN,
    sqrtPrice: BN
): BN
```

---

### getDeltaAmountBaseUnsigned

Δa = L _ (√P_upper - √P_lower) / (√P_upper _ √P_lower), bounded by u64.

**Function**

```typescript
function getDeltaAmountBaseUnsigned(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN
```

---

### getDeltaAmountBaseUnsigned256

Δa = L _ (√P_upper - √P_lower) / (√P_upper _ √P_lower), unbounded.

**Function**

```typescript
function getDeltaAmountBaseUnsigned256(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN
```

---

### getDeltaAmountQuoteUnsigned

Δb = L \* (√P_upper - √P_lower), bounded by u64.

**Function**

```typescript
function getDeltaAmountQuoteUnsigned(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN
```

---

### getDeltaAmountQuoteUnsigned256

Δb = L \* (√P_upper - √P_lower), unbounded.

**Function**

```typescript
function getDeltaAmountQuoteUnsigned256(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN
```

---

### getNextSqrtPriceFromInput

Next sqrt price after amountIn of base (baseForQuote) or quote enters the segment.

**Function**

```typescript
function getNextSqrtPriceFromInput(
    sqrtPrice: BN,
    liquidity: BN,
    amountIn: BN,
    baseForQuote: boolean
): BN
```

---

### getNextSqrtPriceFromOutput

Next sqrt price after amountOut of quote (baseForQuote) or base leaves the segment.

**Function**

```typescript
function getNextSqrtPriceFromOutput(
    sqrtPrice: BN,
    liquidity: BN,
    amountOut: BN,
    baseForQuote: boolean
): BN
```

---

### getNextSqrtPriceFromQuoteAmountOutRoundingDown

√P' = √P - ceil(Δy / L)

**Function**

```typescript
function getNextSqrtPriceFromQuoteAmountOutRoundingDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN
```

---

### getNextSqrtPriceFromBaseAmountOutRoundingUp

√P' = √P _ L / (L - Δx _ √P), rounded up

**Function**

```typescript
function getNextSqrtPriceFromBaseAmountOutRoundingUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN
```

---

### getNextSqrtPriceFromBaseAmountInRoundingUp

√P' = √P _ L / (L + Δx _ √P), rounded up so an exact output is met and an exact input does not move the price further than necessary.

**Function**

```typescript
function getNextSqrtPriceFromBaseAmountInRoundingUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN
```

---

### getNextSqrtPriceFromQuoteAmountInRoundingDown

√P' = √P + Δy / L, rounded down so an exact output is met and an exact input does not move the price further than necessary.

**Function**

```typescript
function getNextSqrtPriceFromQuoteAmountInRoundingDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN
```

---

### getFeeMode

Which side of a swap the fee is taken from; the program's FeeMode::get_fee_mode.

**Function**

```typescript
function getFeeMode(
    collectFeeMode: CollectFeeMode,
    tradeDirection: TradeDirection,
    hasReferral: boolean
): FeeMode
```

---

### getTotalFeeNumeratorFromIncludedFeeAmount

Base plus dynamic fee numerator for an amount that includes the fee.

**Function**

```typescript
function getTotalFeeNumeratorFromIncludedFeeAmount(
    poolFees: QuotePoolFees,
    volatilityTracker: QuoteVolatilityTracker,
    currentPoint: BN,
    activationPoint: BN,
    includedFeeAmount: BN,
    tradeDirection: TradeDirection
): BN
```

---

### getTotalFeeNumeratorFromExcludedFeeAmount

Base plus dynamic fee numerator for an amount that excludes the fee.

**Function**

```typescript
function getTotalFeeNumeratorFromExcludedFeeAmount(
    poolFees: QuotePoolFees,
    volatilityTracker: QuoteVolatilityTracker,
    currentPoint: BN,
    activationPoint: BN,
    excludedFeeAmount: BN,
    tradeDirection: TradeDirection
): BN
```

---

### getTotalFeeNumerator

Base plus dynamic fee numerator, capped at MAX_FEE_NUMERATOR.

**Function**

```typescript
function getTotalFeeNumerator(
    baseFeeNumerator: BN,
    dynamicFee: QuoteDynamicFee,
    volatilityTracker: QuoteVolatilityTracker
): BN
```

---

### getFeeOnAmount

Take the fee out of an amount and split it; the program's get_fee_on_amount.

**Function**

```typescript
function getFeeOnAmount(
    tradeFeeNumerator: BN,
    amount: BN,
    hasReferral: boolean
): FeeOnAmountResult
```

---

### splitFees

[trading fee, protocol fee, referral fee]: the protocol takes PROTOCOL_FEE_PERCENT of the fee and the referrer HOST_FEE_PERCENT of that, both rounded down.

**Function**

```typescript
function splitFees(feeAmount: BN, hasReferral: boolean): [BN, BN, BN]
```

---

### getExcludedFeeAmount

[amount after the fee, fee], with the fee rounded up; the program's PoolFeesConfig::get_excluded_fee_amount.

**Function**

```typescript
function getExcludedFeeAmount(
    tradeFeeNumerator: BN,
    includedFeeAmount: BN
): [BN, BN]
```

---

### getIncludedFeeAmount

[amount before the fee, fee], rounded up and bounded by u64; the program's PoolFeesConfig::get_included_fee_amount.

**Function**

```typescript
function getIncludedFeeAmount(
    tradeFeeNumerator: BN,
    excludedFeeAmount: BN
): [BN, BN]
```

---

### pow

Q64 power, matching the program. A base at or above 1 is inverted through u128::MAX so each multiplication stays inside u128.

**Function**

```typescript
function pow(base: BN, exponent: BN, scaling: boolean = true): BN
```

---

### mulDiv

(x \* y) / denominator with the given rounding; the program's mul_div.

**Function**

```typescript
function mulDiv(x: BN, y: BN, denominator: BN, rounding: Rounding): BN
```

---

### toNumerator

bps \* feeDenominator / 10_000, rounded down; the program's to_numerator.

**Function**

```typescript
function toNumerator(bps: BN, feeDenominator: BN): BN
```

---

### sqrt

Integer square root by Newton's method, rounded down; the program's sqrt_u256.

**Function**

```typescript
function sqrt(value: BN): BN
```

---

### isZeroTransferFee

Token-2022 charges min(amount \* bps / 10_000, maximumFee), so either being zero means no fee.

**Function**

```typescript
function isZeroTransferFee(
    transferFee: {
        transferFeeBasisPoints: number
        maximumFee: BN | bigint
    } | null
): boolean
```

---

### getBaseTransferFee

A DBC base mint's fee has no cap, so the config only stores the basis points.

**Function**

```typescript
function getBaseTransferFee(
    transferFeeBasisPoints: number
): EpochTransferFee | null
```

---

### getEpochTransferFee

The mint's transfer fee in currentEpoch, or null when the mint has no TransferFeeConfig.

**Function**

```typescript
function getEpochTransferFee(
    mint: Mint,
    currentEpoch: number
): EpochTransferFee | null
```

---

### resolveSwapTransferFees

The transfer fees on the input and output side of a swap. The base fee comes from baseMint, then baseTransferFeeBasisPoints, then the config; the quote fee has to come from the quote mint account.

**Function**

```typescript
function resolveSwapTransferFees(
    config: Pick<
        QuotePoolConfig,
        | 'quoteTokenFlag'
        | 'quoteMint'
        | 'transferFeeFlag'
        | 'transferFeeBasisPoints'
    >,
    swapBaseForQuote: boolean,
    transferFees?: QuoteTransferFees
): { input: EpochTransferFee | null; output: EpochTransferFee | null }
```

---

### calculateTransferFeeExcludedAmount

The amount received after the transfer fee and the fee; spl-token-2022's calculate_fee.

**Function**

```typescript
function calculateTransferFeeExcludedAmount(
    transferFee: EpochTransferFee | null,
    includedAmount: BN
): TransferFeeAmount
```

---

### calculateTransferFeeIncludedAmount

The amount to send so that excludedAmount arrives after the transfer fee, and the fee; the program's calculate_transfer_fee_included_amount.

**Function**

```typescript
function calculateTransferFeeIncludedAmount(
    transferFee: EpochTransferFee | null,
    excludedAmount: BN
): TransferFeeAmount
```

---

### getBaseFeeHandler

The handler for a base fee config. The factors are the scheduler's numberOfPeriod, periodFrequency and reductionFactor, or the rate limiter's feeIncrementBps, maxLimiterDuration and referenceAmount.

**Function**

```typescript
function getBaseFeeHandler(
    cliffFeeNumerator: BN,
    firstFactor: number,
    secondFactor: BN,
    thirdFactor: BN,
    baseFeeMode: BaseFeeMode
): BaseFeeHandler
```

---

### isDynamicFeeEnabled

See the source in `src/math/poolFees/dynamicFee.ts`.

**Function**

```typescript
function isDynamicFeeEnabled(dynamicFee: QuoteDynamicFee): boolean
```

---

### getVariableFeeNumerator

((volatility*accumulator * bin*step)^2 * variable_fee_control + 99_999_999_999) / 100_000_000_000, or 0 when the dynamic fee is not initialized.

**Function**

```typescript
function getVariableFeeNumerator(
    dynamicFee: QuoteDynamicFee,
    volatilityTracker: QuoteVolatilityTracker
): BN
```

---

### getFeeSchedulerMinBaseFeeNumerator

The fee after every period has elapsed.

**Function**

```typescript
function getFeeSchedulerMinBaseFeeNumerator(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode
): BN
```

---

### getBaseFeeNumeratorByPeriod

The fee in a period, which stops decaying after numberOfPeriod.

**Function**

```typescript
function getBaseFeeNumeratorByPeriod(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    period: BN,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode
): BN
```

---

### getFeeNumeratorOnLinearFeeScheduler

fee = cliff_fee_numerator - period \* reduction_factor

**Function**

```typescript
function getFeeNumeratorOnLinearFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN
```

---

### getFeeNumeratorOnExponentialFeeScheduler

fee = cliff_fee_numerator \* (1 - reduction_factor / 10_000)^period in Q64

**Function**

```typescript
function getFeeNumeratorOnExponentialFeeScheduler(
    cliffFeeNumerator: BN,
    reductionFactor: BN,
    period: number
): BN
```

---

### getBaseFeeNumerator

The fee at currentPoint, with period = (currentPoint - activationPoint) / periodFrequency.

**Function**

```typescript
function getBaseFeeNumerator(
    cliffFeeNumerator: BN,
    numberOfPeriod: number,
    periodFrequency: BN,
    reductionFactor: BN,
    feeSchedulerMode: BaseFeeMode,
    currentPoint: BN,
    activationPoint: BN
): BN
```

---

### isRateLimiterApplied

The rate limiter only applies to quote-to-base swaps inside maxLimiterDuration after activation.

**Function**

```typescript
function isRateLimiterApplied(
    currentPoint: BN,
    activationPoint: BN,
    tradeDirection: TradeDirection,
    maxLimiterDuration: BN,
    referenceAmount: BN,
    feeIncrementBps: BN
): boolean
```

---

### isZeroRateLimiter

See the source in `src/math/poolFees/rateLimiter.ts`.

**Function**

```typescript
function isZeroRateLimiter(
    referenceAmount: BN,
    maxLimiterDuration: BN,
    feeIncrementBps: BN
): boolean
```

---

### isNonZeroRateLimiter

See the source in `src/math/poolFees/rateLimiter.ts`.

**Function**

```typescript
function isNonZeroRateLimiter(
    referenceAmount: BN,
    maxLimiterDuration: BN,
    feeIncrementBps: BN
): boolean
```

---

### getMaxIndex

Number of fee increments between the cliff fee and MAX_FEE_NUMERATOR.

**Function**

```typescript
function getMaxIndex(cliffFeeNumerator: BN, feeIncrementBps: BN): BN
```

---

### getCheckedAmounts

The amounts at which the fee reaches its maximum: [excluded fee amount, included fee amount, whether the included amount overflowed u64].

**Function**

```typescript
function getCheckedAmounts(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN
): [BN, BN, boolean]
```

---

### getFeeNumeratorFromExcludedAmount

Fee numerator for an amount that excludes the fee. The included amount is recovered from the excluded one, so this is not exact; the program only requires the result to be at or above the cliff fee, and it leaves out the dynamic fee.

**Function**

```typescript
function getFeeNumeratorFromExcludedAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    excludedFeeAmount: BN
): BN
```

---

### getRateLimiterExcludedFeeAmount

Amount after the rate limiter fee for an amount that includes it.

**Function**

```typescript
function getRateLimiterExcludedFeeAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    includedFeeAmount: BN
): BN
```

---

### getMaxOutAmountWithMinBaseFee

The output of a swap of exactly the reference amount, which pays the cliff fee.

**Function**

```typescript
function getMaxOutAmountWithMinBaseFee(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN
): BN
```

---

### liveCurve

The points of a stored curve up to the first zero point. `PoolConfig.curve` holds `MAX_CURVE_POINT` entries and the unused ones are zero; the program stops at the first of them.

**Function**

```typescript
function liveCurve<T extends { sqrtPrice: BN; liquidity: BN }>(curve: T[]): T[]
```

---

### getFeeNumeratorFromIncludedAmount

Fee numerator for an amount that includes the fee. Each whole reference amount above the first pays one more fee increment, up to the maximum fee.

**Function**

```typescript
function getFeeNumeratorFromIncludedAmount(
    cliffFeeNumerator: BN,
    referenceAmount: BN,
    feeIncrementBps: BN,
    includedFeeAmount: BN
): BN
```

---
