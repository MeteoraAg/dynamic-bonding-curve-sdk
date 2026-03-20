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
    SwapMode,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import {
    createKitSignerFromLegacyKeypair,
    executeKitPlan,
    expectKitPlanToMatchLegacyTransaction,
} from './utils/kit'
import { fundSol, LOCALNET_RPC_URL } from './utils/common'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const legacyClient = DynamicBondingCurveClient.create(connection, 'confirmed')
const kitClient = DynamicBondingCurveKitClient.fromRpcUrl(
    LOCALNET_RPC_URL,
    'confirmed'
)

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

describe('Kit pool compatibility', { timeout: 60000 }, () => {
    let partner: Keypair
    let creator: Keypair
    let poolCreator: Keypair
    let user: Keypair

    let partnerSigner: Awaited<ReturnType<typeof createKitSignerFromLegacyKeypair>>
    let creatorSigner: Awaited<ReturnType<typeof createKitSignerFromLegacyKeypair>>
    let poolCreatorSigner: Awaited<
        ReturnType<typeof createKitSignerFromLegacyKeypair>
    >
    let userSigner: Awaited<ReturnType<typeof createKitSignerFromLegacyKeypair>>

    beforeEach(async () => {
        partner = Keypair.generate()
        creator = Keypair.generate()
        poolCreator = Keypair.generate()
        user = Keypair.generate()

        await Promise.all([
            fundSol(connection, partner.publicKey),
            fundSol(connection, poolCreator.publicKey),
            fundSol(connection, user.publicKey),
        ])

        ;[partnerSigner, creatorSigner, poolCreatorSigner, userSigner] =
            await Promise.all([
                createKitSignerFromLegacyKeypair(partner),
                createKitSignerFromLegacyKeypair(creator),
                createKitSignerFromLegacyKeypair(poolCreator),
                createKitSignerFromLegacyKeypair(user),
            ])
    })

    test('createConfigAndPool builders stay compatible with legacy transactions', async () => {
        const combinedConfig = Keypair.generate()
        const combinedBaseMint = Keypair.generate()
        const [combinedConfigSigner, combinedBaseMintSigner] =
            await Promise.all([
                createKitSignerFromLegacyKeypair(combinedConfig),
                createKitSignerFromLegacyKeypair(combinedBaseMint),
            ])

        const createConfigAndPoolParams = {
            config: combinedConfig.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...curveConfig,
            preCreatePoolParam: {
                name: 'COMBINED',
                symbol: 'COM',
                uri: 'https://example.com/combined.json',
                poolCreator: poolCreator.publicKey,
                baseMint: combinedBaseMint.publicKey,
            },
        }

        const legacyCreateConfigAndPoolTx =
            await legacyClient.pool.createConfigAndPool(createConfigAndPoolParams)
        const kitCreateConfigAndPoolPlan =
            await kitClient.pool.createConfigAndPool({
                ...curveConfig,
                config: combinedConfigSigner,
                feeClaimer: partner.publicKey.toBase58(),
                leftoverReceiver: partner.publicKey.toBase58(),
                payer: partnerSigner,
                quoteMint: NATIVE_MINT.toBase58(),
                preCreatePoolParam: {
                    name: 'COMBINED',
                    symbol: 'COM',
                    uri: 'https://example.com/combined.json',
                    poolCreator: poolCreatorSigner,
                    baseMint: combinedBaseMintSigner,
                },
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreateConfigAndPoolTx,
            kitCreateConfigAndPoolPlan,
            partner.publicKey,
            [
                partnerSigner,
                poolCreatorSigner,
                combinedConfigSigner,
                combinedBaseMintSigner,
            ]
        )

        await executeKitPlan(kitCreateConfigAndPoolPlan, partnerSigner)

        const combinedPool = deriveDbcPoolAddress(
            NATIVE_MINT,
            combinedBaseMint.publicKey,
            combinedConfig.publicKey
        )
        expect(await legacyClient.state.getPool(combinedPool)).not.toBeNull()

        const withFirstBuyConfig = Keypair.generate()
        const withFirstBuyBaseMint = Keypair.generate()
        const [withFirstBuyConfigSigner, withFirstBuyBaseMintSigner] =
            await Promise.all([
                createKitSignerFromLegacyKeypair(withFirstBuyConfig),
                createKitSignerFromLegacyKeypair(withFirstBuyBaseMint),
            ])

        const createConfigAndPoolWithFirstBuyParams = {
            config: withFirstBuyConfig.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...curveConfig,
            preCreatePoolParam: {
                name: 'FIRSTBUY',
                symbol: 'BUY',
                uri: 'https://example.com/first-buy.json',
                poolCreator: poolCreator.publicKey,
                baseMint: withFirstBuyBaseMint.publicKey,
            },
            firstBuyParam: {
                buyer: partner.publicKey,
                receiver: partner.publicKey,
                buyAmount: new BN(1_000_000_000),
                minimumAmountOut: new BN(0),
                referralTokenAccount: null as PublicKey | null,
            },
        }

        const legacyCreateConfigAndPoolWithFirstBuy =
            await legacyClient.pool.createConfigAndPoolWithFirstBuy(
                createConfigAndPoolWithFirstBuyParams
            )
        const kitCreateConfigAndPoolWithFirstBuy =
            await kitClient.pool.createConfigAndPoolWithFirstBuy({
                ...curveConfig,
                config: withFirstBuyConfigSigner,
                feeClaimer: partner.publicKey.toBase58(),
                leftoverReceiver: partner.publicKey.toBase58(),
                payer: partnerSigner,
                quoteMint: NATIVE_MINT.toBase58(),
                preCreatePoolParam: {
                    name: 'FIRSTBUY',
                    symbol: 'BUY',
                    uri: 'https://example.com/first-buy.json',
                    poolCreator: poolCreatorSigner,
                    baseMint: withFirstBuyBaseMintSigner,
                },
                firstBuyParam: {
                    buyer: partnerSigner,
                    receiver: partner.publicKey.toBase58(),
                    buyAmount: new BN(1_000_000_000),
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreateConfigAndPoolWithFirstBuy.createConfigTx,
            kitCreateConfigAndPoolWithFirstBuy.createConfigPlan,
            partner.publicKey,
            [partnerSigner, withFirstBuyConfigSigner]
        )
        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreateConfigAndPoolWithFirstBuy.createPoolWithFirstBuyTx,
            kitCreateConfigAndPoolWithFirstBuy.createPoolWithFirstBuyPlan,
            poolCreator.publicKey,
            [
                partnerSigner,
                poolCreatorSigner,
                withFirstBuyBaseMintSigner,
            ]
        )
    })

    test('createPool builders stay compatible with legacy transactions', async () => {
        const { config } = await setupConfigFixture()

        const baseMint = Keypair.generate()
        const baseMintSigner = await createKitSignerFromLegacyKeypair(baseMint)
        const createPoolParams = {
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        }

        const legacyCreatePoolTx = await legacyClient.pool.createPool(
            createPoolParams
        )
        const kitCreatePoolPlan = await kitClient.pool.createPool({
            ...createPoolParams,
            baseMint: baseMintSigner,
            config: config.publicKey.toBase58(),
            payer: poolCreatorSigner,
            poolCreator: poolCreatorSigner,
        })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreatePoolTx,
            kitCreatePoolPlan,
            poolCreator.publicKey,
            [poolCreatorSigner, baseMintSigner]
        )

        const createPoolWithFirstBuyBaseMint = Keypair.generate()
        const createPoolWithFirstBuyBaseMintSigner =
            await createKitSignerFromLegacyKeypair(createPoolWithFirstBuyBaseMint)
        const createPoolWithFirstBuyParams = {
            createPoolParam: {
                ...createPoolParams,
                baseMint: createPoolWithFirstBuyBaseMint.publicKey,
            },
            firstBuyParam: {
                buyer: partner.publicKey,
                receiver: partner.publicKey,
                buyAmount: new BN(1_000_000_000),
                minimumAmountOut: new BN(0),
                referralTokenAccount: null as PublicKey | null,
            },
        }

        const legacyCreatePoolWithFirstBuy =
            await legacyClient.pool.createPoolWithFirstBuy(
                createPoolWithFirstBuyParams
            )
        const kitCreatePoolWithFirstBuy =
            await kitClient.pool.createPoolWithFirstBuy({
                createPoolParam: {
                    ...createPoolParams,
                    baseMint: createPoolWithFirstBuyBaseMintSigner,
                    config: config.publicKey.toBase58(),
                    payer: poolCreatorSigner,
                    poolCreator: poolCreatorSigner,
                },
                firstBuyParam: {
                    buyer: partnerSigner,
                    receiver: partner.publicKey.toBase58(),
                    buyAmount: new BN(1_000_000_000),
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreatePoolWithFirstBuy,
            kitCreatePoolWithFirstBuy,
            poolCreator.publicKey,
            [partnerSigner, poolCreatorSigner, createPoolWithFirstBuyBaseMintSigner]
        )

        const partnerCreatorFirstBuyBaseMint = Keypair.generate()
        const partnerCreatorFirstBuyBaseMintSigner =
            await createKitSignerFromLegacyKeypair(partnerCreatorFirstBuyBaseMint)
        const createPoolWithPartnerAndCreatorFirstBuyParams = {
            createPoolParam: {
                ...createPoolParams,
                baseMint: partnerCreatorFirstBuyBaseMint.publicKey,
            },
            partnerFirstBuyParam: {
                partner: partner.publicKey,
                receiver: partner.publicKey,
                buyAmount: new BN(1_000_000_000),
                minimumAmountOut: new BN(0),
                referralTokenAccount: null as PublicKey | null,
            },
            creatorFirstBuyParam: {
                creator: creator.publicKey,
                receiver: creator.publicKey,
                buyAmount: new BN(500_000_000),
                minimumAmountOut: new BN(0),
                referralTokenAccount: null as PublicKey | null,
            },
        }

        const legacyCreatePoolWithPartnerAndCreatorFirstBuy =
            await legacyClient.pool.createPoolWithPartnerAndCreatorFirstBuy(
                createPoolWithPartnerAndCreatorFirstBuyParams
            )
        const kitCreatePoolWithPartnerAndCreatorFirstBuy =
            await kitClient.pool.createPoolWithPartnerAndCreatorFirstBuy({
                createPoolParam: {
                    ...createPoolParams,
                    baseMint: partnerCreatorFirstBuyBaseMintSigner,
                    config: config.publicKey.toBase58(),
                    payer: poolCreatorSigner,
                    poolCreator: poolCreatorSigner,
                },
                partnerFirstBuyParam: {
                    partner: partnerSigner,
                    receiver: partner.publicKey.toBase58(),
                    buyAmount: new BN(1_000_000_000),
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
                creatorFirstBuyParam: {
                    creator: creatorSigner,
                    receiver: creator.publicKey.toBase58(),
                    buyAmount: new BN(500_000_000),
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacyCreatePoolWithPartnerAndCreatorFirstBuy,
            kitCreatePoolWithPartnerAndCreatorFirstBuy,
            poolCreator.publicKey,
            [
                partnerSigner,
                creatorSigner,
                poolCreatorSigner,
                partnerCreatorFirstBuyBaseMintSigner,
            ]
        )
    })

    test('swap builders stay compatible with legacy transactions', async () => {
        const { pool } = await setupPoolFixture()

        const swapParams = {
            owner: user.publicKey,
            pool,
            amountIn: new BN(1_000_000_000),
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const legacySwapTx = await legacyClient.pool.swap(swapParams)
        const kitSwapPlan = await kitClient.pool.swap({
            ...swapParams,
            owner: userSigner,
            pool: pool.toBase58(),
            referralTokenAccount: null,
            payer: userSigner,
        })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacySwapTx,
            kitSwapPlan,
            user.publicKey,
            [userSigner]
        )

        await executeKitPlan(kitSwapPlan, userSigner)

        const swappedPoolState = await legacyClient.state.getPool(pool)
        expect(swappedPoolState).not.toBeNull()
        expect(swappedPoolState!.quoteReserve.gt(new BN(0))).toBe(true)

        const swap2Params = {
            owner: user.publicKey,
            pool,
            swapBaseForQuote: false,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
            swapMode: SwapMode.ExactIn as const,
            amountIn: new BN(1_000_000_000),
            minimumAmountOut: new BN(0),
        }

        const legacySwap2Tx = await legacyClient.pool.swap2(swap2Params)
        const kitSwap2Plan = await kitClient.pool.swap2({
            ...swap2Params,
            owner: userSigner,
            pool: pool.toBase58(),
            referralTokenAccount: null,
            payer: userSigner,
        })

        await expectKitPlanToMatchLegacyTransaction(
            connection,
            legacySwap2Tx,
            kitSwap2Plan,
            user.publicKey,
            [userSigner]
        )
    })

    async function setupConfigFixture(): Promise<{ config: Keypair }> {
        const config = Keypair.generate()
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

        return { config }
    }

    async function setupPoolFixture(): Promise<{
        config: Keypair
        baseMint: Keypair
        pool: PublicKey
    }> {
        const { config } = await setupConfigFixture()
        const baseMint = Keypair.generate()
        const pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )

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
