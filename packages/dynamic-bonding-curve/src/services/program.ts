import {
    Commitment,
    Connection,
    PublicKey,
    TransactionInstruction,
} from '@solana/web3.js'
import {
    createDbcProgram,
    deriveDbcPoolAuthority,
    getOrCreateATAInstruction,
} from '../helpers'
import type { Program, ProgramAccount } from '@coral-xyz/anchor'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'

export class DynamicBondingCurveProgram {
    protected program: Program<DynamicBondingCurveIDL>
    protected connection: Connection
    protected poolAuthority: PublicKey
    protected commitment: Commitment

    constructor(connection: Connection, commitment: Commitment) {
        const { program } = createDbcProgram(connection, commitment)
        this.program = program
        this.connection = connection
        this.poolAuthority = deriveDbcPoolAuthority()
        this.commitment = commitment
    }

    protected async prepareTokenAccounts(
        owner: PublicKey,
        tokenAMint: PublicKey,
        tokenBMint: PublicKey,
        tokenAProgram: PublicKey,
        tokenBProgram: PublicKey
    ): Promise<{
        ataTokenA: PublicKey
        ataTokenB: PublicKey
        instructions: TransactionInstruction[]
    }> {
        const instructions: TransactionInstruction[] = []
        const [
            { ataPubkey: ataTokenA, ix: createAtaTokenAIx },
            { ataPubkey: ataTokenB, ix: createAtaTokenBIx },
        ] = await Promise.all([
            getOrCreateATAInstruction(
                this.connection,
                tokenAMint,
                owner,
                owner,
                true,
                tokenAProgram
            ),
            getOrCreateATAInstruction(
                this.connection,
                tokenBMint,
                owner,
                owner,
                true,
                tokenBProgram
            ),
        ])
        createAtaTokenAIx && instructions.push(createAtaTokenAIx)
        createAtaTokenBIx && instructions.push(createAtaTokenBIx)

        return { ataTokenA, ataTokenB, instructions }
    }

    /**
     * Get the underlying program instance
     * @returns The program instance
     */
    getProgram(): Program<DynamicBondingCurveIDL> {
        return this.program
    }
}
