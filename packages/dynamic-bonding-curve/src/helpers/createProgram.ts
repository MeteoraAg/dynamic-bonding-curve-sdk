import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { Commitment, type Connection } from '@solana/web3.js'
import DynamicBondingCurveIDL from '../idl/dynamic-bonding-curve/idl.json'
import type { Vault } from '../idl/dynamic-vault/idl'
import DynamicVaultIDL from '../idl/dynamic-vault/idl.json'
import type { Amm } from '../idl/damm-v1/idl'
import DammV1IDL from '../idl/damm-v1/idl.json'
import type { DynamicBondingCurve } from '../idl/dynamic-bonding-curve/idl'
import { CpAmm } from '../idl/damm-v2/idl'
import DammV2IDL from '../idl/damm-v2/idl.json'

/**
 * Create an Anchor client for the DBC program.
 */
export function createDbcProgram(
    connection: Connection,
    commitment: Commitment = 'confirmed'
) {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })
    const program = new Program<DynamicBondingCurve>(
        DynamicBondingCurveIDL,
        provider
    )

    return { program }
}

/**
 * Create an Anchor client for the Dynamic Vault program.
 */
export function createDynamicVaultProgram(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<Vault> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })

    const program = new Program<Vault>(DynamicVaultIDL, provider)
    return program
}

/**
 * Create an Anchor client for the DAMM V1 program.
 */
export function createDammV1Program(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<Amm> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })

    const program = new Program<Amm>(DammV1IDL, provider)
    return program
}

/**
 * Create an Anchor client for the DAMM V2 program.
 */
export function createDammV2Program(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<CpAmm> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })

    const program = new Program<CpAmm>(DammV2IDL, provider)
    return program
}
