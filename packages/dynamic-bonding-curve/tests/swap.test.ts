import { clusterApiUrl, Connection, Keypair, PublicKey } from '@solana/web3.js'
import { ProgramTestContext } from 'solana-bankrun'
import { fundSol, startTest } from './utils/bankrun'
import { expect, test, describe, beforeEach } from 'vitest'
import {
    DynamicBondingCurveClient,
    getCurrentPoint,
    Swap2Params,
    SwapMode,
} from '../src'
import { BN } from 'bn.js'
import { executeTransaction } from './utils/common'

describe.skip('Swap Tests', () => {
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
        config = new PublicKey('EjLfwVN7QqfwDFrfcHSPKvcNBYo6rsJ5qdxUzo62Tg7f')
        pool = new PublicKey('GF9P4WxZQPni7fH8o5aqY2EsNSQeXb6x9Cgs5YdapeQ1') // SOL <> EDwo7umSsZ7mHKeGrpQ93jFEnMvrNim8bQrXCBKifkBs
        const receivers = [
            user.publicKey,
            operator.publicKey,
            partner.publicKey,
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

        const currentPoint = await getCurrentPoint(
            dbcClient.connection,
            poolConfigState.activationType
        )

        const swapQuote = await dbcClient.pool.swapQuote({
            virtualPool: poolState,
            config: poolConfigState,
            swapBaseForQuote: false,
            amountIn: new BN(1000000000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
        })

        const swapParam = {
            amountIn: new BN(1000000000),
            minimumAmountOut: swapQuote.minimumAmountOut!,
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap(swapParam)

        // Get recent blockhash from the banks client
        const recentBlockhash = await context.banksClient.getLatestBlockhash()
        if (recentBlockhash) {
            swapTx.recentBlockhash = recentBlockhash[0]
        }

        // Set fee payer before signing
        swapTx.feePayer = user.publicKey

        await executeTransaction(context.banksClient, swapTx, [user])
    })

    test('swap2ExactIn', async () => {
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

        const currentPoint = await getCurrentPoint(
            dbcClient.connection,
            poolConfigState.activationType
        )

        const swapQuote = await dbcClient.pool.swapQuote2({
            virtualPool: poolState,
            config: poolConfigState,
            swapBaseForQuote: false,
            amountIn: new BN(1000000000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
            swapMode: SwapMode.ExactIn,
        })

        console.log(swapQuote.outputAmount.toString())

        const swap2Param: Swap2Params = {
            swapMode: SwapMode.ExactIn,
            swapBaseForQuote: false,
            amountIn: new BN(1000000000),
            minimumAmountOut: swapQuote.minimumAmountOut!,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap2(swap2Param)

        // Get recent blockhash from the banks client
        const recentBlockhash = await context.banksClient.getLatestBlockhash()
        if (recentBlockhash) {
            swapTx.recentBlockhash = recentBlockhash[0]
        }

        // Set fee payer before signing
        swapTx.feePayer = user.publicKey
        swapTx.partialSign(user)

        await executeTransaction(context.banksClient, swapTx, [user])
    })

    test('swap2PartialFill', async () => {
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

        const currentPoint = await getCurrentPoint(
            dbcClient.connection,
            poolConfigState.activationType
        )

        const swapQuote = await dbcClient.pool.swapQuote2({
            virtualPool: poolState,
            config: poolConfigState,
            swapBaseForQuote: false,
            amountIn: new BN(1000000000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
            swapMode: SwapMode.PartialFill,
        })

        console.log(swapQuote.outputAmount.toString())

        const swap2Param: Swap2Params = {
            amountIn: new BN(1000000000),
            minimumAmountOut: swapQuote.minimumAmountOut!,
            swapBaseForQuote: false,
            swapMode: SwapMode.PartialFill,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap2(swap2Param)

        // Get recent blockhash from the banks client
        const recentBlockhash = await context.banksClient.getLatestBlockhash()
        if (recentBlockhash) {
            swapTx.recentBlockhash = recentBlockhash[0]
        }

        // Set fee payer before signing
        swapTx.feePayer = user.publicKey
        swapTx.partialSign(user)

        await executeTransaction(context.banksClient, swapTx, [user])
    })

    test('swapVExactOut', async () => {
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

        const currentPoint = await getCurrentPoint(
            dbcClient.connection,
            poolConfigState.activationType
        )

        const swapQuote = await dbcClient.pool.swapQuote2({
            virtualPool: poolState,
            config: poolConfigState,
            swapBaseForQuote: false,
            amountOut: new BN(1000000000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
            swapMode: SwapMode.ExactOut,
        })

        console.log(swapQuote.outputAmount.toString())

        const swap2Param: Swap2Params = {
            amountOut: new BN(1000000000),
            maximumAmountIn: swapQuote.maximumAmountIn!,
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactOut,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap2(swap2Param)

        // Get recent blockhash from the banks client
        const recentBlockhash = await context.banksClient.getLatestBlockhash()
        if (recentBlockhash) {
            swapTx.recentBlockhash = recentBlockhash[0]
        }

        // Set fee payer before signing
        swapTx.feePayer = user.publicKey
        swapTx.partialSign(user)

        await executeTransaction(context.banksClient, swapTx, [user])
    })
})
