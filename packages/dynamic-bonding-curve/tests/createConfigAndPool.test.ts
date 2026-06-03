import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { beforeEach, describe, expect, test } from 'vitest'
import { NATIVE_MINT } from '@solana/spl-token'
import { deriveDbcPoolAddress, DynamicBondingCurveClient } from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const TOKEN_NAME = 'TEST'
const TOKEN_SYMBOL = 'TEST'
const TOKEN_URI =
    'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2'

describe('createConfigAndPool', { timeout: 60000 }, () => {
    let partner: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient

    beforeEach(async () => {
        partner = Keypair.generate()
        poolCreator = Keypair.generate()

        for (const account of [partner, poolCreator]) {
            await fundSol(connection, account.publicKey)
        }

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')
    })

    test('creates a config and pool in a single transaction', async () => {
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const curveConfig = buildTestCurveConfig()

        const tx = await dbcClient.partner.createConfigAndPool({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: poolCreator.publicKey,
            quoteMint: NATIVE_MINT,
            ...curveConfig,
            preCreatePoolParam: {
                baseMint: baseMint.publicKey,
                name: TOKEN_NAME,
                symbol: TOKEN_SYMBOL,
                uri: TOKEN_URI,
                poolCreator: poolCreator.publicKey,
            },
        })
        tx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, tx, [
            poolCreator,
            config,
            baseMint,
        ])

        const pool: PublicKey = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )

        expect(
            await dbcClient.state.getPoolConfig(config.publicKey)
        ).not.toBeNull()
        expect(await dbcClient.state.getPool(pool)).not.toBeNull()
    })
})
