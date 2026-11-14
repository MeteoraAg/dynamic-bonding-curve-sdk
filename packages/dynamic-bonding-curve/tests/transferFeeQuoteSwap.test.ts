import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import BN from 'bn.js'
import { beforeAll, describe, expect, test } from 'vitest'
import {
    ActivationType,
    calculateTransferFeeExcludedAmount,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    getCurrentPoint,
    getSwapQuoteTransferFees,
    SwapMode,
    U64_MAX,
    type PoolConfig,
    type VirtualPool,
} from '../src'
import {
    buildTransferFeeQuoteCurveConfig,
    fundSol,
    LOCALNET_RPC_URL,
} from './utils/common'
import {
    createDbcTokenBadge,
    createTransferFeeQuoteMint,
    getToken2022Balance,
    mintToken2022,
} from './utils/tokenBadgeFlow'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const QUOTE_TRANSFER_FEE_BPS = 100
const SLIPPAGE_BPS = 50

describe(
    'swaps on a pool with a 100 bps transfer-fee quote mint',
    { timeout: 60000 },
    () => {
        const client = new DynamicBondingCurveClient(connection, 'confirmed')
        const user = Keypair.generate()
        let quoteMint: PublicKey
        let baseMint: PublicKey
        let configAddress: PublicKey
        let pool: PublicKey

        beforeAll(async () => {
            const admin = Keypair.generate()
            const operator = Keypair.generate()
            const partner = Keypair.generate()
            const baseMintKeypair = Keypair.generate()
            const config = Keypair.generate()
            for (const account of [admin, operator, partner, user]) {
                await fundSol(connection, account.publicKey)
            }

            quoteMint = await createTransferFeeQuoteMint(
                connection,
                admin,
                QUOTE_TRANSFER_FEE_BPS
            )
            const tokenBadge = await createDbcTokenBadge(
                connection,
                admin,
                operator,
                quoteMint
            )
            await mintToken2022(
                connection,
                admin,
                quoteMint,
                user.publicKey,
                BigInt(100_000_000_000)
            )

            const tx = await client.partner.createConfigAndPool({
                config: config.publicKey,
                feeClaimer: partner.publicKey,
                leftoverReceiver: partner.publicKey,
                payer: partner.publicKey,
                quoteMint,
                tokenBadge,
                ...buildTransferFeeQuoteCurveConfig(),
                preCreatePoolParam: {
                    baseMint: baseMintKeypair.publicKey,
                    name: 'TEST',
                    symbol: 'TEST',
                    uri: 'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2',
                    poolCreator: partner.publicKey,
                },
            })
            tx.feePayer = partner.publicKey
            await sendAndConfirmTransaction(connection, tx, [
                partner,
                config,
                baseMintKeypair,
            ])

            baseMint = baseMintKeypair.publicKey
            configAddress = config.publicKey
            pool = deriveDbcPoolAddress(quoteMint, baseMint, configAddress)
        })

        async function loadPoolState(): Promise<{
            virtualPool: VirtualPool
            poolConfig: PoolConfig
        }> {
            const virtualPool = await client.state.getPool(pool)
            const poolConfig = await client.state.getPoolConfig(configAddress)
            return { virtualPool: virtualPool!, poolConfig: poolConfig! }
        }

        async function quoteContext() {
            const { virtualPool, poolConfig } = await loadPoolState()
            return {
                virtualPool,
                config: poolConfig,
                slippageBps: SLIPPAGE_BPS,
                currentPoint: await getCurrentPoint(
                    connection,
                    ActivationType.Timestamp
                ),
                ...(await getSwapQuoteTransferFees(connection, poolConfig, {
                    baseMint,
                })),
            }
        }

        async function balances() {
            return {
                quote: await getToken2022Balance(
                    connection,
                    quoteMint,
                    user.publicKey
                ),
                base: await getToken2022Balance(
                    connection,
                    baseMint,
                    user.publicKey
                ),
            }
        }

        const swapAccounts = () => ({
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        })

        test('an ExactIn buy debits the quoted gross input and credits the quoted output', async () => {
            const amountIn = new BN(1_000_000_000)
            const quote = client.pool.swapQuote2({
                ...(await quoteContext()),
                swapBaseForQuote: false,
                swapMode: SwapMode.ExactIn,
                amountIn,
            })
            const { amount: receivedByPool } =
                calculateTransferFeeExcludedAmount(
                    { transferFeeBasisPoints: 100, maximumFee: U64_MAX },
                    amountIn
                )
            expect(quote.includedTransferFeeAmountIn.eq(amountIn)).toBe(true)
            expect(quote.includedFeeInputAmount.eq(receivedByPool)).toBe(true)

            const before = await balances()
            const tx = await client.pool.swap2({
                ...swapAccounts(),
                swapBaseForQuote: false,
                swapMode: SwapMode.ExactIn,
                amountIn,
                minimumAmountOut: quote.minimumAmountOut,
            })
            await sendAndConfirmTransaction(connection, tx, [user])
            const after = await balances()

            expect(before.quote - after.quote).toBe(
                BigInt(quote.includedTransferFeeAmountIn.toString())
            )
            expect(after.base - before.base).toBe(
                BigInt(quote.excludedTransferFeeAmountOut.toString())
            )
        })

        test('an ExactOut buy debits the quoted gross input and credits exactly the requested output', async () => {
            const amountOut = new BN(1_000_000)
            const quote = client.pool.swapQuote2({
                ...(await quoteContext()),
                swapBaseForQuote: false,
                swapMode: SwapMode.ExactOut,
                amountOut,
            })
            expect(quote.excludedTransferFeeAmountOut.eq(amountOut)).toBe(true)

            const before = await balances()
            const tx = await client.pool.swap2({
                ...swapAccounts(),
                swapBaseForQuote: false,
                swapMode: SwapMode.ExactOut,
                amountOut,
                maximumAmountIn: quote.maximumAmountIn,
            })
            await sendAndConfirmTransaction(connection, tx, [user])
            const after = await balances()

            expect(before.quote - after.quote).toBe(
                BigInt(quote.includedTransferFeeAmountIn.toString())
            )
            expect(after.base - before.base).toBe(BigInt(amountOut.toString()))
        })

        test('an ExactIn sell debits the base input and credits the output net of the quote transfer fee', async () => {
            const amountIn = new BN(500_000)
            const quote = client.pool.swapQuote2({
                ...(await quoteContext()),
                swapBaseForQuote: true,
                swapMode: SwapMode.ExactIn,
                amountIn,
            })
            expect(
                quote.excludedTransferFeeAmountOut.lt(quote.outputAmount)
            ).toBe(true)
            expect(
                calculateTransferFeeExcludedAmount(
                    { transferFeeBasisPoints: 100, maximumFee: U64_MAX },
                    quote.outputAmount
                ).amount.eq(quote.excludedTransferFeeAmountOut)
            ).toBe(true)

            const before = await balances()
            const tx = await client.pool.swap2({
                ...swapAccounts(),
                swapBaseForQuote: true,
                swapMode: SwapMode.ExactIn,
                amountIn,
                minimumAmountOut: quote.minimumAmountOut,
            })
            await sendAndConfirmTransaction(connection, tx, [user])
            const after = await balances()

            expect(before.base - after.base).toBe(
                BigInt(quote.includedTransferFeeAmountIn.toString())
            )
            expect(after.quote - before.quote).toBe(
                BigInt(quote.excludedTransferFeeAmountOut.toString())
            )
        })
    }
)
