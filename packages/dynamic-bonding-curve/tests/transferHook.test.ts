import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js'
import {
    getMint,
    getTransferHook,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import BN from 'bn.js'
import { beforeEach, describe, expect, test } from 'vitest'
import {
    bpsToFeeNumerator,
    createDbcProgram,
    deriveDbcPoolAddress,
    deriveDbcPoolAuthority,
    DynamicBondingCurveClient,
    FEE_DENOMINATOR,
    SwapMode,
    TokenType,
    type ConfigParameters,
    type Swap2Params,
} from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'
import {
    getCounterValue,
    getTransferHookRemainingAccounts,
    initializeExtraAccountMetaListTx,
    TRANSFER_HOOK_COUNTER_PROGRAM_ID,
} from './utils/transferHookCounter'

const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')
const TOKEN_NAME = 'TEST'
const TOKEN_SYMBOL = 'TEST'
const TOKEN_URI =
    'https://ipfs.io/ipfs/QmdcU6CRSNr6qYmyQAGjvFyZajEs9W1GH51rddCFw7S6p2'

let partner: Keypair
let poolCreator: Keypair
let user: Keypair
let creator: Keypair
let dbcClient: DynamicBondingCurveClient

describe('transfer hook SDK tests', { timeout: 90000 }, () => {
    beforeEach(async () => {
        partner = Keypair.generate()
        poolCreator = Keypair.generate()
        user = Keypair.generate()
        creator = Keypair.generate()

        for (const account of [partner, poolCreator, user, creator]) {
            await fundSol(connection, account.publicKey)
        }

        dbcClient = new DynamicBondingCurveClient(connection, 'confirmed')
    })

    test('createConfigWithTransferHook creates a transfer-hook config', async () => {
        const config = Keypair.generate()
        const curveConfig = buildTransferHookCurveConfig()

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

        const configState = await dbcClient.state.getPoolConfig(
            config.publicKey
        )
        expect(configState).not.toBeNull()
        expect(configState!.tokenType).toBe(TokenType.Token2022)

        const configWithTransferHook = await createDbcProgram(
            connection
        ).program.account.configWithTransferHook.fetch(config.publicKey)
        expect(configWithTransferHook.transferHookProgram.toString()).toBe(
            TRANSFER_HOOK_COUNTER_PROGRAM_ID.toString()
        )
    })

    test('createPoolWithTransferHook initializes a transfer-hook pool', async () => {
        const { config } = await createTransferHookConfig()
        const baseMint = Keypair.generate()

        await createTransferHookPool(config.publicKey, baseMint)

        const pool = derivePool(config.publicKey, baseMint.publicKey)
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()

        const mintInfo = await getMint(
            connection,
            baseMint.publicKey,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
        )
        const transferHook = getTransferHook(mintInfo)
        expect(transferHook).not.toBeNull()
        expect(transferHook!.programId.toString()).toBe(
            TRANSFER_HOOK_COUNTER_PROGRAM_ID.toString()
        )
        expect(transferHook!.authority.toString()).toBe(
            deriveDbcPoolAuthority().toString()
        )
    })

    test('createConfigAndPoolWithTransferHook creates config and pool in one transaction', async () => {
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const curveConfig = buildTransferHookCurveConfig()
        const pool = derivePool(config.publicKey, baseMint.publicKey)

        const tx = await dbcClient.partner.createConfigAndPoolWithTransferHook({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: poolCreator.publicKey,
            quoteMint: NATIVE_MINT,
            transferHookProgram: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
            ...curveConfig,
            preCreatePoolParam: {
                baseMint: baseMint.publicKey,
                name: TOKEN_NAME,
                symbol: TOKEN_SYMBOL,
                uri: TOKEN_URI,
                poolCreator: poolCreator.publicKey,
            },
        })

        tx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, tx, [
            poolCreator,
            config,
            baseMint,
        ])

        expect(
            await dbcClient.state.getPoolConfig(config.publicKey)
        ).not.toBeNull()
        expect(await dbcClient.state.getPool(pool)).not.toBeNull()
    })

    test('swap2WithTransferHook executes the hook program', async () => {
        const { config, baseMint, pool } = await createPoolAndHookAccounts()
        const amountIn = new BN(1)
        const params: Swap2Params = {
            swapMode: SwapMode.ExactIn,
            swapBaseForQuote: false,
            amountIn,
            minimumAmountOut: new BN(0),
            owner: user.publicKey,
            pool,
            referralTokenAccount: null,
            payer: user.publicKey,
        }

        const swapTx = await dbcClient.pool.swap2WithTransferHook(params)
        swapTx.feePayer = user.publicKey
        await sendAndConfirmTransaction(connection, swapTx, [user])

        expect(await dbcClient.state.getPool(pool)).not.toBeNull()
        expect(await getCounterValue(connection, baseMint.publicKey)).toBe(1)
        expect(config.publicKey).toBeDefined()
    })

    test('createPoolWithFirstBuyWithTransferHook bundles pool init, extra metas, and first buy', async () => {
        const { config, curveConfig } = await createTransferHookConfig({
            enableFirstSwapWithMinFee: true,
        })
        const baseMint = Keypair.generate()
        const amountIn = new BN(1)
        const transferHookAccounts = getTransferHookRemainingAccounts(
            baseMint.publicKey
        )
        const tx =
            await dbcClient.creator.createPoolWithFirstBuyWithTransferHook({
                createPoolParam: {
                    baseMint: baseMint.publicKey,
                    config: config.publicKey,
                    name: TOKEN_NAME,
                    symbol: TOKEN_SYMBOL,
                    uri: TOKEN_URI,
                    payer: poolCreator.publicKey,
                    poolCreator: poolCreator.publicKey,
                    transferHookProgram: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
                },
                firstBuyParam: {
                    buyer: poolCreator.publicKey,
                    buyAmount: amountIn,
                    minimumAmountOut: new BN(0),
                    referralTokenAccount: null,
                    ...transferHookAccounts,
                },
            })

        const initMetaTx = await initializeExtraAccountMetaListTx({
            connection,
            payer: poolCreator.publicKey,
            mint: baseMint.publicKey,
        })
        const bundledTx = insertAfterFirstInstruction(
            tx,
            initMetaTx.instructions
        )
        bundledTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, bundledTx, [
            poolCreator,
            baseMint,
        ])

        const pool = derivePool(config.publicKey, baseMint.publicKey)
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
        expect(await getCounterValue(connection, baseMint.publicKey)).toBe(1)
        expectMinFee(
            poolState!.poolState.metrics.totalProtocolQuoteFee.add(
                poolState!.poolState.metrics.totalTradingQuoteFee
            ),
            amountIn
        )
        expect(curveConfig.enableFirstSwapWithMinFee).toBe(true)
    })

    test('createPoolWithPartnerAndCreatorFirstBuyWithTransferHook executes both transfer-hook swaps', async () => {
        const { config } = await createTransferHookConfig({
            enableFirstSwapWithMinFee: true,
        })
        const baseMint = Keypair.generate()
        const partnerAmountIn = new BN(1)
        const creatorAmountIn = new BN(1)
        const transferHookAccounts = getTransferHookRemainingAccounts(
            baseMint.publicKey
        )

        const tx =
            await dbcClient.creator.createPoolWithPartnerAndCreatorFirstBuyWithTransferHook(
                {
                    createPoolParam: {
                        baseMint: baseMint.publicKey,
                        config: config.publicKey,
                        name: TOKEN_NAME,
                        symbol: TOKEN_SYMBOL,
                        uri: TOKEN_URI,
                        payer: poolCreator.publicKey,
                        poolCreator: poolCreator.publicKey,
                        transferHookProgram: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
                    },
                    partnerFirstBuyParam: {
                        partner: poolCreator.publicKey,
                        receiver: poolCreator.publicKey,
                        buyAmount: partnerAmountIn,
                        minimumAmountOut: new BN(0),
                        referralTokenAccount: null,
                        ...transferHookAccounts,
                    },
                    creatorFirstBuyParam: {
                        creator: poolCreator.publicKey,
                        receiver: poolCreator.publicKey,
                        buyAmount: creatorAmountIn,
                        minimumAmountOut: new BN(0),
                        referralTokenAccount: null,
                        ...transferHookAccounts,
                    },
                }
            )

        const initMetaTx = await initializeExtraAccountMetaListTx({
            connection,
            payer: poolCreator.publicKey,
            mint: baseMint.publicKey,
        })
        const bundledTx = insertAfterFirstInstruction(
            tx,
            initMetaTx.instructions
        )
        bundledTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, bundledTx, [
            poolCreator,
            baseMint,
        ])

        const pool = derivePool(config.publicKey, baseMint.publicKey)
        expect(await dbcClient.state.getPool(pool)).not.toBeNull()
        expect(await getCounterValue(connection, baseMint.publicKey)).toBe(2)
        expect(creator.publicKey).toBeDefined()
    })

    test('createConfigAndPoolWithFirstBuyWithTransferHook returns config and bundled pool transactions', async () => {
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        const amountIn = new BN(1)
        const curveConfig = buildTransferHookCurveConfig({
            enableFirstSwapWithMinFee: true,
        })
        const transferHookAccounts = getTransferHookRemainingAccounts(
            baseMint.publicKey
        )

        const { createConfigTx, createPoolWithFirstBuyTx } =
            await dbcClient.partner.createConfigAndPoolWithFirstBuyWithTransferHook(
                {
                    config: config.publicKey,
                    feeClaimer: partner.publicKey,
                    leftoverReceiver: partner.publicKey,
                    payer: poolCreator.publicKey,
                    quoteMint: NATIVE_MINT,
                    transferHookProgram: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
                    ...curveConfig,
                    preCreatePoolParam: {
                        baseMint: baseMint.publicKey,
                        name: TOKEN_NAME,
                        symbol: TOKEN_SYMBOL,
                        uri: TOKEN_URI,
                        poolCreator: poolCreator.publicKey,
                    },
                    firstBuyParam: {
                        buyer: poolCreator.publicKey,
                        buyAmount: amountIn,
                        minimumAmountOut: new BN(0),
                        referralTokenAccount: null,
                        ...transferHookAccounts,
                    },
                }
            )

        createConfigTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, createConfigTx, [
            poolCreator,
            config,
        ])

        const initMetaTx = await initializeExtraAccountMetaListTx({
            connection,
            payer: poolCreator.publicKey,
            mint: baseMint.publicKey,
        })
        const bundledTx = insertAfterFirstInstruction(
            createPoolWithFirstBuyTx,
            initMetaTx.instructions
        )
        bundledTx.feePayer = poolCreator.publicKey
        await sendAndConfirmTransaction(connection, bundledTx, [
            poolCreator,
            baseMint,
        ])

        const pool = derivePool(config.publicKey, baseMint.publicKey)
        const poolState = await dbcClient.state.getPool(pool)
        expect(poolState).not.toBeNull()
        expect(await getCounterValue(connection, baseMint.publicKey)).toBe(1)
        expectMinFee(
            poolState!.poolState.metrics.totalProtocolQuoteFee.add(
                poolState!.poolState.metrics.totalTradingQuoteFee
            ),
            amountIn
        )
    })
})

function buildTransferHookCurveConfig(options?: {
    enableFirstSwapWithMinFee?: boolean
}): ConfigParameters {
    return {
        ...buildTestCurveConfig(),
        tokenType: TokenType.Token2022,
        enableFirstSwapWithMinFee: options?.enableFirstSwapWithMinFee ?? false,
    }
}

async function createTransferHookConfig(options?: {
    enableFirstSwapWithMinFee?: boolean
}) {
    const config = Keypair.generate()
    const curveConfig = buildTransferHookCurveConfig(options)
    const createConfigTx = await new DynamicBondingCurveClient(
        connection,
        'confirmed'
    ).partner.createConfigWithTransferHook({
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

    return { config, curveConfig }
}

async function createTransferHookPool(config: PublicKey, baseMint: Keypair) {
    const createPoolTx = await new DynamicBondingCurveClient(
        connection,
        'confirmed'
    ).creator.createPoolWithTransferHook({
        baseMint: baseMint.publicKey,
        config,
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        uri: TOKEN_URI,
        payer: poolCreator.publicKey,
        poolCreator: poolCreator.publicKey,
        transferHookProgram: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
    })

    createPoolTx.feePayer = poolCreator.publicKey
    await sendAndConfirmTransaction(connection, createPoolTx, [
        baseMint,
        poolCreator,
    ])
}

async function createPoolAndHookAccounts() {
    const { config } = await createTransferHookConfig()
    const baseMint = Keypair.generate()
    await createTransferHookPool(config.publicKey, baseMint)
    const initMetaTx = await initializeExtraAccountMetaListTx({
        connection,
        payer: poolCreator.publicKey,
        mint: baseMint.publicKey,
    })

    initMetaTx.feePayer = poolCreator.publicKey
    await sendAndConfirmTransaction(connection, initMetaTx, [poolCreator])

    return {
        config,
        baseMint,
        pool: derivePool(config.publicKey, baseMint.publicKey),
    }
}

function derivePool(config: PublicKey, baseMint: PublicKey): PublicKey {
    return deriveDbcPoolAddress(NATIVE_MINT, baseMint, config)
}

function insertAfterFirstInstruction(
    transaction: Transaction,
    instructions: TransactionInstruction[]
): Transaction {
    const [firstInstruction, ...remainingInstructions] =
        transaction.instructions
    return new Transaction().add(
        firstInstruction,
        ...instructions,
        ...remainingInstructions
    )
}

function expectMinFee(totalTradingFee: BN, amountIn: BN) {
    const expectedFee = amountIn
        .mul(bpsToFeeNumerator(120))
        .div(new BN(FEE_DENOMINATOR))
    const feeDiff = totalTradingFee.sub(expectedFee).abs()
    expect(feeDiff.lte(new BN(1))).toBe(true)
}
