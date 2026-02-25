import {
    Keypair,
    PublicKey,
    Transaction,
    Connection,
    SYSVAR_INSTRUCTIONS_PUBKEY,
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
    FEE_DENOMINATOR,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import { BN } from 'bn.js'
import { NATIVE_MINT } from '@solana/spl-token'
import { bpsToFeeNumerator } from '../src/helpers'

const connection = new Connection('http://127.0.0.1:8899', 'confirmed')

describe('First Swap Tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let user: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient
    let config: Keypair
    let pool: PublicKey
    let baseMint: Keypair
    let curveConfig: ConfigParameters
    let cliffFeeNumerator: InstanceType<typeof BN>
    let endFeeNumerator: InstanceType<typeof BN>

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

        const startingFeeBps = 9000
        const endingFeeBps = 120
        const numberOfPeriod = 60
        const totalDuration = 60

        cliffFeeNumerator = bpsToFeeNumerator(startingFeeBps)
        endFeeNumerator = bpsToFeeNumerator(endingFeeBps)

        // sqrtPrices array for each curve segment checkpoint
        const customPrices = [0.000000001, 0.00000000105, 0.000000002, 0.000001]
        const tokenBaseDecimal = TokenDecimal.SIX
        const tokenQuoteDecimal = TokenDecimal.NINE
        const sqrtPrices = createSqrtPrices(
            customPrices,
            tokenBaseDecimal,
            tokenQuoteDecimal
        )

        // custom liquidity weights for custom segments
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

    test('should charge min fee when using SDK createPoolWithFirstBuy (bundled tx)', async () => {
        const amountIn = new BN(1_000_000_000) // 1 SOL

        const createPoolWithFirstBuyTx =
            await dbcClient.pool.createPoolWithFirstBuy({
                createPoolParam: {
                    baseMint: baseMint.publicKey,
                    config: config.publicKey,
                    name: 'TEST',
                    symbol: 'TEST',
                    uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
                    payer: poolCreator.publicKey,
                    poolCreator: poolCreator.publicKey,
                },
                firstBuyParam: {
                    buyer: poolCreator.publicKey,
                    buyAmount: amountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        createPoolWithFirstBuyTx.feePayer = poolCreator.publicKey

        await sendAndConfirmTransaction(connection, createPoolWithFirstBuyTx, [
            poolCreator,
            baseMint,
        ])

        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()

        const totalTradingFee = poolState!.metrics.totalProtocolQuoteFee.add(
            poolState!.metrics.totalTradingQuoteFee
        )

        const expectedFee = amountIn
            .mul(endFeeNumerator)
            .div(new BN(FEE_DENOMINATOR))

        // verify the fee charged is close to the expected min fee
        const feeDiff = totalTradingFee.sub(expectedFee).abs()
        expect(feeDiff.lte(new BN(1))).toBe(true)

        console.log('SDK createPoolWithFirstBuy test:')
        console.log('  Amount in:', amountIn.toString())
        console.log('  Expected min fee:', expectedFee.toString())
        console.log('  Total fee charged:', totalTradingFee.toString())
        console.log(
            '  Protocol quote fee:',
            poolState!.metrics.totalProtocolQuoteFee.toString()
        )
        console.log(
            '  Trading quote fee:',
            poolState!.metrics.totalTradingQuoteFee.toString()
        )
    })

    test('should charge cliff fee for separate swap transaction using SDK swap()', async () => {
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

        const poolStateAfterCreate = await dbcClient.state.getPool(pool)
        expect(poolStateAfterCreate).not.toBeNull()

        const amountIn = new BN(1_000_000_000)

        const swapTx = await dbcClient.pool.swap({
            amountIn,
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        })

        swapTx.feePayer = user.publicKey

        await sendAndConfirmTransaction(connection, swapTx, [user])

        const poolStateAfterSwap = await dbcClient.state.getPool(pool)
        expect(poolStateAfterSwap).not.toBeNull()

        const expectedFee = amountIn
            .mul(cliffFeeNumerator)
            .div(new BN(FEE_DENOMINATOR))

        const totalTradingFee =
            poolStateAfterSwap!.metrics.totalProtocolQuoteFee.add(
                poolStateAfterSwap!.metrics.totalTradingQuoteFee
            )

        console.log('SDK swap() in separate transaction:')
        console.log('  Amount in:', amountIn.toString())
        console.log('  Expected cliff fee:', expectedFee.toString())
        console.log('  Actual total fee:', totalTradingFee.toString())

        // verify the fee charged is close to the expected cliff fee (in this case, the fee should be at most the cliff fee and at least 95% of it)
        expect(totalTradingFee.lte(expectedFee)).toBe(true)
        expect(
            totalTradingFee.gte(expectedFee.mul(new BN(95)).div(new BN(100)))
        ).toBe(true)
    })

    test('should charge min fee when first swap with pool creation (with SYSVAR)', async () => {
        const amountIn = new BN(1_000_000_000)

        const createPoolWithFirstBuyTx =
            await dbcClient.pool.createPoolWithFirstBuy({
                createPoolParam: {
                    baseMint: baseMint.publicKey,
                    config: config.publicKey,
                    name: 'TEST',
                    symbol: 'TEST',
                    uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
                    payer: poolCreator.publicKey,
                    poolCreator: poolCreator.publicKey,
                },
                firstBuyParam: {
                    buyer: poolCreator.publicKey,
                    buyAmount: amountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        createPoolWithFirstBuyTx.feePayer = poolCreator.publicKey

        await sendAndConfirmTransaction(connection, createPoolWithFirstBuyTx, [
            poolCreator,
            baseMint,
        ])

        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()

        const expectedFee = amountIn
            .mul(endFeeNumerator)
            .div(new BN(FEE_DENOMINATOR))

        const totalTradingFee = poolState!.metrics.totalProtocolQuoteFee.add(
            poolState!.metrics.totalTradingQuoteFee
        )

        const feeDiff = totalTradingFee.sub(expectedFee).abs()
        expect(feeDiff.lte(new BN(1))).toBe(true)

        console.log('Bundled swap with SYSVAR (min fee):')
        console.log('  Amount in:', amountIn.toString())
        console.log('  Expected min fee:', expectedFee.toString())
        console.log('  Actual total fee:', totalTradingFee.toString())
    })

    test('should charge cliff fee when swap bundled WITHOUT SYSVAR', async () => {
        const amountIn = new BN(1_000_000_000)

        const createPoolParam = {
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        }

        const createPoolWithFirstBuyTx =
            await dbcClient.pool.createPoolWithFirstBuy({
                createPoolParam,
                firstBuyParam: {
                    buyer: poolCreator.publicKey,
                    buyAmount: amountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        const createOnlyPoolTx =
            await dbcClient.pool.createPool(createPoolParam)
        const createPoolIxCount = createOnlyPoolTx.instructions.length
        const createPoolIxs = createPoolWithFirstBuyTx.instructions.slice(
            0,
            createPoolIxCount
        )
        const swapIxs =
            createPoolWithFirstBuyTx.instructions.slice(createPoolIxCount)

        const swapIxWithoutSysvar = swapIxs.map((ix) => {
            // remove SYSVAR_INSTRUCTIONS_PUBKEY from keys if present
            const filteredKeys = ix.keys.filter(
                (key) => !key.pubkey.equals(SYSVAR_INSTRUCTIONS_PUBKEY)
            )
            return {
                ...ix,
                keys: filteredKeys,
            }
        })

        // combine into single transaction without SYSVAR on swap instructions
        const bundledTx = new Transaction()
        bundledTx.add(...createPoolIxs)
        swapIxWithoutSysvar.forEach((ix) =>
            bundledTx.add({
                programId: ix.programId,
                keys: ix.keys,
                data: ix.data,
            })
        )

        bundledTx.feePayer = poolCreator.publicKey

        await sendAndConfirmTransaction(connection, bundledTx, [
            poolCreator,
            baseMint,
        ])

        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()

        // calculate expected fee (cliff fee since no SYSVAR)
        const expectedFee = amountIn
            .mul(cliffFeeNumerator)
            .div(new BN(FEE_DENOMINATOR))

        const totalTradingFee = poolState!.metrics.totalProtocolQuoteFee.add(
            poolState!.metrics.totalTradingQuoteFee
        )

        // verify the fee charged is close to the expected cliff fee
        const feeDiff = totalTradingFee.sub(expectedFee).abs()
        expect(feeDiff.lte(new BN(1))).toBe(true)

        console.log('Bundled swap WITHOUT SYSVAR (cliff fee):')
        console.log('  Amount in:', amountIn.toString())
        console.log('  Expected cliff fee:', expectedFee.toString())
        console.log('  Actual total fee:', totalTradingFee.toString())
    })

    test('second swap after bundled first swap should charge cliff fee', async () => {
        const amountIn = new BN(1_000_000_000)

        const createPoolWithFirstBuyTx =
            await dbcClient.pool.createPoolWithFirstBuy({
                createPoolParam: {
                    baseMint: baseMint.publicKey,
                    config: config.publicKey,
                    name: 'TEST',
                    symbol: 'TEST',
                    uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
                    payer: poolCreator.publicKey,
                    poolCreator: poolCreator.publicKey,
                },
                firstBuyParam: {
                    buyer: poolCreator.publicKey,
                    buyAmount: amountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        createPoolWithFirstBuyTx.feePayer = poolCreator.publicKey

        await sendAndConfirmTransaction(connection, createPoolWithFirstBuyTx, [
            poolCreator,
            baseMint,
        ])

        const poolStateAfterFirst = await dbcClient.state.getPool(pool)
        expect(poolStateAfterFirst).not.toBeNull()

        const firstSwapFee =
            poolStateAfterFirst!.metrics.totalProtocolQuoteFee.add(
                poolStateAfterFirst!.metrics.totalTradingQuoteFee
            )
        const expectedFirstFee = amountIn
            .mul(endFeeNumerator)
            .div(new BN(FEE_DENOMINATOR))

        console.log('First swap (bundled with pool creation):')
        console.log('  Expected min fee:', expectedFirstFee.toString())
        console.log('  Actual fee:', firstSwapFee.toString())

        const secondSwapTx = await dbcClient.pool.swap({
            amountIn,
            minimumAmountOut: new BN(0),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        })

        secondSwapTx.feePayer = user.publicKey

        await sendAndConfirmTransaction(connection, secondSwapTx, [user])

        const poolStateAfterSecond = await dbcClient.state.getPool(pool)
        expect(poolStateAfterSecond).not.toBeNull()

        const totalFeeAfterSecond =
            poolStateAfterSecond!.metrics.totalProtocolQuoteFee.add(
                poolStateAfterSecond!.metrics.totalTradingQuoteFee
            )
        const secondSwapFee = totalFeeAfterSecond.sub(firstSwapFee)
        const expectedSecondFee = amountIn
            .mul(cliffFeeNumerator)
            .div(new BN(FEE_DENOMINATOR))

        console.log('Second swap (separate transaction):')
        console.log('  Expected cliff fee:', expectedSecondFee.toString())
        console.log('  Actual fee:', secondSwapFee.toString())

        // verify first swap charged min fee
        const firstFeeDiff = firstSwapFee.sub(expectedFirstFee).abs()
        expect(firstFeeDiff.lte(new BN(1))).toBe(true)

        // verify second swap charged a fee close to cliff fee (may be slightly lower due to fee decay over time)
        expect(secondSwapFee.lte(expectedSecondFee)).toBe(true)
        expect(
            secondSwapFee.gte(
                expectedSecondFee.mul(new BN(95)).div(new BN(100))
            )
        ).toBe(true)

        // Verify second swap fee is significantly higher than min fee (proving it's not using min fee)
        expect(secondSwapFee.gt(expectedFirstFee.mul(new BN(10)))).toBe(true)
    })

    test('SDK createConfigAndPoolWithFirstBuy integration', async () => {
        const newConfig = Keypair.generate()
        const newBaseMint = Keypair.generate()
        const amountIn = new BN(1_000_000_000)

        const newPool = deriveDbcPoolAddress(
            NATIVE_MINT,
            newBaseMint.publicKey,
            newConfig.publicKey
        )

        const { createConfigTx, createPoolWithFirstBuyTx } =
            await dbcClient.pool.createConfigAndPoolWithFirstBuy({
                config: newConfig.publicKey,
                feeClaimer: partner.publicKey,
                leftoverReceiver: partner.publicKey,
                payer: poolCreator.publicKey,
                quoteMint: NATIVE_MINT,
                ...curveConfig,
                preCreatePoolParam: {
                    baseMint: newBaseMint.publicKey,
                    name: 'TEST',
                    symbol: 'TEST',
                    uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
                    poolCreator: poolCreator.publicKey,
                },
                firstBuyParam: {
                    buyer: poolCreator.publicKey,
                    buyAmount: amountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                },
            })

        expect(createConfigTx).toBeDefined()
        expect(createPoolWithFirstBuyTx).toBeDefined()

        createConfigTx.feePayer = poolCreator.publicKey

        await sendAndConfirmTransaction(connection, createConfigTx, [
            poolCreator,
            newConfig,
        ])

        createPoolWithFirstBuyTx.feePayer = poolCreator.publicKey

        await sendAndConfirmTransaction(connection, createPoolWithFirstBuyTx, [
            poolCreator,
            newBaseMint,
        ])

        // verify pool was created
        const poolState = await dbcClient.state.getPool(newPool)
        expect(poolState).not.toBeNull()

        const totalTradingFee = poolState!.metrics.totalProtocolQuoteFee.add(
            poolState!.metrics.totalTradingQuoteFee
        )

        // calculate expected fee (end/min fee for bundled swap)
        const expectedFee = amountIn
            .mul(endFeeNumerator)
            .div(new BN(FEE_DENOMINATOR))

        // verify the fee charged is close to the expected min fee
        const feeDiff = totalTradingFee.sub(expectedFee).abs()
        expect(feeDiff.lte(new BN(1))).toBe(true)

        console.log('SDK createConfigAndPoolWithFirstBuy:')
        console.log('  Amount in:', amountIn.toString())
        console.log('  Expected min fee:', expectedFee.toString())
        console.log('  Total fee charged:', totalTradingFee.toString())
    })
})
