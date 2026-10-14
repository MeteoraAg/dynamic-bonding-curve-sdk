import {
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} from '@solana/web3.js'
import { Vault } from '../idl/dynamic-vault/idl'
import { Program } from '@coral-xyz/anchor'
import { deriveVaultPdas } from './pda'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Amm } from '../idl/damm-v1/idl'

/** The instruction that initializes the permissionless dynamic vault of a mint, with its addresses. */
export async function createInitializePermissionlessDynamicVaultIx(
    mint: PublicKey,
    payer: PublicKey,
    vaultProgram: Program<Vault>
): Promise<{
    vaultKey: PublicKey
    tokenVaultKey: PublicKey
    lpMintKey: PublicKey
    instruction: TransactionInstruction
}> {
    const { vaultPda, tokenVaultPda, lpMintPda } = deriveVaultPdas(mint)
    const instruction = await vaultProgram.methods
        .initialize()
        .accountsPartial({
            vault: vaultPda,
            tokenVault: tokenVaultPda,
            tokenMint: mint,
            lpMint: lpMintPda,
            payer,
            rent: SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction()

    return {
        instruction,
        vaultKey: vaultPda,
        tokenVaultKey: tokenVaultPda,
        lpMintKey: lpMintPda,
    }
}

/** The DAMM v1 instruction that creates a lock escrow for an owner. */
export function createLockEscrowIx(
    payer: PublicKey,
    pool: PublicKey,
    lpMint: PublicKey,
    escrowOwner: PublicKey,
    lockEscrowKey: PublicKey,
    dammV1Program: Program<Amm>
): Promise<TransactionInstruction> {
    return dammV1Program.methods
        .createLockEscrow()
        .accountsPartial({
            pool,
            lpMint,
            owner: escrowOwner,
            lockEscrow: lockEscrowKey,
            payer,
            systemProgram: SystemProgram.programId,
        })
        .instruction()
}
