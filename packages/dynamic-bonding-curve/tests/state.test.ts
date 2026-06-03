import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
} from '@solana/web3.js'
import { beforeEach, describe, expect, test } from 'vitest'
import { NATIVE_MINT } from '@solana/spl-token'
import BN from 'bn.js'
import {
    ConfigParameters,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    TokenType,
} from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import { TRANSFER_HOOK_COUNTER_PROGRAM_ID } from './utils/transferHookCounter'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const TOKEN_NAME = 'TEST'
const TOKEN_SYMBOL = 'TEST'
const TOKEN_URI =
    'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2'

describe('state query endpoints', { timeout: 90000 }, () => {
    let partner: Keypair
    let poolCreator: Keypair
    let dbcClient: DynamicBondingCurveClient

    beforeEach(async () => {
        partner = Keypair.generate()
        poolCreator = Keypair.generate()

        for (const account of [partner, poolCreator]) {
            await fundSol(connection, account.publicKey)
        }

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')
    })

    test('cover every state endpoint for a standard SPL pool', async () => {
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const curveConfig = buildTestCurveConfig()

        await createStandardConfigAndPool(config, baseMint, curveConfig)

        const pool = derivePool(config.publicKey, baseMint.publicKey)
        await assertStateEndpoints({
            config: config.publicKey,
            pool,
            baseMint: baseMint.publicKey,
            owner: partner.publicKey,
            creator: poolCreator.publicKey,
            expectedTokenType: TokenType.SPLToken,
        })
    })

    test('cover every state endpoint for a transfer-hook pool', async () => {
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const curveConfig = buildTransferHookCurveConfig()

        await createTransferHookConfigAndPool(config, baseMint, curveConfig)

        const pool = derivePool(config.publicKey, baseMint.publicKey)
        await assertStateEndpoints({
            config: config.publicKey,
            pool,
            baseMint: baseMint.publicKey,
            owner: partner.publicKey,
            creator: poolCreator.publicKey,
            expectedTokenType: TokenType.Token2022,
        })
    })

    async function assertStateEndpoints(params: {
        config: PublicKey
        pool: PublicKey
        baseMint: PublicKey
        owner: PublicKey
        creator: PublicKey
        expectedTokenType: TokenType
    }) {
        const { config, pool, baseMint, owner, creator, expectedTokenType } =
            params

        const [
            configState,
            poolState,
            configs,
            configsByOwner,
            pools,
            poolsByConfig,
            poolsByCreator,
            poolByBaseMint,
            migrationQuoteThreshold,
            quoteTokenProgress,
            baseTokenProgress,
            poolFeeMetrics,
            poolFeeBreakdown,
            poolsFeesByConfig,
            poolsFeesByCreator,
        ] = await Promise.all([
            dbcClient.state.getPoolConfig(config),
            dbcClient.state.getPool(pool),
            dbcClient.state.getPoolConfigs(),
            dbcClient.state.getPoolConfigsByOwner(owner),
            dbcClient.state.getPools(),
            dbcClient.state.getPoolsByConfig(config),
            dbcClient.state.getPoolsByCreator(creator),
            dbcClient.state.getPoolByBaseMint(baseMint),
            dbcClient.state.getPoolMigrationQuoteThreshold(pool),
            dbcClient.state.getPoolQuoteTokenCurveProgress(pool),
            dbcClient.state.getPoolBaseTokenCurveProgress(pool),
            dbcClient.state.getPoolFeeMetrics(pool),
            dbcClient.state.getPoolFeeBreakdown(pool),
            dbcClient.state.getPoolsFeesByConfig(config),
            dbcClient.state.getPoolsFeesByCreator(creator),
        ])

        expect(configState).not.toBeNull()
        expect(configState!.tokenType).toBe(expectedTokenType)
        expect(poolState).not.toBeNull()
        expect(poolState!.poolState.baseMint.toString()).toBe(
            baseMint.toString()
        )

        expectAccountListToContain(configs, config)
        expectAccountListToContain(configsByOwner, config)
        expectAccountListToContain(pools, pool)
        expectAccountListToContain(poolsByConfig, pool)
        expectAccountListToContain(poolsByCreator, pool)
        expect(poolByBaseMint?.publicKey.toString()).toBe(pool.toString())

        expect(migrationQuoteThreshold.gt(new BN(0))).toBe(true)
        expect(quoteTokenProgress).toBe(0)
        expect(baseTokenProgress).toBe(0)
        expect(poolFeeMetrics.total.totalTradingQuoteFee.isZero()).toBe(true)
        expect(poolFeeBreakdown.partner.unclaimedQuoteFee.isZero()).toBe(true)
        expectPoolFeeListToContain(poolsFeesByConfig, pool)
        expectPoolFeeListToContain(poolsFeesByCreator, pool)

        // metadata getters: none created here, so the lists are empty
        const [poolMetadata, partnerMetadata] = await Promise.all([
            dbcClient.state.getPoolMetadata(pool),
            dbcClient.state.getPartnerMetadata(owner),
        ])
        expect(Array.isArray(poolMetadata)).toBe(true)
        expect(Array.isArray(partnerMetadata)).toBe(true)
    }

    async function createStandardConfigAndPool(
        config: Keypair,
        baseMint: Keypair,
        curveConfig: ConfigParameters
    ) {
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

        const createPoolTx = await dbcClient.creator.createPool({
            baseMint: baseMint.publicKey,
            config: config.publicKey,
            name: TOKEN_NAME,
            symbol: TOKEN_SYMBOL,
            uri: TOKEN_URI,
            payer: poolCreator.publicKey,
            poolCreator: poolCreator.publicKey,
        })
        createPoolTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, createPoolTx, [
            baseMint,
            poolCreator,
        ])
    }

    async function createTransferHookConfigAndPool(
        config: Keypair,
        baseMint: Keypair,
        curveConfig: ConfigParameters
    ) {
        const createConfigTx =
            await dbcClient.partner.createConfigWithTransferHook({
                config: config.publicKey,
                feeClaimer: partner.publicKey,
                leftoverReceiver: partner.publicKey,
                payer: partner.publicKey,
                quoteMint: NATIVE_MINT,
                transferHookProgram: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
                ...curveConfig,
            })
        createConfigTx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, createConfigTx, [
            partner,
            config,
        ])

        const createPoolTx = await dbcClient.creator.createPoolWithTransferHook(
            {
                baseMint: baseMint.publicKey,
                config: config.publicKey,
                name: TOKEN_NAME,
                symbol: TOKEN_SYMBOL,
                uri: TOKEN_URI,
                payer: poolCreator.publicKey,
                poolCreator: poolCreator.publicKey,
                transferHookProgram: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
            }
        )
        createPoolTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, createPoolTx, [
            baseMint,
            poolCreator,
        ])
    }
})

function buildTransferHookCurveConfig(): ConfigParameters {
    return {
        ...buildTestCurveConfig(),
        tokenType: TokenType.Token2022,
    }
}

function derivePool(config: PublicKey, baseMint: PublicKey): PublicKey {
    return deriveDbcPoolAddress(NATIVE_MINT, baseMint, config)
}

function expectAccountListToContain(
    accounts: Array<{ publicKey: PublicKey }>,
    expected: PublicKey
) {
    expect(accounts.map((account) => account.publicKey.toString())).toContain(
        expected.toString()
    )
}

function expectPoolFeeListToContain(
    fees: Array<{ poolAddress: PublicKey }>,
    expectedPool: PublicKey
) {
    expect(fees.map((fee) => fee.poolAddress.toString())).toContain(
        expectedPool.toString()
    )
}
