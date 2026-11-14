import {
    AccountMeta,
    Commitment,
    Connection,
    PublicKey,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    TransactionInstruction,
} from '@solana/web3.js'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import BN from 'bn.js'
import { getCurrentPoint } from './chain'
import {
    getOrCreateATAInstruction,
    unwrapSOLInstruction,
    wrapSOLInstruction,
} from './token'
import { isNativeSol } from './utils'
import { isRateLimiterApplied } from '../math/poolFees/rateLimiter'
import {
    ActivationType,
    BaseFeeMode,
    type BaseFee,
    TradeDirection,
} from '../types'

/**
 * Whether the rate limiter applies to a swap right now, for callers who build
 * the swap instruction themselves and have to pass the instructions sysvar.
 */
export async function rateLimiterApplied(params: {
    connection: Connection
    baseFee: BaseFee
    activationType: ActivationType
    activationPoint: BN
    swapBaseForQuote: boolean
}): Promise<boolean> {
    const { baseFee } = params
    if (baseFee.baseFeeMode !== BaseFeeMode.RateLimiter) {
        return false
    }

    const currentPoint = await getCurrentPoint(
        params.connection,
        params.activationType
    )
    return isRateLimiterApplied(
        currentPoint,
        params.activationPoint,
        params.swapBaseForQuote
            ? TradeDirection.BaseToQuote
            : TradeDirection.QuoteToBase,
        baseFee.secondFactor,
        baseFee.thirdFactor,
        new BN(baseFee.firstFactor)
    )
}

/**
 * A swap's token account and its create instruction. The wSOL account always
 * gets one: the unwrap closes it, and another SOL swap in the same transaction
 * has to find it open.
 */
async function getOrCreateSwapTokenAccount(
    params: {
        connection: Connection
        commitment: Commitment
        payer: PublicKey
    },
    mint: PublicKey,
    owner: PublicKey,
    tokenProgram: PublicKey
): Promise<{ ataPubkey: PublicKey; ix?: TransactionInstruction }> {
    if (!isNativeSol(mint)) {
        return getOrCreateATAInstruction(
            params.connection,
            mint,
            owner,
            params.payer,
            tokenProgram,
            params.commitment
        )
    }
    const ataPubkey = getAssociatedTokenAddressSync(
        mint,
        owner,
        true,
        tokenProgram
    )
    return {
        ataPubkey,
        ix: createAssociatedTokenAccountIdempotentInstruction(
            params.payer,
            ataPubkey,
            owner,
            mint,
            tokenProgram
        ),
    }
}

/** Create the input and output token accounts of a swap, wrap and unwrap SOL, and add the instructions sysvar. */
export async function prepareSwapAccounts(params: {
    connection: Connection
    commitment: Commitment
    payer: PublicKey
    inputOwner: PublicKey
    outputOwner: PublicKey
    unwrapAuthority: PublicKey
    inputMint: PublicKey
    outputMint: PublicKey
    inputTokenProgram: PublicKey
    outputTokenProgram: PublicKey
    wrapAmount: BN
    includeInstructionSysvar: boolean
}): Promise<{
    inputTokenAccount: PublicKey
    outputTokenAccount: PublicKey
    preInstructions: TransactionInstruction[]
    postInstructions: TransactionInstruction[]
    remainingAccounts: AccountMeta[]
}> {
    const [
        { ataPubkey: inputTokenAccount, ix: createInputAtaIx },
        { ataPubkey: outputTokenAccount, ix: createOutputAtaIx },
    ] = await Promise.all([
        getOrCreateSwapTokenAccount(
            params,
            params.inputMint,
            params.inputOwner,
            params.inputTokenProgram
        ),
        getOrCreateSwapTokenAccount(
            params,
            params.outputMint,
            params.outputOwner,
            params.outputTokenProgram
        ),
    ])

    const preInstructions: TransactionInstruction[] = []
    if (createInputAtaIx) {
        preInstructions.push(createInputAtaIx)
    }
    if (createOutputAtaIx) {
        preInstructions.push(createOutputAtaIx)
    }
    if (isNativeSol(params.inputMint)) {
        preInstructions.push(
            ...wrapSOLInstruction(
                params.inputOwner,
                inputTokenAccount,
                BigInt(params.wrapAmount.toString())
            )
        )
    }

    const postInstructions: TransactionInstruction[] = []
    if (isNativeSol(params.inputMint) || isNativeSol(params.outputMint)) {
        postInstructions.push(
            unwrapSOLInstruction(params.unwrapAuthority, params.unwrapAuthority)
        )
    }

    const remainingAccounts: AccountMeta[] = params.includeInstructionSysvar
        ? [
              {
                  pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
                  isSigner: false,
                  isWritable: false,
              },
          ]
        : []

    return {
        inputTokenAccount,
        outputTokenAccount,
        preInstructions,
        postInstructions,
        remainingAccounts,
    }
}
