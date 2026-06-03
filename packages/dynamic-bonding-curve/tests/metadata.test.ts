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

describe('metadata endpoints', { timeout: 60000 }, () => {
    let partner: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let baseMint: Keypair
    let pool: PublicKey

    beforeEach(async () => {
        partner = Keypair.generate()
        poolCreator = Keypair.generate()
        config = Keypair.generate()
        baseMint = Keypair.generate()

        for (const account of [partner, poolCreator]) {
            await fundSol(connection, account.publicKey)
        }

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')

        const curveConfig = buildTestCurveConfig()

        const createConfigTx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...curveConfig,
        })
        createConfigTx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, createConfigTx, [
            partner,
            config,
        ])

        const createPoolTx = await dbcClient.creator.createPool({
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: TOKEN_NAME,
            symbol: TOKEN_SYMBOL,
            uri: TOKEN_URI,
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

    test('createPartnerMetadata then getPartnerMetadata returns it', async () => {
        const tx = await dbcClient.partner.createPartnerMetadata({
            name: 'Partner Name',
            website: 'https://partner.example',
            logo: 'https://partner.example/logo.png',
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner])

        const metadata = await dbcClient.state.getPartnerMetadata(
            partner.publicKey
        )
        expect(metadata.length).toBeGreaterThan(0)
        expect(metadata[0].name).toBe('Partner Name')
    })

    test('createPoolMetadata then getPoolMetadata returns it', async () => {
        const tx = await dbcClient.creator.createPoolMetadata({
            virtualPool: pool,
            name: 'Pool Name',
            website: 'https://pool.example',
            logo: 'https://pool.example/logo.png',
            creator: poolCreator.publicKey,
            payer: poolCreator.publicKey,
        })
        tx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, tx, [poolCreator])

        const metadata = await dbcClient.state.getPoolMetadata(pool)
        expect(metadata.length).toBeGreaterThan(0)
        expect(metadata[0].name).toBe('Pool Name')
    })
})
