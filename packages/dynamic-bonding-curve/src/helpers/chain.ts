import { ActivationType } from '../types'
import BN from 'bn.js'
import { Connection, PublicKey } from '@solana/web3.js'
import { convertToLamports } from './utils'
import { getTokenDecimals } from './token'

/** The current slot, or the block time of the current slot, depending on activationType. */
export async function getCurrentPoint(
    connection: Connection,
    activationType: ActivationType
): Promise<BN> {
    const currentSlot = await connection.getSlot()
    if (activationType === ActivationType.Slot) {
        return new BN(currentSlot)
    }

    const currentTime = await connection.getBlockTime(currentSlot)
    if (currentTime === null) {
        throw new Error(`Block time is unavailable for slot ${currentSlot}`)
    }
    return new BN(currentTime)
}

/** Convert a UI amount to lamports using the mint's on-chain decimals. */
export async function prepareSwapAmountParam(
    amount: number,
    mintAddress: PublicKey,
    connection: Connection
): Promise<BN> {
    return convertToLamports(
        amount,
        await getTokenDecimals(connection, mintAddress)
    )
}
