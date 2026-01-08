import BN from 'bn.js'
import { PublicKey, type GetProgramAccountsFilter } from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'
import { MAX_BASIS_POINT, FEE_DENOMINATOR } from '../constants'
import Decimal from 'decimal.js'

/**
 * Convert a number or string to a BN value in lamports
 * @param amount - The amount to convert
 * @param tokenDecimal - The decimal precision of the token
 * @returns The amount in BN
 */
export function convertToLamports(
    amount: number | string,
    tokenDecimal: number
): BN {
    const valueInLamports = new Decimal(amount).mul(
        Decimal.pow(10, tokenDecimal)
    )
    return fromDecimalToBN(valueInLamports)
}

/**
 * Get BN value from decimal value after roundown
 * @param value - The decimal value
 * @returns value in BN after roundown
 */
export function fromDecimalToBN(value: Decimal): BN {
    return new BN(value.floor().toFixed())
}

/**
 * Create a memcmp filter for owner-based filtering
 * @param owner - The owner public key or string
 * @param offset - The offset where the owner field is located in the account data
 * @returns A GetProgramAccountsFilter array with the owner filter
 */
export function createProgramAccountFilter(
    owner: PublicKey | string,
    offset: number
): GetProgramAccountsFilter[] {
    const ownerKey = typeof owner === 'string' ? new PublicKey(owner) : owner
    return [
        {
            memcmp: {
                offset,
                bytes: ownerKey.toBase58(),
                encoding: 'base58',
            },
        },
    ]
}

/**
 * Check if a mint is the native SOL mint
 * @param mint - The mint to check
 * @returns Whether the mint is the native SOL mint
 */
export function isNativeSol(mint: PublicKey): boolean {
    return mint.toString() === NATIVE_MINT.toString()
}

/**
 * Check if the locked vesting is the default
 * @param lockedVesting - The locked vesting parameters
 * @returns true if the locked vesting is the default, false otherwise
 */
export function isDefaultLockedVesting(lockedVesting: {
    amountPerPeriod: BN
    cliffDurationFromMigrationTime: BN
    frequency: BN
    numberOfPeriod: BN
    cliffUnlockAmount: BN
}): boolean {
    return (
        lockedVesting.amountPerPeriod.eqn(0) &&
        lockedVesting.cliffDurationFromMigrationTime.eqn(0) &&
        lockedVesting.frequency.eqn(0) &&
        lockedVesting.numberOfPeriod.eqn(0) &&
        lockedVesting.cliffUnlockAmount.eqn(0)
    )
}

/**
 * Convert decimal to a BN
 * @param value - The value
 * @returns The BN
 */
export function convertDecimalToBN(value: Decimal): BN {
    return new BN(value.floor().toFixed())
}

/**
 * Converts basis points (bps) to fee numerator
 * 1 bps = 0.01% = 0.0001 in decimal
 *
 * @param bps - The value in basis points [1-10_000]
 * @returns The equivalent fee numerator
 */
export function bpsToFeeNumerator(bps: number): BN {
    return new BN(bps * FEE_DENOMINATOR).divn(MAX_BASIS_POINT)
}

/**
 * Converts fee numerator back to basis points (bps)
 *
 * @param feeNumerator - The fee numerator to convert
 * @returns The equivalent value in basis points [1-10_000]
 */
export function feeNumeratorToBps(feeNumerator: BN): number {
    return feeNumerator
        .muln(MAX_BASIS_POINT)
        .div(new BN(FEE_DENOMINATOR))
        .toNumber()
}
