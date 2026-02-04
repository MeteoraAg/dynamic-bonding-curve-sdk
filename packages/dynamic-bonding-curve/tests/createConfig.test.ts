import { Keypair, Connection, sendAndConfirmTransaction } from '@solana/web3.js'
import { test, describe, beforeEach, expect } from 'vitest'
import { fundSol } from './utils/common'
import {
    ActivationType,
    BaseFeeMode,
    buildCurve,
    buildCurveWithCustomSqrtPrices,
    calculateLockedLiquidityBpsAtTime,
    CollectFeeMode,
    ConfigParameters,
    createSqrtPrices,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    DynamicBondingCurveClient,
    getVestingLockedLiquidityBpsAtNSeconds,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../src'
import { NATIVE_MINT } from '@solana/spl-token'
import { MIN_LOCKED_LIQUIDITY_BPS, SECONDS_PER_DAY } from '../src/constants'

const connection = new Connection('http://127.0.0.1:8899', 'confirmed')

describe('createConfig tests', { timeout: 60000 }, () => {
    let partner: Keypair
    let dbcClient: DynamicBondingCurveClient
    let curveConfig: ConfigParameters

    beforeEach(async () => {
        partner = Keypair.generate()

        await fundSol(connection, partner.publicKey)

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
    })

    test('createConfig', async () => {
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
                totalTokenSupply: 1_000_000_000,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
                migrationOption: MigrationOption.MET_DAMM_V2,
                tokenBaseDecimal: TokenDecimal.SIX,
                tokenQuoteDecimal: TokenDecimal.NINE,
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
                        startingFeeBps: 120,
                        endingFeeBps: 120,
                        numberOfPeriod: 0,
                        totalDuration: 0,
                    },
                },
                dynamicFeeEnabled: true,
                activationType: ActivationType.Timestamp,
                collectFeeMode: CollectFeeMode.QuoteToken,
                migrationFeeOption: MigrationFeeOption.Customizable,
                tokenType: TokenType.SPL,
                partnerLiquidityPercentage: 90,
                creatorLiquidityPercentage: 0,
                partnerPermanentLockedLiquidityPercentage: 0,
                creatorPermanentLockedLiquidityPercentage: 0,
                creatorTradingFeePercentage: 0,
                leftover: 0,
                tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
                migrationFee: {
                    feePercentage: 0,
                    creatorFeePercentage: 0,
                },
                migratedPoolFee: {
                    collectFeeMode: CollectFeeMode.QuoteToken,
                    dynamicFee: DammV2DynamicFeeMode.Enabled,
                    poolFeeBps: 120,
                },
                poolCreationFee: 1,
                partnerLiquidityVestingInfoParams: {
                    vestingPercentage: 10, // 10% = 999 BPS (fails)
                    bpsPerPeriod: 10,
                    cliffDurationFromMigrationTime: SECONDS_PER_DAY + 1,
                    numberOfPeriods: 100,
                    totalDuration: 100000,
                },
                migratedPoolBaseFeeMode:
                    DammV2BaseFeeMode.FeeTimeSchedulerLinear,
                enableFirstSwapWithMinFee: false,
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
                totalTokenSupply: 1_000_000_000,
                percentageSupplyOnMigration: 25,
                migrationQuoteThreshold: 1,
                migrationOption: MigrationOption.MET_DAMM_V2,
                tokenBaseDecimal: TokenDecimal.SIX,
                tokenQuoteDecimal: TokenDecimal.NINE,
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
                        startingFeeBps: 120,
                        endingFeeBps: 120,
                        numberOfPeriod: 0,
                        totalDuration: 0,
                    },
                },
                dynamicFeeEnabled: true,
                activationType: ActivationType.Timestamp,
                collectFeeMode: CollectFeeMode.QuoteToken,
                migrationFeeOption: MigrationFeeOption.Customizable,
                tokenType: TokenType.SPL,
                partnerLiquidityPercentage: 89,
                creatorLiquidityPercentage: 0,
                partnerPermanentLockedLiquidityPercentage: 0,
                creatorPermanentLockedLiquidityPercentage: 0,
                creatorTradingFeePercentage: 0,
                leftover: 0,
                tokenUpdateAuthority: TokenUpdateAuthorityOption.Immutable,
                migrationFee: {
                    feePercentage: 0,
                    creatorFeePercentage: 0,
                },
                migratedPoolFee: {
                    collectFeeMode: CollectFeeMode.QuoteToken,
                    dynamicFee: DammV2DynamicFeeMode.Enabled,
                    poolFeeBps: 120,
                },
                poolCreationFee: 1,
                partnerLiquidityVestingInfoParams: {
                    vestingPercentage: 11, // 11% = 1099 BPS (passes)
                    bpsPerPeriod: 1,
                    cliffDurationFromMigrationTime: SECONDS_PER_DAY,
                    numberOfPeriods: 10000,
                    totalDuration: 100000,
                },
                migratedPoolBaseFeeMode:
                    DammV2BaseFeeMode.FeeTimeSchedulerLinear,
                enableFirstSwapWithMinFee: false,
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
