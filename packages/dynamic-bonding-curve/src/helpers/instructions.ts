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

/** The instruction that initializes the permissionless dynamic vault of a mint at its derived addresses. */
export function createInitializePermissionlessDynamicVaultIx(
    mint: PublicKey,
    pdas: ReturnType<typeof deriveVaultPdas>,
    payer: PublicKey,
    vaultProgram: Program<Vault>
): Promise<TransactionInstruction> {
    return vaultProgram.methods
        .initialize()
        .accountsPartial({
            vault: pdas.vaultPda,
            tokenVault: pdas.tokenVaultPda,
            tokenMint: mint,
            lpMint: pdas.lpMintPda,
            payer,
            rent: SYSVAR_RENT_PUBKEY,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .instruction()
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
