# Meteora Dynamic Bonding Curve SDK

A Typescript SDK for interacting with the Dynamic Bonding Curve on Meteora.

## Overview

This SDK provides a set of tools and methods to interact with the [Meteora Dynamic Bonding Curve](https://github.com/MeteoraAg/dynamic-bonding-curve). It enables developers to easily create and manage dynamic bonding curves, with support for custom configurations and fee structures.

## Installation

```bash
npm install @meteora-ag/dynamic-bonding-curve-sdk
# or
pnpm install @meteora-ag/dynamic-bonding-curve-sdk
# or
yarn add @meteora-ag/dynamic-bonding-curve-sdk
```

## Initialization

```typescript
import { Connection } from '@solana/web3.js'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'

const connection = new Connection('https://api.mainnet-beta.solana.com')
const client = new DynamicBondingCurveClient(connection, 'confirmed')
```

## Usage

Refer to the [docs](./docs.md) for how to use the functions.

## Flow

The generic flow of how Dynamic Bonding Curve works is as follows:

1. The partner creates a config key for the pool.
2. The creator creates a pool.
3. The pool is tradeable on the Dynamic Bonding Curve.
4. Meteora's migrator service migrates the pool to either DAMM V1 or DAMM V2 based on the config key once the quote reserve is more than or equals to the migration quote threshold.
5. The graduated pool is tradeable on either DAMM V1 or DAMM V2.

## Flow of migration

### DAMM V1

1. `createDammV1MigrationMetadata`
2. `createLocker` (if the token has locked vesting)
3. `migrateToDammV1`
4. `lockDammV1LpToken` (if `creatorPermanentLockedLiquidityPercentage` or `partnerPermanentLockedLiquidityPercentage` is >0)
5. `claimDammV1LpToken` (if `creatorLiquidityPercentage` or `partnerLiquidityPercentage` is >0)

### DAMM V2

1. `createLocker` (if the token has locked vesting)
2. `migrateToDammV2`

### Test

1. Run solana localnet validator

```bash
cd packages/dynamic-bonding-curve
solana-test-validator --bpf-program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN tests/fixtures/dynamic_bonding_curve.so --bpf-program cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG tests/fixtures/cp_amm.so --bpf-program Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB tests/fixtures/amm.so --bpf-program LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn tests/fixtures/locker.so --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s tests/fixtures/metaplex.so --bpf-program 24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi tests/fixtures/vault.so
```

2. Run the tests

```bash
pnpm test
```

### Manual Migrator

We have created a [Manual Migrator UI](https://migrator.meteora.ag) that allows you to manually migrate a pool to either DAMM V1 or DAMM V2. Compatible with both Mainnet and Devnet pools.

### Program Address

- Mainnet-beta: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
- Devnet: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN

### Graduated DAMM Pool Config Keys

Accessible via `DAMM_V1_MIGRATION_FEE_ADDRESS[i]` in the SDK.

- MigrationFeeOption.FixedBps25 == 0: 8f848CEy8eY6PhJ3VcemtBDzPPSD4Vq7aJczLZ3o8MmX
- MigrationFeeOption.FixedBps30 == 1: HBxB8Lf14Yj8pqeJ8C4qDb5ryHL7xwpuykz31BLNYr7S
- MigrationFeeOption.FixedBps100 == 2: 7v5vBdUQHTNeqk1HnduiXcgbvCyVEZ612HLmYkQoAkik
- MigrationFeeOption.FixedBps200 == 3: EkvP7d5yKxovj884d2DwmBQbrHUWRLGK6bympzrkXGja
- MigrationFeeOption.FixedBps400 == 4: 9EZYAJrcqNWNQzP2trzZesP7XKMHA1jEomHzbRsdX8R2
- MigrationFeeOption.FixedBps600 == 5: 8cdKo87jZU2R12KY1BUjjRPwyjgdNjLGqSGQyrDshhud

Accessible via `DAMM_V2_MIGRATION_FEE_ADDRESS[i]` in the SDK.

- MigrationFeeOption.FixedBps25 == 0: 7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd
- MigrationFeeOption.FixedBps30 == 1: 2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k
- MigrationFeeOption.FixedBps100 == 2: Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp
- MigrationFeeOption.FixedBps200 == 3: 2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq
- MigrationFeeOption.FixedBps400 == 4: AkmQWebAwFvWk55wBoCr5D62C6VVDTzi84NJuD9H7cFD
- MigrationFeeOption.FixedBps600 == 5: DbCRBj8McvPYHJG1ukj8RE15h2dCNUdTAESG49XpQ44u
- MigrationFeeOption.Customizable == 6: A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck
