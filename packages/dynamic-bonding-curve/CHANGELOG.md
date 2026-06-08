# Changelog

All notable changes to the Dynamic Bonding Curve SDK will be documented in this file.

## [1.5.10] - 2026-06-08

### Added

- Added `client.pool.getQuoteFromInputAmount` and `client.pool.getQuoteFromOutputAmount` for quoting launch-state swaps before a pool exists.
- Added `SwapQuoteConfig`, `SimulatedQuoteFromInputAmountParams`, and `SimulatedQuoteFromOutputAmountParams` types for pre-pool swap quote simulations.

### Changed

- Updated pool quote simulation to accept either an existing pool config or a `buildCurve` output, deriving `migrationSqrtPrice` when it is not present.

## [1.5.9] - 2026-06-03

### Fixed

- Fixed `StateService` endpoints to correctly fetch both regular and transfer-hook pool and config accounts.

## [1.5.8] - 2026-05-26

### Added

- Added Token-2022 transfer-hook support for DBC pool configs and pools:
    - `client.partner.createConfigWithTransferHook`
    - `client.partner.createConfigAndPoolWithTransferHook`
    - `client.partner.createConfigAndPoolWithFirstBuyWithTransferHook`
    - `client.creator.createPoolWithTransferHook`
    - `client.creator.createPoolWithFirstBuyWithTransferHook`
    - `client.creator.createPoolWithPartnerAndCreatorFirstBuyWithTransferHook`
- Added transfer-hook swap and fee claim endpoints:
    - `client.pool.swap2WithTransferHook`
    - `client.partner.claimPartnerTradingFee2`
    - `client.creator.claimCreatorTradingFee2`
- Added transfer-hook account helper types:
    - `TransferHookAccountsInfo`
    - `TransferHookRemainingAccounts`
    - `FirstBuyWithTransferHookParams`
    - `PartnerFirstBuyWithTransferHookParams`
    - `CreatorFirstBuyWithTransferHookParams`
    - `AccountsType`
- Added account types for transfer-hook program accounts:
    - `ConfigWithTransferHook`
    - `TransferHookPool`
- Added `CreateVirtualPoolMetadataParameters` as an exported IDL-derived type.
- Added `client.partner.createConfigAndPool` and `client.partner.createConfigAndPoolWithFirstBuy` so partner-owned config-and-pool flows live under the partner service.
- Added `client.creator.createPool`, `client.creator.createPoolWithFirstBuy`, and `client.creator.createPoolWithPartnerAndCreatorFirstBuy` so creator-owned pool initialization flows live under the creator service.
- Added `client.partner.claimPartnerTradingFeeToReceiver` and `client.creator.claimCreatorTradingFeeToReceiver` for the non-transfer-hook fee claim flows that do not require `tempWSolAcc`.
- Added test coverage for transfer-hook config creation, pool creation, swaps, first buys, and fee claims using the new `transfer_hook_counter` test program.

### Changed

- Updated the DBC IDL and generated types to include transfer-hook instructions and account layouts.
- Updated DAMM V1, DAMM V2, and Dynamic Vault IDLs and generated types.
- Updated `DynamicBondingCurveClient` so all services share one `StateService` instance.
- Updated `StateService.getPoolConfig` to fetch both regular `poolConfig` accounts and transfer-hook config accounts.
- Updated `StateService.getPool` to fetch both regular `virtualPool` accounts and transfer-hook pool accounts.
- Updated swap quote math and state helpers to read virtual pool fields from the new nested `poolState` layout.
- Updated `buildCurve*` helpers to accept `token.tokenAuthorityOption` and map it to the on-chain `tokenUpdateAuthority` field.
- Renamed `createVaultProgram` to `createDynamicVaultProgram` to match the Dynamic Vault IDL naming.
- Renamed internal/public DAMM V1 and Dynamic Vault generated IDL program types from `DammV1` and `DynamicVault` to `Amm` and `Vault`.
- Updated validator and CI setup to use the `mercurial_vault.so` fixture and include the `transfer_hook_counter.so` fixture.
- Reworked `docs.md` with the current SDK service layout and transfer-hook function documentation.
- Updated `getMigratedPoolMarketCapFeeSchedulerParams` and `MigratedPoolMarketCapFeeSchedulerParams` to use `priceMultiple` directly.

### Breaking Changes

- **Pool creation methods moved service namespaces.** Existing callers must update:
    - `client.pool.createPool(...)` -> `client.creator.createPool(...)`
    - `client.pool.createPoolWithFirstBuy(...)` -> `client.creator.createPoolWithFirstBuy(...)`
    - `client.pool.createPoolWithPartnerAndCreatorFirstBuy(...)` -> `client.creator.createPoolWithPartnerAndCreatorFirstBuy(...)`
    - `client.pool.createConfigAndPool(...)` -> `client.partner.createConfigAndPool(...)`
    - `client.pool.createConfigAndPoolWithFirstBuy(...)` -> `client.partner.createConfigAndPoolWithFirstBuy(...)`
- **Pool address params were renamed from `virtualPool` to `pool` across SDK request types.** Update call sites for:
    - `CreateLockerParams`
    - `WithdrawLeftoverParams`
    - `MigrateToDammV1Params`
    - `MigrateToDammV2Params`
    - `DammLpTokenParams`
    - `PartnerWithdrawSurplusParams`
    - `CreatorWithdrawSurplusParams`
    - `TransferPoolCreatorParams`
    - `WithdrawMigrationFeeParams`
    - `ClaimPartnerPoolCreationFeeParams`
- **Virtual pool account data now uses the nested `poolState` layout.** Code that directly reads `VirtualPool` fields must migrate from flat fields like `pool.config`, `pool.baseMint`, `pool.quoteReserve`, `pool.sqrtPrice`, and `pool.metrics` to `pool.poolState.config`, `pool.poolState.baseMint`, `pool.poolState.quoteReserve`, `pool.poolState.sqrtPrice`, and `pool.poolState.metrics`.
- **`TokenType.SPL` was renamed to `TokenType.SPLToken`.** The enum value remains `0`, but TypeScript callers must update the enum member name.
- **`TokenUpdateAuthorityOption` was renamed to `TokenAuthorityOption`.** Update imports and references.
- **`TokenConfig.tokenUpdateAuthority` was renamed to `tokenAuthorityOption` for all `buildCurve*` helpers.** The helper still maps this value to the on-chain `tokenUpdateAuthority` config field.
- **`PreCreatePoolParams` was renamed to `CreatePoolBaseParams`.** Update imports and any explicit type annotations.
- **The old no-`tempWSolAcc` trading fee claim types were renamed.**
    - `ClaimTradingFeeParams` -> `ClaimPartnerTradingFeeParams`
    - `ClaimTradingFee2Params` -> `ClaimPartnerTradingFeeToReceiverParams`
    - `ClaimCreatorTradingFee2Params` -> `ClaimCreatorTradingFeeToReceiverParams`
- **The old `claimPartnerTradingFee2` and `claimCreatorTradingFee2` non-transfer-hook behavior moved to `claimPartnerTradingFeeToReceiver` and `claimCreatorTradingFeeToReceiver`.** In `1.5.8`, `claimPartnerTradingFee2` and `claimCreatorTradingFee2` build transfer-hook fee claim instructions and should be used only for transfer-hook pools.
- **`createVaultProgram` was renamed to `createDynamicVaultProgram`.** Update helper imports.
- **`StateService.getDammV1LockEscrow` was removed.** Consumers that need lock escrow data must fetch it through the relevant generated program client.
- **`LockEscrow` now comes from IDL types instead of IDL accounts.** Update assumptions if you were treating it as an Anchor account object.
- **Raw IDL instruction indexes changed.** Code using `DynamicBondingCurve['instructions'][index]` directly must be updated because transfer-hook instructions shifted the generated instruction order.
- **Market cap fee scheduler config now uses `priceMultiple`.** Replace `marketCapFeeSchedulerParams.startingMarketCap` and `marketCapFeeSchedulerParams.endingMarketCap` with `marketCapFeeSchedulerParams.priceMultiple`.

### Fixed

- Fixed state and quote helpers to work with the new nested virtual pool account layout.
- Fixed transfer-hook pool state reads so `getPoolConfig`, `getPool`, fee metrics, fee breakdowns, and curve progress helpers work with both regular and transfer-hook pools.
- Fixed SOL quote handling in transfer-hook fee claim flows by preserving the wrapped SOL post-instructions where needed.

## [1.5.7] - 2026-03-24

### Changed

- Updated `getMigratedPoolMarketCapFeeSchedulerParams` function to use `startingMarketCap` and `endingMarketCap` instead of `sqrtPriceStepBps`

## [1.5.6] - 2026-03-12

### Added

- Added `MigratedCollectFeeMode` enum with `Compounding` (2) support for migrated DAMM v2 pool configuration.
- Added `compoundingFeeBps` support in `MigratedPoolFeeConfig` and propagated it through all `buildCurve*` helpers.

### Changed

- Updated migrated pool fee validation to require `compoundingFeeBps > 0` only when `collectFeeMode = MigratedCollectFeeMode.Compounding`, and `0` otherwise.
- Updated migration flow for DAMM v2 to remove position vesting accounts from `migrateDammV2` remaining accounts.
- Removed `deriveDammV2PositionVestingAccount` PDA helper.

### Fixed

- Fixed `getDynamicFeeParams` function to correctly calculate the dynamic fee parameters based on the max price change bps

## [1.5.5] - 2026-02-25

### Changed

- Fixed `getPoolBaseTokenCurveProgress` function to correctly calculate the progress of the base token curve using `getBaseTokenForSwap` function
- `createConfigAndPoolWithFirstBuy` functions now return `createConfigTx` and `createPoolWithFirstBuyTx` as separate `Transaction` instead of an object containing 3 separate `Transaction`s
- `createPoolWithFirstBuy` functions now return a `Transaction` instead of an object containing the new config transaction and pool transaction
- `createPoolWithPartnerAndCreatorFirstBuy` functions now return a `Transaction` instead of an object containing the new config transaction and pool transaction

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
