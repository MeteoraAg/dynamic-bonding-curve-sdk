import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'
import BN from 'bn.js'
import { describe, expect, test } from 'vitest'
import {
    decodeDbcEventInstruction,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    parseDbcEvents,
    SwapMode,
} from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

async function eventsOf(signature: string) {
    const transaction = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
    })
    const parsed = await connection.getParsedTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
    })
    const events = parseDbcEvents(transaction!)
    expect(parseDbcEvents(parsed!).map((e) => e.name)).toEqual(
        events.map((e) => e.name)
    )
    return events
}

describe('events', { timeout: 60000 }, () => {
    test('decodeDbcEventInstruction ignores data without the event tag', () => {
        expect(decodeDbcEventInstruction(new Uint8Array([1, 2, 3]))).toBeNull()
    })

    test('parseDbcEvents reads config, pool, and swap events', async () => {
        const partner = Keypair.generate()
        const user = Keypair.generate()
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        await fundSol(connection, partner.publicKey)
        await fundSol(connection, user.publicKey)
        const client = new DynamicBondingCurveClient(connection, 'confirmed')

        const createTx = await client.partner.createConfigAndPool({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...buildTestCurveConfig(),
            preCreatePoolParam: {
                baseMint: baseMint.publicKey,
                name: 'TEST',
                symbol: 'TEST',
                uri: 'https://example.com/test.json',
                poolCreator: partner.publicKey,
            },
        })
        createTx.feePayer = partner.publicKey
        const createSignature = await sendAndConfirmTransaction(
            connection,
            createTx,
            [partner, config, baseMint]
        )
        const pool: PublicKey = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )

        const createEvents = await eventsOf(createSignature)
        const names = createEvents.map((e) => e.name)
        expect(names.some((n) => n.startsWith('evtCreateConfig'))).toBe(true)
        const initialized = createEvents.find(
            (e) => e.name === 'evtInitializePool'
        )
        expect(initialized).toBeDefined()
        if (initialized?.name === 'evtInitializePool') {
            expect(initialized.data.pool.equals(pool)).toBe(true)
            expect(initialized.data.config.equals(config.publicKey)).toBe(true)
        }

        const swapTx = await client.pool.swap2({
            amountIn: new BN(1_000_000_000),
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            swapMode: SwapMode.ExactIn,
            payer: user.publicKey,
        })
        swapTx.feePayer = user.publicKey
        const swapSignature = await sendAndConfirmTransaction(
            connection,
            swapTx,
            [user]
        )

        const swapEvents = await eventsOf(swapSignature)
        const swap = swapEvents.find((e) => e.name === 'evtSwap3')
        expect(swap).toBeDefined()
        if (swap?.name === 'evtSwap3') {
            expect(swap.data.pool.equals(pool)).toBe(true)
            expect(swap.data.quoteReserve.gt(new BN(0))).toBe(true)
        }
    })
})
