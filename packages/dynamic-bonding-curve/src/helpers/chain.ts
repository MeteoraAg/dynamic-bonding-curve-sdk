import { ActivationType } from '../types'
import BN from 'bn.js'
import { Connection, PublicKey } from '@solana/web3.js'
import { convertToLamports } from './utils'
import { getTokenDecimals } from './token'
/**
 * Get the first key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The first key
 */
export function getFirstKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf1
    }
    return buf2
}

/**
 * Get the second key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The second key
 */
export function getSecondKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf2
    }
    return buf1
}

/**
 * Get the current point based on activation type
 * @param connection - The Solana connection instance
 * @param activationType - The activation type (Slot or Time)
 * @returns The current point as a BN
 */
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

/**
 * Prepare the swap amount param
 * @param amount - The amount to swap
 * @param mintAddress - The mint address
 * @param connection - The Solana connection instance
 * @returns The amount in lamports
 */
export async function prepareSwapAmountParam(
    amount: number,
    mintAddress: PublicKey,
    connection: Connection
): Promise<BN> {
    const mintTokenDecimals = await getTokenDecimals(connection, mintAddress)

    return convertToLamports(amount, mintTokenDecimals)
}
