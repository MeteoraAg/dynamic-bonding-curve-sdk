import { expect, test, describe } from 'vitest'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    buildCurve,
    buildCurveWithLiquidityWeights,
    buildCurveWithMarketCap,
    buildCurveWithTwoSegments,
    getBaseTokenForSwap,
    getMigrationBaseToken,
    getMigrationQuoteAmountFromThreshold,
    getMigrationThresholdPrice,
    getSwapAmountWithBuffer,
    getTotalVestingAmount,
} from '../src/helpers'
import {
    ConfigParameters,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
} from '../src'
import { curveBaseParams } from './utils/curve'

function programSupplyGap(config: ConfigParameters): { gap: BN } {
    const sqrtMigrationPrice = getMigrationThresholdPrice(
        config.migrationQuoteThreshold,
        config.sqrtStartPrice,
        config.curve
    )
    const swapBaseAmount = getBaseTokenForSwap(
        config.sqrtStartPrice,
        sqrtMigrationPrice,
        config.curve
    )
    const swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        config.sqrtStartPrice,
        config.curve
    )
    const migrationBaseAmount = getMigrationBaseToken(
        getMigrationQuoteAmountFromThreshold(
            config.migrationQuoteThreshold,
            config.migrationFee.feePercentage
        ),
        sqrtMigrationPrice,
        config.migrationOption,
        config.migratedPoolFee.collectFeeMode
    )
    const minimumSupply = swapBaseAmountBuffer
        .add(migrationBaseAmount)
        .add(getTotalVestingAmount(config.lockedVesting))
    return {
        gap: config.tokenSupply!.preMigrationTokenSupply.sub(minimumSupply),
    }
}

describe('buildCurve math matches program migration math', () => {
    const collectFeeModes = [
        MigratedCollectFeeMode.QuoteToken,
        MigratedCollectFeeMode.Compounding,
    ]

    const baseParams = (collectFeeMode: MigratedCollectFeeMode) =>
        curveBaseParams({
            token: { leftover: 1_000 },
            migration: {
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.Customizable,
                migrationFee: { feePercentage: 3, creatorFeePercentage: 0 },
                migratedPoolFee: {
                    collectFeeMode,
                    dynamicFee: 0,
                    poolFeeBps: 100,
                },
            },
        })

    const liquidityWeights = Array.from({ length: 16 }, (_, i) =>
        new Decimal(1.2).pow(i).toNumber()
    )

    for (const collectFeeMode of collectFeeModes) {
        const builders: Array<[string, () => ConfigParameters]> = [
            [
                'buildCurve',
                () =>
                    buildCurve({
                        ...baseParams(collectFeeMode),
                        percentageSupplyOnMigration: 20,
                        migrationQuoteThreshold: 300,
                    }),
            ],
            [
                'buildCurveWithMarketCap',
                () =>
                    buildCurveWithMarketCap({
                        ...baseParams(collectFeeMode),
                        initialMarketCap: 30,
                        migrationMarketCap: 3_000,
                    }),
            ],
            [
                'buildCurveWithTwoSegments',
                () =>
                    buildCurveWithTwoSegments({
                        ...baseParams(collectFeeMode),
                        initialMarketCap: 30,
                        migrationMarketCap: 3_000,
                        percentageSupplyOnMigration: 20,
                    }),
            ],
            [
                'buildCurveWithLiquidityWeights',
                () =>
                    buildCurveWithLiquidityWeights({
                        ...baseParams(collectFeeMode),
                        initialMarketCap: 30,
                        migrationMarketCap: 3_000,
                        liquidityWeights,
                    }),
            ],
        ]

        for (const [name, build] of builders) {
            test(`${name} reserves the program migration base (collect fee mode ${collectFeeMode})`, () => {
                const config = build()
                const { gap } = programSupplyGap(config)
                const leftover = new BN(1_000).mul(new BN(10 ** 6))

                expect(gap.gte(new BN(0))).toBe(true)
                expect(gap.sub(leftover).abs().lte(new BN(10_000))).toBe(true)
            })
        }
    }
})
