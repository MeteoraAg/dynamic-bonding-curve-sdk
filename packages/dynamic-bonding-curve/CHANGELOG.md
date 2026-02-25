# Changelog

All notable changes to the Dynamic Bonding Curve SDK will be documented in this file.

## [1.5.5] - 2026-02-25

### Changed

- Fixed `getBaseTokenForSwap` function to correctly calculate the base token for swap
- `createPoolWithFirstBuy` functions now return a `Transaction` instead of an object containing the new config transaction and pool transaction
- `createConfigAndPoolWithFirstBuy` functions now return `createConfigTx` and `createPoolWithFirstBuyTx` as separate `Transaction` instead of an object containing 3 separate transactions

## [1.5.4] - 2026-02-24

### Added

- Added `getPoolBaseTokenCurveProgress` function to get the progress of the base token curve

### Changed

- Renamed `getPoolCurveProgress` function to `getPoolQuoteTokenCurveProgress`

## [1.5.3] - 2026-02-15

### Added

- Added `TokenConfig`, `FeeConfig`, `MigrationConfig`, `MigrationFee`, `MigratedPoolFeeConfig`, `MigratedPoolMarketCapFeeSchedulerParams`, `LiquidityDistributionConfig` types for structured parameter grouping
- Added `MigratedPoolFeeResult` type for the return value of `getMigratedPoolFeeParams`
- Added `DEFAULT_MIGRATED_POOL_FEE_PARAMS` constant for default migrated pool fee values
- Added `validateMarketCapFeeSchedulerRequiresPoolFeeBps` validation to ensure `poolFeeBps > 0` when `marketCapFeeSchedulerParams` is configured
- Added comprehensive unit tests for `getMigratedPoolFeeParams` and migration fee option behavior in `buildCurve.test.ts`
- Added test coverage for all migration fee option cases: fixed options (0-5), customizable without market cap scheduler, customizable with market cap scheduler, and DAMM V1 defaults

### Changed

- All `buildCurve*` functions now destructure the unified `MigratedPoolFeeResult` from `getMigratedPoolFeeParams` instead of separately calling `getMigratedPoolMarketCapFeeSchedulerParams`
- Updated `validateMigratedPoolFee` to accept `migratedPoolMarketCapFeeSchedulerParams` and allow non-empty `migratedPoolFee` when market cap fee scheduler is configured with a fixed fee option

### Breaking Changes

- **`BuildCurveBaseParams` restructured** from flat parameters to nested groups: `token: TokenConfig`, `fee: FeeConfig`, `migration: MigrationConfig`, `liquidityDistribution: LiquidityDistributionConfig`, `lockedVesting: LockedVestingParams`, `activationType: ActivationType`. This affects all `buildCurve*` functions: `buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithMidPrice`, `buildCurveWithLiquidityWeights`, `buildCurveWithCustomSqrtPrices`.

## [1.5.2] - 2026-01-27

### Added

- Added `getMigratedPoolMarketCapFeeSchedulerParams` helper function to craft `MigratedPoolMarketCapFeeSchedulerParams` object
- Added `decodePodAlignedFeeMarketCapScheduler` helper function to decode `PodAlignedFeeMarketCapScheduler` object from config account data
- Added `validateMigratedPoolBaseFeeMode` and `validateDynamicFeeParams` validation functions for config creation
- Added `getMinBaseFeeNumerator` into `BaseFeeHandler` class
- Added if `poolConfigState.enableFirstSwapWithMinFee` is true, then the `swap` and `swap2` functions will contain `SYSVAR_INSTRUCTIONS_PUBKEY` in remaining accounts

### Changed

- Bumped DAMM v2 IDL to v0.1.7

### Breaking Changes

- Added `migratedPoolBaseFeeMode`, `migratedPoolMarketCapFeeSchedulerParams` and `enableFirstSwapWithMinFee` parameters to `buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithLiquidityWeights`, `buildCurveWithMidPrice`, `buildCurveWithCustomSqrtPrices` functions
- Added `eligibleForFirstSwapWithMinFee` parameter to `swapQuote`, `swapQuote2` functions when quoting for first swap with minimum fee

## [1.5.1] - 2026-01-17

### Fixed

- Fixed `calculateBaseToQuoteFromAmountIn` function to cap the sqrt price when the input amount is greater than the available liquidity

## [1.5.0] - 2025-01-09

### Added

- Added `firstPositionVestingAddress` and `secondPositionVestingAddress` into `remainingAccounts` in `migrateDammV2` function
- Added `claimPartnerPoolCreationFee` function
- Added validation checks for createConfig
- Added optional `partnerLiquidityVestingInfoParams` and `creatorLiquidityVestingInfoParams` parameters to all `buildCurve` functions
- Added `getLiquidityVestingInfoParams` helper function to craft `LiquidityVestingInfoParameters` object
- Added tests for `createConfig` validation, `createPool`, `swap` and `swap2`

### Changed

- `partnerLpPercentage` and `creatorLpPercentage` has been renamed to `partnerLiquidityPercentage` and `creatorLiquidityPercentage` respectively
- `partnerLockedLpPercentage` and `creatorLockedLpPercentage` has been renamed to `partnerPermanentLockedLiquidityPercentage` and `creatorPermanentLockedLiquidityPercentage` respectively
- Renamed `BASIS_POINT_MAX` to `MAX_BASIS_POINT`

## [1.4.10] - 2025-01-03

### Added

- Added `buildCurveWithCustomSqrtPrices` function to build a curve with custom sqrt price points and optional liquidity weights

## [1.4.9] - 2025-11-29

### Added

- Added `buildCurveWithMidPrice` function to build a custom constant product curve with a mid price option.
- Added `getCurveBreakdown` helper function

## [1.4.8] - 2025-11-23

### Changed

- Moved `getCurrentPoint` in `if` statement to reduce unnecessary RPC calls

## [1.4.7] - 2025-11-23

### Added

- Added an `if` statement to check if the `baseFeeMode` is `RateLimiter` in `swap` and `swap2` endpoints

## [1.4.6] - 2025-10-28

### Added

- Added validation checks for migration fee percentages

### Deprecated

- Endpoint `createDammV2MigrationMetadata` is deprecated as it is no longer needed when migrating a DAMM v2 pool.

### Changed

- Minimum base fee increased from 1bp (0.01%) to 25 bps (0.25%). Affected endpoints: `createConfig`, `createPool`, `createConfigAndPool`, `createConfigAndPoolWithFirstBuy`, `createPoolWithFirstBuy`, `createPoolWithPartnerAndCreatorFirstBuy`
- Migration fee increased from 50% to 99%.

## [1.4.5] - 2025-10-11

### Changed

- Fixed `validateFeeScheduler` function to correctly validate the fee scheduler parameters
- Fixed `getMinBaseFeeNumerator` function to correctly calculate the min base fee numerator

## [1.4.4] - 2025-09-24

### Changed

- Bumped DAMM v2 IDL

## [1.4.3] - 2025-09-19

### Changed

- Fixed `getPoolFeeBreakdown` function to correctly calculate the fee breakdown for a token pool

## [1.4.2] - 2025-09-19

### Added

- `getPoolFeeBreakdown` function to get the fee breakdown for a token pool

## [1.4.1] - 2025-09-15

### Changed

- Removed `feePayer` parameter from `creatorWithdrawMigrationFee` and `partnerWithdrawMigrationFee` functions ++ Fixed functions

## [1.4.0] - 2025-09-09

### Changed

- Fixed `calculateFeeSchedulerEndingBaseFeeBps` function to correctly calculate the ending base fee when `numberOfPeriod` or `periodFrequency` is 0

## [1.3.9] - 2025-09-05

### Changed

- Remove console.log in `getDeltaAmountQuoteUnsigned` and `getDeltaAmountQuoteUnsigned256` functions

## [1.3.8] - 2025-09-03

### Changed

- Remove `U64_MAX` check in `getDeltaAmountQuoteUnsigned` and `getDeltaAmountQuoteUnsigned256` functions

## [1.3.7] - 2025-08-14

### Added

- `swap2` function with `swapMode` parameter
- `swapQuote2` function with `swapMode` parameter
- `prepareSwapAmountParam` helper function
- `getCurrentPoint` helper function

### Changed

- `swapQuote` function now returns `SwapResult` instead of `QuoteResult`
- `getAccountData` function now requires a `commitment` parameter
- Deprecated `swapQuoteExactIn` function
- Deprecated `swapQuoteExactOut` function

## [1.3.6] - 2025-08-08

### Changed

- `withdrawLeftover` function fully permissionless and only `payer` needs to sign.

## [1.3.5] - 2025-07-31

### Added

- Added `MigrationFeeOption === 6` to `MigrationFeeOption` enum for customizable graduated pool fee. Only available for DAMM V2.
- Added new address in `DAMM_V2_MIGRATION_FEE_ADDRESS` fee address array for `MigrationFeeOption === 6`
- Validation checks for `migratedPoolFee` parameter

### Changed

- `buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithLiquidityWeights` functions now have an optional `migrationFeeOption` parameter

## [1.3.4] - 2025-07-28

### Added

- Added `getDammV1MigrationMetadata` to get DAMM v1 migration states

## [1.3.3] - 2025-07-22

### Changed

- Added compulsory `receiver` parameter for `partner` and `creator` first buy in `createPoolWithPartnerAndCreatorFirstBuy` function
- Added optional `receiver` parameter to `createPoolWithFirstBuy` and `createConfigAndPoolWithFirstBuy` functions

## [1.3.2] - 2025-07-22

### Changed

- Fixed precision issue in `getPoolCurveProgress` function

## [1.3.1] - 2025-07-02

### Added

- `swapQuoteExactOut` function

## [1.3.0] - 2025-07-01

### Added

- Added optional `payer` parameter to `swap` function
- Added `createPoolWithPartnerAndCreatorFirstBuy` function

### Changed

- `createConfigAndPoolWithFirstBuy` and `createPoolWithFirstBuy` function now accepts a `buyer` parameter
- `createPoolWithFirstBuy` function now returns a `Transaction[]` containing `createPoolTx` and a `swapBuyTx` instead of a single `Transaction`

## [1.2.9] - 2025-06-26

### Added

- `TokenUpdateAuthorityOption` enum to have more options for token update authority:
    - CreatorUpdateAuthority (0)
    - Immutable (1)
    - PartnerUpdateAuthority (2)
    - CreatorUpdateAndMintAuthority (3)
    - PartnerUpdateAndMintAuthority (4)

### Changed

- Changed `CollectFeeMode` enums from `OnlyQuote` and `Both` to `QuoteToken` and `OutputToken`

## [1.2.8] - 2025-06-24

### Added

- `getQuoteReserveFromNextSqrtPrice` helper function

## [1.2.7] - 2025-06-19

### Changed

- Fixed `buildCurve` function to correctly calculate with precision for the `migrationBaseSupply`

## [1.2.6] - 2025-06-13

### Changed

- Fixed `getPercentageSupplyOnMigration` function to correctly calculate the percentage of supply on migration

## [1.2.5] - 2025-06-12

### Changed

- Removed `getDammV1MigrationMetadata` and `getDammV2MigrationMetadata` functions

## [1.2.4] - 2025-06-12

### Added

- Support for Rate Limiter mode in base fee configuration
    - Allows partners to configure an alternative base fee mode that increases fee slope based on quote amount
    - Only available when collect fee mode is in quote token only and for buy operations
    - Prevents multiple swap instructions (or CPI) to the same pool in a single transaction

### Breaking Changes

- Maximum `cliff_fee_numerator` increased from 50% (5000 bps / 500_000_000) to 99% (9900 bps / 990_000_000)
- `swap` instruction now requires `instruction_sysvar_account` in remaining_accounts when `is_rate_limiter_applied` is true
- `swap_quote` function updated to handle rate limiter math calculations and 99% max fee
- Base fee parameter structure updated:
    - Renamed `fee_scheduler_mode` to `base_fee_mode`
    - Updated parameter structure:
        ```
        base_fee = {
            cliff_fee_numerator: BN
            first_factor: number // feeScheduler: numberOfPeriod, rateLimiter: feeIncrementBps
            second_factor: BN // feeScheduler: periodFrequency, rateLimiter: maxLimiterDuration
            third_factor: BN // feeScheduler: reductionFactor, rateLimiter: referenceAmount
            base_fee_mode: BaseFeeMode // 0, 1, or 2
        }
        ```
    - New base fee modes:
        - 0 = Fee Scheduler - Linear
        - 1 = Fee Scheduler - Exponential
        - 2 = Rate Limiter
- `buildCurve`, `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`, `buildCurveWithLiquidityWeights` functions now require `baseFeeParams` parameter that can be either configured with `feeSchedulerParam` or `rateLimiterParam`

### Changed

- Updated base fee parameter structure to support both fee scheduler and rate limiter modes
- Enhanced fee calculation logic to accommodate rate limiter functionality

## [1.2.3] - 2025-06-07

### Added

- `swapQuoteExactIn` function

## [1.2.2] - 2025-06-02

### Added

- `claimCreatorTradingFee2` function (without `tempWSolAcc` parameter)
- `claimPartnerTradingFee2` function (without `tempWSolAcc` parameter)

## [1.2.1] - 2025-06-02

### Changed

- Fixed `buildCurveWithMarketCap` function to correctly calculate the `migrationQuoteThreshold`
- Fixed `validateConfigParameters` function to calculate `migrationBaseAmount` correctly

## [1.2.0] - 2025-05-31

### Changed

- `withdrawMigrationFee` function for partner and creator is now called `partnerWithdrawMigrationFee` and `creatorWithdrawMigrationFee`
- `createConfigAndPoolWithFirstBuy` function now returns an object containing the new config transaction, new pool transaction, and first buy transaction

## [1.1.9] - 2025-05-30

### Added

- `transferPoolCreator` function for creator
- `withdrawMigrationFee` function for creator
- `withdrawMigrationFee` function for partner

### Changed

- Removed `buildCurveWithCreatorFirstBuy` function

### Breaking Changes

- `createConfig`'s `ConfigParameters` include `migrationFee` and `tokenUpdateAuthority` configurations.
- All `buildCurve` functions now require `migrationFee` and `tokenUpdateAuthority` configurations.

## [1.1.8] - 2025-05-28

### Added

- `createConfigAndPoolWithFirstBuy` function
- `getTokenType` helper function
- `prepareTokenAccountTx` helper function
- `cleanUpTokenAccountTx` helper function

## [1.1.7] - 2025-05-27

### Changed

- Fixed `buildCurveWithTwoSegments` function to correctly calculate the midSqrtPrice
- Fixed precision error of `buildCurveWithMarketCap` function
- Changed `periodFrequency` calculation in `getLockedVestingParams` function

## [1.1.6] - 2025-05-23

### Added

- `getPoolByBaseMint` function
- `buildCurveWithCreatorFirstBuy` function
- `buildCurveWithTwoSegments` function
- `getLockedVestingParams` function
- `getBaseFeeParams` function
- `DAMM_V1_MIGRATION_FEE_ADDRESS` and `DAMM_V2_MIGRATION_FEE_ADDRESS` fee address array
- `getPriceFromSqrtPrice` function

### Changed

- Optimised `getPoolsQuoteFeesByConfig` and `getPoolsBaseFeesByConfig` functions
- Fixed `getDammV1MigrationMetadata` and `getDammV2MigrationMetadata` functions to derive the metadata address from the pool address
- Removed `buildCurveAndCreateConfig`, `buildCurveAndCreateConfigByMarketCap` and `buildCurveGraphAndCreateConfig` functions
- Added `tempWSolAcc` parameter to `claimPartnerTradingFee` and `claimCreatorTradingFee` functions
- Removed `getTokenDecimal` state function

### Breaking Changes

- Curve building functions are now split into two steps:
    1. Use helper functions to build curve config:
        - `buildCurve`
        - `buildCurveWithMarketCap`
        - `buildCurveWithTwoSegments`
        - `buildCurveWithLiquidityWeights`
        - `buildCurveWithCreatorFirstBuy`
    2. Call `createConfig` with the built config
- Added required `tempWSolAcc` parameter to fee claiming functions when receiver !== creator || feeClaimer

## [1.1.5] - 2025-05-23

### Added

- `createConfigAndPool` function

### Changed

- `docs.md` updated with the correct createPool format
- `CHANGELOG.md` switched to DES format

## [1.1.4] - 2025-05-09

### Added

- New function: `buildCurveGraphAndCreateConfig`
- Added `leftover` parameter to curve building functions

### Changed

- Updated fee claiming functions to support custom receivers

### Breaking Changes

- `buildCurveAndCreateConfig` and `buildCurveAndCreateConfigByMarketCap` now require `leftover` parameter
- `buildCurveGraphAndCreateConfig` uses `liquidityWeights[]` instead of `kFactor`
- Added receiver option in `claimPartnerTradingFee` and `claimCreatorTradingFee`

## [1.1.3] - 2025-05-07

### Changed

- Updated `buildCurveGraphAndCreateConfig` to use `liquidityWeights[]` instead of `kFactor`
- Modified dynamic fee calculation to be 20% of minimum base fee
- Changed `createPoolAndBuy` buyer from `payer` to `poolCreator`

### Added

- Payer option to `claimCreatorTradingFee` and `claimPartnerTradingFee` functions

## [1.1.2] - 2025-04-30

### Added

- New fee options: 4% and 6% graduation fees
- New functions:
    - `creatorWithdrawSurplus`
    - `claimCreatorTradingFee`
    - `createPoolAndBuy`
- New getter functions
- SDK modularization and RPC call optimization

### Changed

- Updated service and getter function calling patterns

### Breaking Changes

- Added required `creatorTradingFeePercentage` parameter to:
    - `createConfig`
    - `buildCurveAndCreateConfig`
    - `buildCurveAndCreateConfigByMarketCap`
- Updated function namespaces:
    - `client.partners` → `client.partner`
    - `client.migrations` → `client.migration`
    - `client.creators` → `client.creator`
    - `client.pools` → `client.pool`
    - `client.getProgram()` → `client.state`
- New pool address derivation functions:
    1. `deriveDbcPoolAddress`
    2. `deriveDammV1PoolAddress`
    3. `deriveDammV2PoolAddress`
