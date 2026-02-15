import {
    Keypair,
    PublicKey,
    Connection,
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

describe('swap Tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let user: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let pool: PublicKey
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

        // define sqrtPrices array for each curve segment checkpoint
        const customPrices = [0.000000001, 0.00000000105, 0.000000002, 0.000001]
        const tokenBaseDecimal = TokenDecimal.SIX
        const tokenQuoteDecimal = TokenDecimal.NINE
        const sqrtPrices = createSqrtPrices(
            customPrices,
            tokenBaseDecimal,
            tokenQuoteDecimal
        )

        // define custom liquidity weights for custom segments (optional)
        // length must be sqrtPrices.length - 1, or leave undefined for even
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
                    baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                    feeSchedulerParam: {
                        startingFeeBps: 9000,
                        endingFeeBps: 120,
                        numberOfPeriod: 60,
                        totalDuration: 60,
                    },
                },
                dynamicFeeEnabled: true,
                collectFeeMode: CollectFeeMode.QuoteToken,
                creatorTradingFeePercentage: 0,
                poolCreationFee: 1,
                enableFirstSwapWithMinFee: false,
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

        // Create config
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

        // Create pool
        const createPoolTx = await dbcClient.pool.createPool({
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

        pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
    })

    test('swap', async () => {
        const swapParam = {
            amountIn: new BN(1000000000),
            minimumAmountOut: new BN(1),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool: pool,
            referralTokenAccount: null as PublicKey | null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap(swapParam)

        swapTx.feePayer = user.publicKey

        await sendAndConfirmTransaction(connection, swapTx, [user])

        // Verify pool state after swap
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
        expect(poolState!.quoteReserve.gt(new BN(0))).toBe(true)
    })
})
