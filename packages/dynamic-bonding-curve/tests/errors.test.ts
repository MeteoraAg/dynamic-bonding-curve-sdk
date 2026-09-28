import { Connection, Keypair, sendAndConfirmTransaction } from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'
import BN from 'bn.js'
import { describe, expect, test } from 'vitest'
import {
    DbcError,
    DbcErrorCode,
    DbcValidationError,
    deriveDbcPoolAddress,
    DynamicBondingCurveClient,
    getDbcError,
    getLiquidityVestingInfoParams,
    SwapMode,
} from '../src'
import { buildTestCurveConfig, fundSol, LOCALNET_RPC_URL } from './utils/common'

const DBC = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN'
const DAMM_V2 = 'cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG'
const slippageLogs = [
    'Program log: Instruction: Swap2',
    'Program log: AnchorError occurred. Error Code: ExceededSlippage. Error Number: 6002. Error Message: Exceeded slippage tolerance.',
    `Program ${DBC} failed: custom program error: 0x1772`,
]

describe('errors', () => {
    test('DbcErrorCode maps names to codes', () => {
        expect(DbcErrorCode.exceededSlippage).toBe(6002)
        expect(DbcErrorCode.amountIsZero).toBe(6005)
    })

    test('getDbcError reads a program error from logs', () => {
        const error = getDbcError({ logs: slippageLogs })

        expect(error).toBeInstanceOf(DbcError)
        expect(error?.errorName).toBe('exceededSlippage')
        expect(error?.code).toBe(DbcErrorCode.exceededSlippage)
        expect(error?.message).toBe('Exceeded slippage tolerance')
        expect(error?.logs).toBe(slippageLogs)
    })

    test('getDbcError takes logs for an error that carries none', () => {
        expect(getDbcError(new Error('failed'))).toBeNull()
        expect(getDbcError(new Error('failed'), slippageLogs)?.code).toBe(6002)
    })

    test('getDbcError ignores an error from another program', () => {
        const logs = [
            `Program ${DAMM_V2} failed: custom program error: 0x1772`,
            `Program ${DBC} failed: custom program error: 0x1772`,
        ]

        expect(getDbcError({ logs })).toBeNull()
    })

    test('getDbcError ignores a code the program does not define', () => {
        expect(
            getDbcError({
                logs: [`Program ${DBC} failed: custom program error: 0x1`],
            })
        ).toBeNull()
    })

    test('parameter checks throw DbcValidationError', () => {
        expect(() => getLiquidityVestingInfoParams(101, 0, 0, 0, 0)).toThrow(
            DbcValidationError
        )
    })
})

describe('errors on the validator', { timeout: 60000 }, () => {
    const connection = new Connection(LOCALNET_RPC_URL, 'confirmed')

    test('a swap past its slippage limit maps to exceededSlippage', async () => {
        const partner = Keypair.generate()
        const user = Keypair.generate()
        const config = Keypair.generate()
        const baseMint = Keypair.generate()
        await fundSol(connection, partner.publicKey)
        await fundSol(connection, user.publicKey)
        const client = new DynamicBondingCurveClient(connection, 'confirmed')

        const createTx = await client.partner.createConfigAndPool({
            config: config.publicKey,
            feeClaimer: partner.publicKey,
            leftoverReceiver: partner.publicKey,
            payer: partner.publicKey,
            quoteMint: NATIVE_MINT,
            ...buildTestCurveConfig(),
            preCreatePoolParam: {
                baseMint: baseMint.publicKey,
                name: 'TEST',
                symbol: 'TEST',
                uri: 'https://example.com/test.json',
                poolCreator: partner.publicKey,
            },
        })
        createTx.feePayer = partner.publicKey
        await sendAndConfirmTransaction(connection, createTx, [
            partner,
            config,
            baseMint,
        ])

        const swapTx = await client.pool.swap2({
            amountIn: new BN(1_000_000_000),
            minimumAmountOut: new BN('18446744073709551615'),
            swapBaseForQuote: false,
            owner: user.publicKey,
            pool: deriveDbcPoolAddress(
                NATIVE_MINT,
                baseMint.publicKey,
                config.publicKey
            ),
            referralTokenAccount: null,
            swapMode: SwapMode.ExactIn,
            payer: user.publicKey,
        })
        swapTx.feePayer = user.publicKey

        let caught: unknown
        try {
            await sendAndConfirmTransaction(connection, swapTx, [user])
        } catch (error) {
            caught = error
        }

        const error = getDbcError(caught)
        expect(error?.errorName).toBe('exceededSlippage')
        expect(error?.code).toBe(DbcErrorCode.exceededSlippage)
    })
})
