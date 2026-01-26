import { Keypair } from '@solana/web3.js'
import { ProgramTestContext } from 'solana-bankrun'
import { fundSol, startTest } from './utils/bankrun'
import { test, describe, beforeEach, vi } from 'vitest'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    CollectFeeMode,
    ConfigParameters,
    createSqrtPrices,
    DammV2DynamicFeeMode,
    DynamicBondingCurveClient,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
    StateService,
    PoolConfig,
    DammV2BaseFeeMode,
} from '../src'
import { connection, executeTransaction } from './utils/common'
import { NATIVE_MINT } from '@solana/spl-token'

describe('createPool tests', () => {
    let context: ProgramTestContext
    let admin: Keypair
    let partner: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let curveConfig: ConfigParameters

    beforeEach(async () => {
        context = await startTest()
        admin = context.payer
        partner = Keypair.generate()
        poolCreator = Keypair.generate()
        const receivers = [partner.publicKey, poolCreator.publicKey]
        await fundSol(context.banksClient, admin, receivers)
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
            totalTokenSupply: 1_000_000_000,
            leftover: 1000,
            sqrtPrices,
            liquidityWeights,
            tokenBaseDecimal: tokenBaseDecimal,
            tokenQuoteDecimal: tokenQuoteDecimal,
            tokenType: TokenType.SPL,
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
            },
            partnerLiquidityPercentage: 0,
            creatorLiquidityPercentage: 0,
            partnerPermanentLockedLiquidityPercentage: 100,
            creatorPermanentLockedLiquidityPercentage: 0,
            creatorTradingFeePercentage: 0,
            lockedVestingParams: {
                totalLockedVestingAmount: 0,
                numberOfVestingPeriod: 0,
                cliffUnlockAmount: 0,
                totalVestingDuration: 0,
                cliffDurationFromMigrationTime: 0,
            },
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
            activationType: ActivationType.Timestamp,
            collectFeeMode: CollectFeeMode.QuoteToken,
            tokenUpdateAuthority:
                TokenUpdateAuthorityOption.PartnerUpdateAuthority,
            poolCreationFee: 1,
            migratedPoolBaseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            enableFirstSwapWithMinFee: false,
        })

        config = Keypair.generate()
    })

    test('createPool', async () => {
        const createConfigTx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...curveConfig,
        })

        const recentBlockhash = await context.banksClient.getLatestBlockhash()
        if (recentBlockhash) {
            createConfigTx.recentBlockhash = recentBlockhash[0]
        }

        createConfigTx.feePayer = partner.publicKey

        await executeTransaction(context.banksClient, createConfigTx, [
            partner,
            config,
        ])

        const baseMint = Keypair.generate()

        // Mock getPoolConfig to avoid reading from disconnected connection
        vi.spyOn(StateService.prototype, 'getPoolConfig').mockResolvedValue({
            quoteMint: NATIVE_MINT,
            tokenType: TokenType.SPL,
        } as PoolConfig)

        const createPoolTx = await dbcClient.pool.createPool({
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        })

        const poolBlockhash = await context.banksClient.getLatestBlockhash()
        if (poolBlockhash) {
            createPoolTx.recentBlockhash = poolBlockhash[0]
        }

        createPoolTx.feePayer = poolCreator.publicKey

        await executeTransaction(context.banksClient, createPoolTx, [
            baseMint,
            poolCreator,
        ])
    })
})
