import {
    fromLegacyPublicKey,
    fromLegacyTransactionInstruction,
} from '@solana/compat'
import {
    addSignersToTransactionMessage,
    appendTransactionMessageInstructions,
    compileTransactionMessage,
    createSolanaRpc,
    createSolanaRpcSubscriptions,
    createTransactionMessage,
    pipe,
    sendAndConfirmTransactionFactory,
    setTransactionMessageFeePayer,
    setTransactionMessageFeePayerSigner,
    setTransactionMessageLifetimeUsingBlockhash,
    signTransactionMessageWithSigners,
    type Blockhash,
    type TransactionSigner,
} from '@solana/kit'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { expect } from 'vitest'
import { createKitSignerFromLegacyKeypair } from '../../src/kit/helpers'
import type { KitTransactionPlan } from '../../src'
import { LOCALNET_RPC_URL } from './common'

const LOCALNET_WS_URL = 'ws://127.0.0.1:8900'

const rpc = createSolanaRpc(LOCALNET_RPC_URL)
const rpcSubscriptions = createSolanaRpcSubscriptions(LOCALNET_WS_URL)
const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc: rpc as never,
    rpcSubscriptions: rpcSubscriptions as never,
})

export { createKitSignerFromLegacyKeypair }

export async function executeKitPlan(
    plan: KitTransactionPlan,
    feePayer: TransactionSigner
): Promise<void> {
    const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        (transaction) =>
            setTransactionMessageFeePayerSigner(feePayer, transaction),
        (transaction) =>
            setTransactionMessageLifetimeUsingBlockhash(
                latestBlockhash,
                transaction
            ),
        (transaction) =>
            appendTransactionMessageInstructions(
                plan.instructions,
                transaction
            ),
        (transaction) =>
            addSignersToTransactionMessage(plan.signers, transaction)
    )

    const signedTransaction = await signTransactionMessageWithSigners(message)
    await sendAndConfirm(signedTransaction as never, {
        commitment: 'confirmed',
    })
}

export async function expectKitPlanToCompile(
    connection: Connection,
    plan: KitTransactionPlan,
    feePayer: PublicKey
): Promise<void> {
    const latestBlockhash = await connection.getLatestBlockhash()
    const message = pipe(
        createTransactionMessage({ version: 0 }),
        (transaction) =>
            setTransactionMessageFeePayer(
                fromLegacyPublicKey(feePayer),
                transaction
            ),
        (transaction) =>
            setTransactionMessageLifetimeUsingBlockhash(
                {
                    blockhash: latestBlockhash.blockhash as Blockhash,
                    lastValidBlockHeight: BigInt(
                        latestBlockhash.lastValidBlockHeight
                    ),
                },
                transaction
            ),
        (transaction) =>
            appendTransactionMessageInstructions(plan.instructions, transaction)
    )

    expect(compileTransactionMessage(message)).toBeDefined()
}

export async function expectKitPlanToMatchLegacyTransaction(
    connection: Connection,
    legacyTransaction: Transaction,
    plan: KitTransactionPlan,
    feePayer: PublicKey,
    expectedSigners: readonly TransactionSigner[] = []
): Promise<void> {
    expect(plan.instructions).toEqual(
        legacyTransaction.instructions.map(fromLegacyTransactionInstruction)
    )
    expect(plan.signers.map((signer) => signer.address).sort()).toEqual(
        expectedSigners.map((signer) => signer.address).sort()
    )

    await expectKitPlanToCompile(connection, plan, feePayer)
}
