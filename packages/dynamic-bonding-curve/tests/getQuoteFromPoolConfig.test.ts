import { Keypair, Connection, sendAndConfirmTransaction } from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { NATIVE_MINT } from '@solana/spl-token'
import BN from 'bn.js'
import {
    DynamicBondingCurveClient,
    SwapMode,
    TokenType,
    getQuoteFromInputAmount,
} from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

describe('getQuoteFrom with a decoded PoolConfig', { timeout: 60000 }, () => {
    let partner: Keypair
    let dbcClient: DynamicBondingCurveClient

    beforeEach(async () => {
        partner = Keypair.generate()
        await fundSol(connection, partner.publicKey)
        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')
    })

    test('quotes the same as the ConfigParameters it was created from', async () => {
        const curveConfig = buildTestCurveConfig()
        const config = Keypair.generate()
        const createConfigTx = await dbcClient.partner.createConfig2({
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

        const poolConfig = await dbcClient.state.getPoolConfig(config.publicKey)
        expect(poolConfig).not.toBeNull()

        const params = {
            swapBaseForQuote: false,
            swapMode: SwapMode.ExactIn as const,
            amountIn: new BN(1_000_000_000),
            slippageBps: 50,
        }
        const fromParameters = getQuoteFromInputAmount({
            ...params,
            config: curveConfig,
        })
        const fromPoolConfig = getQuoteFromInputAmount({
            ...params,
            config: poolConfig!,
        })

        expect(fromParameters.outputAmount.gt(new BN(0))).toBe(true)
        expect(fromPoolConfig).toEqual(fromParameters)
        expect(() =>
            getQuoteFromInputAmount({
                ...params,
                config: poolConfig!,
                quoteTokenFlag: TokenType.Token2022,
            })
        ).toThrow('quoteTokenFlag does not match config.quoteTokenFlag')
    })
})
