import {
    Keypair,
    PublicKey,
    Connection,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    ConfigParameters,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    Swap2Params,
    SwapMode,
} from '../src'
import { BN } from 'bn.js'
import { NATIVE_MINT } from '@solana/spl-token'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

describe('swap2 Tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let user: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let pool: PublicKey
    let baseMint: Keypair
    let curveConfig: ConfigParameters

    beforeEach(async () => {
        partner = Keypair.generate()
        user = Keypair.generate()
        poolCreator = Keypair.generate()
        config = Keypair.generate()
        baseMint = Keypair.generate()

        for (const account of [partner, user, poolCreator]) {
            await fundSol(connection, account.publicKey)
        }

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')

        curveConfig = buildTestCurveConfig()

        // create config
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

        // create pool
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

    test('swap2ExactIn', async () => {
        const swap2Param: Swap2Params = {
            swapMode: SwapMode.ExactIn,
            swapBaseForQuote: false,
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(1),
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap2(swap2Param)

        swapTx.feePayer = user.publicKey

        await sendAndConfirmTransaction(connection, swapTx, [user])

        // Verify pool state after swap
        const virtualPool = await dbcClient.state.getPool(pool)
        expect(virtualPool).not.toBeNull()
        expect(virtualPool!.poolState.quoteReserve.gt(new BN(0))).toBe(true)
    })

    test('swap2PartialFill', async () => {
        const swap2Param: Swap2Params = {
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(1),
            swapBaseForQuote: false,
            swapMode: SwapMode.PartialFill,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap2(swap2Param)

        swapTx.feePayer = user.publicKey

        await sendAndConfirmTransaction(connection, swapTx, [user])

        // Verify pool state after swap
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
    })

    test('swap2ExactOut', async () => {
        const swap2Param: Swap2Params = {
            amountOut: new BN(1000000),
            maximumAmountIn: new BN(1000000000),
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactOut,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap2(swap2Param)

        swapTx.feePayer = user.publicKey

        await sendAndConfirmTransaction(connection, swapTx, [user])

        // verify pool state after swap
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
    })
})
