import { NATIVE_MINT } from '@solana/spl-token'
import BN from 'bn.js'
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from '@solana/web3.js'
import { beforeEach, describe, expect, test } from 'vitest'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    CollectFeeMode,
    createSqrtPrices,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    DynamicBondingCurveKitClient,
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
        tokenUpdateAuthority:
            TokenUpdateAuthorityOption.PartnerUpdateAuthority,
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
            collectFeeMode: CollectFeeMode.QuoteToken,
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

describe('Kit partner and creator compatibility', { timeout: 60000 }, () => {
    let partner: Keypair
    let creator: Keypair
    let poolCreator: Keypair
    let receiver: Keypair
    let tempWSol: Keypair

    let partnerSigner: Awaited<ReturnType<typeof createKitSignerFromLegacyKeypair>>
    let poolCreatorSigner: Awaited<
        ReturnType<typeof createKitSignerFromLegacyKeypair>
    >
    let tempWSolSigner: Awaited<
        ReturnType<typeof createKitSignerFromLegacyKeypair>
    >

    beforeEach(async () => {
        partner = Keypair.generate()
        creator = Keypair.generate()
        poolCreator = Keypair.generate()
        receiver = Keypair.generate()
        tempWSol = Keypair.generate()

        await Promise.all([
            fundSol(connection, partner.publicKey),
            fundSol(connection, poolCreator.publicKey),
        ])

        ;[
            partnerSigner,
            poolCreatorSigner,
            tempWSolSigner,
        ] = await Promise.all([
            createKitSignerFromLegacyKeypair(partner),
            createKitSignerFromLegacyKeypair(poolCreator),
            createKitSignerFromLegacyKeypair(tempWSol),
        ])
    })

    test('partner builders stay compatible with legacy transactions', async () => {
        const config = Keypair.generate()
        const configSigner = await createKitSignerFromLegacyKeypair(config)
        const createConfigParams = {
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...curveConfig,
        }

        const legacyCreateConfigTx =
            await legacyClient.partner.createConfig(createConfigParams)
        const kitCreateConfigPlan = await kitClient.partner.createConfig({
            ...curveConfig,
            config: configSigner,
            feeClaimer: partner.publicKey.toBase58(),
            leftoverReceiver: partner.publicKey.toBase58(),
            payer: partnerSigner,
            quoteMint: NATIVE_MINT.toBase58(),
        })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreateConfigTx,
            kitCreateConfigPlan,
            partner.publicKey,
            [partnerSigner, configSigner]
        )

        const { pool } = await setupPoolFixture()

        const createPartnerMetadataParams = {
            name: 'Partner',
            website: 'https://partner.example',
            logo: 'https://partner.example/logo.png',
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
        }

        const legacyCreatePartnerMetadata =
            await legacyClient.partner.createPartnerMetadata(
                createPartnerMetadataParams
            )
        const kitCreatePartnerMetadata =
            await kitClient.partner.createPartnerMetadata({
                ...createPartnerMetadataParams,
                feeClaimer: partnerSigner,
                payer: partnerSigner,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreatePartnerMetadata,
            kitCreatePartnerMetadata,
            partner.publicKey,
            [partnerSigner]
        )

        const claimPartnerTradingFeeParams = {
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(10_000),
            maxQuoteAmount: new BN(10_000),
            receiver: receiver.publicKey,
            tempWSolAcc: tempWSol.publicKey,
        }

        const legacyClaimPartnerTradingFee =
            await legacyClient.partner.claimPartnerTradingFee(
                claimPartnerTradingFeeParams
            )
        const kitClaimPartnerTradingFee =
            await kitClient.partner.claimPartnerTradingFee({
                ...claimPartnerTradingFeeParams,
                feeClaimer: partnerSigner,
                payer: partnerSigner,
                pool: pool.toBase58(),
                receiver: receiver.publicKey.toBase58(),
                tempWSolAcc: tempWSolSigner,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyClaimPartnerTradingFee,
            kitClaimPartnerTradingFee,
            partner.publicKey,
            [partnerSigner, tempWSolSigner]
        )

        const claimPartnerTradingFee2Params = {
            feeClaimer: partner.publicKey,
            payer: partner.publicKey,
            pool,
            maxBaseAmount: new BN(10_000),
            maxQuoteAmount: new BN(10_000),
            receiver: receiver.publicKey,
        }

        const legacyClaimPartnerTradingFee2 =
            await legacyClient.partner.claimPartnerTradingFee2(
                claimPartnerTradingFee2Params
            )
        const kitClaimPartnerTradingFee2 =
            await kitClient.partner.claimPartnerTradingFee2({
                ...claimPartnerTradingFee2Params,
                feeClaimer: partnerSigner,
                payer: partnerSigner,
                pool: pool.toBase58(),
                receiver: receiver.publicKey.toBase58(),
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyClaimPartnerTradingFee2,
            kitClaimPartnerTradingFee2,
            partner.publicKey,
            [partnerSigner]
        )

        const partnerWithdrawSurplusParams = {
            feeClaimer: partner.publicKey,
            virtualPool: pool,
        }

        const legacyPartnerWithdrawSurplus =
            await legacyClient.partner.partnerWithdrawSurplus(
                partnerWithdrawSurplusParams
            )
        const kitPartnerWithdrawSurplus =
            await kitClient.partner.partnerWithdrawSurplus({
                feeClaimer: partnerSigner,
                virtualPool: pool.toBase58(),
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyPartnerWithdrawSurplus,
            kitPartnerWithdrawSurplus,
            partner.publicKey,
            [partnerSigner]
        )

        const partnerWithdrawMigrationFeeParams = {
            virtualPool: pool,
            sender: partner.publicKey,
        }

        const legacyPartnerWithdrawMigrationFee =
            await legacyClient.partner.partnerWithdrawMigrationFee(
                partnerWithdrawMigrationFeeParams
            )
        const kitPartnerWithdrawMigrationFee =
            await kitClient.partner.partnerWithdrawMigrationFee({
                virtualPool: pool.toBase58(),
                sender: partnerSigner,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyPartnerWithdrawMigrationFee,
            kitPartnerWithdrawMigrationFee,
            partner.publicKey,
            [partnerSigner]
        )

        const claimPartnerPoolCreationFeeParams = {
            virtualPool: pool,
            feeReceiver: partner.publicKey,
        }

        const legacyClaimPartnerPoolCreationFee =
            await legacyClient.partner.claimPartnerPoolCreationFee(
                claimPartnerPoolCreationFeeParams
            )
        const kitClaimPartnerPoolCreationFee =
            await kitClient.partner.claimPartnerPoolCreationFee({
                virtualPool: pool.toBase58(),
                feeReceiver: partner.publicKey.toBase58(),
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyClaimPartnerPoolCreationFee,
            kitClaimPartnerPoolCreationFee,
            partner.publicKey
        )
        expect(kitClaimPartnerPoolCreationFee.signers).toHaveLength(0)
    })

    test('creator builders stay compatible with legacy transactions', async () => {
        const { pool } = await setupPoolFixture()

        const createPoolMetadataParams = {
            virtualPool: pool,
            name: 'Pool',
            website: 'https://pool.example',
            logo: 'https://pool.example/logo.png',
            creator: poolCreator.publicKey,
            payer: poolCreator.publicKey,
        }

        const legacyCreatePoolMetadata =
            await legacyClient.creator.createPoolMetadata(createPoolMetadataParams)
        const kitCreatePoolMetadata =
            await kitClient.creator.createPoolMetadata({
                ...createPoolMetadataParams,
                virtualPool: pool.toBase58(),
                creator: poolCreatorSigner,
                payer: poolCreatorSigner,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreatePoolMetadata,
            kitCreatePoolMetadata,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const claimCreatorTradingFeeParams = {
            creator: poolCreator.publicKey,
            payer: poolCreator.publicKey,
            pool,
            maxBaseAmount: new BN(10_000),
            maxQuoteAmount: new BN(10_000),
            receiver: receiver.publicKey,
            tempWSolAcc: tempWSol.publicKey,
        }

        const legacyClaimCreatorTradingFee =
            await legacyClient.creator.claimCreatorTradingFee(
                claimCreatorTradingFeeParams
            )
        const kitClaimCreatorTradingFee =
            await kitClient.creator.claimCreatorTradingFee({
                ...claimCreatorTradingFeeParams,
                creator: poolCreatorSigner,
                payer: poolCreatorSigner,
                pool: pool.toBase58(),
                receiver: receiver.publicKey.toBase58(),
                tempWSolAcc: tempWSolSigner,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyClaimCreatorTradingFee,
            kitClaimCreatorTradingFee,
            poolCreator.publicKey,
            [poolCreatorSigner, tempWSolSigner]
        )

        const claimCreatorTradingFee2Params = {
            creator: poolCreator.publicKey,
            payer: poolCreator.publicKey,
            pool,
            maxBaseAmount: new BN(10_000),
            maxQuoteAmount: new BN(10_000),
            receiver: receiver.publicKey,
        }

        const legacyClaimCreatorTradingFee2 =
            await legacyClient.creator.claimCreatorTradingFee2(
                claimCreatorTradingFee2Params
            )
        const kitClaimCreatorTradingFee2 =
            await kitClient.creator.claimCreatorTradingFee2({
                ...claimCreatorTradingFee2Params,
                creator: poolCreatorSigner,
                payer: poolCreatorSigner,
                pool: pool.toBase58(),
                receiver: receiver.publicKey.toBase58(),
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyClaimCreatorTradingFee2,
            kitClaimCreatorTradingFee2,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const creatorWithdrawSurplusParams = {
            creator: poolCreator.publicKey,
            virtualPool: pool,
        }

        const legacyCreatorWithdrawSurplus =
            await legacyClient.creator.creatorWithdrawSurplus(
                creatorWithdrawSurplusParams
            )
        const kitCreatorWithdrawSurplus =
            await kitClient.creator.creatorWithdrawSurplus({
                creator: poolCreatorSigner,
                virtualPool: pool.toBase58(),
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreatorWithdrawSurplus,
            kitCreatorWithdrawSurplus,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const transferPoolCreatorParams = {
            virtualPool: pool,
            creator: poolCreator.publicKey,
            newCreator: creator.publicKey,
        }

        const legacyTransferPoolCreator =
            await legacyClient.creator.transferPoolCreator(
                transferPoolCreatorParams
            )
        const kitTransferPoolCreator =
            await kitClient.creator.transferPoolCreator({
                virtualPool: pool.toBase58(),
                creator: poolCreatorSigner,
                newCreator: creator.publicKey.toBase58(),
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyTransferPoolCreator,
            kitTransferPoolCreator,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )

        const creatorWithdrawMigrationFeeParams = {
            virtualPool: pool,
            sender: poolCreator.publicKey,
        }

        const legacyCreatorWithdrawMigrationFee =
            await legacyClient.creator.creatorWithdrawMigrationFee(
                creatorWithdrawMigrationFeeParams
            )
        const kitCreatorWithdrawMigrationFee =
            await kitClient.creator.creatorWithdrawMigrationFee({
                virtualPool: pool.toBase58(),
                sender: poolCreatorSigner,
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreatorWithdrawMigrationFee,
            kitCreatorWithdrawMigrationFee,
            poolCreator.publicKey,
            [poolCreatorSigner]
        )
    })

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
