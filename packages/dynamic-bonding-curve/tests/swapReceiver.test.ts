import {
    Keypair,
    PublicKey,
    Connection,
    sendAndConfirmTransaction,
    Transaction,
} from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    SwapMode,
} from '../src'
import { BN } from 'bn.js'
import { getAssociatedTokenAddressSync, NATIVE_MINT } from '@solana/spl-token'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

async function tokenBalance(account: PublicKey): Promise<bigint | null> {
    const info = await connection.getAccountInfo(account)
    if (!info) return null
    const { value } = await connection.getTokenAccountBalance(account)
    return BigInt(value.amount)
}

function signers(tx: Transaction): string[] {
    return tx.signatures.map((s) => s.publicKey.toBase58())
}

describe('swap with receiver Tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let user: Keypair
    let receiver: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let pool: PublicKey
    let baseMint: Keypair

    beforeEach(async () => {
        partner = Keypair.generate()
        user = Keypair.generate()
        // never funded and never signs
        receiver = Keypair.generate()
        poolCreator = Keypair.generate()
        config = Keypair.generate()
        baseMint = Keypair.generate()

        for (const account of [partner, user, poolCreator]) {
            await fundSol(connection, account.publicKey)
        }

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')

        const createConfigTx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...buildTestCurveConfig(),
        })
        createConfigTx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, createConfigTx, [
            partner,
            config,
        ])

        const createPoolTx = await dbcClient.creator.createPool({
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        })
        createPoolTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, createPoolTx, [
            baseMint,
            poolCreator,
        ])

        pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
    })

    test('swap: the output goes to the receiver, the owner pays and signs alone', async () => {
        const swapTx = await dbcClient.pool.swap({
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(1),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            receiver: receiver.publicKey,
        })
        swapTx.feePayer = user.publicKey
        await sendAndConfirmTransaction(connection, swapTx, [user])

        expect(signers(swapTx)).toEqual([user.publicKey.toBase58()])
        const receiverBase = getAssociatedTokenAddressSync(
            baseMint.publicKey,
            receiver.publicKey
        )
        const userBase = getAssociatedTokenAddressSync(
            baseMint.publicKey,
            user.publicKey
        )
        expect((await tokenBalance(receiverBase))! > 0n).toBe(true)
        expect(await tokenBalance(userBase)).toBeNull()
        expect(await connection.getBalance(receiver.publicKey)).toBe(0)
    })

    test('swap2 ExactIn: the output goes to the receiver', async () => {
        const swapTx = await dbcClient.pool.swap2({
            swapMode: SwapMode.ExactIn,
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(1),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            receiver: receiver.publicKey,
        })
        swapTx.feePayer = user.publicKey
        await sendAndConfirmTransaction(connection, swapTx, [user])

        expect(signers(swapTx)).toEqual([user.publicKey.toBase58()])
        const receiverBase = getAssociatedTokenAddressSync(
            baseMint.publicKey,
            receiver.publicKey
        )
        expect((await tokenBalance(receiverBase))! > 0n).toBe(true)
        expect(
            await tokenBalance(
                getAssociatedTokenAddressSync(
                    baseMint.publicKey,
                    user.publicKey
                )
            )
        ).toBeNull()
    })

    test('swap2 ExactOut: the receiver gets exactly the amount out', async () => {
        const amountOut = new BN(1000000)
        const swapTx = await dbcClient.pool.swap2({
            swapMode: SwapMode.ExactOut,
            amountOut,
            maximumAmountIn: new BN(1000000000),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            receiver: receiver.publicKey,
        })
        swapTx.feePayer = user.publicKey
        await sendAndConfirmTransaction(connection, swapTx, [user])

        const receiverBase = getAssociatedTokenAddressSync(
            baseMint.publicKey,
            receiver.publicKey
        )
        expect(await tokenBalance(receiverBase)).toBe(
            BigInt(amountOut.toString())
        )
    })

    test('swap2 selling into SOL: the receiver keeps wrapped SOL, nothing of its is closed', async () => {
        // the owner buys first, so it holds base tokens and no wrapped SOL account
        const buyTx = await dbcClient.pool.swap2({
            swapMode: SwapMode.ExactIn,
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(1),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
        })
        buyTx.feePayer = user.publicKey
        await sendAndConfirmTransaction(connection, buyTx, [user])
        const userBase = getAssociatedTokenAddressSync(
            baseMint.publicKey,
            user.publicKey
        )
        const bought = (await tokenBalance(userBase))!
        expect(
            await tokenBalance(
                getAssociatedTokenAddressSync(NATIVE_MINT, user.publicKey)
            )
        ).toBeNull()

        const sellTx = await dbcClient.pool.swap2({
            swapMode: SwapMode.ExactIn,
            amountIn: new BN((bought / 2n).toString()),
            minimumAmountOut: new BN(1),
            swapBaseForQuote: true,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            receiver: receiver.publicKey,
        })
        sellTx.feePayer = user.publicKey
        await sendAndConfirmTransaction(connection, sellTx, [user])

        expect(signers(sellTx)).toEqual([user.publicKey.toBase58()])
        expect(await tokenBalance(userBase)).toBe(bought - bought / 2n)
        const receiverWsol = getAssociatedTokenAddressSync(
            NATIVE_MINT,
            receiver.publicKey
        )
        expect((await tokenBalance(receiverWsol))! > 0n).toBe(true)
    })
})
