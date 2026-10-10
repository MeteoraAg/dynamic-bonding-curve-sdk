import {
    ActivationType,
    BaseFeeMode,
    CollectFeeMode,
    MAX_CURVE_POINT,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
    validateConfigParameters,
    type BaseFeeParams,
    type BuildCurveBaseParams,
    type ConfigParameters,
    type FeeConfig,
    type LiquidityDistributionConfig,
    type LockedVestingParams,
    type MigrationConfig,
    type TokenConfig,
} from '../../src'
import { Keypair } from '@solana/web3.js'
import BN from 'bn.js'
import { expect } from 'vitest'

export type CurveParamsOverrides = {
    token?: Partial<TokenConfig>
    fee?: Partial<FeeConfig>
    migration?: MigrationConfig
    liquidityDistribution?: LiquidityDistributionConfig
    lockedVesting?: LockedVestingParams
    activationType?: ActivationType
}

export function constantFee(feeBps: number): BaseFeeParams {
    return {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: {
            startingFeeBps: feeBps,
            endingFeeBps: feeBps,
            numberOfPeriod: 0,
            totalDuration: 0,
        },
    }
}

/**
 * The simplest config the builders accept: a 6-decimal SPL token against a
 * 9-decimal quote, a constant 1% fee, no vesting, and a DAMM v2 migration
 * with all liquidity permanently locked for the partner.
 */
export function curveBaseParams(
    overrides: CurveParamsOverrides = {}
): BuildCurveBaseParams {
    return {
        token: {
            tokenType: TokenType.SPLToken,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: TokenDecimal.NINE,
            tokenAuthorityOption: TokenAuthorityOption.Immutable,
            totalTokenSupply: 1_000_000_000,
            leftover: 0,
            ...overrides.token,
        },
        fee: {
            baseFeeParams: constantFee(100),
            dynamicFeeEnabled: false,
            collectFeeMode: CollectFeeMode.QuoteToken,
            creatorTradingFeePercentage: 0,
            poolCreationFee: 0,
            enableFirstSwapWithMinFee: false,
            ...overrides.fee,
        },
        migration: overrides.migration ?? {
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: MigrationFeeOption.FixedBps100,
            migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
        },
        liquidityDistribution: overrides.liquidityDistribution ?? {
            partnerLiquidityPercentage: 0,
            partnerPermanentLockedLiquidityPercentage: 100,
            creatorLiquidityPercentage: 0,
            creatorPermanentLockedLiquidityPercentage: 0,
        },
        lockedVesting: overrides.lockedVesting ?? {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
        activationType: overrides.activationType ?? ActivationType.Timestamp,
    }
}

/** The curve is strictly increasing with positive liquidity and passes the config validation the program applies. */
export function expectProgramValidCurve(config: ConfigParameters) {
    expect(config.curve.length).toBeGreaterThan(0)
    expect(config.curve.length).toBeLessThanOrEqual(MAX_CURVE_POINT)
    let previous = config.sqrtStartPrice
    for (const point of config.curve) {
        expect(point.sqrtPrice.gt(previous)).toBe(true)
        expect(point.liquidity.gt(new BN(0))).toBe(true)
        previous = point.sqrtPrice
    }
    expect(config.migrationQuoteThreshold.gt(new BN(0))).toBe(true)
    expect(() =>
        validateConfigParameters({
            ...config,
            leftoverReceiver: Keypair.generate().publicKey,
        })
    ).not.toThrow()
}
