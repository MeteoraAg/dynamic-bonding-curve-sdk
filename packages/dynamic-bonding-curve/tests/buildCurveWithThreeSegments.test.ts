import { expect, test, describe } from 'vitest'
import { buildCurveWithThreeSegments } from '../src/helpers'
import BN from 'bn.js'
import {
    ActivationType,
    BaseFeeMode,
    BuildCurveBaseParams,
    BuildCurveWithThreeSegmentsParams,
    CollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
} from '../src'
import { convertBNToDecimal } from './utils/common'

describe('buildCurveWithThreeSegments tests', () => {
    // Base parameters used across tests
    const getBaseParams = (): BuildCurveBaseParams => ({
        totalTokenSupply: 1_000_000_000,
        migrationOption: MigrationOption.MET_DAMM_V2,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
        lockedVestingParam: {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
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
        activationType: ActivationType.Slot,
        collectFeeMode: CollectFeeMode.QuoteToken,
        migrationFeeOption: MigrationFeeOption.FixedBps100,
        tokenType: TokenType.SPL,
        partnerLpPercentage: 0,
        creatorLpPercentage: 0,
        partnerLockedLpPercentage: 100,
        creatorLockedLpPercentage: 0,
        creatorTradingFeePercentage: 0,
        leftover: 10000,
        tokenUpdateAuthority: 0,
        migrationFee: {
            feePercentage: 10,
            creatorFeePercentage: 50,
        },
    })

    // Helper to create valid three phase params
    const createThreePhaseParams = (
        overrides: Partial<BuildCurveWithThreeSegmentsParams> = {}
    ): BuildCurveWithThreeSegmentsParams => ({
        ...getBaseParams(),
        initialMarketCap: 30_000, // $30k initial MC -> initial price = 0.00003 (P0)
        phase1EndPrice: 0.0001, // Price at end of phase 1 = 0.0001 (P1)
        phase2EndPrice: 0.0003, // Price at end of phase 2 = 0.0003 (P2)
        migrationMarketCap: 500_000, // $500k migration MC -> migration price = 0.0005 (P3)
        liquidityWeights: [2, 1, 1], // phase1 has 2x the liquidity of phase2 and phase3
        leftover: 100_000_000, // 10% leftover helps with rounding
        ...overrides,
    })

    //  VALID CONFIGURATION TESTS
    describe('Valid Configurations', () => {
        test('should build curve with default liquidity weights (2:1:1)', () => {
            console.log('\n Testing default liquidity weights (2:1:1)')

            const config = buildCurveWithThreeSegments(createThreePhaseParams())

            expect(config).toBeDefined()
            expect(config.curve).toBeDefined()
            expect(config.curve.length).toBe(3)
            expect(config.sqrtStartPrice).toBeDefined()

            console.log('sqrtStartPrice:', config.sqrtStartPrice.toString())
            console.log('curve:', convertBNToDecimal(config.curve))
            console.log(
                'migrationQuoteThreshold:',
                config.migrationQuoteThreshold.toString()
            )
        })

        test('should build curve with equal liquidity weights (1:1:1)', () => {
            console.log('\n Testing equal liquidity weights (1:1:1)')

            const config = buildCurveWithThreeSegments(
                createThreePhaseParams({
                    liquidityWeights: [1, 1, 1],
                })
            )

            expect(config).toBeDefined()
            expect(config.curve.length).toBe(3)

            console.log('sqrtStartPrice:', config.sqrtStartPrice.toString())
            console.log('curve:', convertBNToDecimal(config.curve))
        })
    })

    //  LIQUIDITY WEIGHTS VALIDATION TESTS
    describe('Liquidity Weights Validation', () => {
        test('should throw error when weight has zero in first phase', () => {
            console.log('\n Testing zero weight in phase 1')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        liquidityWeights: [0, 1, 1],
                    })
                )
            }).toThrow(/Liquidity weights must all be greater than 0/)
        })

        test('should throw error when weight has zero in middle phase', () => {
            console.log('\n Testing zero weight in phase 2')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        liquidityWeights: [1, 0, 1],
                    })
                )
            }).toThrow(/Liquidity weights must all be greater than 0/)
        })

        test('should throw error when weight has zero in last phase', () => {
            console.log('\n Testing zero weight in phase 3')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        liquidityWeights: [1, 1, 0],
                    })
                )
            }).toThrow(/Liquidity weights must all be greater than 0/)
        })

        test('should build curve with various weight ratios', () => {
            console.log('\n Testing various weight ratios')

            // Test 3:2:1 ratio
            const config1 = buildCurveWithThreeSegments(
                createThreePhaseParams({
                    liquidityWeights: [3, 2, 1],
                })
            )
            expect(config1).toBeDefined()
            expect(config1.curve.length).toBe(3)

            // Test 1:2:3 ratio
            const config2 = buildCurveWithThreeSegments(
                createThreePhaseParams({
                    liquidityWeights: [1, 2, 3],
                })
            )
            expect(config2).toBeDefined()
            expect(config2.curve.length).toBe(3)
        })
    })

    //  PRICE PROGRESSION ERROR TESTS
    describe('Price Progression Validation', () => {
        test('should throw error when phase1EndPrice <= initial price', () => {
            console.log('\n Testing phase1EndPrice <= initial price')

            // initialMarketCap = 30,000, totalTokenSupply = 1,000,000,000
            // initial price = 30,000 / 1,000,000,000 = 0.00003
            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        initialMarketCap: 30_000,
                        phase1EndPrice: 0.00002, // Less than initial price of 0.00003
                    })
                )
            }).toThrow(/phase1EndPrice.*must be greater than initial price/)
        })

        test('should throw error when phase1EndPrice equals initial price', () => {
            console.log('\n Testing phase1EndPrice == initial price')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        initialMarketCap: 30_000,
                        phase1EndPrice: 0.00003, // Equal to initial price
                    })
                )
            }).toThrow(/phase1EndPrice.*must be greater than initial price/)
        })

        test('should throw error when phase2EndPrice <= phase1EndPrice', () => {
            console.log('\n Testing phase2EndPrice <= phase1EndPrice')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        phase1EndPrice: 0.0001,
                        phase2EndPrice: 0.00005, // Less than phase1EndPrice
                    })
                )
            }).toThrow(/phase2EndPrice.*must be greater than phase1EndPrice/)
        })

        test('should throw error when phase2EndPrice equals phase1EndPrice', () => {
            console.log('\n Testing phase2EndPrice == phase1EndPrice')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        phase1EndPrice: 0.0001,
                        phase2EndPrice: 0.0001, // Equal to phase1EndPrice
                    })
                )
            }).toThrow(/phase2EndPrice.*must be greater than phase1EndPrice/)
        })
    })

    //  CURVE OUTPUT VALIDATION TESTS
    describe('Curve Output Validation', () => {
        test('should have 3 curve segments', () => {
            console.log('\n Testing curve has 3 segments')

            const config = buildCurveWithThreeSegments(
                createThreePhaseParams({})
            )

            expect(config.curve).toBeDefined()
            expect(config.curve.length).toBe(3)
        })

        test('should have increasing sqrt prices in curve', () => {
            console.log('\n Testing increasing sqrt prices')

            const config = buildCurveWithThreeSegments(
                createThreePhaseParams({})
            )

            expect(config.curve.length).toBe(3)

            // sqrtStartPrice < curve[0].sqrtPrice < curve[1].sqrtPrice < curve[2].sqrtPrice
            expect(config.sqrtStartPrice.lt(config.curve[0].sqrtPrice)).toBe(
                true
            )
            expect(
                config.curve[0].sqrtPrice.lt(config.curve[1].sqrtPrice)
            ).toBe(true)
            expect(
                config.curve[1].sqrtPrice.lt(config.curve[2].sqrtPrice)
            ).toBe(true)

            console.log('sqrtStartPrice:', config.sqrtStartPrice.toString())
            console.log(
                'curve[0].sqrtPrice:',
                config.curve[0].sqrtPrice.toString()
            )
            console.log(
                'curve[1].sqrtPrice:',
                config.curve[1].sqrtPrice.toString()
            )
            console.log(
                'curve[2].sqrtPrice:',
                config.curve[2].sqrtPrice.toString()
            )
        })

        test('should have positive liquidity in all curve segments', () => {
            console.log('\n Testing positive liquidity')

            const config = buildCurveWithThreeSegments(
                createThreePhaseParams({})
            )

            expect(config.curve.length).toBe(3)

            for (let i = 0; i < config.curve.length; i++) {
                expect(config.curve[i].liquidity.gt(new BN(0))).toBe(true)
                console.log(
                    `curve[${i}].liquidity:`,
                    config.curve[i].liquidity.toString()
                )
            }
        })

        test('should have valid migration quote threshold', () => {
            console.log('\n Testing migration quote threshold')

            const config = buildCurveWithThreeSegments(
                createThreePhaseParams({})
            )

            expect(config.migrationQuoteThreshold).toBeDefined()
            expect(config.migrationQuoteThreshold.gt(new BN(0))).toBe(true)

            console.log(
                'migrationQuoteThreshold:',
                config.migrationQuoteThreshold.toString()
            )
        })
    })
})
