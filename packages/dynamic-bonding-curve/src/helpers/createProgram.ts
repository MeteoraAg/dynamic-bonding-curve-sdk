import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { Commitment, type Connection } from '@solana/web3.js'
import DynamicBondingCurveIDL from '../idl/dynamic-bonding-curve/idl.json'
import type { Vault } from '../idl/dynamic-vault/idl'
import DynamicVaultIDL from '../idl/dynamic-vault/idl.json'
import type { Amm } from '../idl/damm-v1/idl'
import DammV1IDL from '../idl/damm-v1/idl.json'
import type { DynamicBondingCurve } from '../idl/dynamic-bonding-curve/idl'
import type { CpAmm } from '../idl/damm-v2/idl'
import DammV2IDL from '../idl/damm-v2/idl.json'

// The SDK builds transactions and never signs, so the provider has no wallet.
function readOnlyProvider(
    connection: Connection,
    commitment: Commitment
): AnchorProvider {
    return new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })
}

/** An Anchor client for the DBC program. */
export function createDbcProgram(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<DynamicBondingCurve> {
    return new Program<DynamicBondingCurve>(
        DynamicBondingCurveIDL,
        readOnlyProvider(connection, commitment)
    )
}

export function createDynamicVaultProgram(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<Vault> {
    return new Program<Vault>(
        DynamicVaultIDL,
        readOnlyProvider(connection, commitment)
    )
}

export function createDammV1Program(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<Amm> {
    return new Program<Amm>(DammV1IDL, readOnlyProvider(connection, commitment))
}

export function createDammV2Program(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<CpAmm> {
    return new Program<CpAmm>(
        DammV2IDL,
        readOnlyProvider(connection, commitment)
    )
}
