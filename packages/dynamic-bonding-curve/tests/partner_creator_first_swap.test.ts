import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { fundSol } from './utils/common'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    CollectFeeMode,
    ConfigParameters,
    createSqrtPrices,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import { BN } from 'bn.js'
import { NATIVE_MINT } from '@solana/spl-token'

const connection = new Connection('http://127.0.0.1:8899', 'confirmed')

describe('Partner Creator First Swap Tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let creator: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let pool: PublicKey
    let baseMint: Keypair
    let curveConfig: ConfigParameters

    beforeEach(async () => {
        partner = Keypair.generate()
        creator = Keypair.generate()
        poolCreator = Keypair.generate()
        config = Keypair.generate()
        baseMint = Keypair.generate()

        for (const account of [partner, creator, poolCreator]) {
            await fundSol(connection, account.publicKey)
        }

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')

        const startingFeeBps = 9000
        const endingFeeBps = 120
        const numberOfPeriod = 60
        const totalDuration = 60

        const customPrices = [0.000000001, 0.00000000105, 0.000000002, 0.000001]
        const tokenBaseDecimal = TokenDecimal.SIX
        const tokenQuoteDecimal = TokenDecimal.NINE
        const sqrtPrices = createSqrtPrices(
            customPrices,
            tokenBaseDecimal,
            tokenQuoteDecimal
        )
        const liquidityWeights = [2, 1, 1]

        curveConfig = buildCurveWithCustomSqrtPrices({
            token: {
                tokenType: TokenType.SPL,
                tokenBaseDecimal: tokenBaseDecimal,
                tokenQuoteDecimal: tokenQuoteDecimal,
                tokenUpdateAuthority:
                    TokenUpdateAuthorityOption.PartnerUpdateAuthority,
                totalTokenSupply: 1_000_000_000,
                leftover: 1000,
            },
            fee: {
                baseFeeParams: {
                    baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
                    feeSchedulerParam: {
                        startingFeeBps,
                        endingFeeBps,
                        numberOfPeriod,
                        totalDuration,
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
            sqrtPrices,
            liquidityWeights,
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
    })

    test('bundles createPool + partnerBuy + creatorBuy into one transaction', async () => {
        const partnerAmountIn = new BN(1_000_000_000)
        const creatorAmountIn = new BN(500_000_000)

        const createPoolParam = {
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        }

        const createOnlyPoolTx =
            await dbcClient.pool.createPool(createPoolParam)
        const bundledTx =
            await dbcClient.pool.createPoolWithPartnerAndCreatorFirstBuy({
                createPoolParam,
                partnerFirstBuyParam: {
                    partner: partner.publicKey,
                    receiver: partner.publicKey,
                    buyAmount: partnerAmountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
                creatorFirstBuyParam: {
                    // Use same signer as partner to keep bundled legacy tx within size limit.
                    creator: partner.publicKey,
                    receiver: partner.publicKey,
                    buyAmount: creatorAmountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        expect(bundledTx.instructions.length).toBeGreaterThan(
            createOnlyPoolTx.instructions.length
        )

        bundledTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, bundledTx, [
            poolCreator,
            baseMint,
            partner,
        ])

        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
        const totalTradingFee = poolState!.metrics.totalProtocolQuoteFee.add(
            poolState!.metrics.totalTradingQuoteFee
        )
        expect(totalTradingFee.gt(new BN(0))).toBe(true)
    })

    test('bundles createPool + partnerBuy only when creator buy is omitted', async () => {
        const partnerAmountIn = new BN(1_000_000_000)

        const createPoolParam = {
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        }

        const createOnlyPoolTx =
            await dbcClient.pool.createPool(createPoolParam)
        const bundledTx =
            await dbcClient.pool.createPoolWithPartnerAndCreatorFirstBuy({
                createPoolParam,
                partnerFirstBuyParam: {
                    partner: partner.publicKey,
                    receiver: partner.publicKey,
                    buyAmount: partnerAmountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        expect(bundledTx.instructions.length).toBeGreaterThan(
            createOnlyPoolTx.instructions.length
        )

        bundledTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, bundledTx, [
            poolCreator,
            baseMint,
            partner,
        ])

        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
        const totalTradingFee = poolState!.metrics.totalProtocolQuoteFee.add(
            poolState!.metrics.totalTradingQuoteFee
        )
        expect(totalTradingFee.gt(new BN(0))).toBe(true)
    })
})
