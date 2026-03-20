import {
    fromLegacyKeypair,
    fromLegacyTransactionInstruction,
} from '@solana/compat'
import {
    type Address,
    createSignerFromKeyPair,
    isTransactionSigner,
    type KeyPairSigner,
    type TransactionSigner,
} from '@solana/kit'
import { Keypair, PublicKey, Transaction } from '@solana/web3.js'
import type {
    KitAddressOrSignerInput,
    KitTransactionPlan,
} from './types'

export function toLegacyPublicKey(
    value: KitAddressOrSignerInput | PublicKey
): PublicKey {
    if (value instanceof PublicKey) {
        return value
    }

    if (isKitTransactionSigner(value)) {
        return new PublicKey(value.address)
    }

    return new PublicKey(value.toString())
}

export function toLegacyOptionalPublicKey(
    value: KitAddressOrSignerInput | PublicKey | null | undefined
): PublicKey | null | undefined {
    if (value === null) {
        return null
    }

    if (value === undefined) {
        return undefined
    }

    return toLegacyPublicKey(value)
}

export function collectKitTransactionSigners(
    ...values: readonly unknown[]
): TransactionSigner[] {
    const uniqueSigners = new Map<string, TransactionSigner>()

    for (const value of values) {
        collectKitTransactionSignersFromValue(value, uniqueSigners)
    }

    return [...uniqueSigners.values()]
}

export function createKitTransactionPlan(
    transaction: Transaction,
    signers: readonly TransactionSigner[] = []
): KitTransactionPlan {
    const requiredSignerAddresses = new Set(
        transaction.instructions.flatMap((instruction) =>
            instruction.keys
                .filter((account) => account.isSigner)
                .map((account) => account.pubkey.toBase58())
        )
    )

    return {
        instructions: transaction.instructions.map(
            fromLegacyTransactionInstruction
        ),
        signers: collectKitTransactionSigners(
            signers.filter((signer) =>
                requiredSignerAddresses.has(signer.address)
            )
        ),
    }
}

export async function createKitSignerFromLegacyKeypair(
    keypair: Keypair
): Promise<KeyPairSigner> {
    return createSignerFromKeyPair(await fromLegacyKeypair(keypair))
}

function collectKitTransactionSignersFromValue(
    value: unknown,
    signers: Map<string, TransactionSigner>
): void {
    if (value == null) {
        return
    }

    if (Array.isArray(value)) {
        for (const item of value) {
            collectKitTransactionSignersFromValue(item, signers)
        }
        return
    }

    if (isKitTransactionSigner(value)) {
        signers.set(value.address, value)
    }
}

function isKitTransactionSigner(value: unknown): value is TransactionSigner {
    return (
        value != null &&
        typeof value === 'object' &&
        'address' in value &&
        isTransactionSigner(
            value as {
                [key: string]: unknown
                address: Address
            }
        )
    )
}
