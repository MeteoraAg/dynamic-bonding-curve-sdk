import { Connection, Keypair } from '@solana/web3.js'
import { expect, test, describe } from 'vitest'
import BN from 'bn.js'
import {
    constantProductBaseFromQuote,
    getMigrationBaseToken,
    validateCompoundingMigrationDeposit,
    getMigrationThresholdPrice,
} from '../src/helpers/common'
import {
    ActivationType,
    BaseFeeMode,
    buildCurve,
    calculateTransferFeeExcludedAmount,
    calculateTransferFeeIncludedAmount,
    CollectFeeMode,
    DynamicBondingCurveClient,
    MigratedCollectFeeMode,
    MigratedTransferFeeAuthorityOption,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
    TransferFeeWithheldAuthority,
    resolveSwapTransferFees,
    validateConfigParameters,
    validateTransferFeeParameters,
    type PoolConfig,
} from '../src'
import type { Mint } from '@solana/spl-token'
import { MAX_BASE_TRANSFER_FEE_BPS, U64_MAX } from '../src/constants'

const baseCurve = buildCurve({
    token: {
        tokenType: TokenType.Token2022,
        tokenBaseDecimal: TokenDecimal.SIX,
        tokenQuoteDecimal: TokenDecimal.NINE,
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
        migrationFeeOption: MigrationFeeOption.Customizable,
        migrationFee: {
            feePercentage: 0,
            creatorFeePercentage: 0,
        },
        migratedPoolFee: {
            collectFeeMode: MigratedCollectFeeMode.Compounding,
            dynamicFee: 0,
            poolFeeBps: 100,
            compoundingFeeBps: 0,
        },
    },
    liquidityDistribution: {
        partnerPermanentLockedLiquidityPercentage: 100,
        partnerLiquidityPercentage: 0,
        creatorPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 0,
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
    migrationQuoteThreshold: 50,
})

describe('transfer fee math', () => {
    const transferFee = {
        transferFeeBasisPoints: 100,
        maximumFee: U64_MAX,
    }

    test('excludes the fee from an included amount', () => {
        const result = calculateTransferFeeExcludedAmount(
            transferFee,
            new BN(1_000_000)
        )
        expect(result.transferFee.eqn(10_000)).toBe(true)
        expect(result.amount.eqn(990_000)).toBe(true)
    })

    test('caps the fee at maximumFee', () => {
        const result = calculateTransferFeeExcludedAmount(
            { transferFeeBasisPoints: 100, maximumFee: new BN(1) },
            new BN(1_000_000)
        )
        expect(result.transferFee.eqn(1)).toBe(true)
        expect(result.amount.eqn(999_999)).toBe(true)
    })

    test('grosses an excluded amount back up and verifies the inverse', () => {
        const excluded = calculateTransferFeeExcludedAmount(
            transferFee,
            new BN(1_000_000)
        )
        const included = calculateTransferFeeIncludedAmount(
            transferFee,
            excluded.amount
        )
        expect(included.transferFee.eq(excluded.transferFee)).toBe(true)
        const checked = calculateTransferFeeExcludedAmount(
            transferFee,
            included.amount
        )
        expect(checked.amount.eq(excluded.amount)).toBe(true)
    })

    test('rejects an included amount above u64', () => {
        expect(() =>
            calculateTransferFeeIncludedAmount(transferFee, U64_MAX)
        ).toThrow('Math overflow')
        expect(() =>
            calculateTransferFeeIncludedAmount(
                { transferFeeBasisPoints: 10_000, maximumFee: new BN(1) },
                U64_MAX
            )
        ).toThrow('Math overflow')
    })

    test('leaves the amount unchanged when there is no fee', () => {
        const amount = new BN(123)
        expect(
            calculateTransferFeeExcludedAmount(null, amount).amount.eq(amount)
        ).toBe(true)
        expect(
            calculateTransferFeeIncludedAmount(null, amount).amount.eq(amount)
        ).toBe(true)
    })
})

describe('compounding migration deposit', () => {
    const sqrtPrice = new BN('583337266871351588')
    const quoteAmount = new BN('50000000000')

    test('uses constant product for a compounding migration base', () => {
        const base = getMigrationBaseToken(
            quoteAmount,
            sqrtPrice,
            MigrationOption.MET_DAMM_V2,
            MigratedCollectFeeMode.Compounding
        )
        expect(
            base.eq(constantProductBaseFromQuote(quoteAmount, sqrtPrice))
        ).toBe(true)
    })

    test('accepts a deposit whose price stays within 1% after the base fee', () => {
        const migrationSqrtPrice = getMigrationThresholdPrice(
            baseCurve.migrationQuoteThreshold,
            baseCurve.sqrtStartPrice,
            baseCurve.curve
        )
        expect(() =>
            validateCompoundingMigrationDeposit({
                migrationQuoteThreshold: baseCurve.migrationQuoteThreshold,
                migrationFeePercentage: baseCurve.migrationFee.feePercentage,
                migrationSqrtPrice,
                baseTransferFee: {
                    transferFeeBasisPoints: 250,
                    maximumFee: U64_MAX,
                },
            })
        ).not.toThrow()
    })

    test('rejects a compounding deposit below dead liquidity', () => {
        expect(() =>
            validateCompoundingMigrationDeposit({
                migrationQuoteThreshold: new BN(1),
                migrationFeePercentage: 0,
                migrationSqrtPrice: sqrtPrice,
            })
        ).toThrow()
    })
})

describe('transfer fee quotes', () => {
    const client = new DynamicBondingCurveClient(
        new Connection('http://127.0.0.1:8899'),
        'confirmed'
    )
    const amountIn = new BN(1_000_000_000)

    test('a base transfer fee reduces the quote bought with quote tokens', () => {
        const noFee = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountIn,
        })
        const withFee = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountIn,
            baseTransferFeeBasisPoints: 250,
        })

        expect(withFee.includedFeeInputAmount.eq(amountIn)).toBe(true)
        expect(withFee.includedTransferFeeAmountIn.eq(amountIn)).toBe(true)
        expect(
            withFee.excludedTransferFeeAmountOut.lt(withFee.outputAmount)
        ).toBe(true)
        expect(
            withFee.excludedTransferFeeAmountOut.lt(noFee.outputAmount)
        ).toBe(true)
        expect(
            withFee.minimumAmountOut!.eq(withFee.excludedTransferFeeAmountOut)
        ).toBe(true)
    })

    test('exact out round trips through the base transfer fee', () => {
        const exactIn = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountIn,
            baseTransferFeeBasisPoints: 250,
        })
        const exactOut = client.pool.getQuoteFromOutputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountOut: exactIn.excludedTransferFeeAmountOut,
            baseTransferFeeBasisPoints: 250,
        })
        const roundTrip = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountIn: exactOut.includedTransferFeeAmountIn,
            baseTransferFeeBasisPoints: 250,
        })

        expect(
            exactOut.excludedTransferFeeAmountOut.eq(
                exactIn.excludedTransferFeeAmountOut
            )
        ).toBe(true)
        expect(
            roundTrip.excludedTransferFeeAmountOut.gte(
                exactIn.excludedTransferFeeAmountOut
            )
        ).toBe(true)
    })

    test('a Token-2022 quote mint requires quoteMint', () => {
        const quoteMint = Keypair.generate().publicKey
        const config = {
            quoteMint,
            quoteTokenFlag: TokenType.Token2022,
            transferFeeBasisPoints: 0,
        } as unknown as PoolConfig

        expect(() => resolveSwapTransferFees(config, false)).toThrow(
            'quoteMint and currentEpoch are required for a Token-2022 quote mint'
        )
        expect(() =>
            resolveSwapTransferFees(config, false, {
                quoteMint: {
                    address: Keypair.generate().publicKey,
                } as Mint,
                currentEpoch: 0,
            })
        ).toThrow('quoteMint does not match config.quoteMint')
        expect(
            resolveSwapTransferFees(
                { ...config, quoteTokenFlag: TokenType.SPLToken },
                false
            )
        ).toEqual({ input: null, output: null })
    })
})

describe('transfer fee config validation', () => {
    const transferFeeParameters = {
        transferFeeBasisPoints: 250,
        withheldAuthority: TransferFeeWithheldAuthority.Creator,
        migratedTransferFeeAuthorityOption:
            MigratedTransferFeeAuthorityOption.Partner,
    }

    test('accepts a token2022 base fee within the cap', () => {
        expect(() =>
            validateTransferFeeParameters(
                transferFeeParameters,
                TokenType.Token2022
            )
        ).not.toThrow()
    })

    test('rejects a base fee above 10%', () => {
        expect(() =>
            validateTransferFeeParameters(
                {
                    ...transferFeeParameters,
                    transferFeeBasisPoints: MAX_BASE_TRANSFER_FEE_BPS + 1,
                },
                TokenType.Token2022
            )
        ).toThrow('Invalid transfer fee parameters')
    })

    test('rejects a base fee on an SPL mint', () => {
        expect(() =>
            validateTransferFeeParameters(
                transferFeeParameters,
                TokenType.SPLToken
            )
        ).toThrow('Base transfer fee requires token type Token2022')
    })

    test('rejects authority fields when the fee is zero', () => {
        expect(() =>
            validateTransferFeeParameters(
                {
                    transferFeeBasisPoints: 0,
                    withheldAuthority: TransferFeeWithheldAuthority.Creator,
                    migratedTransferFeeAuthorityOption:
                        MigratedTransferFeeAuthorityOption.Immutable,
                },
                TokenType.Token2022
            )
        ).toThrow('Invalid transfer fee parameters')
    })

    test('requires constant supply, no vesting, customizable migration, and compounding', () => {
        const leftoverReceiver = Keypair.generate().publicKey
        expect(() =>
            validateConfigParameters(
                { ...baseCurve, leftoverReceiver },
                {
                    transferFeeParameters,
                    quoteMintHasTransferFee: false,
                }
            )
        ).not.toThrow()

        expect(() =>
            validateConfigParameters(
                {
                    ...baseCurve,
                    tokenSupply: null,
                    leftoverReceiver,
                },
                { transferFeeParameters, quoteMintHasTransferFee: false }
            )
        ).toThrow('Transfer fee configs require a constant token supply')
    })
})
