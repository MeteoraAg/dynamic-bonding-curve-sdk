# Changelog

All notable changes to the Dynamic Bonding Curve SDK will be documented in this file.

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
