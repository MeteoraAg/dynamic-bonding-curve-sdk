import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { beforeEach, describe, expect, test } from 'vitest'
import { NATIVE_MINT } from '@solana/spl-token'
import {
    DAMM_V1_MIGRATION_FEE_ADDRESS,
    DAMM_V2_MIGRATION_FEE_ADDRESS,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
} from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const TOKEN_NAME = 'TEST'
const TOKEN_SYMBOL = 'TEST'
const TOKEN_URI =
    'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2'

const dammV1Config = DAMM_V1_MIGRATION_FEE_ADDRESS[0]
const dammV2Config = DAMM_V2_MIGRATION_FEE_ADDRESS[0]

describe(
    'migration + post-migration endpoints (transaction build)',
    { timeout: 60000 },
    () => {
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

        test('createLocker builds a transaction', async () => {
            const tx = await dbcClient.migration.createLocker({
                pool,
                payer: poolCreator.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('withdrawLeftover builds a transaction', async () => {
            const tx = await dbcClient.migration.withdrawLeftover({
                pool,
                payer: partner.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('createDammV1MigrationMetadata builds a transaction', async () => {
            const tx = await dbcClient.migration.createDammV1MigrationMetadata({
                virtualPool: pool,
                config: config.publicKey,
                payer: poolCreator.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('migrateToDammV1 builds a transaction', async () => {
            const tx = await dbcClient.migration.migrateToDammV1({
                pool,
                dammConfig: dammV1Config,
                payer: poolCreator.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('lockDammV1LpToken builds transactions for creator and partner', async () => {
            const creatorTx = await dbcClient.migration.lockDammV1LpToken({
                pool,
                dammConfig: dammV1Config,
                payer: poolCreator.publicKey,
                isPartner: false,
            })
            const partnerTx = await dbcClient.migration.lockDammV1LpToken({
                pool,
                dammConfig: dammV1Config,
                payer: partner.publicKey,
                isPartner: true,
            })
            expect(creatorTx.instructions.length).toBeGreaterThan(0)
            expect(partnerTx.instructions.length).toBeGreaterThan(0)
        })

        test('claimDammV1LpToken builds transactions for creator and partner', async () => {
            const creatorTx = await dbcClient.migration.claimDammV1LpToken({
                pool,
                dammConfig: dammV1Config,
                payer: poolCreator.publicKey,
                isPartner: false,
            })
            const partnerTx = await dbcClient.migration.claimDammV1LpToken({
                pool,
                dammConfig: dammV1Config,
                payer: partner.publicKey,
                isPartner: true,
            })
            expect(creatorTx.instructions.length).toBeGreaterThan(0)
            expect(partnerTx.instructions.length).toBeGreaterThan(0)
        })

        test('migrateToDammV2 builds a transaction with position NFT keypairs', async () => {
            const result = await dbcClient.migration.migrateToDammV2({
                pool,
                dammConfig: dammV2Config,
                payer: poolCreator.publicKey,
            })
            expect(result.transaction.instructions.length).toBeGreaterThan(0)
            expect(result.firstPositionNftKeypair).toBeDefined()
            expect(result.secondPositionNftKeypair).toBeDefined()
        })

        test('partnerWithdrawSurplus builds a transaction', async () => {
            const tx = await dbcClient.partner.partnerWithdrawSurplus({
                feeClaimer: partner.publicKey,
                pool,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('creatorWithdrawSurplus builds a transaction', async () => {
            const tx = await dbcClient.creator.creatorWithdrawSurplus({
                creator: poolCreator.publicKey,
                pool,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('partnerWithdrawMigrationFee builds a transaction', async () => {
            const tx = await dbcClient.partner.partnerWithdrawMigrationFee({
                pool,
                sender: partner.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('creatorWithdrawMigrationFee builds a transaction', async () => {
            const tx = await dbcClient.creator.creatorWithdrawMigrationFee({
                pool,
                sender: poolCreator.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('claimPartnerPoolCreationFee builds a transaction', async () => {
            const tx = await dbcClient.partner.claimPartnerPoolCreationFee({
                pool,
                feeReceiver: partner.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })

        test('transferPoolCreator builds a transaction', async () => {
            const newCreator = Keypair.generate()
            const tx = await dbcClient.creator.transferPoolCreator({
                pool,
                creator: poolCreator.publicKey,
                newCreator: newCreator.publicKey,
            })
            expect(tx.instructions.length).toBeGreaterThan(0)
        })
    }
)
