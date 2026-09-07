import {
    Commitment,
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js'

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createCloseAccountInstruction,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    NATIVE_MINT,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TokenAccountNotFoundError,
    TokenInvalidAccountOwnerError,
} from '@solana/spl-token'
import { TokenType } from '../types'

/**
 * Return an ATA address and an idempotent create instruction when the account is missing.
 */
export const getOrCreateATAInstruction = async (
    connection: Connection,
    tokenMint: PublicKey,
    owner: PublicKey,
    payer: PublicKey,
    allowOwnerOffCurve = true,
    tokenProgram: PublicKey,
    commitment: Commitment = 'confirmed'
): Promise<{ ataPubkey: PublicKey; ix?: TransactionInstruction }> => {
    const toAccount = getAssociatedTokenAddressSync(
        tokenMint,
        owner,
        allowOwnerOffCurve,
        tokenProgram
    )

    try {
        await getAccount(connection, toAccount, commitment, tokenProgram)
        return { ataPubkey: toAccount, ix: undefined }
    } catch (e) {
        if (
            e instanceof TokenAccountNotFoundError ||
            e instanceof TokenInvalidAccountOwnerError
        ) {
            const ix = createAssociatedTokenAccountIdempotentInstruction(
                payer,
                toAccount,
                owner,
                tokenMint,
                tokenProgram
            )

            return { ataPubkey: toAccount, ix }
        } else {
            /* handle error */
            console.error('Error::getOrCreateATAInstruction', e)
            throw e
        }
    }
}

/**
 * Build an instruction that closes the owner's wrapped SOL ATA into a receiver.
 */
export function unwrapSOLInstruction(
    owner: PublicKey,
    receiver: PublicKey,
    allowOwnerOffCurve = true
): TransactionInstruction | null {
    const wSolATAAccount = getAssociatedTokenAddressSync(
        NATIVE_MINT,
        owner,
        allowOwnerOffCurve
    )
    if (wSolATAAccount) {
        const closedWrappedSolInstruction = createCloseAccountInstruction(
            wSolATAAccount,
            receiver,
            owner,
            [],
            TOKEN_PROGRAM_ID
        )
        return closedWrappedSolInstruction
    }
    return null
}

/**
 * Build transfer and sync instructions that wrap SOL into an existing wrapped SOL account.
 */
export function wrapSOLInstruction(
    from: PublicKey,
    to: PublicKey,
    amount: bigint
): TransactionInstruction[] {
    return [
        SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: amount,
        }),
        new TransactionInstruction({
            keys: [
                {
                    pubkey: to,
                    isSigner: false,
                    isWritable: true,
                },
            ],
            data: Buffer.from(new Uint8Array([17])),
            programId: TOKEN_PROGRAM_ID,
        }),
    ]
}

/**
 * Derive the associated token address for a wallet, mint, and token program.
 */
export function findAssociatedTokenAddress(
    walletAddress: PublicKey,
    tokenMintAddress: PublicKey,
    tokenProgramId: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [
            walletAddress.toBuffer(),
            tokenProgramId.toBuffer(),
            tokenMintAddress.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    )[0]
}

/**
 * Fetch a mint account and return its token decimals.
 */
export async function getTokenDecimals(
    connection: Connection,
    mintAddress: PublicKey | string
): Promise<number> {
    const mintPubkey =
        mintAddress instanceof PublicKey
            ? mintAddress
            : new PublicKey(mintAddress)

    const tokenProgram = (await connection.getAccountInfo(mintPubkey)).owner

    const mintInfo = await getMint(
        connection,
        mintPubkey,
        'confirmed',
        tokenProgram
    )
    return mintInfo.decimals
}

/**
 * Return the SPL Token program ID for a token type.
 */
export function getTokenProgram(tokenType: TokenType): PublicKey {
    return tokenType === TokenType.SPLToken
        ? TOKEN_PROGRAM_ID
        : TOKEN_2022_PROGRAM_ID
}

/**
 * Return the token type from the mint account owner, or `null` if the mint is missing.
 */
export async function getTokenType(
    connection: Connection,
    tokenMint: PublicKey
): Promise<TokenType | null> {
    const accountInfo = await connection.getAccountInfo(tokenMint)
    if (!accountInfo) {
        return null
    }

    return accountInfo.owner.equals(TOKEN_PROGRAM_ID)
        ? TokenType.SPLToken
        : TokenType.Token2022
}

/**
 * Build a setup transaction for a token account, including SOL wrapping when needed.
 */
export async function prepareTokenAccountTx(
    connection: Connection,
    owner: PublicKey,
    payer: PublicKey,
    tokenMint: PublicKey,
    amount: bigint,
    tokenProgram: PublicKey,
    commitment: Commitment = 'confirmed'
): Promise<{
    tokenAccount: PublicKey
    transaction: Transaction
}> {
    const instructions: TransactionInstruction[] = []
    const { ataPubkey: tokenAccount, ix: createAtaIx } =
        await getOrCreateATAInstruction(
            connection,
            tokenMint,
            owner,
            payer,
            true,
            tokenProgram,
            commitment
        )

    createAtaIx && instructions.push(createAtaIx)

    if (tokenMint.equals(NATIVE_MINT)) {
        const wrapIx = wrapSOLInstruction(owner, tokenAccount, amount)
        instructions.push(...wrapIx)
    }

    const transaction = new Transaction()
    if (instructions.length > 0) {
        transaction.add(...instructions)
    }

    return { tokenAccount, transaction }
}

/**
 * Build a cleanup transaction for wrapped SOL accounts.
 */
export async function cleanUpTokenAccountTx(
    owner: PublicKey,
    receiver: PublicKey,
    tokenMint: PublicKey
): Promise<{
    transaction: Transaction
}> {
    if (tokenMint.equals(NATIVE_MINT)) {
        const unwrapIx = unwrapSOLInstruction(owner, receiver)
        if (unwrapIx) {
            return { transaction: new Transaction().add(unwrapIx) }
        }
    }

    return null
}
