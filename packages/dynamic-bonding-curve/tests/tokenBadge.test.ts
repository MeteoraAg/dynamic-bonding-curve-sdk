import { Keypair, PublicKey } from '@solana/web3.js'
import { expect, test, describe } from 'vitest'
import { NATIVE_MINT } from '@solana/spl-token'
import {
    deriveTokenBadgeAddress,
    getTokenBadgeRemainingAccounts,
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
} from '../src'

describe('token badge helpers', () => {
    test('deriveTokenBadgeAddress matches the token_badge PDA', () => {
        const [expected] = PublicKey.findProgramAddressSync(
            [Buffer.from('token_badge'), NATIVE_MINT.toBuffer()],
            DYNAMIC_BONDING_CURVE_PROGRAM_ID
        )

        expect(deriveTokenBadgeAddress(NATIVE_MINT).equals(expected)).toBe(true)
    })

    test('getTokenBadgeRemainingAccounts is empty when omitted', () => {
        expect(getTokenBadgeRemainingAccounts()).toEqual([])
        expect(getTokenBadgeRemainingAccounts(undefined)).toEqual([])
    })

    test('getTokenBadgeRemainingAccounts returns a read-only remaining account', () => {
        const tokenBadge = Keypair.generate().publicKey
        expect(getTokenBadgeRemainingAccounts(tokenBadge)).toEqual([
            {
                pubkey: tokenBadge,
                isSigner: false,
                isWritable: false,
            },
        ])
    })
})
