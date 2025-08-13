import { ComputeBudgetProgram, Signer, Transaction } from '@solana/web3.js'
import BN from 'bn.js'
import { BanksClient } from 'solana-bankrun'
import { processTransactionMaybeThrow } from './bankrun'

export async function executeTransaction(
    banksClient: BanksClient,
    transaction: Transaction,
    signers: Signer[]
) {
    transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({
            units: 400_000,
        })
    )
    const latestBlockhash = await banksClient.getLatestBlockhash()
    if (!latestBlockhash) {
        throw new Error('Failed to get latest blockhash')
    }
    transaction.recentBlockhash = latestBlockhash[0]
    transaction.sign(...signers)

    await processTransactionMaybeThrow(banksClient, transaction)
}

// Helper function to convert BN values to decimal strings
export function convertBNToDecimal<T>(obj: T): T {
    if (obj instanceof BN) {
        return obj.toString(10) as T
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => convertBNToDecimal(item)) as T
    }
    if (obj && typeof obj === 'object') {
        const result = {} as T
        for (const key in obj) {
            result[key] = convertBNToDecimal(obj[key])
        }
        return result
    }
    return obj
}

// Q64.64 format helper
export const Q = (n: number) => {
    const bigIntValue = BigInt(Math.floor(n * 2 ** 64))
    return new BN(bigIntValue.toString())
}
