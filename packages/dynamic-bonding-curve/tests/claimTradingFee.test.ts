import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    U64_MAX,
} from '../src'
import { BN } from 'bn.js'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createSyncNativeInstruction,
    getAccount,
    getAssociatedTokenAddressSync,
    ACCOUNT_SIZE,
    NATIVE_MINT,
} from '@solana/spl-token'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

/** A claim to a new receiver closes a temporary wSOL account into it, so the receiver also gets that account's rent. */
async function tokenAccountRent(): Promise<bigint> {
    return BigInt(
        await connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE)
    )
}

describe('claim trading fees', { timeout: 60000 }, () => {
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

        const curveConfig = buildTestCurveConfig({
            creatorTradingFeePercentage: 50,
        })

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
        expect(virtualPool!.poolState.partnerQuoteFee.gt(new BN(0))).toBe(true)
        expect(virtualPool!.poolState.creatorQuoteFee.gt(new BN(0))).toBe(true)
    })

    async function unclaimedFees() {
        const { poolState } = (await dbcClient.state.getPool(pool))!
        return {
            partner: BigInt(poolState.partnerQuoteFee.toString()),
            creator: BigInt(poolState.creatorQuoteFee.toString()),
        }
    }

    async function transactionFee(tx: Transaction): Promise<bigint> {
        const fee = await connection.getFeeForMessage(
            tx.compileMessage(),
            'confirmed'
        )
        return BigInt(fee.value!)
    }

    test('claimPartnerTradingFee pays the partner share to the feeClaimer by default', async () => {
        const before = await unclaimedFees()
        const balanceBefore = BigInt(
            await connection.getBalance(partner.publicKey)
        )

        const tx = await dbcClient.partner.claimPartnerTradingFee({
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(0),
            maxQuoteAmount: U64_MAX,
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner])

        const balanceAfter = BigInt(
            await connection.getBalance(partner.publicKey)
        )
        expect(balanceAfter - balanceBefore).toBe(
            before.partner - (await transactionFee(tx))
        )
        expect((await unclaimedFees()).partner).toBe(BigInt(0))
        expect((await unclaimedFees()).creator).toBe(before.creator)
    })

    test.each([
        'claimPartnerTradingFee',
        'claimPartnerTradingFeeToReceiver',
        'claimPartnerTradingFee2',
    ] as const)(
        '%s sends the whole partner share to a distinct receiver',
        async (method) => {
            const receiver = Keypair.generate()
            const before = await unclaimedFees()

            const tx = await dbcClient.partner[method]({
                feeClaimer: partner.publicKey,
                payer: partner.publicKey,
                pool,
                maxBaseAmount: new BN(0),
                maxQuoteAmount: U64_MAX,
                receiver: receiver.publicKey,
            })
            tx.feePayer = partner.publicKey
            await sendAndConfirmTransaction(connection, tx, [partner])

            expect(
                BigInt(await connection.getBalance(receiver.publicKey))
            ).toBe(before.partner + (await tokenAccountRent()))
            const after = await unclaimedFees()
            expect(after.partner).toBe(BigInt(0))
            expect(after.creator).toBe(before.creator)
        }
    )

    test('claimPartnerTradingFee honours maxQuoteAmount and leaves the rest unclaimed', async () => {
        const receiver = Keypair.generate()
        const before = await unclaimedFees()
        const maxQuoteAmount = before.partner / BigInt(2)

        const tx = await dbcClient.partner.claimPartnerTradingFee({
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(0),
            maxQuoteAmount: new BN(maxQuoteAmount.toString()),
            receiver: receiver.publicKey,
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner])

        expect(BigInt(await connection.getBalance(receiver.publicKey))).toBe(
            maxQuoteAmount + (await tokenAccountRent())
        )
        expect((await unclaimedFees()).partner).toBe(
            before.partner - maxQuoteAmount
        )
    })

    test('a SOL fee claim to another receiver pays it in SOL and leaves the claimer wSOL alone', async () => {
        const receiver = Keypair.generate()
        const before = await unclaimedFees()
        const claimerAta = getAssociatedTokenAddressSync(
            NATIVE_MINT,
            partner.publicKey
        )
        const heldWsol = 5_000_000
        const fundTx = new Transaction().add(
            createAssociatedTokenAccountIdempotentInstruction(
                partner.publicKey,
                claimerAta,
                partner.publicKey,
                NATIVE_MINT
            ),
            SystemProgram.transfer({
                fromPubkey: partner.publicKey,
                toPubkey: claimerAta,
                lamports: heldWsol,
            }),
            createSyncNativeInstruction(claimerAta)
        )
        await sendAndConfirmTransaction(connection, fundTx, [partner])

        const tx = await dbcClient.partner.claimPartnerTradingFee({
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(0),
            maxQuoteAmount: U64_MAX,
            receiver: receiver.publicKey,
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner])

        const claimerWsol = await getAccount(connection, claimerAta)
        expect(claimerWsol.amount).toBe(BigInt(heldWsol))
        expect(BigInt(await connection.getBalance(receiver.publicKey))).toBe(
            before.partner + (await tokenAccountRent())
        )
    })

    test('claimCreatorTradingFee pays the creator share to the creator, who funds the new base token account', async () => {
        const before = await unclaimedFees()
        const balanceBefore = BigInt(
            await connection.getBalance(poolCreator.publicKey)
        )

        const tx = await dbcClient.creator.claimCreatorTradingFee({
            creator: poolCreator.publicKey,
            payer: poolCreator.publicKey,
            pool,
            maxBaseAmount: new BN(0),
            maxQuoteAmount: U64_MAX,
        })
        tx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, tx, [poolCreator])

        const balanceAfter = BigInt(
            await connection.getBalance(poolCreator.publicKey)
        )
        expect(balanceAfter - balanceBefore).toBe(
            before.creator -
                (await transactionFee(tx)) -
                (await tokenAccountRent())
        )
        const after = await unclaimedFees()
        expect(after.creator).toBe(BigInt(0))
        expect(after.partner).toBe(before.partner)
    })

    test.each([
        'claimCreatorTradingFeeToReceiver',
        'claimCreatorTradingFee2',
    ] as const)(
        '%s sends the whole creator share to a distinct receiver',
        async (method) => {
            const receiver = Keypair.generate()
            const before = await unclaimedFees()

            const tx = await dbcClient.creator[method]({
                creator: poolCreator.publicKey,
                payer: poolCreator.publicKey,
                pool,
                maxBaseAmount: new BN(0),
                maxQuoteAmount: U64_MAX,
                receiver: receiver.publicKey,
            })
            tx.feePayer = poolCreator.publicKey
            await sendAndConfirmTransaction(connection, tx, [poolCreator])

            expect(
                BigInt(await connection.getBalance(receiver.publicKey))
            ).toBe(before.creator + (await tokenAccountRent()))
            const after = await unclaimedFees()
            expect(after.creator).toBe(BigInt(0))
            expect(after.partner).toBe(before.partner)
        }
    )
})
