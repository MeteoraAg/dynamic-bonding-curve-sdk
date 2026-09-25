import {
    AccountMeta,
    Commitment,
    Connection,
    PublicKey,
    SYSVAR_INSTRUCTIONS_PUBKEY,
    TransactionInstruction,
} from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'
import BN from 'bn.js'
import { getCurrentPoint } from './chain'
import {
    getOrCreateATAInstruction,
    unwrapSOLInstruction,
    wrapSOLInstruction,
} from './token'
import { isRateLimiterApplied } from '../math/poolFees/rateLimiter'
import { ActivationType, BaseFeeMode, TradeDirection } from '../types'

/**
 * Return whether the rate limiter applies to this swap.
 */
export async function rateLimiterApplied(params: {
    connection: Connection
    baseFeeMode: BaseFeeMode
    firstFactor: number
    secondFactor: BN
    thirdFactor: BN
    activationType: ActivationType
    activationPoint: BN
    swapBaseForQuote: boolean
}): Promise<boolean> {
    if (params.baseFeeMode !== BaseFeeMode.RateLimiter) {
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
        params.secondFactor,
        params.thirdFactor,
        new BN(params.firstFactor)
    )
}

/**
 * Create the swap input and output token accounts, including SOL wrap, unwrap, and the instructions sysvar.
 */
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
    const preInstructions: TransactionInstruction[] = []
    const [
        { ataPubkey: inputTokenAccount, ix: createInputAtaIx },
        { ataPubkey: outputTokenAccount, ix: createOutputAtaIx },
    ] = await Promise.all([
        getOrCreateATAInstruction(
            params.connection,
            params.inputMint,
            params.inputOwner,
            params.payer,
            true,
            params.inputTokenProgram,
            params.commitment
        ),
        getOrCreateATAInstruction(
            params.connection,
            params.outputMint,
            params.outputOwner,
            params.payer,
            true,
            params.outputTokenProgram,
            params.commitment
        ),
    ])
    createInputAtaIx && preInstructions.push(createInputAtaIx)
    createOutputAtaIx && preInstructions.push(createOutputAtaIx)

    if (params.inputMint.equals(NATIVE_MINT)) {
        preInstructions.push(
            ...wrapSOLInstruction(
                params.inputOwner,
                inputTokenAccount,
                BigInt(params.wrapAmount.toString())
            )
        )
    }

    const postInstructions: TransactionInstruction[] = []
    if (
        [params.inputMint.toBase58(), params.outputMint.toBase58()].includes(
            NATIVE_MINT.toBase58()
        )
    ) {
        const unwrapIx = unwrapSOLInstruction(
            params.unwrapAuthority,
            params.unwrapAuthority
        )
        unwrapIx && postInstructions.push(unwrapIx)
    }

    const remainingAccounts: AccountMeta[] = []
    if (params.includeInstructionSysvar) {
        remainingAccounts.push({
            pubkey: SYSVAR_INSTRUCTIONS_PUBKEY,
            isSigner: false,
            isWritable: false,
        })
    }

    return {
        inputTokenAccount,
        outputTokenAccount,
        preInstructions,
        postInstructions,
        remainingAccounts,
    }
}
