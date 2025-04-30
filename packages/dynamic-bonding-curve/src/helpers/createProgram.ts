import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { Commitment, type Connection } from '@solana/web3.js'
import DynamicBondingCurveIDL from '../idl/dynamic-bonding-curve/idl.json'
import type { DynamicVault } from '../idl/dynamic-vault/idl'
import DynamicVaultIDL from '../idl/dynamic-vault/idl.json'
import type { DammV1 } from '../idl/damm-v1/idl'
import DammV1IDL from '../idl/damm-v1/idl.json'
import type { DynamicBondingCurve } from '../idl/dynamic-bonding-curve/idl'
import { DammV2 } from '../idl/damm-v2/idl'
import DammV2IDL from '../idl/damm-v2/idl.json'

/**
 * Create a program instance
 * @param connection - The connection to the network
 * @returns The program instance
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
 * Create a vault program instance
 * @param connection - The connection to the network
 * @returns The vault program instance
 */
export function createVaultProgram(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<DynamicVault> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })

    const program = new Program<DynamicVault>(DynamicVaultIDL, provider)
    return program
}

/**
 * Create a DAMM V1 program instance
 * @param connection - The connection to the network
 * @returns The DAMM V1 program instance
 */
export function createDammV1Program(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<DammV1> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })

    const program = new Program<DammV1>(DammV1IDL, provider)
    return program
}

export function createDammV2Program(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<DammV2> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })

    const program = new Program<DammV2>(DammV2IDL, provider)
    return program
}
