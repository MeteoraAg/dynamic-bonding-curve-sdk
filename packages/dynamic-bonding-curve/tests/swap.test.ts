import { clusterApiUrl, Connection, Keypair, PublicKey } from '@solana/web3.js'
import { ProgramTestContext } from 'solana-bankrun'
import { fundSol, startTest } from './utils/bankrun'
import { expect, test, describe, beforeEach } from 'bun:test'
import { DynamicBondingCurveClient, SwapMode } from '../src'
import { BN } from 'bn.js'
import { executeTransaction } from './utils/common'

describe('Swap Tests', () => {
    let context: ProgramTestContext
    let admin: Keypair
    let operator: Keypair
    let partner: Keypair
    let user: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: PublicKey
    let pool: PublicKey

    beforeEach(async () => {
        context = await startTest()
        admin = context.payer
        operator = Keypair.generate()
        partner = Keypair.generate()
        user = Keypair.generate()
        poolCreator = Keypair.generate()
        config = new PublicKey('FwnwxVcnNdegNym3K2buLQWA4KTyL3jhNq3anc5fSvHd')
        pool = new PublicKey('Bn4ezTWgjHzJZVLttsqhVZJRB16SfqJVJ42WRScrMc2d') // SOL <> FGN27LjGn4KC8rtLvHvYNCwHoDX2Lej9ZWDp3EBinMPw
        const receivers = [
            operator.publicKey,
            partner.publicKey,
            user.publicKey,
            poolCreator.publicKey,
        ]
        await fundSol(context.banksClient, admin, receivers)
        const connection = new Connection(clusterApiUrl('devnet'))
        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')
    })

    test('swapV1', async () => {
        const poolState = await dbcClient.state.getPool(pool)
        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }
        const poolConfigState = await dbcClient.state.getPoolConfig(
            poolState.config
        )
        if (!poolConfigState) {
            throw new Error(
                `Pool config not found: ${poolState.config.toString()}`
            )
        }

        // const currentSlot = await dbcClient.connection.getSlot()

        // const swapQuote = await dbcClient.pool.swapQuote({
        //     virtualPool: poolState,
        //     config: poolConfigState,
        //     swapBaseForQuote: false,
        //     amountIn: new BN(1000000000),
        //     slippageBps: 50,
        //     hasReferral: false,
        //     currentPoint: new BN(currentSlot),
        // })

        const swapParam = {
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap(swapParam)

        executeTransaction(context.banksClient, swapTx, [user])
    })

    test('swapV2ExactIn', async () => {
        const poolState = await dbcClient.state.getPool(pool)
        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }
        const poolConfigState = await dbcClient.state.getPoolConfig(
            poolState.config
        )
        if (!poolConfigState) {
            throw new Error(
                `Pool config not found: ${poolState.config.toString()}`
            )
        }

        // const currentSlot = await dbcClient.connection.getSlot()

        // const swapQuote = await dbcClient.pool.swapQuote({
        //     virtualPool: poolState,
        //     config: poolConfigState,
        //     swapBaseForQuote: false,
        //     amountIn: new BN(1000000000),
        //     slippageBps: 50,
        //     hasReferral: false,
        //     currentPoint: new BN(currentSlot),
        // })

        const swapV2Param = {
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactIn,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swapV2(swapV2Param)

        executeTransaction(context.banksClient, swapTx, [user])
    })

    test('swapV2PartialFill', async () => {
        const poolState = await dbcClient.state.getPool(pool)
        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }
        const poolConfigState = await dbcClient.state.getPoolConfig(
            poolState.config
        )
        if (!poolConfigState) {
            throw new Error(
                `Pool config not found: ${poolState.config.toString()}`
            )
        }

        // const currentSlot = await dbcClient.connection.getSlot()

        // const swapQuote = await dbcClient.pool.swapQuote({
        //     virtualPool: poolState,
        //     config: poolConfigState,
        //     swapBaseForQuote: false,
        //     amountIn: new BN(1000000000),
        //     slippageBps: 50,
        //     hasReferral: false,
        //     currentPoint: new BN(currentSlot),
        // })

        const swapV2Param = {
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            swapMode: SwapMode.PartialFill,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swapV2(swapV2Param)

        executeTransaction(context.banksClient, swapTx, [user])
    })

    test('swapV2ExactOut', async () => {
        const poolState = await dbcClient.state.getPool(pool)
        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }
        const poolConfigState = await dbcClient.state.getPoolConfig(
            poolState.config
        )
        if (!poolConfigState) {
            throw new Error(
                `Pool config not found: ${poolState.config.toString()}`
            )
        }

        // const currentSlot = await dbcClient.connection.getSlot()

        // const swapQuote = await dbcClient.pool.swapQuote({
        //     virtualPool: poolState,
        //     config: poolConfigState,
        //     swapBaseForQuote: false,
        //     amountIn: new BN(1000000000),
        //     slippageBps: 50,
        //     hasReferral: false,
        //     currentPoint: new BN(currentSlot),
        // })

        const swapV2Param = {
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactOut,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swapV2(swapV2Param)

        executeTransaction(context.banksClient, swapTx, [user])
    })
})
