import { AccountMeta, PublicKey } from '@solana/web3.js'
import {
    BASE_ADDRESS,
    DAMM_V1_PROGRAM_ID,
    DAMM_V2_PROGRAM_ID,
    LOCKER_PROGRAM_ID,
    METAPLEX_PROGRAM_ID,
    VAULT_PROGRAM_ID,
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
} from '../constants'

// pool seeds order the two mints by bytes, larger first
function getFirstKey(key1: PublicKey, key2: PublicKey): Buffer {
    return Buffer.compare(key1.toBuffer(), key2.toBuffer()) === 1
        ? key1.toBuffer()
        : key2.toBuffer()
}

function getSecondKey(key1: PublicKey, key2: PublicKey): Buffer {
    return Buffer.compare(key1.toBuffer(), key2.toBuffer()) === 1
        ? key2.toBuffer()
        : key1.toBuffer()
}

const SEED = Object.freeze({
    POOL_AUTHORITY: 'pool_authority',
    EVENT_AUTHORITY: '__event_authority',
    POOL: 'pool',
    TOKEN_VAULT: 'token_vault',
    METADATA: 'metadata',
    PARTNER_METADATA: 'partner_metadata',
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
    TOKEN_BADGE: 'token_badge',
})

function pda(seeds: (Buffer | Uint8Array)[], programId: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, programId)[0]
}

export function deriveDbcEventAuthority(): PublicKey {
    return pda(
        [Buffer.from(SEED.EVENT_AUTHORITY)],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

export function deriveDammV2EventAuthority(): PublicKey {
    return pda([Buffer.from(SEED.EVENT_AUTHORITY)], DAMM_V2_PROGRAM_ID)
}

export function deriveLockerEventAuthority(): PublicKey {
    return pda([Buffer.from(SEED.EVENT_AUTHORITY)], LOCKER_PROGRAM_ID)
}

export function deriveDbcPoolAuthority(): PublicKey {
    return pda(
        [Buffer.from(SEED.POOL_AUTHORITY)],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

export function deriveDammV2PoolAuthority(): PublicKey {
    return pda([Buffer.from(SEED.POOL_AUTHORITY)], DAMM_V2_PROGRAM_ID)
}

/** Seeds: "pool", config, then the two mints ordered larger first. */
export function deriveDbcPoolAddress(
    quoteMint: PublicKey,
    baseMint: PublicKey,
    config: PublicKey
): PublicKey {
    return pda(
        [
            Buffer.from(SEED.POOL),
            config.toBuffer(),
            getFirstKey(quoteMint, baseMint),
            getSecondKey(quoteMint, baseMint),
        ],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

export function deriveDammV1PoolAddress(
    config: PublicKey,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey
): PublicKey {
    return pda(
        [
            getFirstKey(tokenAMint, tokenBMint),
            getSecondKey(tokenAMint, tokenBMint),
            config.toBuffer(),
        ],
        DAMM_V1_PROGRAM_ID
    )
}

export function deriveDammV2PoolAddress(
    config: PublicKey,
    tokenAMint: PublicKey,
    tokenBMint: PublicKey
): PublicKey {
    return pda(
        [
            Buffer.from(SEED.POOL),
            config.toBuffer(),
            getFirstKey(tokenAMint, tokenBMint),
            getSecondKey(tokenAMint, tokenBMint),
        ],
        DAMM_V2_PROGRAM_ID
    )
}

/** The Metaplex metadata account of a mint. */
export function deriveMintMetadata(mint: PublicKey): PublicKey {
    return pda(
        [
            Buffer.from(SEED.METADATA),
            METAPLEX_PROGRAM_ID.toBuffer(),
            mint.toBuffer(),
        ],
        METAPLEX_PROGRAM_ID
    )
}

export function derivePartnerMetadata(feeClaimer: PublicKey): PublicKey {
    return pda(
        [Buffer.from(SEED.PARTNER_METADATA), feeClaimer.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

export function deriveDbcPoolMetadata(pool: PublicKey): PublicKey {
    return pda(
        [Buffer.from(SEED.VIRTUAL_POOL_METADATA), pool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

export function deriveDammV1MigrationMetadataAddress(
    virtualPool: PublicKey
): PublicKey {
    return pda(
        [Buffer.from(SEED.DAMM_V1_MIGRATION_METADATA), virtualPool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

export function deriveDammV2MigrationMetadataAddress(
    virtualPool: PublicKey
): PublicKey {
    return pda(
        [Buffer.from(SEED.DAMM_V2_MIGRATION_METADATA), virtualPool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

export function deriveDbcTokenVaultAddress(
    pool: PublicKey,
    mint: PublicKey
): PublicKey {
    return pda(
        [Buffer.from(SEED.TOKEN_VAULT), mint.toBuffer(), pool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

/** The DAMM v1 pool's LP account in a dynamic vault. */
export function deriveDammV1VaultLPAddress(
    vault: PublicKey,
    pool: PublicKey
): PublicKey {
    return pda([vault.toBuffer(), pool.toBuffer()], DAMM_V1_PROGRAM_ID)
}

export function deriveDammV2TokenVaultAddress(
    pool: PublicKey,
    mint: PublicKey
): PublicKey {
    return pda(
        [Buffer.from(SEED.TOKEN_VAULT), mint.toBuffer(), pool.toBuffer()],
        DAMM_V2_PROGRAM_ID
    )
}

/** The dynamic vault of a mint and its token vault and LP mint. */
export const deriveVaultPdas = (
    tokenMint: PublicKey,
    seedBaseKey: PublicKey = BASE_ADDRESS
): { vaultPda: PublicKey; tokenVaultPda: PublicKey; lpMintPda: PublicKey } => {
    const vaultPda = pda(
        [Buffer.from(SEED.VAULT), tokenMint.toBuffer(), seedBaseKey.toBuffer()],
        VAULT_PROGRAM_ID
    )
    return {
        vaultPda,
        tokenVaultPda: pda(
            [Buffer.from(SEED.TOKEN_VAULT), vaultPda.toBuffer()],
            VAULT_PROGRAM_ID
        ),
        lpMintPda: pda(
            [Buffer.from(SEED.LP_MINT), vaultPda.toBuffer()],
            VAULT_PROGRAM_ID
        ),
    }
}

export function deriveDammV1LpMintAddress(pool: PublicKey): PublicKey {
    return pda([Buffer.from(SEED.LP_MINT), pool.toBuffer()], DAMM_V1_PROGRAM_ID)
}

export function derivePositionAddress(positionNft: PublicKey): PublicKey {
    return pda(
        [Buffer.from(SEED.POSITION), positionNft.toBuffer()],
        DAMM_V2_PROGRAM_ID
    )
}

export function derivePositionNftAccount(
    positionNftMint: PublicKey
): PublicKey {
    return pda(
        [Buffer.from(SEED.POSITION_NFT_ACCOUNT), positionNftMint.toBuffer()],
        DAMM_V2_PROGRAM_ID
    )
}

export function deriveDammV1LockEscrowAddress(
    dammPool: PublicKey,
    owner: PublicKey
): PublicKey {
    return pda(
        [Buffer.from(SEED.LOCK_ESCROW), dammPool.toBuffer(), owner.toBuffer()],
        DAMM_V1_PROGRAM_ID
    )
}

/** The locker escrow for a base key, see deriveBaseKeyForLocker. */
export function deriveLockerEscrowAddress(base: PublicKey): PublicKey {
    return pda([Buffer.from(SEED.ESCROW), base.toBuffer()], LOCKER_PROGRAM_ID)
}

export function deriveDammV1ProtocolFeeAddress(
    mint: PublicKey,
    pool: PublicKey
): PublicKey {
    return pda(
        [Buffer.from(SEED.FEE), mint.toBuffer(), pool.toBuffer()],
        DAMM_V1_PROGRAM_ID
    )
}

/** The base key the program uses for a pool's locker escrow. */
export function deriveBaseKeyForLocker(virtualPool: PublicKey): PublicKey {
    return pda(
        [Buffer.from(SEED.BASE_LOCKER), virtualPool.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

/**
 * The DBC token badge of a mint. Passed as remaining account 0 when creating
 * a config or pool whose quote mint is not permissionless-supported.
 */
export function deriveTokenBadgeAddress(tokenMint: PublicKey): PublicKey {
    return pda(
        [Buffer.from(SEED.TOKEN_BADGE), tokenMint.toBuffer()],
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )
}

/** Remaining accounts for the optional DBC token badge (index 0). */
export function getTokenBadgeRemainingAccounts(
    tokenBadge?: PublicKey
): AccountMeta[] {
    return tokenBadge
        ? [{ pubkey: tokenBadge, isSigner: false, isWritable: false }]
        : []
}
