import {
    clusterApiUrl,
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js'
import { BanksClient, start, startAnchor } from 'solana-bankrun'
import {
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
    METAPLEX_PROGRAM_ID,
    DAMM_V1_PROGRAM_ID,
    VAULT_PROGRAM_ID,
    DAMM_V2_PROGRAM_ID,
    LOCKER_PROGRAM_ID,
} from '../../src/constants'
import {
    ACCOUNT_SIZE,
    AccountLayout,
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import { DynamicBondingCurve } from '../../src/idl/dynamic-bonding-curve/idl'
import DynamicBondingCurveIDL from '../../src/idl/dynamic-bonding-curve/idl.json'
import {
    DynamicBondingCurveClient,
    DynamicBondingCurveProgram,
} from '../../src'
import BN from 'bn.js'

export const LOCAL_ADMIN_KEYPAIR = Keypair.fromSecretKey(
    Uint8Array.from([
        230, 207, 238, 109, 95, 154, 47, 93, 183, 250, 147, 189, 87, 15, 117,
        184, 44, 91, 94, 231, 126, 140, 238, 134, 29, 58, 8, 182, 88, 22, 113,
        234, 8, 234, 192, 109, 87, 125, 190, 55, 129, 173, 227, 8, 104, 201,
        104, 13, 31, 178, 74, 80, 54, 14, 77, 78, 226, 57, 47, 122, 166, 165,
        57, 144,
    ])
)

export async function startTest() {
    return start(
        [
            {
                name: 'dynamic_bonding_curve',
                programId: new PublicKey(DYNAMIC_BONDING_CURVE_PROGRAM_ID),
            },
            {
                name: 'cp_amm',
                programId: new PublicKey(DAMM_V2_PROGRAM_ID),
            },
            {
                name: 'amm',
                programId: new PublicKey(DAMM_V1_PROGRAM_ID),
            },
            {
                name: 'locker',
                programId: new PublicKey(LOCKER_PROGRAM_ID),
            },
            {
                name: 'metaplex',
                programId: new PublicKey(METAPLEX_PROGRAM_ID),
            },
            {
                name: 'vault',
                programId: new PublicKey(VAULT_PROGRAM_ID),
            },
        ],
        [
            {
                address: LOCAL_ADMIN_KEYPAIR.publicKey,
                info: {
                    executable: false,
                    owner: SystemProgram.programId,
                    lamports: LAMPORTS_PER_SOL * 100,
                    data: new Uint8Array(),
                },
            },
        ]
    )
}

export async function fundSol(
    banksClient: BanksClient,
    from: Keypair,
    receivers: PublicKey[]
) {
    const instructions: TransactionInstruction[] = []
    for (const receiver of receivers) {
        instructions.push(
            SystemProgram.transfer({
                fromPubkey: from.publicKey,
                toPubkey: receiver,
                lamports: BigInt(10 * LAMPORTS_PER_SOL),
            })
        )
    }

    let transaction = new Transaction()
    const latestBlockhash = await banksClient.getLatestBlockhash()
    if (!latestBlockhash) {
        throw new Error('Failed to get recent blockhash')
    }
    const [recentBlockhash] = latestBlockhash
    transaction.recentBlockhash = recentBlockhash
    transaction.add(...instructions)
    transaction.sign(from)

    await banksClient.processTransaction(transaction)
}

export async function processTransactionMaybeThrow(
    banksClient: BanksClient,
    transaction: Transaction
) {
    const transactionMeta = await banksClient.tryProcessTransaction(transaction)
    if (transactionMeta.result && transactionMeta.result.length > 0) {
        throw Error(transactionMeta.result)
    }
}

export async function expectThrowsAsync(
    fn: () => Promise<void>,
    errorMessage: String
) {
    try {
        await fn()
    } catch (err) {
        if (!(err instanceof Error)) {
            throw err
        } else {
            if (
                !err.message.toLowerCase().includes(errorMessage.toLowerCase())
            ) {
                throw new Error(
                    `Unexpected error: ${err.message}. Expected error: ${errorMessage}`
                )
            }
            return
        }
    }
    throw new Error("Expected an error but didn't get one")
}

export async function createUsersAndFund(
    banksClient: BanksClient,
    payer: Keypair,
    user?: Keypair
): Promise<Keypair> {
    if (!user) {
        user = Keypair.generate()
    }

    await fundSol(banksClient, payer, [user.publicKey])

    return user
}
