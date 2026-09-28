import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { beforeEach, describe, expect, test } from 'vitest'
import { NATIVE_MINT } from '@solana/spl-token'
import {
    ActivationType,
    BaseFeeMode,
    buildCurve,
    CollectFeeMode,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
} from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    createDbcTokenBadge,
    createTransferFeeQuoteMint,
} from './utils/tokenBadgeFlow'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const TOKEN_NAME = 'TEST'
const TOKEN_SYMBOL = 'TEST'
const TOKEN_URI =
    'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2'

describe('createConfigAndPool', { timeout: 60000 }, () => {
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

    test('creates a config and pool in a single transaction', async () => {
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const curveConfig = buildTestCurveConfig()

        const tx = await dbcClient.partner.createConfigAndPool({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: poolCreator.publicKey,
            quoteMint: NATIVE_MINT,
            ...curveConfig,
            preCreatePoolParam: {
                baseMint: baseMint.publicKey,
                name: TOKEN_NAME,
                symbol: TOKEN_SYMBOL,
                uri: TOKEN_URI,
                poolCreator: poolCreator.publicKey,
            },
        })
        tx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, tx, [
            poolCreator,
            config,
            baseMint,
        ])

        const pool: PublicKey = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )

        expect(
            await dbcClient.state.getPoolConfig(config.publicKey)
        ).not.toBeNull()
        expect(await dbcClient.state.getPool(pool)).not.toBeNull()
    })

    test('accepts a badged quote mint with a transfer fee without transferFeeParameters', async () => {
        const admin = Keypair.generate()
        const operator = Keypair.generate()
        for (const account of [admin, operator]) {
            await fundSol(connection, account.publicKey)
        }
        const quoteMint = await createTransferFeeQuoteMint(
            connection,
            admin,
            100
        )
        const tokenBadge = await createDbcTokenBadge(
            connection,
            admin,
            operator,
            quoteMint
        )

        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const curveConfig = buildCurve({
            token: {
                tokenType: TokenType.Token2022,
                tokenBaseDecimal: TokenDecimal.SIX,
                tokenQuoteDecimal: TokenDecimal.NINE,
                tokenAuthorityOption: TokenAuthorityOption.Immutable,
                totalTokenSupply: 1_000_000_000,
                leftover: 0,
            },
            fee: {
                baseFeeParams: {
                    baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
                    feeSchedulerParam: {
                        startingFeeBps: 100,
                        endingFeeBps: 100,
                        numberOfPeriod: 0,
                        totalDuration: 0,
                    },
                },
                dynamicFeeEnabled: false,
                collectFeeMode: CollectFeeMode.QuoteToken,
                creatorTradingFeePercentage: 0,
                poolCreationFee: 0,
                enableFirstSwapWithMinFee: false,
            },
            migration: {
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.Customizable,
                migrationFee: {
                    feePercentage: 0,
                    creatorFeePercentage: 0,
                },
                migratedPoolFee: {
                    collectFeeMode: MigratedCollectFeeMode.Compounding,
                    dynamicFee: 0,
                    poolFeeBps: 100,
                    compoundingFeeBps: 0,
                },
            },
            liquidityDistribution: {
                partnerPermanentLockedLiquidityPercentage: 100,
                partnerLiquidityPercentage: 0,
                creatorPermanentLockedLiquidityPercentage: 0,
                creatorLiquidityPercentage: 0,
            },
            lockedVesting: {
                totalLockedVestingAmount: 0,
                numberOfVestingPeriod: 0,
                cliffUnlockAmount: 0,
                totalVestingDuration: 0,
                cliffDurationFromMigrationTime: 0,
            },
            activationType: ActivationType.Timestamp,
            percentageSupplyOnMigration: 20,
            migrationQuoteThreshold: 50,
        })

        await expect(
            dbcClient.partner.createConfig({
                config: Keypair.generate().publicKey,
                feeClaimer: partner.publicKey,
                leftoverReceiver: partner.publicKey,
                payer: poolCreator.publicKey,
                quoteMint,
                tokenBadge,
                ...curveConfig,
            })
        ).rejects.toThrow('Quote mint has a non-zero transfer fee')

        const tx = await dbcClient.partner.createConfigAndPool({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: poolCreator.publicKey,
            quoteMint,
            tokenBadge,
            ...curveConfig,
            preCreatePoolParam: {
                baseMint: baseMint.publicKey,
                name: TOKEN_NAME,
                symbol: TOKEN_SYMBOL,
                uri: TOKEN_URI,
                poolCreator: poolCreator.publicKey,
            },
        })
        tx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, tx, [
            poolCreator,
            config,
            baseMint,
        ])

        const configState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(configState!.quoteMint.equals(quoteMint)).toBe(true)
        expect(configState!.transferFeeBasisPoints).toBe(0)
        expect(
            await dbcClient.state.getPool(
                deriveDbcPoolAddress(
                    quoteMint,
                    baseMint.publicKey,
                    config.publicKey
                )
            )
        ).not.toBeNull()
    })

    test('accepts a zero-fee quote mint with a revoked transfer fee authority without a badge', async () => {
        const quoteMint = await createTransferFeeQuoteMint(
            connection,
            partner,
            0,
            null
        )
        const config = Keypair.generate()

        const tx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint,
            ...buildTestCurveConfig(),
        })
        tx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, tx, [partner, config])

        const configState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(configState!.quoteMint.equals(quoteMint)).toBe(true)
    })
})
