import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'

export const connection = new Connection('http://127.0.0.1:8899')

// airdrop SOL to a given public key and confirms the transaction
export async function fundSol(
    connection: Connection,
    pubkey: PublicKey,
    solAmount: number = 10
): Promise<void> {
    const sig = await connection.requestAirdrop(
        pubkey,
        solAmount * LAMPORTS_PER_SOL
    )
    const latestBlockhash = await connection.getLatestBlockhash()
    await connection.confirmTransaction(
        {
            signature: sig,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
    )
}

// helper function to convert BN values to decimal strings
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
