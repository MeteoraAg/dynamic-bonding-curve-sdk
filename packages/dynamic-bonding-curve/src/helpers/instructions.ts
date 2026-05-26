import {
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
} from '@solana/web3.js'
import { Vault } from '../idl/dynamic-vault/idl'
import { Program } from '@coral-xyz/anchor'
import {
    deriveTokenVaultKey,
    deriveVaultAddress,
    deriveVaultLpMintAddress,
} from './pda'
import { BASE_ADDRESS } from '../constants'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { Amm } from '../idl/damm-v1/idl'

/**
 * Build the instruction and derived addresses for a permissionless dynamic vault.
 */
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
 * Build the DAMM V1 lock escrow instruction.
 */
export async function createLockEscrowIx(
    payer: PublicKey,
    pool: PublicKey,
    lpMint: PublicKey,
    escrowOwner: PublicKey,
    lockEscrowKey: PublicKey,
    dammV1Program: Program<Amm>
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
