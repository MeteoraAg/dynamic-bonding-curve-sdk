import { Keypair, Connection, sendAndConfirmTransaction } from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    ActivationType,
    ConfigParameters,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    getCurrentPoint,
    Swap2Params,
    SwapMode,
} from '../src'
import { BN } from 'bn.js'
import { NATIVE_MINT } from '@solana/spl-token'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

describe('swapQuote', { timeout: 60000 }, () => {
    let partner: Keypair
    let user: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
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
    })

    test('swapQuote returns an exact-in quote for the buy direction', async () => {
        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const virtualPool = await dbcClient.state.getPool(pool)
        const poolConfigState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(virtualPool).not.toBeNull()
        expect(poolConfigState).not.toBeNull()

        const currentPoint = await getCurrentPoint(
            connection,
            ActivationType.Timestamp
        )

        const quote = dbcClient.pool.swapQuote({
            virtualPool: virtualPool!,
            config: poolConfigState!,
            swapBaseForQuote: false,
            amountIn: new BN(1_000_000_000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
            eligibleForFirstSwapWithMinFee: false,
        })

        expect(quote.outputAmount.gt(new BN(0))).toBe(true)
        expect(quote.minimumAmountOut.lte(quote.outputAmount)).toBe(true)
    })

    test('swapQuote2 supports ExactIn, PartialFill, and ExactOut modes', async () => {
        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const virtualPool = await dbcClient.state.getPool(pool)
        const poolConfigState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(virtualPool).not.toBeNull()
        expect(poolConfigState).not.toBeNull()

        const currentPoint = await getCurrentPoint(
            connection,
            ActivationType.Timestamp
        )

        const exactInQuote = dbcClient.pool.swapQuote2({
            virtualPool: virtualPool!,
            config: poolConfigState!,
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactIn,
            amountIn: new BN(1_000_000_000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
            eligibleForFirstSwapWithMinFee: false,
        })
        expect(exactInQuote.outputAmount.gt(new BN(0))).toBe(true)

        const partialFillQuote = dbcClient.pool.swapQuote2({
            virtualPool: virtualPool!,
            config: poolConfigState!,
            swapBaseForQuote: false,
            swapMode: SwapMode.PartialFill,
            amountIn: new BN(1_000_000_000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
            eligibleForFirstSwapWithMinFee: false,
        })
        expect(partialFillQuote.outputAmount.gt(new BN(0))).toBe(true)

        const exactOutQuote = dbcClient.pool.swapQuote2({
            virtualPool: virtualPool!,
            config: poolConfigState!,
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactOut,
            amountOut: new BN(1_000_000),
            slippageBps: 50,
            hasReferral: false,
            currentPoint,
            eligibleForFirstSwapWithMinFee: false,
        })
        expect(exactOutQuote.maximumAmountIn!.gt(new BN(0))).toBe(true)
    })

    test('swapQuote2 results feed swap2 params and default the optional flags', async () => {
        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const virtualPool = await dbcClient.state.getPool(pool)
        const poolConfigState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        const currentPoint = await getCurrentPoint(
            connection,
            ActivationType.Timestamp
        )
        const quoteParams = {
            virtualPool: virtualPool!,
            config: poolConfigState!,
            swapBaseForQuote: false,
            slippageBps: 50,
            currentPoint,
        }

        const exactIn = dbcClient.pool.swapQuote2({
            ...quoteParams,
            swapMode: SwapMode.ExactIn,
            amountIn: new BN(1_000_000_000),
        })
        const exactInParams: Swap2Params = {
            owner: user.publicKey,
            pool,
            swapBaseForQuote: false,
            referralTokenAccount: null,
            swapMode: SwapMode.ExactIn,
            amountIn: new BN(1_000_000_000),
            minimumAmountOut: exactIn.minimumAmountOut,
        }
        expect(exactInParams.minimumAmountOut.lte(exactIn.outputAmount)).toBe(
            true
        )

        const exactOut = dbcClient.pool.swapQuote2({
            ...quoteParams,
            swapMode: SwapMode.ExactOut,
            amountOut: new BN(1_000_000),
        })
        const exactOutParams: Swap2Params = {
            owner: user.publicKey,
            pool,
            swapBaseForQuote: false,
            referralTokenAccount: null,
            swapMode: SwapMode.ExactOut,
            amountOut: new BN(1_000_000),
            maximumAmountIn: exactOut.maximumAmountIn,
        }
        expect(exactOutParams.maximumAmountIn.gt(new BN(0))).toBe(true)
    })

    test('getQuoteFromInputAmount matches swapQuote2 at launch', async () => {
        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const virtualPool = await dbcClient.state.getPool(pool)
        const poolConfigState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(virtualPool).not.toBeNull()
        expect(poolConfigState).not.toBeNull()

        const amountIn = new BN(1_000_000_000)

        const expected = dbcClient.pool.swapQuote2({
            virtualPool: virtualPool!,
            config: poolConfigState!,
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactIn,
            amountIn,
            slippageBps: 50,
            hasReferral: false,
            currentPoint: virtualPool!.poolState.activationPoint,
            eligibleForFirstSwapWithMinFee: false,
        })

        const quoteFromBuildCurve = dbcClient.pool.getQuoteFromInputAmount({
            config: curveConfig,
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactIn,
            amountIn,
            slippageBps: 50,
        })

        expect(quoteFromBuildCurve.includedFeeInputAmount.eq(amountIn)).toBe(
            true
        )
        expect(
            quoteFromBuildCurve.excludedFeeInputAmount.eq(
                expected.excludedFeeInputAmount
            )
        ).toBe(true)
        expect(quoteFromBuildCurve.outputAmount.eq(expected.outputAmount)).toBe(
            true
        )
        expect(
            quoteFromBuildCurve.minimumAmountOut!.eq(expected.minimumAmountOut!)
        ).toBe(true)
        expect(quoteFromBuildCurve.tradingFee.eq(expected.tradingFee)).toBe(
            true
        )
        expect(quoteFromBuildCurve.protocolFee.eq(expected.protocolFee)).toBe(
            true
        )
        expect(quoteFromBuildCurve.referralFee.eq(expected.referralFee)).toBe(
            true
        )
        expect(
            quoteFromBuildCurve.nextSqrtPrice.eq(expected.nextSqrtPrice)
        ).toBe(true)
    })

    test('getQuoteFromOutputAmount matches swapQuote2 at launch', async () => {
        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const virtualPool = await dbcClient.state.getPool(pool)
        const poolConfigState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(virtualPool).not.toBeNull()
        expect(poolConfigState).not.toBeNull()

        const amountOut = new BN(1_000_000)

        const expected = dbcClient.pool.swapQuote2({
            virtualPool: virtualPool!,
            config: poolConfigState!,
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactOut,
            amountOut,
            slippageBps: 50,
            hasReferral: false,
            currentPoint: virtualPool!.poolState.activationPoint,
            eligibleForFirstSwapWithMinFee: false,
        })

        const quoteFromBuildCurve = dbcClient.pool.getQuoteFromOutputAmount({
            config: curveConfig,
            swapBaseForQuote: false,
            amountOut,
            slippageBps: 50,
        })

        expect(
            quoteFromBuildCurve.includedFeeInputAmount.eq(
                expected.includedFeeInputAmount
            )
        ).toBe(true)
        expect(
            quoteFromBuildCurve.excludedFeeInputAmount.eq(
                expected.excludedFeeInputAmount
            )
        ).toBe(true)
        expect(quoteFromBuildCurve.outputAmount.eq(expected.outputAmount)).toBe(
            true
        )
        expect(
            quoteFromBuildCurve.maximumAmountIn!.eq(expected.maximumAmountIn!)
        ).toBe(true)
        expect(quoteFromBuildCurve.tradingFee.eq(expected.tradingFee)).toBe(
            true
        )
        expect(quoteFromBuildCurve.protocolFee.eq(expected.protocolFee)).toBe(
            true
        )
        expect(quoteFromBuildCurve.referralFee.eq(expected.referralFee)).toBe(
            true
        )
        expect(
            quoteFromBuildCurve.nextSqrtPrice.eq(expected.nextSqrtPrice)
        ).toBe(true)
    })
})
