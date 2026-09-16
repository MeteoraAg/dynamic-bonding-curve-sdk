import { NATIVE_MINT } from '@solana/spl-token'
import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { beforeEach, describe, test } from 'vitest'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    CollectFeeMode,
    createSqrtPrices,
    DAMM_V2_MIGRATION_FEE_ADDRESS,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    DynamicBondingCurveKitClient,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import {
    createKitSignerFromLegacyKeypair,
    expectKitPlanToMatchLegacyTransaction,
} from './utils/kit'
import { fundSol, LOCALNET_RPC_URL } from './utils/common'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const legacyClient = DynamicBondingCurveClient.create(connection, 'confirmed')
const kitClient = DynamicBondingCurveKitClient.fromLegacyClient(legacyClient)

const curveConfig = buildCurveWithCustomSqrtPrices({
    token: {
        tokenType: TokenType.SPL,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        tokenUpdateAuthority: TokenUpdateAuthorityOption.PartnerUpdateAuthority,
        totalTokenSupply: 1_000_000_000,
        leftover: 1000,
    },
    fee: {
        baseFeeParams: {
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
            feeSchedulerParam: {
                startingFeeBps: 9000,
                endingFeeBps: 120,
                numberOfPeriod: 60,
                totalDuration: 60,
            },
        },
        dynamicFeeEnabled: false,
        collectFeeMode: CollectFeeMode.QuoteToken,
        creatorTradingFeePercentage: 0,
        poolCreationFee: 0,
        enableFirstSwapWithMinFee: true,
    },
    migration: {
        migrationOption: MigrationOption.MET_DAMM_V2,
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: {
            feePercentage: 10,
            creatorFeePercentage: 50,
        },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
            dynamicFee: DammV2DynamicFeeMode.Enabled,
            poolFeeBps: 120,
            baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
        },
    },
    liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 100,
        creatorLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
    },
    lockedVesting: {
        totalLockedVestingAmount: 0,
        numberOfVestingPeriod: 0,
        cliffUnlockAmount: 0,
        totalVestingDuration: 0,
        cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
    sqrtPrices: createSqrtPrices(
        [0.000000001, 0.00000000105, 0.000000002, 0.000001],
        TokenDecimal.SIX,
        TokenDecimal.NINE
    ),
    liquidityWeights: [2, 1, 1],
})

describe('Kit migration compatibility', { timeout: 60000 }, () => {
    let partner: Keypair
    let poolCreator: Keypair

    let poolCreatorSigner: Awaited<
        ReturnType<typeof createKitSignerFromLegacyKeypair>
    >
    beforeEach(async () => {
        partner = Keypair.generate()
        poolCreator = Keypair.generate()

        await Promise.all([
            fundSol(connection, partner.publicKey),
            fundSol(connection, poolCreator.publicKey),
        ])

        poolCreatorSigner = await createKitSignerFromLegacyKeypair(poolCreator)
    })

    test('migration builders stay compatible with legacy transactions', async () => {
        const { config, pool } = await setupPoolFixture()

        const dammConfig =
            DAMM_V2_MIGRATION_FEE_ADDRESS[MigrationFeeOption.Customizable]

        const createLockerParams = {
            payer: poolCreator.publicKey,
            virtualPool: pool,
        }

        const legacyCreateLocker =
            await legacyClient.migration.createLocker(createLockerParams)
        const kitCreateLocker = await kitClient.migration.createLocker({
            payer: poolCreatorSigner,
            virtualPool: pool.toBase58(),
        })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreateLocker,
            kitCreateLocker,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const withdrawLeftoverParams = {
            payer: poolCreator.publicKey,
            virtualPool: pool,
        }

        const legacyWithdrawLeftover =
            await legacyClient.migration.withdrawLeftover(
                withdrawLeftoverParams
            )
        const kitWithdrawLeftover = await kitClient.migration.withdrawLeftover({
            payer: poolCreatorSigner,
            virtualPool: pool.toBase58(),
        })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyWithdrawLeftover,
            kitWithdrawLeftover,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const createDammV1MigrationMetadataParams = {
            payer: poolCreator.publicKey,
            virtualPool: pool,
            config: config.publicKey,
        }

        const legacyCreateDammV1MigrationMetadata =
            await legacyClient.migration.createDammV1MigrationMetadata(
                createDammV1MigrationMetadataParams
            )
        const kitCreateDammV1MigrationMetadata =
            await kitClient.migration.createDammV1MigrationMetadata({
                payer: poolCreatorSigner,
                virtualPool: pool.toBase58(),
                config: config.publicKey.toBase58(),
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreateDammV1MigrationMetadata,
            kitCreateDammV1MigrationMetadata,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const migrateParams = {
            payer: poolCreator.publicKey,
            virtualPool: pool,
            dammConfig,
        }

        const legacyMigrateToDammV1 =
            await legacyClient.migration.migrateToDammV1(migrateParams)
        const kitMigrateToDammV1 = await kitClient.migration.migrateToDammV1({
            payer: poolCreatorSigner,
            virtualPool: pool.toBase58(),
            dammConfig: dammConfig.toBase58(),
        })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyMigrateToDammV1,
            kitMigrateToDammV1,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const dammLpTokenParams = {
            payer: poolCreator.publicKey,
            virtualPool: pool,
            dammConfig,
            isPartner: false,
        }

        const legacyLockDammV1LpToken =
            await legacyClient.migration.lockDammV1LpToken(dammLpTokenParams)
        const kitLockDammV1LpToken =
            await kitClient.migration.lockDammV1LpToken({
                payer: poolCreatorSigner,
                virtualPool: pool.toBase58(),
                dammConfig: dammConfig.toBase58(),
                isPartner: false,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyLockDammV1LpToken,
            kitLockDammV1LpToken,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const legacyClaimDammV1LpToken =
            await legacyClient.migration.claimDammV1LpToken(dammLpTokenParams)
        const kitClaimDammV1LpToken =
            await kitClient.migration.claimDammV1LpToken({
                payer: poolCreatorSigner,
                virtualPool: pool.toBase58(),
                dammConfig: dammConfig.toBase58(),
                isPartner: false,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyClaimDammV1LpToken,
            kitClaimDammV1LpToken,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )
    })

    // `migrateToDammV2` is intentionally excluded from validator-backed Kit
    // coverage here because the underlying legacy migration flow currently
    // fails on a fresh validator before Kit conversion.

    async function setupPoolFixture(): Promise<{
        config: Keypair
        baseMint: Keypair
        pool: PublicKey
    }> {
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )

        const createConfigTx = await legacyClient.partner.createConfig({
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

        const createPoolTx = await legacyClient.pool.createPool({
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
            poolCreator,
            baseMint,
        ])

        return { config, baseMint, pool }
    }
})
