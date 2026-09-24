import { Keypair, Connection, sendAndConfirmTransaction } from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    ActivationType,
    BaseFeeMode,
    buildCurve,
    calculateLockedLiquidityBpsAtTime,
    CollectFeeMode,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    deriveDbcPoolAddress,
    deriveTokenBadgeAddress,
    DynamicBondingCurveClient,
    MigratedCollectFeeMode,
    getVestingLockedLiquidityBpsAtNSeconds,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenAuthorityOption,
} from '../src'
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    NATIVE_MINT,
} from '@solana/spl-token'
import BN from 'bn.js'
import { MIN_LOCKED_LIQUIDITY_BPS, SECONDS_PER_DAY } from '../src/constants'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

describe('createConfig tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let dbcClient: DynamicBondingCurveClient

    beforeEach(async () => {
        partner = Keypair.generate()

        await fundSol(connection, partner.publicKey)

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')
    })

    test('createConfig', async () => {
        const curveConfig = buildTestCurveConfig()
        const config = Keypair.generate()
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

        const configState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(configState).not.toBeNull()
    })

    test('createConfig includes tokenBadge remaining account when provided', async () => {
        const curveConfig = buildTestCurveConfig()
        const config = Keypair.generate()
        const tokenBadge = deriveTokenBadgeAddress(NATIVE_MINT)
        const createConfigTx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            tokenBadge,
            ...curveConfig,
        })

        const createConfigIx = createConfigTx.instructions[0]
        expect(
            createConfigIx.keys.some((key) => key.pubkey.equals(tokenBadge))
        ).toBe(true)
        expect(await dbcClient.state.getTokenBadge(NATIVE_MINT)).toBeNull()
    })

    test('createConfig with output token fee mode', async () => {
        const outputTokenCurveConfig = buildTestCurveConfig({
            migratedPoolFee: {
                collectFeeMode: MigratedCollectFeeMode.OutputToken,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 120,
                baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            },
        })

        const config = Keypair.generate()
        const createConfigTx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...outputTokenCurveConfig,
        })

        createConfigTx.feePayer = partner.publicKey

        await sendAndConfirmTransaction(connection, createConfigTx, [
            partner,
            config,
        ])

        const configState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(configState!.migratedCollectFeeMode).toBe(
            MigratedCollectFeeMode.OutputToken
        )
        expect(configState!.migratedCompoundingFeeBps).toBe(0)
        expect(configState!.migratedPoolFeeBps).toBe(120)
        expect(configState!.migratedDynamicFee).toBe(
            DammV2DynamicFeeMode.Enabled
        )
        expect(configState!.migratedPoolBaseFeeMode).toBe(
            DammV2BaseFeeMode.FeeTimeSchedulerLinear
        )
    })

    test('createConfig with compounding fee mode', async () => {
        const compoundingCurveConfig = buildTestCurveConfig({
            migratedPoolFee: {
                collectFeeMode: MigratedCollectFeeMode.Compounding,
                dynamicFee: DammV2DynamicFeeMode.Enabled,
                poolFeeBps: 120,
                compoundingFeeBps: 500,
                baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            },
        })

        const config = Keypair.generate()
        const createConfigTx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...compoundingCurveConfig,
        })

        createConfigTx.feePayer = partner.publicKey

        await sendAndConfirmTransaction(connection, createConfigTx, [
            partner,
            config,
        ])

        const configState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(configState!.migratedCollectFeeMode).toBe(
            MigratedCollectFeeMode.Compounding
        )
        expect(configState!.migratedCompoundingFeeBps).toBe(500)
        expect(configState!.migratedPoolFeeBps).toBe(120)
        expect(configState!.migratedDynamicFee).toBe(
            DammV2DynamicFeeMode.Enabled
        )
        expect(configState!.migratedPoolBaseFeeMode).toBe(
            DammV2BaseFeeMode.FeeTimeSchedulerLinear
        )
    })

    test('createConfig, createPool, and swap with a 5-decimal quote mint', async () => {
        const quoteMint = await createMint(
            connection,
            partner,
            partner.publicKey,
            null,
            5
        )
        const migrationQuoteThreshold = 1_000_000_000
        const curveConfig = buildCurve({
            token: {
                tokenType: TokenType.SPLToken,
                tokenBaseDecimal: TokenDecimal.SIX,
                tokenQuoteDecimal: 5,
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
                migrationFeeOption: MigrationFeeOption.FixedBps100,
                migrationFee: {
                    feePercentage: 0,
                    creatorFeePercentage: 0,
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
            percentageSupplyOnMigration: 20,
            migrationQuoteThreshold,
        })

        const config = Keypair.generate()
        const createConfigTx = await dbcClient.partner.createConfig({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint,
            ...curveConfig,
        })
        createConfigTx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, createConfigTx, [
            partner,
            config,
        ])

        const baseMint = Keypair.generate()
        const createPoolTx = await dbcClient.creator.createPool({
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: 'TEST',
            symbol: 'TEST',
            uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
            payer: partner.publicKey,
            poolCreator: partner.publicKey,
        })
        createPoolTx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, createPoolTx, [
            baseMint,
            partner,
        ])

        const amountIn = new BN(1_000_000).mul(new BN(10 ** 5))
        const partnerQuoteAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            partner,
            quoteMint,
            partner.publicKey
        )
        await mintTo(
            connection,
            partner,
            quoteMint,
            partnerQuoteAccount.address,
            partner,
            BigInt(amountIn.toString())
        )

        const pool = deriveDbcPoolAddress(
            quoteMint,
            baseMint.publicKey,
            config.publicKey
        )
        const swapTx = await dbcClient.pool.swap({
            amountIn,
            minimumAmountOut: new BN(1),
            swapBaseForQuote: false,
            owner: partner.publicKey,
            pool,
            referralTokenAccount: null,
            payer: partner.publicKey,
        })
        swapTx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, swapTx, [partner])

        const configState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(configState!.quoteMint.equals(quoteMint)).toBe(true)
        expect(
            configState!.migrationQuoteThreshold.eq(
                new BN(migrationQuoteThreshold).mul(new BN(10 ** 5))
            )
        ).toBe(true)

        const virtualPool = await dbcClient.state.getPool(pool)
        expect(virtualPool!.poolState.quoteReserve.gt(new BN(0))).toBe(true)
    })
})

describe('Locked Liquidity Validation Tests', () => {
    describe('getVestingLockedLiquidityBpsAtNSeconds', () => {
        test('10% vesting with cliff > SECONDS_PER_DAY should return 999 BPS at day 1', () => {
            const vestingInfo = {
                vestingPercentage: 10,
                bpsPerPeriod: 10,
                numberOfPeriods: 100,
                cliffDurationFromMigrationTime: SECONDS_PER_DAY + 1, // 86401
                frequency: 1000,
            }

            const lockedBps = getVestingLockedLiquidityBpsAtNSeconds(
                vestingInfo,
                SECONDS_PER_DAY
            )

            // Due to u128::MAX floor division, 10% becomes 999 BPS instead of 1000
            expect(lockedBps).toBe(999)
            expect(lockedBps).toBeLessThan(MIN_LOCKED_LIQUIDITY_BPS)
        })

        test('11% vesting should return 1099 BPS at day 1', () => {
            const vestingInfo = {
                vestingPercentage: 11,
                bpsPerPeriod: 1,
                numberOfPeriods: 10000,
                cliffDurationFromMigrationTime: SECONDS_PER_DAY,
                frequency: 10,
            }

            const lockedBps = getVestingLockedLiquidityBpsAtNSeconds(
                vestingInfo,
                SECONDS_PER_DAY
            )

            expect(lockedBps).toBe(1099)
            expect(lockedBps).toBeGreaterThanOrEqual(MIN_LOCKED_LIQUIDITY_BPS)
        })

        test('zero vesting should return 0 BPS', () => {
            const vestingInfo = {
                vestingPercentage: 0,
                bpsPerPeriod: 0,
                numberOfPeriods: 0,
                cliffDurationFromMigrationTime: 0,
                frequency: 0,
            }

            const lockedBps = getVestingLockedLiquidityBpsAtNSeconds(
                vestingInfo,
                SECONDS_PER_DAY
            )

            expect(lockedBps).toBe(0)
        })

        test('undefined vesting should return 0 BPS', () => {
            const lockedBps = getVestingLockedLiquidityBpsAtNSeconds(
                undefined,
                SECONDS_PER_DAY
            )

            expect(lockedBps).toBe(0)
        })
    })

    describe('calculateLockedLiquidityBpsAtTime', () => {
        test('10% vesting only should return 999 BPS (fails validation)', () => {
            const vestingInfo = {
                vestingPercentage: 10,
                bpsPerPeriod: 10,
                numberOfPeriods: 100,
                cliffDurationFromMigrationTime: SECONDS_PER_DAY + 1,
                frequency: 1000,
            }

            const totalLockedBps = calculateLockedLiquidityBpsAtTime(
                0, // partner permanent locked
                0, // creator permanent locked
                vestingInfo,
                undefined,
                SECONDS_PER_DAY
            )

            expect(totalLockedBps).toBe(999)
            expect(totalLockedBps).toBeLessThan(MIN_LOCKED_LIQUIDITY_BPS)
        })

        test('10% vesting + 1% permanent locked should return 1099 BPS (passes validation)', () => {
            const vestingInfo = {
                vestingPercentage: 10,
                bpsPerPeriod: 10,
                numberOfPeriods: 100,
                cliffDurationFromMigrationTime: SECONDS_PER_DAY + 1,
                frequency: 1000,
            }

            const totalLockedBps = calculateLockedLiquidityBpsAtTime(
                1, // partner permanent locked 1%
                0, // creator permanent locked
                vestingInfo,
                undefined,
                SECONDS_PER_DAY
            )

            // 999 (vesting) + 100 (1% permanent) = 1099
            expect(totalLockedBps).toBe(1099)
            expect(totalLockedBps).toBeGreaterThanOrEqual(
                MIN_LOCKED_LIQUIDITY_BPS
            )
        })

        test('11% vesting should return 1099 BPS (passes validation)', () => {
            const vestingInfo = {
                vestingPercentage: 11,
                bpsPerPeriod: 1,
                numberOfPeriods: 10000,
                cliffDurationFromMigrationTime: SECONDS_PER_DAY,
                frequency: 10,
            }

            const totalLockedBps = calculateLockedLiquidityBpsAtTime(
                0, // partner permanent locked
                0, // creator permanent locked
                vestingInfo,
                undefined,
                SECONDS_PER_DAY
            )

            expect(totalLockedBps).toBe(1099)
            expect(totalLockedBps).toBeGreaterThanOrEqual(
                MIN_LOCKED_LIQUIDITY_BPS
            )
        })

        test('100% permanent locked should return 10000 BPS', () => {
            const totalLockedBps = calculateLockedLiquidityBpsAtTime(
                100, // partner permanent locked 100%
                0, // creator permanent locked
                undefined,
                undefined,
                SECONDS_PER_DAY
            )

            expect(totalLockedBps).toBe(10000)
        })

        test('50% partner + 50% creator permanent locked should return 10000 BPS', () => {
            const totalLockedBps = calculateLockedLiquidityBpsAtTime(
                50, // partner permanent locked 50%
                50, // creator permanent locked 50%
                undefined,
                undefined,
                SECONDS_PER_DAY
            )

            expect(totalLockedBps).toBe(10000)
        })
    })

    describe('validateConfigParameters validation', () => {
        test('should throw error for 10% vesting with insufficient locked liquidity', () => {
            const curveConfig = buildCurve({
                token: {
                    tokenType: TokenType.SPLToken,
                    tokenBaseDecimal: TokenDecimal.SIX,
                    tokenQuoteDecimal: TokenDecimal.NINE,
                    tokenAuthorityOption: TokenAuthorityOption.Immutable,
                    totalTokenSupply: 1_000_000_000,
                    leftover: 0,
                },
                fee: {
                    baseFeeParams: {
                        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                        feeSchedulerParam: {
                            startingFeeBps: 120,
                            endingFeeBps: 120,
                            numberOfPeriod: 0,
                            totalDuration: 0,
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
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 120,
                    },
                },
                liquidityDistribution: {
                    partnerLiquidityPercentage: 90,
                    partnerPermanentLockedLiquidityPercentage: 0,
                    partnerLiquidityVestingInfoParams: {
                        vestingPercentage: 10, // 10% = 999 BPS (fails)
                        bpsPerPeriod: 10,
                        cliffDurationFromMigrationTime: SECONDS_PER_DAY + 1,
                        numberOfPeriods: 100,
                        totalDuration: 100000,
                    },
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
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            // verify the locked BPS calculation shows 999 BPS
            const lockedBps = calculateLockedLiquidityBpsAtTime(
                curveConfig.partnerPermanentLockedLiquidityPercentage,
                curveConfig.creatorPermanentLockedLiquidityPercentage,
                curveConfig.partnerLiquidityVestingInfo,
                curveConfig.creatorLiquidityVestingInfo,
                SECONDS_PER_DAY
            )
            expect(lockedBps).toBe(999)
            expect(lockedBps).toBeLessThan(MIN_LOCKED_LIQUIDITY_BPS)
        })

        test('should succeed for 11% vesting with sufficient locked liquidity', () => {
            const curveConfig = buildCurve({
                token: {
                    tokenType: TokenType.SPLToken,
                    tokenBaseDecimal: TokenDecimal.SIX,
                    tokenQuoteDecimal: TokenDecimal.NINE,
                    tokenAuthorityOption: TokenAuthorityOption.Immutable,
                    totalTokenSupply: 1_000_000_000,
                    leftover: 0,
                },
                fee: {
                    baseFeeParams: {
                        baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                        feeSchedulerParam: {
                            startingFeeBps: 120,
                            endingFeeBps: 120,
                            numberOfPeriod: 0,
                            totalDuration: 0,
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
                        feePercentage: 0,
                        creatorFeePercentage: 0,
                    },
                    migratedPoolFee: {
                        collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                        dynamicFee: DammV2DynamicFeeMode.Enabled,
                        poolFeeBps: 120,
                    },
                },
                liquidityDistribution: {
                    partnerLiquidityPercentage: 89,
                    partnerPermanentLockedLiquidityPercentage: 0,
                    partnerLiquidityVestingInfoParams: {
                        vestingPercentage: 11, // 11% = 1099 BPS (passes)
                        bpsPerPeriod: 1,
                        cliffDurationFromMigrationTime: SECONDS_PER_DAY,
                        numberOfPeriods: 10000,
                        totalDuration: 100000,
                    },
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
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
            })

            // verify the locked BPS calculation shows >= 1000 BPS
            const lockedBps = calculateLockedLiquidityBpsAtTime(
                curveConfig.partnerPermanentLockedLiquidityPercentage,
                curveConfig.creatorPermanentLockedLiquidityPercentage,
                curveConfig.partnerLiquidityVestingInfo,
                curveConfig.creatorLiquidityVestingInfo,
                SECONDS_PER_DAY
            )
            expect(lockedBps).toBe(1099)
            expect(lockedBps).toBeGreaterThanOrEqual(MIN_LOCKED_LIQUIDITY_BPS)
        })
    })
})
