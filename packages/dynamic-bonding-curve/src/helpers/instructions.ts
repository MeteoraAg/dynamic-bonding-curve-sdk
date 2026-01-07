import {
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} from '@solana/web3.js'
import { DynamicVault } from '../idl/dynamic-vault/idl'
import { Program } from '@coral-xyz/anchor'
import {
    deriveTokenVaultKey,
    deriveVaultAddress,
    deriveVaultLpMintAddress,
} from './pda'
import { BASE_ADDRESS } from '../constants'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { DammV1 } from '../idl/damm-v1/idl'

/**
 * Create a permissionless dynamic vault instruction
 * @param mint - The mint of the vault
 * @param payer - The payer of the vault
 * @param vaultProgram - The vault program
 * @returns The vault key, token vault key, and lp mint key
 */
export async function createInitializePermissionlessDynamicVaultIx(
    mint: PublicKey,
    payer: PublicKey,
    vaultProgram: Program<DynamicVault>
): Promise<{
    vaultKey: PublicKey
    tokenVaultKey: PublicKey
    lpMintKey: PublicKey
    instruction: TransactionInstruction
}> {
    const vaultKey = deriveVaultAddress(mint, BASE_ADDRESS)

    const tokenVaultKey = deriveTokenVaultKey(vaultKey)

    const lpMintKey = deriveVaultLpMintAddress(vaultKey)

    const ix = await vaultProgram.methods
        .initialize()
        .accountsPartial({
            vault: vaultKey,
            tokenVault: tokenVaultKey,
            tokenMint: mint,
            lpMint: lpMintKey,
            payer,
            rent: SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction()

    return {
        instruction: ix,
        vaultKey,
        tokenVaultKey,
        lpMintKey,
    }
}

/**
 * Create a lock escrow instruction
 * @param connection - The connection to the Solana network
 * @param payer - The payer of the lock escrow
 * @param pool - The pool address
 * @param lpMint - The lp mint address
 * @param escrowOwner - The owner of the escrow
 * @param lockEscrowKey - The lock escrow key
 * @param dammV1Program - The DAMM V1 program
 * @returns The lock escrow instruction
 */
export async function createLockEscrowIx(
    payer: PublicKey,
    pool: PublicKey,
    lpMint: PublicKey,
    escrowOwner: PublicKey,
    lockEscrowKey: PublicKey,
    dammV1Program: Program<DammV1>
): Promise<TransactionInstruction> {
    const ix = await dammV1Program.methods
        .createLockEscrow()
        .accountsPartial({
            pool,
            lpMint,
            owner: escrowOwner,
            lockEscrow: lockEscrowKey,
            payer: payer,
            systemProgram: SystemProgram.programId,
        })
        .instruction()

    return ix
}
