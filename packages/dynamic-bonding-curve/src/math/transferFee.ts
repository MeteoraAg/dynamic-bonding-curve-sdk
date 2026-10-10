import {
    calculateFee,
    getEpochFee,
    getTransferFeeConfig,
    MAX_FEE_BASIS_POINTS,
    type Mint,
} from '@solana/spl-token'
import BN from 'bn.js'
import { U64_MAX } from '../constants'
import {
    type QuotePoolConfig,
    type QuoteTransferFees,
    TokenType,
} from '../types'
import { ProgramError } from './errors'

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

/** Token-2022 charges min(amount * bps / 10_000, maximumFee), so either being zero means no fee. */
export function isZeroTransferFee(
    transferFee: {
        transferFeeBasisPoints: number
        maximumFee: BN | bigint
    } | null
): boolean {
    if (!transferFee || transferFee.transferFeeBasisPoints === 0) {
        return true
    }
    const maximumFee = transferFee.maximumFee
    return typeof maximumFee === 'bigint'
        ? maximumFee === BigInt(0)
        : maximumFee.isZero()
}

/** A DBC base mint's fee has no cap, so the config only stores the basis points. */
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

/** Flag 1 is a TransferFeeConfig, including at 0 basis points. */
function getConfigBaseTransferFee(
    config: Pick<QuotePoolConfig, 'transferFeeFlag' | 'transferFeeBasisPoints'>
): EpochTransferFee | null {
    if (config.transferFeeFlag !== 1) {
        return null
    }
    return {
        transferFeeBasisPoints: config.transferFeeBasisPoints,
        maximumFee: U64_MAX,
    }
}

/** The mint's transfer fee in currentEpoch, or null when the mint has no TransferFeeConfig. */
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

/**
 * The transfer fees on the input and output side of a swap. The base fee
 * comes from baseMint, then baseTransferFeeBasisPoints, then the config; the
 * quote fee has to come from the quote mint account.
 */
export function resolveSwapTransferFees(
    config: Pick<
        QuotePoolConfig,
        | 'quoteTokenFlag'
        | 'quoteMint'
        | 'transferFeeFlag'
        | 'transferFeeBasisPoints'
    >,
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
        base = getConfigBaseTransferFee(config)
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
    } else if (config.quoteTokenFlag === TokenType.Token2022) {
        throw new Error(
            'quoteMint and currentEpoch are required for a Token-2022 quote mint, use getSwapQuoteTransferFees'
        )
    }

    return swapBaseForQuote
        ? { input: base, output: quote }
        : { input: quote, output: base }
}

/** The amount received after the transfer fee and the fee; spl-token-2022's calculate_fee. */
export function calculateTransferFeeExcludedAmount(
    transferFee: EpochTransferFee | null,
    includedAmount: BN
): TransferFeeAmount {
    if (
        !transferFee ||
        isZeroTransferFee(transferFee) ||
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

// spl-token-2022's calculate_pre_fee_amount
function calculatePreFeeAmount(
    transferFee: EpochTransferFee,
    excludedAmount: BN
): BN {
    if (excludedAmount.isZero() || isZeroTransferFee(transferFee)) {
        return excludedAmount
    }
    if (transferFee.transferFeeBasisPoints === MAX_FEE_BASIS_POINTS) {
        return excludedAmount.add(transferFee.maximumFee)
    }

    const oneInBasisPoints = new BN(MAX_FEE_BASIS_POINTS)
    const denominator = oneInBasisPoints.subn(
        transferFee.transferFeeBasisPoints
    )
    const rawPreFeeAmount = excludedAmount
        .mul(oneInBasisPoints)
        .add(denominator)
        .subn(1)
        .div(denominator)
    if (rawPreFeeAmount.sub(excludedAmount).gte(transferFee.maximumFee)) {
        return excludedAmount.add(transferFee.maximumFee)
    }
    return rawPreFeeAmount
}

/**
 * The amount to send so that excludedAmount arrives after the transfer fee,
 * and the fee; the program's calculate_transfer_fee_included_amount.
 */
export function calculateTransferFeeIncludedAmount(
    transferFee: EpochTransferFee | null,
    excludedAmount: BN
): TransferFeeAmount {
    if (excludedAmount.isZero()) {
        return { amount: ZERO, transferFee: ZERO }
    }
    if (!transferFee || isZeroTransferFee(transferFee)) {
        return { amount: excludedAmount, transferFee: ZERO }
    }

    const preFeeAmount = calculatePreFeeAmount(transferFee, excludedAmount)
    if (preFeeAmount.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
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
        throw new Error(ProgramError.FeeInverseIsIncorrect)
    }

    return { amount: includedAmount, transferFee: fee }
}
