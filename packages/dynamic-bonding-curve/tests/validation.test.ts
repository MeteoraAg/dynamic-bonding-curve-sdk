import { describe, expect, test } from 'vitest'
import { Keypair, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import {
    buildCurve,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenType,
    validateCompoundingFeeBps,
    validateConfigParameters,
    validateMigratedPoolFee,
} from '../src'
import { curveBaseParams } from './utils/curve'

const baseParams = curveBaseParams({
    token: {
        tokenType: TokenType.Token2022,
        tokenAuthorityOption: TokenAuthorityOption.PartnerUpdateAuthority,
    },
})

describe('validateConfigParameters', () => {
    const config = {
        ...buildCurve({
            ...baseParams,
            percentageSupplyOnMigration: 20,
            migrationQuoteThreshold: 100,
        }),
        leftoverReceiver: Keypair.generate().publicKey,
    }

    test('a Token-2022 partner update authority only needs a non-default fee claimer when one is given', () => {
        expect(() => validateConfigParameters(config)).not.toThrow()
        expect(() =>
            validateConfigParameters(config, {
                feeClaimer: Keypair.generate().publicKey,
            })
        ).not.toThrow()
        expect(() =>
            validateConfigParameters(config, { feeClaimer: PublicKey.default })
        ).toThrow('Invalid fee claimer')
    })

    test('checks the curve shape before running curve math on it', () => {
        expect(() =>
            validateConfigParameters({ ...config, curve: [] })
        ).toThrow('Invalid curve')
        expect(() =>
            validateConfigParameters({
                ...config,
                curve: [
                    { ...config.curve[0], sqrtPrice: config.sqrtStartPrice },
                ],
            })
        ).toThrow('Invalid curve')
    })
})

describe('validateCompoundingFeeBps', () => {
    test('Compounding allows 0 to 10_000 bps', () => {
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.Compounding, 500)
        ).toBe(true)
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.Compounding, 0)
        ).toBe(true)
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.Compounding, 10001)
        ).toBe(false)
    })

    test('other modes require 0 bps', () => {
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.QuoteToken, 0)
        ).toBe(true)
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.OutputToken, 0)
        ).toBe(true)
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.QuoteToken, 100)
        ).toBe(false)
        expect(
            validateCompoundingFeeBps(MigratedCollectFeeMode.OutputToken, 250)
        ).toBe(false)
    })
})

describe('validateMigratedPoolFee', () => {
    const compounding = {
        collectFeeMode: MigratedCollectFeeMode.Compounding,
        dynamicFee: DammV2DynamicFeeMode.Enabled,
        poolFeeBps: 300,
    }

    test.each([500, 0, undefined])(
        'Compounding with compoundingFeeBps %s passes',
        (compoundingFeeBps) => {
            expect(
                validateMigratedPoolFee(
                    compounding,
                    MigrationOption.MET_DAMM_V2,
                    MigrationFeeOption.Customizable,
                    undefined,
                    compoundingFeeBps
                )
            ).toBe(true)
        }
    )

    test('a non-compounding mode with a compounding fee fails', () => {
        expect(
            validateMigratedPoolFee(
                {
                    ...compounding,
                    collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                },
                MigrationOption.MET_DAMM_V2,
                MigrationFeeOption.Customizable,
                undefined,
                100
            )
        ).toBe(false)
    })

    test('a market cap scheduler needs a sqrtPriceStepBps that fits a u16', () => {
        const withStep = (sqrtPriceStepBps: number) =>
            validateMigratedPoolFee(
                {
                    collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                    dynamicFee: DammV2DynamicFeeMode.Disabled,
                    poolFeeBps: 1000,
                },
                MigrationOption.MET_DAMM_V2,
                MigrationFeeOption.Customizable,
                {
                    numberOfPeriod: 4,
                    sqrtPriceStepBps,
                    schedulerExpirationDuration: 3600,
                    reductionFactor: new BN(9_000_000),
                },
                0,
                DammV2BaseFeeMode.FeeMarketCapSchedulerLinear
            )
        expect(withStep(65_535)).toBe(true)
        expect(withStep(65_536)).toBe(false)
    })
})
