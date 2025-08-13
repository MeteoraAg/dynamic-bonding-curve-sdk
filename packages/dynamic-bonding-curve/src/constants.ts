import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'

// Curve + Math constants
export const OFFSET: number = 64
export const U64_MAX: BN = new BN('18446744073709551615')
export const MIN_SQRT_PRICE: BN = new BN('4295048016')
export const MAX_SQRT_PRICE: BN = new BN('79226673521066979257578248091')

export const RESOLUTION = 64
export const ONE_Q64 = new BN(1).shln(RESOLUTION)
export const FEE_DENOMINATOR = 1_000_000_000
export const MAX_FEE_BPS = 9900 // 99%
export const MIN_FEE_BPS = 1 // 0.0001%
export const MIN_FEE_NUMERATOR = 100_000 // 0.0001%
export const MAX_FEE_NUMERATOR = 990_000_000 // 99%
export const BASIS_POINT_MAX = 10000
export const MAX_CURVE_POINT = 16
export const PARTNER_SURPLUS_SHARE = 80 // 80%
export const SWAP_BUFFER_PERCENTAGE = 25 // 25%
export const MAX_MIGRATION_FEE_PERCENTAGE = 50 // 50%
export const MAX_CREATOR_MIGRATION_FEE_PERCENTAGE = 100 // 100%
export const MAX_SWALLOW_PERCENTAGE = 20 // 20%

export const MAX_RATE_LIMITER_DURATION_IN_SECONDS = 43200 // 12 hours
export const MAX_RATE_LIMITER_DURATION_IN_SLOTS = 108000 // 12 hours

export const SLOT_DURATION = 400
export const TIMESTAMP_DURATION = 1000

// Pubkey
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

// Dynamic Fee
export const DYNAMIC_FEE_FILTER_PERIOD_DEFAULT = 10 // 10 seconds
export const DYNAMIC_FEE_DECAY_PERIOD_DEFAULT = 120 // 120 seconds
export const DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT = 5000 // 50%
export const MAX_DYNAMIC_FEE_PERCENTAGE = 20 // 20% of base fee

export const BIN_STEP_BPS_DEFAULT = 1
//  bin_step << 64 / BASIS_POINT_MAX
export const BIN_STEP_BPS_U128_DEFAULT = new BN('1844674407370955')
export const MAX_PRICE_CHANGE_BPS_DEFAULT = 1500 // 15%

export const MIN_MIGRATED_POOL_FEE_BPS = 10 // 0.1%
export const MAX_MIGRATED_POOL_FEE_BPS = 1000 // 10%

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
