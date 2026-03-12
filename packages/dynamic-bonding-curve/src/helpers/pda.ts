import { PublicKey } from '@solana/web3.js'
import {
    BASE_ADDRESS,
    DAMM_V1_PROGRAM_ID,
    DAMM_V2_PROGRAM_ID,
    LOCKER_PROGRAM_ID,
    METAPLEX_PROGRAM_ID,
    VAULT_PROGRAM_ID,
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
} from '../constants'
import { getFirstKey, getSecondKey } from './common'

const SEED = Object.freeze({
    POOL_AUTHORITY: 'pool_authority',
    EVENT_AUTHORITY: '__event_authority',
    POOL: 'pool',
    TOKEN_VAULT: 'token_vault',
    METADATA: 'metadata',
    PARTNER_METADATA: 'partner_metadata',
    CLAIM_FEE_OPERATOR: 'cf_operator',
    DAMM_V1_MIGRATION_METADATA: 'meteora',
    DAMM_V2_MIGRATION_METADATA: 'damm_v2',
    LP_MINT: 'lp_mint',
    FEE: 'fee',
    POSITION: 'position',
    POSITION_NFT_ACCOUNT: 'position_nft_account',
    LOCK_ESCROW: 'lock_escrow',
    VIRTUAL_POOL_METADATA: 'virtual_pool_metadata',
    ESCROW: 'escrow',
    BASE_LOCKER: 'base_locker',
    VAULT: 'vault',
})

/**
 * Derive DBC event authority
 * @returns The event authority
 */
export function deriveDbcEventAuthority(): PublicKey {
    const [eventAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.EVENT_AUTHORITY)],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
    return eventAuthority
}

/**
 * Derive DAMM V1 event authority
 * @returns The event authority
 */
export function deriveDammV1EventAuthority(): PublicKey {
    const [eventAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.EVENT_AUTHORITY)],
        DAMM_V1_PROGRAM_ID
    )
    return eventAuthority
}

/**
 * Derive DAMM V2 event authority
 * @returns The event authority
 */
export function deriveDammV2EventAuthority(): PublicKey {
    const [eventAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.EVENT_AUTHORITY)],
        DAMM_V2_PROGRAM_ID
    )
    return eventAuthority
}

/**
 * Derive Locker event authority
 * @returns The event authority
 */
export function deriveLockerEventAuthority(): PublicKey {
    const [eventAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.EVENT_AUTHORITY)],
        LOCKER_PROGRAM_ID
    )
    return eventAuthority
}

/**
 * Derive DBC pool authority
 * @returns The pool authority
 */
export function deriveDbcPoolAuthority(): PublicKey {
    const [poolAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.POOL_AUTHORITY)],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )

    return poolAuthority
}

/**
 * Derive DAMM V1 pool authority
 * @returns The pool authority
 */
export function deriveDammV1PoolAuthority(): PublicKey {
    const [poolAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.POOL_AUTHORITY)],
        DAMM_V1_PROGRAM_ID
    )

    return poolAuthority
}

/**
 * Derive DAMM V2 pool authority
 * @returns The pool authority
 */
export function deriveDammV2PoolAuthority(): PublicKey {
    const [poolAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.POOL_AUTHORITY)],
        DAMM_V2_PROGRAM_ID
    )

    return poolAuthority
}

/**
 * Derive DBC pool address
 * @param quoteMint - The quote mint
 * @param baseMint - The base mint
 * @param config - The config
 * @returns The pool
 */
export function deriveDbcPoolAddress(
    quoteMint: PublicKey,
    baseMint: PublicKey,
    config: PublicKey
): PublicKey {
    const isQuoteMintBiggerThanBaseMint =
        new PublicKey(quoteMint)
            .toBuffer()
            .compare(new Uint8Array(new PublicKey(baseMint).toBuffer())) > 0

    const [pool] = PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.POOL),
            new PublicKey(config).toBuffer(),
            isQuoteMintBiggerThanBaseMint
                ? new PublicKey(quoteMint).toBuffer()
                : new PublicKey(baseMint).toBuffer(),
            isQuoteMintBiggerThanBaseMint
                ? new PublicKey(baseMint).toBuffer()
                : new PublicKey(quoteMint).toBuffer(),
        ],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )

    return pool
}

/**
 * Derive DAMM V1 pool address
 * @param config - The config
 * @param tokenAMint - The token A mint
 * @param tokenBMint - The token B mint
 * @returns The DAMM V1 pool address
 */
export function deriveDammV1PoolAddress(
    config: PublicKey,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            getFirstKey(tokenAMint, tokenBMint),
            getSecondKey(tokenAMint, tokenBMint),
            config.toBuffer(),
        ],
        DAMM_V1_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V2 pool address
 * @param config - The config
 * @param tokenAMint - The token A mint
 * @param tokenBMint - The token B mint
 * @returns The DAMM V2 pool address
 */
export function deriveDammV2PoolAddress(
    config: PublicKey,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.POOL),
            config.toBuffer(),
            getFirstKey(tokenAMint, tokenBMint),
            getSecondKey(tokenAMint, tokenBMint),
        ],
        DAMM_V2_PROGRAM_ID
    )[0]
}

/**
 * Derive mint metadata address
 * @param mint - The mint
 * @returns The mint metadata address
 */
export function deriveMintMetadata(mint: PublicKey): PublicKey {
    const [metadata] = PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.METADATA),
            METAPLEX_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        METAPLEX_PROGRAM_ID
    )

    return metadata
}

/**
 * Derive partner metadata
 * @param feeClaimer - The fee claimer
 * @returns The partner metadata
 */
export function derivePartnerMetadata(feeClaimer: PublicKey): PublicKey {
    const [partnerMetadata] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.PARTNER_METADATA), feeClaimer.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
    return partnerMetadata
}

/**
 * Derive DBC pool metadata
 * @param pool - The pool
 * @returns The DBC pool metadata
 */
export function deriveDbcPoolMetadata(pool: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.VIRTUAL_POOL_METADATA), pool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V1 migration metadata address
 * @param virtual_pool - The virtual pool
 * @returns The DAMM migration metadata address
 */
export function deriveDammV1MigrationMetadataAddress(
    virtual_pool: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.DAMM_V1_MIGRATION_METADATA), virtual_pool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V2 migration metadata address
 * @param virtual_pool - The virtual pool
 * @returns The DAMM migration metadata address
 */
export function deriveDammV2MigrationMetadataAddress(
    virtual_pool: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.DAMM_V2_MIGRATION_METADATA), virtual_pool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )[0]
}

/**
 * Derive DBC token vault address
 * @param pool - The pool
 * @param mint - The mint
 * @returns The token vault
 */
export function deriveDbcTokenVaultAddress(
    pool: PublicKey,
    mint: PublicKey
): PublicKey {
    const [tokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.TOKEN_VAULT), mint.toBuffer(), pool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )

    return tokenVault
}

/**
 * Derive DAMM V1 vault LP address
 * @param vault - The vault
 * @param pool - The pool
 * @returns The vault LP address
 */
export function deriveDammV1VaultLPAddress(
    vault: PublicKey,
    pool: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [vault.toBuffer(), pool.toBuffer()],
        DAMM_V1_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V2 token vault address
 * @param pool - The pool
 * @param mint - The mint
 * @returns The token vault
 */
export function deriveDammV2TokenVaultAddress(
    pool: PublicKey,
    mint: PublicKey
): PublicKey {
    const [tokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.TOKEN_VAULT), mint.toBuffer(), pool.toBuffer()],
        DAMM_V2_PROGRAM_ID
    )

    return tokenVault
}

/**
 * Derive vault address
 * @param mint - The mint
 * @param payer - The payer
 * @returns The vault address
 */
export function deriveVaultAddress(
    mint: PublicKey,
    payer: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.VAULT), mint.toBuffer(), payer.toBuffer()],
        VAULT_PROGRAM_ID
    )[0]
}

/**
 * Derive vault addresses
 * @param tokenMint - The token mint
 * @param seedBaseKey - The seed base key
 * @returns The vault PDAs
 */
export const deriveVaultPdas = (
    tokenMint: PublicKey,
    seedBaseKey?: PublicKey
) => {
    const [vault] = PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.VAULT),
            tokenMint.toBuffer(),
            (seedBaseKey ?? BASE_ADDRESS).toBuffer(),
        ],
        VAULT_PROGRAM_ID
    )

    const [tokenVault] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.TOKEN_VAULT), vault.toBuffer()],
        VAULT_PROGRAM_ID
    )
    const [lpMint] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.LP_MINT), vault.toBuffer()],
        VAULT_PROGRAM_ID
    )

    return {
        vaultPda: vault,
        tokenVaultPda: tokenVault,
        lpMintPda: lpMint,
    }
}

/**
 * Derive token vault address
 * @param vaultKey - The vault address
 * @returns The token vault address
 */
export function deriveTokenVaultKey(vaultKey: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.TOKEN_VAULT), vaultKey.toBuffer()],
        VAULT_PROGRAM_ID
    )[0]
}

/**
 * Derive Vault LP mint address
 * @param pool - The pool
 * @returns The Vault LP mint address
 */
export function deriveVaultLpMintAddress(pool: PublicKey) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.LP_MINT), pool.toBuffer()],
        VAULT_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V1 LP mint address
 * @param pool - The pool
 * @returns The LP mint address
 */
export function deriveDammV1LpMintAddress(pool: PublicKey) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.LP_MINT), pool.toBuffer()],
        DAMM_V1_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V2 position address
 * @param positionNft - The position NFT
 * @returns The DAMM V2 position address
 */
export function derivePositionAddress(positionNft: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.POSITION), positionNft.toBuffer()],
        DAMM_V2_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V2 position NFT account
 * @param positionNftMint - The position NFT mint
 * @returns The DAMM V2 position NFT account
 */
export function derivePositionNftAccount(
    positionNftMint: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.POSITION_NFT_ACCOUNT), positionNftMint.toBuffer()],
        DAMM_V2_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V1 lock escrow address
 * @param dammPool - The DAMM pool
 * @param creator - The creator of the virtual pool
 * @returns The lock escrow address
 */
export function deriveDammV1LockEscrowAddress(
    dammPool: PublicKey,
    creator: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.LOCK_ESCROW),
            dammPool.toBuffer(),
            creator.toBuffer(),
        ],
        DAMM_V1_PROGRAM_ID
    )[0]
}

/**
 * Derive DAMM V2 lock escrow address
 * @param dammPool - The DAMM pool
 * @param creator - The creator of the virtual pool
 * @returns The lock escrow address
 */
export function deriveDammV2LockEscrowAddress(
    dammPool: PublicKey,
    creator: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            Buffer.from(SEED.LOCK_ESCROW),
            dammPool.toBuffer(),
            creator.toBuffer(),
        ],
        DAMM_V2_PROGRAM_ID
    )[0]
}

/**
 * Derive escrow address
 * @param base - The base mint
 * @returns The escrow address
 */
export function deriveEscrow(base: PublicKey): PublicKey {
    const [escrow] = PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.ESCROW), base.toBuffer()],
        LOCKER_PROGRAM_ID
    )
    return escrow
}

/**
 * Derive DAMM V1 protocol fee address
 * @param mint - The mint
 * @param pool - The pool
 * @returns The protocol fee address
 */
export function deriveDammV1ProtocolFeeAddress(
    mint: PublicKey,
    pool: PublicKey
) {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.FEE), mint.toBuffer(), pool.toBuffer()],
        DAMM_V1_PROGRAM_ID
    )[0]
}

/**
 * Derive base key for the locker
 * @param virtualPool - The virtual pool
 * @returns The base key for the locker
 */
export function deriveBaseKeyForLocker(virtualPool: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from(SEED.BASE_LOCKER), virtualPool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )[0]
}
