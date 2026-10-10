import BN from 'bn.js'
import { PublicKey, type GetProgramAccountsFilter } from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'
import { MAX_BASIS_POINT, FEE_DENOMINATOR } from '../constants'
import Decimal from 'decimal.js'
import type { LockedVestingParameters } from '../types'

/** A UI amount in lamports, rounded down. */
export function convertToLamports(
    amount: number | string,
    tokenDecimal: number
): BN {
    return fromDecimalToBN(
        new Decimal(amount).mul(Decimal.pow(10, tokenDecimal))
    )
}

/** A Decimal as a BN, rounded down. */
export function fromDecimalToBN(value: Decimal): BN {
    return new BN(value.floor().toFixed())
}

/** A memcmp filter on a pubkey field at a byte offset of the account data. */
export function createProgramAccountFilter(
    pubkey: PublicKey | string,
    offset: number
): GetProgramAccountsFilter[] {
    return [
        {
            memcmp: {
                offset,
                bytes: new PublicKey(pubkey).toBase58(),
                encoding: 'base58',
            },
        },
    ]
}

export function isNativeSol(mint: PublicKey): boolean {
    return mint.equals(NATIVE_MINT)
}

export function isDefaultLockedVesting(
    lockedVesting: LockedVestingParameters
): boolean {
    return (
        lockedVesting.amountPerPeriod.isZero() &&
        lockedVesting.cliffDurationFromMigrationTime.isZero() &&
        lockedVesting.frequency.isZero() &&
        lockedVesting.numberOfPeriod.isZero() &&
        lockedVesting.cliffUnlockAmount.isZero()
    )
}

/** Basis points in [0, 10_000] as a fee numerator over FEE_DENOMINATOR. */
export function bpsToFeeNumerator(bps: number): BN {
    if (!Number.isInteger(bps)) {
        throw new Error('bps must be a whole number')
    }
    return new BN(bps).mul(new BN(FEE_DENOMINATOR)).divn(MAX_BASIS_POINT)
}

/** A fee numerator over FEE_DENOMINATOR as basis points, rounded down. */
export function feeNumeratorToBps(feeNumerator: BN): number {
    return feeNumerator
        .muln(MAX_BASIS_POINT)
        .div(new BN(FEE_DENOMINATOR))
        .toNumber()
}
