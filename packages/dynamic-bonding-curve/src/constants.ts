import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'
import {
    LiquidityVestingInfoParams,
    MigratedPoolMarketCapFeeSchedulerParameters,
} from './types'

export const MAX_CURVE_POINT = 16

export const OFFSET = 64
export const RESOLUTION = 64
export const ONE_Q64 = new BN(1).shln(RESOLUTION)

export const FEE_DENOMINATOR = 1_000_000_000
export const MAX_BASIS_POINT = 10_000

export const U16_MAX = 65_535
export const U24_MAX = 16_777_215
export const U64_MAX = new BN('18446744073709551615')
export const U128_MAX = new BN('340282366920938463463374607431768211455')

export const MIN_SQRT_PRICE = new BN('4295048016')
export const MAX_SQRT_PRICE = new BN('79226673521066979257578248091')

// Base Fee
export const MIN_FEE_BPS = 25 // 0.25% // previously 0.01%
export const MAX_FEE_BPS = 9900 // 99%
export const MIN_FEE_NUMERATOR = 2_500_000 // 0.25% // previously 100_000 (0.01%)
export const MAX_FEE_NUMERATOR = 990_000_000 // 99%

// Base Fee - Rate Limiter
export const MAX_RATE_LIMITER_DURATION_IN_SECONDS = 43_200 // 12 hours
export const MAX_RATE_LIMITER_DURATION_IN_SLOTS = 108_000 // 12 hours

// Dynamic Fee
export const DYNAMIC_FEE_FILTER_PERIOD_DEFAULT = 10 // 10 seconds
export const DYNAMIC_FEE_DECAY_PERIOD_DEFAULT = 120 // 120 seconds
export const DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT = 5000 // 50%
export const DYNAMIC_FEE_SCALING_FACTOR = new BN(100_000_000_000)
export const DYNAMIC_FEE_ROUNDING_OFFSET = new BN(99_999_999_999)
export const BIN_STEP_BPS_DEFAULT = 1
//  bin_step << 64 / MAX_BASIS_POINT
export const BIN_STEP_BPS_U128_DEFAULT = new BN('1844674407370955')
export const MAX_PRICE_CHANGE_PERCENTAGE_DEFAULT = 20 // 20%

// Protocol Fee
export const PROTOCOL_FEE_PERCENT = 20 // 20%

// Referral Fee
export const HOST_FEE_PERCENT = 20 // 20%

// Swap Buffer
export const SWAP_BUFFER_PERCENTAGE = 25 // 25%

// Migration Fee
export const MAX_MIGRATION_FEE_PERCENTAGE = 99 // 99% // previously 50%
export const MAX_CREATOR_MIGRATION_FEE_PERCENTAGE = 100 // 100%

// Migrated Pool Locked Liquidity
export const MIN_LOCKED_LIQUIDITY_BPS = 1000 // 10%
export const SECONDS_PER_DAY = 86400
// Max lock duration must less than or equals to https://github.com/MeteoraAg/damm-v2/blob/689a3264484799d833c505523f4ff4e4990690aa/programs/cp-amm/src/constants.rs#L72
// We reduce to 2 years because cliff_point is relative and depend on time when token is migrated
export const MAX_LOCK_DURATION_IN_SECONDS = 63_072_000 // 2 years

// Pool Creation Fee
export const PROTOCOL_POOL_CREATION_FEE_PERCENT = 10 // 10%
export const MIN_POOL_CREATION_FEE = 1_000_000
export const MAX_POOL_CREATION_FEE = 100_000_000_000

// Migrated Pool Fee
export const MIN_MIGRATED_POOL_FEE_BPS = 10 // 0.1%
export const MAX_MIGRATED_POOL_FEE_BPS = 1000 // 10%

export const DYNAMIC_BONDING_CURVE_PROGRAM_ID = new PublicKey(
    'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
)
export const METAPLEX_PROGRAM_ID = new PublicKey(
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s'
)
export const DAMM_V1_PROGRAM_ID = new PublicKey(
    'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB'
)
export const DAMM_V2_PROGRAM_ID = new PublicKey(
    'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'
)
export const VAULT_PROGRAM_ID = new PublicKey(
    '24Uqj9JCLxUeoC3hGfh5W3s9FM9uCHDS2SG3LYwBpyTi'
)
export const LOCKER_PROGRAM_ID = new PublicKey(
    'LocpQgucEQHbqNABEYvBvwoxCPsSbG91A1QaQhQQqjn'
)
export const BASE_ADDRESS = new PublicKey(
    'HWzXGcGHy4tcpYfaRDCyLNzXqBTv3E6BttpCH2vJxArv'
)

// DAMM V1 Migration Fee Options
export const DAMM_V1_MIGRATION_FEE_ADDRESS = [
    new PublicKey('8f848CEy8eY6PhJ3VcemtBDzPPSD4Vq7aJczLZ3o8MmX'), // FixedBps25
    new PublicKey('HBxB8Lf14Yj8pqeJ8C4qDb5ryHL7xwpuykz31BLNYr7S'), // FixedBps30
    new PublicKey('7v5vBdUQHTNeqk1HnduiXcgbvCyVEZ612HLmYkQoAkik'), // FixedBps100
    new PublicKey('EkvP7d5yKxovj884d2DwmBQbrHUWRLGK6bympzrkXGja'), // FixedBps200
    new PublicKey('9EZYAJrcqNWNQzP2trzZesP7XKMHA1jEomHzbRsdX8R2'), // FixedBps400
    new PublicKey('8cdKo87jZU2R12KY1BUjjRPwyjgdNjLGqSGQyrDshhud'), // FixedBps600
]

// DAMM V2 Migration Fee Options
export const DAMM_V2_MIGRATION_FEE_ADDRESS = [
    new PublicKey('7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd'), // FixedBps25
    new PublicKey('2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k'), // FixedBps30
    new PublicKey('Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp'), // FixedBps100
    new PublicKey('2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq'), // FixedBps200
    new PublicKey('AkmQWebAwFvWk55wBoCr5D62C6VVDTzi84NJuD9H7cFD'), // FixedBps400
    new PublicKey('DbCRBj8McvPYHJG1ukj8RE15h2dCNUdTAESG49XpQ44u'), // FixedBps600
    new PublicKey('A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck'), // Customizable
]

export const DEFAULT_LIQUIDITY_VESTING_INFO_PARAMS: LiquidityVestingInfoParams =
    {
        vestingPercentage: 0,
        bpsPerPeriod: 0,
        numberOfPeriods: 0,
        cliffDurationFromMigrationTime: 0,
        totalDuration: 0,
    }

export const DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS: MigratedPoolMarketCapFeeSchedulerParameters =
    {
        numberOfPeriod: 0,
        sqrtPriceStepBps: 0,
        schedulerExpirationDuration: 0,
        reductionFactor: new BN(0),
    }
