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
        tokenAllocation: [10, 10, 80], // 10% (phase1) + 10% (phase2 )+ 80% (phase3) = 100%
        leftover: 100_000_000, // 10% leftover helps with rounding
        ...overrides,
    })

    //  VALID CONFIGURATION TESTS
    describe('Valid Configurations', () => {
        test('should build curve with default allocation (10/10/80)', () => {
            console.log('\n Testing default allocation (10/10/80)')

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

        test('should build curve with stable, growth, moon allocation (50/25/25)', () => {
            console.log('\n Testing stable, growth, moon allocation (50/25/25)')

            const config = buildCurveWithThreeSegments(
                createThreePhaseParams({
                    tokenAllocation: [50, 25, 25],
                })
            )

            expect(config).toBeDefined()
            expect(config.curve.length).toBe(3)

            console.log('sqrtStartPrice:', config.sqrtStartPrice.toString())
            console.log('curve:', convertBNToDecimal(config.curve))
        })
    })

    //  TOKEN ALLOCATION ERROR TESTS
    describe('Token Allocation Validation', () => {
        test('should throw error when allocation sums to less than 100', () => {
            console.log('\n Testing allocation sum < 100')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        tokenAllocation: [30, 30, 30], // sums to 90
                    })
                )
            }).toThrow(/Token allocation must sum to 100/)
        })

        test('should throw error when allocation sums to more than 100', () => {
            console.log('\n Testing allocation sum > 100')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        tokenAllocation: [40, 40, 40], // sums to 120
                    })
                )
            }).toThrow(/Token allocation must sum to 100/)
        })

        test('should throw error when allocation has zero in first phase', () => {
            console.log('\n Testing zero allocation in phase 1')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        tokenAllocation: [0, 50, 50],
                    })
                )
            }).toThrow(/allocation percentages must all be greater than 0/)
        })

        test('should throw error when allocation has zero in middle phase', () => {
            console.log('\n Testing zero allocation in phase 2')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        tokenAllocation: [50, 0, 50],
                    })
                )
            }).toThrow(/allocation percentages must all be greater than 0/)
        })

        test('should throw error when allocation has zero in last phase', () => {
            console.log('\n Testing zero allocation in phase 3')

            expect(() => {
                buildCurveWithThreeSegments(
                    createThreePhaseParams({
                        tokenAllocation: [50, 50, 0],
                    })
                )
            }).toThrow(/allocation percentages must all be greater than 0/)
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
