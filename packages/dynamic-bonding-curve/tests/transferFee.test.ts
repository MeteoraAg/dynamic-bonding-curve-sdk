import { Connection, Keypair, PublicKey } from '@solana/web3.js'
import { expect, test, describe } from 'vitest'
import BN from 'bn.js'
import {
    constantProductBaseFromQuote,
    getMigrationBaseToken,
    getMigrationDepositAmounts,
    getTransferFeeMigrationPositionSplit,
    validateCompoundingMigrationDeposit,
    getMigrationThresholdPrice,
} from '../src/helpers/migration'
import {
    buildCurve,
    calculateTransferFeeExcludedAmount,
    calculateTransferFeeIncludedAmount,
    DynamicBondingCurveClient,
    getSwapQuoteTransferFees,
    MigratedCollectFeeMode,
    MigratedTransferFeeAuthorityOption,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    TokenType,
    TransferFeeWithheldAuthority,
    isZeroTransferFee,
    resolveSwapTransferFees,
    validateConfigParameters,
    validateTransferFeeParameters,
    type LockedVestingParams,
    type MigratedPoolFeeConfig,
    type PoolConfig,
    type QuotePoolConfig,
    type QuoteVirtualPool,
    SwapMode,
} from '../src'
import { getMint, TOKEN_2022_PROGRAM_ID, type Mint } from '@solana/spl-token'
import { MAX_BASE_TRANSFER_FEE_BPS, U64_MAX } from '../src/constants'
import { swapQuoteExactIn } from '../src/math/swapQuote'
import {
    buildTransferFeeQuoteCurveConfig,
    fundSol,
    LOCALNET_RPC_URL,
} from './utils/common'
import { curveBaseParams } from './utils/curve'
import { createTransferFeeQuoteMint } from './utils/tokenBadgeFlow'

const baseCurve = buildTransferFeeQuoteCurveConfig()

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
        ).toThrow('Math operation overflow')
        expect(() =>
            calculateTransferFeeIncludedAmount(
                { transferFeeBasisPoints: 10_000, maximumFee: new BN(1) },
                U64_MAX
            )
        ).toThrow('Math operation overflow')
    })

    test('treats a zero maximum fee as no fee', () => {
        const amount = new BN(1_000_000)
        const transferFee = {
            transferFeeBasisPoints: 100,
            maximumFee: new BN(0),
        }
        expect(isZeroTransferFee(transferFee)).toBe(true)
        expect(
            calculateTransferFeeExcludedAmount(transferFee, amount).amount.eq(
                amount
            )
        ).toBe(true)
        expect(
            calculateTransferFeeIncludedAmount(transferFee, amount).amount.eq(
                amount
            )
        ).toBe(true)
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

    test('rounds the scaled base up so the deposit price stays at or below the budget', () => {
        const [depositBase, depositQuote] = getMigrationDepositAmounts(
            new BN(10),
            new BN(3),
            new BN(10),
            new BN(1)
        )
        expect(depositBase.eqn(4)).toBe(true)
        expect(depositQuote.eqn(1)).toBe(true)
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

describe('transfer fee migration position split', () => {
    test('uses the configured percentage instead of the rounded bucket total', () => {
        const split = getTransferFeeMigrationPositionSplit({
            distributableLiquidity: new BN(199),
            partnerLiquidityPercentage: 1,
            partnerPermanentLockedLiquidityPercentage: 1,
            partnerVestingPercentage: 1,
        })
        const roundedBucketTotal = new BN(199).muln(1).divn(100).muln(3)

        expect(split.secondPosition).toBe('partner')
        expect(split.numerator.eqn(30_000_000)).toBe(true)
        expect(split.secondPositionLiquidity.eqn(5)).toBe(true)
        expect(roundedBucketTotal.eqn(3)).toBe(true)
    })

    test('splits the creator side when the partner holds more liquidity', () => {
        const split = getTransferFeeMigrationPositionSplit({
            distributableLiquidity: new BN(199),
            partnerLiquidityPercentage: 60,
            partnerPermanentLockedLiquidityPercentage: 0,
            partnerVestingPercentage: 0,
        })

        expect(split.secondPosition).toBe('creator')
        expect(split.numerator.eq(new BN('400000000'))).toBe(true)
        expect(split.secondPositionLiquidity.eqn(79)).toBe(true)
    })

    test('splits the partner side when the two sides are equal', () => {
        const split = getTransferFeeMigrationPositionSplit({
            distributableLiquidity: new BN(100),
            partnerLiquidityPercentage: 50,
            partnerPermanentLockedLiquidityPercentage: 0,
            partnerVestingPercentage: 0,
        })

        expect(split.secondPosition).toBe('partner')
        expect(split.secondPositionLiquidity.eqn(50)).toBe(true)
    })
})

describe('transfer fee quotes', () => {
    const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
    const client = new DynamicBondingCurveClient(connection, 'confirmed')
    const amountIn = new BN(1_000_000_000)

    test('charges the Token-2022 quote mint fee before the config exists', async () => {
        const payer = Keypair.generate()
        await fundSol(connection, payer.publicKey)
        const quoteMint = await createTransferFeeQuoteMint(
            connection,
            payer,
            100
        )
        const transferFees = await getSwapQuoteTransferFees(connection, {
            quoteMint,
            quoteTokenFlag: TokenType.Token2022,
        })

        const quote = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountIn,
            quoteTokenFlag: TokenType.Token2022,
            ...transferFees,
        })

        const { amount: amountAfterFee } = calculateTransferFeeExcludedAmount(
            { transferFeeBasisPoints: 100, maximumFee: U64_MAX },
            amountIn
        )
        expect(quote.includedTransferFeeAmountIn.eq(amountIn)).toBe(true)
        expect(quote.includedFeeInputAmount.eq(amountAfterFee)).toBe(true)
    })

    test('rejects a mint address where a decoded Mint is expected', () => {
        const address = Keypair.generate().publicKey as unknown as Mint

        expect(() =>
            client.pool.getQuoteFromInputAmount({
                config: baseCurve,
                swapBaseForQuote: false,
                amountIn,
                quoteTokenFlag: TokenType.Token2022,
                quoteMint: address,
                currentEpoch: 0,
            })
        ).toThrow('quoteMint must be the decoded Mint account')
        expect(() =>
            client.pool.getQuoteFromOutputAmount({
                config: baseCurve,
                swapBaseForQuote: false,
                amountOut: amountIn,
                baseMint: address,
                currentEpoch: 0,
            })
        ).toThrow('baseMint must be the decoded Mint account')
    })

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

    async function decodedTransferFeeMint(
        transferFeeBasisPoints: number
    ): Promise<Mint> {
        const payer = Keypair.generate()
        await fundSol(connection, payer.publicKey)
        const address = await createTransferFeeQuoteMint(
            connection,
            payer,
            transferFeeBasisPoints,
            null
        )
        return getMint(connection, address, 'confirmed', TOKEN_2022_PROGRAM_ID)
    }

    const baseFee250 = { transferFeeBasisPoints: 250, maximumFee: U64_MAX }

    /** The pool right after a no-fee buy of amountIn, so there is quote to sell back into. */
    function poolAfterBuy(): QuoteVirtualPool {
        const buy = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountIn,
        })
        return {
            poolState: {
                sqrtPrice: buy.nextSqrtPrice,
                quoteReserve: amountIn,
                activationPoint: new BN(0),
                hasSwap: 1,
                volatilityTracker: { volatilityAccumulator: new BN(0) },
            },
        }
    }

    const quoteConfig: QuotePoolConfig = {
        poolFees: {
            baseFee: baseCurve.poolFees.baseFee,
            dynamicFee: { initialized: 0, binStep: 0, variableFeeControl: 0 },
        },
        collectFeeMode: baseCurve.collectFeeMode,
        sqrtStartPrice: baseCurve.sqrtStartPrice,
        migrationQuoteThreshold: baseCurve.migrationQuoteThreshold,
        migrationSqrtPrice: getMigrationThresholdPrice(
            baseCurve.migrationQuoteThreshold,
            baseCurve.sqrtStartPrice,
            baseCurve.curve
        ),
        curve: baseCurve.curve,
        enableFirstSwapWithMinFee: 0,
        quoteTokenFlag: TokenType.SPLToken,
        transferFeeFlag: 0,
        transferFeeBasisPoints: 0,
    }

    test('a sell with a base transfer fee swaps only what the pool receives after the fee', () => {
        const sellAmount = new BN(10_000_000)
        const sell = (transferFees?: { baseTransferFeeBasisPoints: number }) =>
            swapQuoteExactIn(
                poolAfterBuy(),
                quoteConfig,
                true,
                sellAmount,
                0,
                false,
                new BN(0),
                false,
                transferFees
            )
        const withFee = sell({ baseTransferFeeBasisPoints: 250 })
        const { amount: receivedByPool } = calculateTransferFeeExcludedAmount(
            baseFee250,
            sellAmount
        )
        const noFeeOnReceived = swapQuoteExactIn(
            poolAfterBuy(),
            quoteConfig,
            true,
            receivedByPool,
            0,
            false,
            new BN(0),
            false
        )

        expect(withFee.includedTransferFeeAmountIn.eq(sellAmount)).toBe(true)
        expect(withFee.includedFeeInputAmount.eq(receivedByPool)).toBe(true)
        expect(withFee.outputAmount.eq(noFeeOnReceived.outputAmount)).toBe(true)
        expect(withFee.outputAmount.lt(sell().outputAmount)).toBe(true)
        expect(
            withFee.excludedTransferFeeAmountOut.eq(withFee.outputAmount)
        ).toBe(true)
    })

    test('a partial-fill buy keeps the quote input and nets the base fee from the output', () => {
        const hugeAmountIn = new BN(1_000_000_000_000_000)
        const partial = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            swapMode: SwapMode.PartialFill,
            amountIn: hugeAmountIn,
            baseTransferFeeBasisPoints: 250,
        })
        const { amount: netOutput } = calculateTransferFeeExcludedAmount(
            baseFee250,
            partial.outputAmount
        )

        expect(partial.includedTransferFeeAmountIn.lt(hugeAmountIn)).toBe(true)
        expect(
            partial.excludedTransferFeeAmountOut.lt(partial.outputAmount)
        ).toBe(true)
        expect(partial.excludedTransferFeeAmountOut.eq(netOutput)).toBe(true)
        expect(partial.minimumAmountOut!.eq(netOutput)).toBe(true)
    })

    test('a decoded baseMint takes precedence over baseTransferFeeBasisPoints', async () => {
        const baseMint = await decodedTransferFeeMint(300)
        const quote = (transferFees: {
            baseMint?: Mint
            baseTransferFeeBasisPoints?: number
            currentEpoch?: number
        }) =>
            client.pool.getQuoteFromInputAmount({
                config: baseCurve,
                swapBaseForQuote: false,
                amountIn,
                ...transferFees,
            })

        const both = quote({
            baseMint,
            currentEpoch: 0,
            baseTransferFeeBasisPoints: 100,
        })
        const mintOnly = quote({ baseMint, currentEpoch: 0 })
        const basisPointsOnly = quote({ baseTransferFeeBasisPoints: 100 })

        expect(
            both.excludedTransferFeeAmountOut.eq(
                mintOnly.excludedTransferFeeAmountOut
            )
        ).toBe(true)
        expect(
            both.excludedTransferFeeAmountOut.eq(
                calculateTransferFeeExcludedAmount(
                    { transferFeeBasisPoints: 300, maximumFee: U64_MAX },
                    both.outputAmount
                ).amount
            )
        ).toBe(true)
        expect(
            both.excludedTransferFeeAmountOut.lt(
                basisPointsOnly.excludedTransferFeeAmountOut
            )
        ).toBe(true)
    })

    test('a decoded zero-fee baseMint overrides a non-zero baseTransferFeeBasisPoints', async () => {
        const baseMint = await decodedTransferFeeMint(0)
        const quote = client.pool.getQuoteFromInputAmount({
            config: baseCurve,
            swapBaseForQuote: false,
            amountIn,
            baseMint,
            currentEpoch: 0,
            baseTransferFeeBasisPoints: 250,
        })

        expect(quote.excludedTransferFeeAmountOut.eq(quote.outputAmount)).toBe(
            true
        )
    })

    test('a decoded baseMint or quoteMint needs currentEpoch', async () => {
        const mint = await decodedTransferFeeMint(100)
        const config = {
            quoteMint: mint.address,
            quoteTokenFlag: TokenType.Token2022,
            transferFeeBasisPoints: 0,
        } as unknown as PoolConfig

        expect(() =>
            client.pool.getQuoteFromInputAmount({
                config: baseCurve,
                swapBaseForQuote: false,
                amountIn,
                baseMint: mint,
            })
        ).toThrow('currentEpoch is required to quote a transfer fee')
        expect(() =>
            client.pool.getQuoteFromOutputAmount({
                config: baseCurve,
                swapBaseForQuote: false,
                amountOut: amountIn,
                quoteTokenFlag: TokenType.Token2022,
                quoteMint: mint,
            })
        ).toThrow('currentEpoch is required to quote a transfer fee')
        expect(() =>
            resolveSwapTransferFees(config, false, { quoteMint: mint })
        ).toThrow('currentEpoch is required to quote a transfer fee')
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
                    tlvData: Buffer.alloc(0),
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
    const feeClaimer = Keypair.generate().publicKey
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
                TokenType.Token2022,
                feeClaimer
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
                TokenType.Token2022,
                feeClaimer
            )
        ).toThrow('Invalid transfer fee parameters')
    })

    test('rejects a base fee on an SPL mint', () => {
        expect(() =>
            validateTransferFeeParameters(
                transferFeeParameters,
                TokenType.SPLToken,
                feeClaimer
            )
        ).toThrow('Base transfer fee requires token type Token2022')
    })

    test('rejects a zero fee that is immutable before and after migration', () => {
        expect(() =>
            validateTransferFeeParameters(
                {
                    transferFeeBasisPoints: 0,
                    withheldAuthority: TransferFeeWithheldAuthority.Creator,
                    migratedTransferFeeAuthorityOption:
                        MigratedTransferFeeAuthorityOption.Immutable,
                },
                TokenType.Token2022,
                feeClaimer
            )
        ).toThrow('Invalid transfer fee parameters')
        expect(() =>
            validateTransferFeeParameters(
                {
                    transferFeeBasisPoints: 0,
                    withheldAuthority: TransferFeeWithheldAuthority.Creator,
                    migratedTransferFeeAuthorityOption:
                        MigratedTransferFeeAuthorityOption.RevokeZeroFee,
                },
                TokenType.Token2022,
                feeClaimer
            )
        ).toThrow('Invalid transfer fee parameters')
    })

    test('accepts a zero fee when an authority remains after migration', () => {
        expect(() =>
            validateTransferFeeParameters(
                {
                    transferFeeBasisPoints: 0,
                    withheldAuthority: TransferFeeWithheldAuthority.Creator,
                    migratedTransferFeeAuthorityOption:
                        MigratedTransferFeeAuthorityOption.Creator,
                },
                TokenType.Token2022,
                feeClaimer
            )
        ).not.toThrow()
    })

    test('rejects a default fee claimer when the partner holds a transfer fee authority', () => {
        expect(() =>
            validateTransferFeeParameters(
                transferFeeParameters,
                TokenType.Token2022,
                PublicKey.default
            )
        ).toThrow('Invalid fee claimer')
    })

    describe('restrictions on the curve shape', () => {
        const compoundingMigratedPoolFee: MigratedPoolFeeConfig = {
            collectFeeMode: MigratedCollectFeeMode.Compounding,
            dynamicFee: 0,
            poolFeeBps: 100,
            compoundingFeeBps: 0,
        }
        const curveWith = (overrides: {
            lockedVesting?: LockedVestingParams
            migrationFeeOption?: MigrationFeeOption
            migratedPoolFee?: MigratedPoolFeeConfig
        }) => {
            const curve = buildCurve({
                ...curveBaseParams({
                    token: { tokenType: TokenType.Token2022 },
                    lockedVesting: overrides.lockedVesting,
                    migration: {
                        migrationOption: MigrationOption.MET_DAMM_V2,
                        migrationFeeOption:
                            overrides.migrationFeeOption ??
                            MigrationFeeOption.Customizable,
                        migrationFee: {
                            feePercentage: 0,
                            creatorFeePercentage: 0,
                        },
                        migratedPoolFee:
                            overrides.migratedPoolFee ??
                            compoundingMigratedPoolFee,
                    },
                }),
                percentageSupplyOnMigration: 20,
                migrationQuoteThreshold: 50,
            })
            const supply = curve.tokenSupply!.preMigrationTokenSupply
            return {
                ...curve,
                tokenSupply: {
                    preMigrationTokenSupply: supply,
                    postMigrationTokenSupply: supply,
                },
            }
        }

        const validate = (curve: ReturnType<typeof curveWith> | null) =>
            validateConfigParameters(
                {
                    ...(curve ?? baseCurve),
                    ...(curve ? {} : { tokenSupply: null }),
                    leftoverReceiver: Keypair.generate().publicKey,
                },
                {
                    transferFeeParameters,
                    quoteMintHasTransferFee: false,
                    feeClaimer,
                }
            )

        test('accepts the compounding customizable curve with constant supply', () => {
            expect(() => validate(curveWith({}))).not.toThrow()
        })

        test('rejects a variable token supply', () => {
            expect(() => validate(null)).toThrow(
                'Transfer fee configs require a constant token supply'
            )
        })

        test('rejects locked vesting', () => {
            expect(() =>
                validate(
                    curveWith({
                        lockedVesting: {
                            totalLockedVestingAmount: 1_000_000,
                            numberOfVestingPeriod: 10,
                            cliffUnlockAmount: 0,
                            totalVestingDuration: 10,
                            cliffDurationFromMigrationTime: 0,
                        },
                    })
                )
            ).toThrow('Transfer fee configs cannot include locked vesting')
        })

        test('rejects a fixed migration fee option', () => {
            expect(() =>
                validate(
                    curveWith({
                        migrationFeeOption: MigrationFeeOption.FixedBps100,
                    })
                )
            ).toThrow(
                'Transfer fee configs require MigrationFeeOption.Customizable'
            )
        })

        test('rejects a migrated pool that does not compound', () => {
            expect(() =>
                validate(
                    curveWith({
                        migratedPoolFee: {
                            collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                            dynamicFee: 0,
                            poolFeeBps: 100,
                        },
                    })
                )
            ).toThrow(
                'Transfer fee configs require MigratedCollectFeeMode.Compounding'
            )
        })
    })

    test('applies the transfer fee restrictions when the basis points are zero', () => {
        const leftoverReceiver = Keypair.generate().publicKey
        expect(() =>
            validateConfigParameters(
                {
                    ...baseCurve,
                    tokenSupply: null,
                    leftoverReceiver,
                },
                {
                    transferFeeParameters: {
                        transferFeeBasisPoints: 0,
                        withheldAuthority: TransferFeeWithheldAuthority.Creator,
                        migratedTransferFeeAuthorityOption:
                            MigratedTransferFeeAuthorityOption.Creator,
                    },
                    feeClaimer,
                }
            )
        ).toThrow('Transfer fee configs require a constant token supply')
    })

    test('rejects a default fee claimer for a Token-2022 partner authority', () => {
        const leftoverReceiver = Keypair.generate().publicKey
        expect(() =>
            validateConfigParameters(
                {
                    ...baseCurve,
                    tokenType: TokenType.Token2022,
                    tokenUpdateAuthority:
                        TokenAuthorityOption.PartnerUpdateAuthority,
                    leftoverReceiver,
                },
                { feeClaimer: PublicKey.default }
            )
        ).toThrow('Invalid fee claimer')
    })
})
