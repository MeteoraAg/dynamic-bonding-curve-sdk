import { Commitment, Transaction, type Connection } from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import { deriveDbcPoolAuthority } from '../helpers'
import { StateService } from './state'
import { TREASURY_ADDRESS } from '../constants'

export class AdminService extends DynamicBondingCurveProgram {
    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
    }

    /**
     * Withdraw lamports (SOL) from the pool authority PDA and send them to the treasury.
     * @returns A transaction that withdraws lamports from authority to the treasury
     */
    async withdrawLamportsFromAuthority(): Promise<Transaction> {
        const poolAuthority = deriveDbcPoolAuthority()

        return this.program.methods
            .withdrawLamportsFromPoolAuthority()
            .accountsPartial({
                poolAuthority,
                receiver: TREASURY_ADDRESS,
            })
            .transaction()
    }
}
