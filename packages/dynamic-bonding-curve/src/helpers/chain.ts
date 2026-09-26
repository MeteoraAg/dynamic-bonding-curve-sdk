import { ActivationType } from '../types'
import BN from 'bn.js'
import { Commitment, Connection, PublicKey } from '@solana/web3.js'
import type { DynamicBondingCurve } from '../idl/dynamic-bonding-curve/idl'
import { Program } from '@coral-xyz/anchor'
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
 * Generic account fetch helper
 * @param accountAddress - The address of the account to fetch
 * @param accountType - The type of account to fetch from program.account
 * @param program - The program instance
 * @param commitment - The commitment level
 * @returns The fetched account data
 */
export async function getAccountData<T>(
    accountAddress: PublicKey | string,
    accountType: keyof Program<DynamicBondingCurve>['account'],
    program: Program<DynamicBondingCurve>,
    commitment: Commitment
): Promise<T> {
    const address =
        accountAddress instanceof PublicKey
            ? accountAddress
            : new PublicKey(accountAddress)

    return (await program.account[accountType].fetchNullable(
        address,
        commitment
    )) as T
}

/**
 * Get creation timestamp for an account
 * @param accountAddress - The address of the account
 * @param connection - The Solana connection instance
 * @returns The creation timestamp as a Date object, or undefined if not found
 */
export async function getAccountCreationTimestamp(
    accountAddress: PublicKey | string,
    connection: Connection
): Promise<Date | undefined> {
    const address =
        accountAddress instanceof PublicKey
            ? accountAddress
            : new PublicKey(accountAddress)

    const signatures = await connection.getSignaturesForAddress(address, {
        limit: 1,
    })

    return signatures[0]?.blockTime
        ? new Date(signatures[0].blockTime * 1000)
        : undefined
}

/**
 * Get creation timestamps for multiple accounts
 * @param accountAddresses - Array of account addresses
 * @param connection - The Solana connection instance
 * @returns Array of creation timestamps corresponding to the input addresses
 */
export async function getAccountCreationTimestamps(
    accountAddresses: (PublicKey | string)[],
    connection: Connection
): Promise<(Date | undefined)[]> {
    const timestampPromises = accountAddresses.map((address) =>
        getAccountCreationTimestamp(address, connection)
    )
    return Promise.all(timestampPromises)
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
