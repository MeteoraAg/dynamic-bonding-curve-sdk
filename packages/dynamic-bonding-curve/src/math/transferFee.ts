import {
    calculateFee,
    getEpochFee,
    getTransferFeeConfig,
    MAX_FEE_BASIS_POINTS,
    type Mint,
} from '@solana/spl-token'
import BN from 'bn.js'
import { U64_MAX } from '../constants'
import { type PoolConfig, type QuoteTransferFees, TokenType } from '../types'

export type EpochTransferFee = {
    transferFeeBasisPoints: number
    maximumFee: BN
}

export type TransferFeeAmount = {
    amount: BN
    transferFee: BN
}

const ZERO = new BN(0)

function toSplTransferFee(transferFee: EpochTransferFee) {
    return {
        epoch: BigInt(0),
        maximumFee: BigInt(transferFee.maximumFee.toString()),
        transferFeeBasisPoints: transferFee.transferFeeBasisPoints,
    }
}

/**
 * Return the base mint transfer fee a config creates. The program always sets the maximum fee to u64::MAX.
 */
export function getBaseTransferFee(
    transferFeeBasisPoints: number
): EpochTransferFee | null {
    if (!transferFeeBasisPoints) {
        return null
    }
    return {
        transferFeeBasisPoints,
        maximumFee: U64_MAX,
    }
}

export function getEpochTransferFee(
    mint: Mint,
    currentEpoch: number
): EpochTransferFee | null {
    const transferFeeConfig = getTransferFeeConfig(mint)
    if (!transferFeeConfig) {
        return null
    }
    const epochFee = getEpochFee(transferFeeConfig, BigInt(currentEpoch))
    return {
        transferFeeBasisPoints: epochFee.transferFeeBasisPoints,
        maximumFee: new BN(epochFee.maximumFee.toString()),
    }
}

export function resolveSwapTransferFees(
    config: PoolConfig,
    swapBaseForQuote: boolean,
    transferFees?: QuoteTransferFees
): { input: EpochTransferFee | null; output: EpochTransferFee | null } {
    let base: EpochTransferFee | null
    if (transferFees?.baseMint) {
        if (transferFees.currentEpoch === undefined) {
            throw new Error('currentEpoch is required to quote a transfer fee')
        }
        base = getEpochTransferFee(
            transferFees.baseMint,
            transferFees.currentEpoch
        )
    } else if (transferFees?.baseTransferFeeBasisPoints !== undefined) {
        base = getBaseTransferFee(transferFees.baseTransferFeeBasisPoints)
    } else {
        base = getBaseTransferFee(config.transferFeeBasisPoints ?? 0)
    }

    let quote: EpochTransferFee | null = null
    if (transferFees?.quoteMint) {
        if (
            config.quoteMint &&
            !transferFees.quoteMint.address.equals(config.quoteMint)
        ) {
            throw new Error('quoteMint does not match config.quoteMint')
        }
        if (transferFees.currentEpoch === undefined) {
            throw new Error('currentEpoch is required to quote a transfer fee')
        }
        quote = getEpochTransferFee(
            transferFees.quoteMint,
            transferFees.currentEpoch
        )
    } else if (Number(config.quoteTokenFlag) === TokenType.Token2022) {
        // the program applies the quote mint's current transfer fee, which only the mint account holds
        throw new Error(
            'quoteMint and currentEpoch are required for a Token-2022 quote mint, use getSwapQuoteTransferFees'
        )
    }

    if (swapBaseForQuote) {
        return { input: base, output: quote }
    }
    return { input: quote, output: base }
}

export function calculateTransferFeeExcludedAmount(
    transferFee: EpochTransferFee | null,
    includedAmount: BN
): TransferFeeAmount {
    if (
        !transferFee ||
        transferFee.transferFeeBasisPoints === 0 ||
        includedAmount.isZero()
    ) {
        return { amount: includedAmount, transferFee: ZERO }
    }

    const fee = new BN(
        calculateFee(
            toSplTransferFee(transferFee),
            BigInt(includedAmount.toString())
        ).toString()
    )
    return {
        amount: includedAmount.sub(fee),
        transferFee: fee,
    }
}

function calculatePreFeeAmount(
    transferFee: EpochTransferFee,
    excludedAmount: BN
): BN {
    if (excludedAmount.isZero() || transferFee.transferFeeBasisPoints === 0) {
        return excludedAmount
    }

    if (transferFee.transferFeeBasisPoints === MAX_FEE_BASIS_POINTS) {
        return excludedAmount.add(transferFee.maximumFee)
    }

    const oneInBasisPoints = new BN(MAX_FEE_BASIS_POINTS)
    const denominator = oneInBasisPoints.sub(
        new BN(transferFee.transferFeeBasisPoints)
    )
    const rawPreFeeAmount = excludedAmount
        .mul(oneInBasisPoints)
        .add(denominator)
        .sub(new BN(1))
        .div(denominator)

    if (rawPreFeeAmount.sub(excludedAmount).gte(transferFee.maximumFee)) {
        return excludedAmount.add(transferFee.maximumFee)
    }

    return rawPreFeeAmount
}

export function calculateTransferFeeIncludedAmount(
    transferFee: EpochTransferFee | null,
    excludedAmount: BN
): TransferFeeAmount {
    if (excludedAmount.isZero()) {
        return { amount: ZERO, transferFee: ZERO }
    }
    if (!transferFee || transferFee.transferFeeBasisPoints === 0) {
        return { amount: excludedAmount, transferFee: ZERO }
    }

    const preFeeAmount = calculatePreFeeAmount(transferFee, excludedAmount)
    if (preFeeAmount.gt(U64_MAX)) {
        throw new Error('Math overflow')
    }
    const fee = calculateTransferFeeExcludedAmount(
        transferFee,
        preFeeAmount
    ).transferFee
    const includedAmount = excludedAmount.add(fee)
    const verification = calculateTransferFeeExcludedAmount(
        transferFee,
        includedAmount
    ).transferFee
    if (!fee.eq(verification)) {
        throw new Error('Fee inverse is incorrect')
    }

    return { amount: includedAmount, transferFee: fee }
}
