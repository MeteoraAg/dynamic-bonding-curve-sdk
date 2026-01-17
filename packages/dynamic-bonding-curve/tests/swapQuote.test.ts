import { Keypair, PublicKey } from '@solana/web3.js'
import { ProgramTestContext } from 'solana-bankrun'
import { fundSol, startTest } from './utils/bankrun'
import { test, describe, beforeEach, vi, expect } from 'vitest'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    calculateBaseToQuoteFromAmountIn,
    CollectFeeMode,
    ConfigParameters,
    createSqrtPrices,
    DammV2DynamicFeeMode,
    deriveDbcPoolAddress,
    deriveDbcTokenVaultAddress,
    DynamicBondingCurveClient,
    MigrationFeeOption,
    MigrationOption,
    PoolConfig,
    StateService,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
    VirtualPool,
} from '../src'
import { BN } from 'bn.js'
import { connection, executeTransaction } from './utils/common'
import { NATIVE_MINT } from '@solana/spl-token'

describe('swapQuote Tests', () => {
    let context: ProgramTestContext
    let admin: Keypair
    let operator: Keypair
    let partner: Keypair
    let user: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let pool: PublicKey
    let baseMint: Keypair
    let curveConfig: ConfigParameters

    beforeEach(async () => {
        context = await startTest()
        admin = context.payer
        operator = Keypair.generate()
        partner = Keypair.generate()
        user = Keypair.generate()
        poolCreator = Keypair.generate()
        config = Keypair.generate()
        baseMint = Keypair.generate()

        const receivers = [
            user.publicKey,
            operator.publicKey,
            partner.publicKey,
            poolCreator.publicKey,
        ]
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
                TokenUpdateAuthorityOption.PartnerUpdateAndMintAuthority,
            poolCreationFee: 1,
        })

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

        vi.spyOn(StateService.prototype, 'getPoolConfig').mockResolvedValue({
            quoteMint: NATIVE_MINT,
            tokenType: TokenType.SPL,
            activationType: ActivationType.Timestamp,
            poolFees: curveConfig.poolFees,
            quoteTokenFlag: TokenType.SPL,
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

        pool = deriveDbcPoolAddress(
            NATIVE_MINT,
            baseMint.publicKey,
            config.publicKey
        )
        const baseVault = deriveDbcTokenVaultAddress(pool, baseMint.publicKey)
        const quoteVault = deriveDbcTokenVaultAddress(pool, NATIVE_MINT)

        vi.spyOn(StateService.prototype, 'getPool').mockResolvedValue({
            config: config.publicKey,
            creator: poolCreator.publicKey,
            baseMint: baseMint.publicKey,
            baseVault,
            quoteVault,
            baseReserve: new BN(1000000000000),
            quoteReserve: new BN(0),
            sqrtPrice: curveConfig.sqrtStartPrice,
            activationPoint: new BN(0),
            poolType: TokenType.SPL,
        } as unknown as VirtualPool)
    })

    test('calculateBaseToQuoteFromAmountIn returns amountLeft when input exceeds available liquidity', async () => {

        const configState = {
            curve: curveConfig.curve,
            sqrtStartPrice: curveConfig.sqrtStartPrice,
        }

        const currentSqrtPrice = curveConfig.sqrtStartPrice

        const excessiveAmountIn = new BN('1000000000000000') 

        const result = calculateBaseToQuoteFromAmountIn(
            configState,
            currentSqrtPrice,
            excessiveAmountIn
        )

        expect(result.nextSqrtPrice.eq(curveConfig.sqrtStartPrice)).toBe(true)

        // amountLeft greater than 0 and equal to the input
        expect(result.amountLeft.gte(new BN(0))).toBe(true)
        expect(result.amountLeft.eq(excessiveAmountIn)).toBe(true)

        // outputAmount should be equal to 0
        expect(result.outputAmount.eq(new BN(0))).toBe(true)
    })

    test('calculateBaseToQuoteFromAmountIn caps at sqrtStartPrice when selling pushes price below', async () => {
        const configState = {
            curve: curveConfig.curve,
            sqrtStartPrice: curveConfig.sqrtStartPrice,
        }

        // get a higher sqrt price from the curve
        let currentSqrtPrice = curveConfig.sqrtStartPrice
        for (const point of curveConfig.curve) {
            if (!point.sqrtPrice.isZero() && point.sqrtPrice.gt(currentSqrtPrice)) {
                currentSqrtPrice = point.sqrtPrice
            }
        }

        const excessiveAmountIn = new BN('10000000000000000000') 

        const result = calculateBaseToQuoteFromAmountIn(
            configState,
            currentSqrtPrice,
            excessiveAmountIn
        )

        // the price should be capped at sqrtStartPrice
        expect(result.nextSqrtPrice.eq(curveConfig.sqrtStartPrice)).toBe(true)

        // amountLeft should be greater than 0
        expect(result.amountLeft.gt(new BN(0))).toBe(true)
        // outputAmount should be greater than 0
        expect(result.outputAmount.gt(new BN(0))).toBe(true)
    })
})
