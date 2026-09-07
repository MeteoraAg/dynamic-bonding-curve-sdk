import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { beforeEach, describe, expect, test } from 'vitest'
import {
    ActivationType,
    BaseFeeMode,
    buildCurve,
    CollectFeeMode,
    deriveDammV2PoolAddress,
    deriveDbcPoolAddress,
    deriveDbcPoolAuthority,
    deriveTokenBadgeAddress,
    DynamicBondingCurveClient,
    MigrationFeeOption,
    MigrationOption,
    SwapMode,
    TokenAuthorityOption,
    TokenDecimal,
    TokenType,
} from '../src'
import { BN } from 'bn.js'
import { fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    createDammV2MigrationConfig,
    createDbcTokenBadge,
    createStockQuoteMint,
    mintToken2022,
} from './utils/tokenBadgeFlow'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const TOKEN_NAME = 'TEST'
const TOKEN_SYMBOL = 'TEST'
const TOKEN_URI =
    'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2'
const MIGRATION_QUOTE_THRESHOLD = 10
const QUOTE_DECIMALS = TokenDecimal.SIX

function buildBadgedQuoteCurveConfig() {
    return buildCurve({
        token: {
            tokenType: TokenType.Token2022,
            tokenBaseDecimal: TokenDecimal.SIX,
            tokenQuoteDecimal: QUOTE_DECIMALS,
            tokenAuthorityOption: TokenAuthorityOption.PartnerUpdateAuthority,
            totalTokenSupply: 1_000_000_000,
            leftover: 0,
        },
        fee: {
            baseFeeParams: {
                baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
                feeSchedulerParam: {
                    startingFeeBps: 25,
                    endingFeeBps: 25,
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
            migrationFeeOption: MigrationFeeOption.FixedBps25,
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
        migrationQuoteThreshold: MIGRATION_QUOTE_THRESHOLD,
    })
}

describe(
    'token badge quote mint full flow (DBC -> DAMM v2)',
    { timeout: 120000 },
    () => {
        let admin: Keypair
        let operator: Keypair
        let partner: Keypair
        let poolCreator: Keypair
        let user: Keypair
        let dbcClient: DynamicBondingCurveClient
        let quoteMint: PublicKey
        let tokenBadge: PublicKey

        beforeEach(async () => {
            admin = Keypair.generate()
            operator = Keypair.generate()
            partner = Keypair.generate()
            poolCreator = Keypair.generate()
            user = Keypair.generate()

            for (const account of [
                admin,
                operator,
                partner,
                poolCreator,
                user,
            ]) {
                await fundSol(connection, account.publicKey)
            }

            dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')
            quoteMint = await createStockQuoteMint(connection, admin)
            tokenBadge = deriveTokenBadgeAddress(quoteMint)
        })

        test('rejects createConfig when the quote mint needs a badge and none is passed', async () => {
            const config = Keypair.generate()
            const createConfigTx = await dbcClient.partner.createConfig({
                config: config.publicKey,
                feeClaimer: partner.publicKey,
                leftoverReceiver: partner.publicKey,
                payer: partner.publicKey,
                quoteMint,
                ...buildBadgedQuoteCurveConfig(),
            })
            createConfigTx.feePayer = partner.publicKey

            await expect(
                sendAndConfirmTransaction(connection, createConfigTx, [
                    partner,
                    config,
                ])
            ).rejects.toThrow(/Invalid token badge/)
        })

        test('badges a Token-2022 quote mint, launches on DBC, and migrates to DAMM v2', async () => {
            await createDbcTokenBadge(connection, admin, operator, quoteMint)

            const badgeAccount = await dbcClient.state.getTokenBadge(quoteMint)
            expect(badgeAccount).not.toBeNull()
            expect(badgeAccount!.tokenMint.equals(quoteMint)).toBe(true)

            const config = Keypair.generate()
            const curveConfig = buildBadgedQuoteCurveConfig()
            const createConfigTx = await dbcClient.partner.createConfig({
                config: config.publicKey,
                feeClaimer: partner.publicKey,
                leftoverReceiver: partner.publicKey,
                payer: partner.publicKey,
                quoteMint,
                tokenBadge,
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
            expect(configState!.quoteMint.equals(quoteMint)).toBe(true)
            expect(configState!.tokenType).toBe(TokenType.Token2022)

            const baseMint = Keypair.generate()
            const createPoolTx = await dbcClient.creator.createPool({
                baseMint: baseMint.publicKey,
                config: config.publicKey,
                name: TOKEN_NAME,
                symbol: TOKEN_SYMBOL,
                uri: TOKEN_URI,
                payer: poolCreator.publicKey,
                poolCreator: poolCreator.publicKey,
                tokenBadge,
            })
            createPoolTx.feePayer = poolCreator.publicKey
            await sendAndConfirmTransaction(connection, createPoolTx, [
                baseMint,
                poolCreator,
            ])

            const pool = deriveDbcPoolAddress(
                quoteMint,
                baseMint.publicKey,
                config.publicKey
            )
            const poolState = await dbcClient.state.getPool(pool)
            expect(poolState).not.toBeNull()
            expect(poolState!.poolState.isMigrated).toBe(0)

            const swapAmount = BigInt(
                (MIGRATION_QUOTE_THRESHOLD + 5) * 10 ** QUOTE_DECIMALS
            )
            await mintToken2022(
                connection,
                admin,
                quoteMint,
                user.publicKey,
                swapAmount
            )

            const swapTx = await dbcClient.pool.swap2({
                pool,
                owner: user.publicKey,
                payer: user.publicKey,
                swapBaseForQuote: false,
                swapMode: SwapMode.PartialFill,
                amountIn: new BN(swapAmount.toString()),
                minimumAmountOut: new BN(0),
                referralTokenAccount: null,
            })
            swapTx.feePayer = user.publicKey
            await sendAndConfirmTransaction(connection, swapTx, [user])

            const poolAfterSwap = await dbcClient.state.getPool(pool)
            expect(
                poolAfterSwap!.poolState.quoteReserve.gte(
                    configState!.migrationQuoteThreshold
                )
            ).toBe(true)
            expect(poolAfterSwap!.poolState.isMigrated).toBe(0)

            await fundSol(connection, deriveDbcPoolAuthority(), 1)

            const dammConfig = await createDammV2MigrationConfig(
                connection,
                admin
            )

            const {
                transaction: migrateTx,
                firstPositionNftKeypair,
                secondPositionNftKeypair,
            } = await dbcClient.migration.migrateToDammV2({
                pool,
                dammConfig,
                payer: poolCreator.publicKey,
            })
            migrateTx.feePayer = poolCreator.publicKey
            await sendAndConfirmTransaction(connection, migrateTx, [
                poolCreator,
                firstPositionNftKeypair,
                secondPositionNftKeypair,
            ])

            const poolAfterMigration = await dbcClient.state.getPool(pool)
            expect(poolAfterMigration!.poolState.isMigrated).toBe(1)

            const dammPool = deriveDammV2PoolAddress(
                dammConfig,
                baseMint.publicKey,
                quoteMint
            )
            const dammPoolAccount = await connection.getAccountInfo(dammPool)
            expect(dammPoolAccount).not.toBeNull()
        })
    }
)
