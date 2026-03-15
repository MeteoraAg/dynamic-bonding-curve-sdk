import { Keypair, Connection, sendAndConfirmTransaction } from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    DynamicBondingCurveClient,
    MigratedCollectFeeMode,
    deriveDbcPoolAddress,
} from '../src'
import { NATIVE_MINT } from '@solana/spl-token'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

describe('createPool tests', { timeout: 60000 }, () => {
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

    test('createPool', async () => {
        const curveConfig = buildTestCurveConfig()
        const config = Keypair.generate()

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

        const baseMint = Keypair.generate()

        const createPoolTx = await dbcClient.pool.createPool({
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

        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
    })

    test('createPool with output token fee mode', async () => {
        const curveConfig = buildTestCurveConfig({
            migratedPoolFee: {
                collectFeeMode: MigratedCollectFeeMode.OutputToken,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 120,
                baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            },
        })
        const config = Keypair.generate()

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

        const baseMint = Keypair.generate()

        const createPoolTx = await dbcClient.pool.createPool({
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

        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
    })

    test('createPool with compounding fee mode', async () => {
        const curveConfig = buildTestCurveConfig({
            migratedPoolFee: {
                collectFeeMode: MigratedCollectFeeMode.Compounding,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 120,
                compoundingFeeBps: 500,
                baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            },
        })
        const config = Keypair.generate()

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

        const baseMint = Keypair.generate()

        const createPoolTx = await dbcClient.pool.createPool({
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

        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
    })
})
