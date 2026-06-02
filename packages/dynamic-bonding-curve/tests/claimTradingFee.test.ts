import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import { deriveDbcPoolAddress, DynamicBondingCurveClient } from '../src'
import { BN } from 'bn.js'
import { NATIVE_MINT } from '@solana/spl-token'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

describe('Claim Partner Trading Fee Tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let pool: PublicKey
    let baseMint: Keypair

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

        pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )

        const createPoolParam = {
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        }

        const bundledTx =
            await dbcClient.creator.createPoolWithPartnerAndCreatorFirstBuy({
                createPoolParam,
                partnerFirstBuyParam: {
                    partner: partner.publicKey,
                    receiver: partner.publicKey,
                    buyAmount: new BN(1_000_000_000),
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })
        bundledTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, bundledTx, [
            poolCreator,
            baseMint,
            partner,
        ])

        const virtualPool = await dbcClient.state.getPool(pool)
        expect(virtualPool).not.toBeNull()
        expect(
            virtualPool!.poolState.metrics.totalTradingQuoteFee.gt(new BN(0))
        ).toBe(true)
    })

    test('claimPartnerTradingFee (SOL quote, receiver defaults to feeClaimer)', async () => {
        const tx = await dbcClient.partner.claimPartnerTradingFee({
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(0),
            maxQuoteAmount: new BN('18446744073709551615'),
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner])
    })

    test('claimPartnerTradingFee (SOL quote, distinct receiver via tempWSolAcc)', async () => {
        const receiver = Keypair.generate()

        const balanceBefore = await connection.getBalance(receiver.publicKey)

        const tx = await dbcClient.partner.claimPartnerTradingFee({
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(0),
            maxQuoteAmount: new BN('18446744073709551615'),
            receiver: receiver.publicKey,
            tempWSolAcc: partner.publicKey,
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner])

        const balanceAfter = await connection.getBalance(receiver.publicKey)
        expect(balanceAfter).toBeGreaterThan(balanceBefore)
    })

    test('claimPartnerTradingFeeToReceiver (SOL quote)', async () => {
        const receiver = Keypair.generate()

        const balanceBefore = await connection.getBalance(receiver.publicKey)

        const tx = await dbcClient.partner.claimPartnerTradingFeeToReceiver({
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(0),
            maxQuoteAmount: new BN('18446744073709551615'),
            receiver: receiver.publicKey,
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner])

        const balanceAfter = await connection.getBalance(receiver.publicKey)
        expect(balanceAfter).toBeGreaterThan(balanceBefore)
    })
})
