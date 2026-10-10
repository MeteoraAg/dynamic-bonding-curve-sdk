import {
    Commitment,
    Connection,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
} from '@solana/web3.js'

import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    createCloseAccountInstruction,
    ExtensionType,
    getAccount,
    getAssociatedTokenAddressSync,
    getExtensionTypes,
    getMint,
    getTransferFeeConfig,
    unpackMint,
    NATIVE_MINT,
    NATIVE_MINT_2022,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    TokenAccountNotFoundError,
    TokenInvalidAccountOwnerError,
    type Mint,
} from '@solana/spl-token'
import { isZeroTransferFee } from '../math/transferFee'
import { type PoolConfig, type QuoteTransferFees, TokenType } from '../types'

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
        }
        throw e
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

    const mintAccount = await connection.getAccountInfo(mintPubkey)
    if (!mintAccount) {
        throw new Error(`Mint account ${mintPubkey.toBase58()} not found`)
    }
    const tokenProgram = mintAccount.owner

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

export async function getTokenType(
    connection: Connection,
    tokenMint: PublicKey
): Promise<TokenType> {
    const accountInfo = await connection.getAccountInfo(tokenMint)
    if (!accountInfo) {
        throw new Error(`Mint account ${tokenMint.toBase58()} not found`)
    }

    return accountInfo.owner.equals(TOKEN_PROGRAM_ID)
        ? TokenType.SPLToken
        : TokenType.Token2022
}

/**
 * Return whether a mint has a non-zero transfer fee, active or scheduled, or a transfer fee config authority.
 */
export function hasTransferFeeOrConfigAuthority(
    mint: Mint,
    currentEpoch: number
): boolean {
    const transferFeeConfig = getTransferFeeConfig(mint)
    if (!transferFeeConfig) {
        return false
    }
    if (
        !transferFeeConfig.transferFeeConfigAuthority.equals(PublicKey.default)
    ) {
        return true
    }

    const { olderTransferFee, newerTransferFee } = transferFeeConfig
    if (BigInt(currentEpoch) < newerTransferFee.epoch) {
        return (
            !isZeroTransferFee(olderTransferFee) ||
            !isZeroTransferFee(newerTransferFee)
        )
    }
    return !isZeroTransferFee(newerTransferFee)
}

/**
 * Return whether a quote mint is supported without a token badge.
 * SPL Token mints are supported. Token-2022 mints are supported when their only
 * extensions are metadata and a zero transfer fee with no config authority.
 */
export function isSupportedQuoteMint(
    mint: Mint,
    currentEpoch: number
): boolean {
    if (mint.address.equals(NATIVE_MINT_2022)) {
        throw new Error('Token-2022 native mint is not supported as quote mint')
    }

    const supportedExtensions = [
        ExtensionType.MetadataPointer,
        ExtensionType.TokenMetadata,
        ExtensionType.TransferFeeConfig,
    ]
    return (
        getExtensionTypes(mint.tlvData).every((extension) =>
            supportedExtensions.includes(extension)
        ) && !hasTransferFeeOrConfigAuthority(mint, currentEpoch)
    )
}

async function fetchMint(
    connection: Connection,
    mint: PublicKey,
    commitment: Commitment,
    tokenProgram?: PublicKey
): Promise<Mint> {
    if (tokenProgram) {
        return getMint(connection, mint, commitment, tokenProgram)
    }

    const accountInfo = await connection.getAccountInfo(mint, commitment)
    if (!accountInfo) {
        throw new Error(`Mint account ${mint.toBase58()} not found`)
    }
    return unpackMint(mint, accountInfo, accountInfo.owner)
}

/**
 * Fetch the quote mint, optional base mint, and current epoch for an existing-pool swap quote.
 * Returns an empty object when the quote mint is SPL Token and `baseMint` is omitted.
 */
export async function getSwapQuoteTransferFees(
    connection: Connection,
    config: Pick<PoolConfig, 'quoteMint' | 'quoteTokenFlag'>,
    commitmentOrOptions:
        | Commitment
        | {
              commitment?: Commitment
              baseMint?: PublicKey
          } = 'confirmed'
): Promise<QuoteTransferFees> {
    const options =
        typeof commitmentOrOptions === 'string'
            ? { commitment: commitmentOrOptions }
            : commitmentOrOptions
    const commitment = options.commitment ?? 'confirmed'
    const quoteIsToken2022 =
        Number(config.quoteTokenFlag) === TokenType.Token2022
    if (!quoteIsToken2022 && !options.baseMint) {
        return {}
    }

    const [epochInfo, quoteMint, baseMint] = await Promise.all([
        connection.getEpochInfo(commitment),
        quoteIsToken2022
            ? fetchMint(
                  connection,
                  config.quoteMint,
                  commitment,
                  TOKEN_2022_PROGRAM_ID
              )
            : Promise.resolve(undefined),
        options.baseMint
            ? fetchMint(connection, options.baseMint, commitment)
            : Promise.resolve(undefined),
    ])

    return {
        ...(quoteMint ? { quoteMint } : {}),
        ...(baseMint ? { baseMint } : {}),
        currentEpoch: epochInfo.epoch,
    }
}
