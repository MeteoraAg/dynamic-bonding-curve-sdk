import {
    Commitment,
    Connection,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
} from '@solana/web3.js'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createCloseAccountInstruction,
    createSyncNativeInstruction,
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
 * The owner's ATA for a mint, with an idempotent create instruction when the
 * account does not exist yet. Off-curve owners (PDAs) are allowed.
 */
export const getOrCreateATAInstruction = async (
    connection: Connection,
    tokenMint: PublicKey,
    owner: PublicKey,
    payer: PublicKey,
    tokenProgram: PublicKey,
    commitment: Commitment = 'confirmed'
): Promise<{ ataPubkey: PublicKey; ix?: TransactionInstruction }> => {
    const toAccount = getAssociatedTokenAddressSync(
        tokenMint,
        owner,
        true,
        tokenProgram
    )

    try {
        await getAccount(connection, toAccount, commitment, tokenProgram)
        return { ataPubkey: toAccount }
    } catch (e) {
        if (
            e instanceof TokenAccountNotFoundError ||
            e instanceof TokenInvalidAccountOwnerError
        ) {
            return {
                ataPubkey: toAccount,
                ix: createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    toAccount,
                    owner,
                    tokenMint,
                    tokenProgram
                ),
            }
        }
        throw e
    }
}

/** Close the owner's wrapped SOL ATA and send the lamports to receiver. */
export function unwrapSOLInstruction(
    owner: PublicKey,
    receiver: PublicKey
): TransactionInstruction {
    return createCloseAccountInstruction(
        getAssociatedTokenAddressSync(NATIVE_MINT, owner, true),
        receiver,
        owner,
        [],
        TOKEN_PROGRAM_ID
    )
}

/** Transfer lamports into an existing wrapped SOL account and sync its balance. */
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
        createSyncNativeInstruction(to),
    ]
}

/** Unpack a mint owned by either token program. */
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

export async function getTokenDecimals(
    connection: Connection,
    mintAddress: PublicKey | string,
    commitment: Commitment = 'confirmed'
): Promise<number> {
    const mint = await fetchMint(
        connection,
        new PublicKey(mintAddress),
        commitment
    )
    return mint.decimals
}

/** The token program for a DBC token type or token flag. */
export function getTokenProgram(tokenType: TokenType): PublicKey {
    return tokenType === TokenType.SPLToken
        ? TOKEN_PROGRAM_ID
        : TOKEN_2022_PROGRAM_ID
}

/** The DBC token type of an existing mint, from the program that owns it. */
export async function getTokenType(
    connection: Connection,
    tokenMint: PublicKey,
    commitment: Commitment = 'confirmed'
): Promise<TokenType> {
    const accountInfo = await connection.getAccountInfo(tokenMint, commitment)
    if (!accountInfo) {
        throw new Error(`Mint account ${tokenMint.toBase58()} not found`)
    }
    return accountInfo.owner.equals(TOKEN_PROGRAM_ID)
        ? TokenType.SPLToken
        : TokenType.Token2022
}

/**
 * Whether a mint has a non-zero transfer fee, active or scheduled, or a
 * transfer fee config authority; the program's has_transfer_fee_or_config_authority.
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
 * Whether a quote mint is supported without a token badge: SPL Token mints,
 * and Token-2022 mints whose only extensions are metadata and a zero
 * transfer fee with no config authority.
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

/**
 * The quote mint, optional base mint and current epoch a swap quote on an
 * existing pool needs. Empty when the quote mint is SPL Token and no baseMint
 * is given, since neither side can then carry a transfer fee.
 */
export async function getSwapQuoteTransferFees(
    connection: Connection,
    config: Pick<PoolConfig, 'quoteMint' | 'quoteTokenFlag'>,
    options: { commitment?: Commitment; baseMint?: PublicKey } = {}
): Promise<QuoteTransferFees> {
    const commitment = options.commitment ?? 'confirmed'
    const quoteIsToken2022 = config.quoteTokenFlag === TokenType.Token2022
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
            : undefined,
        options.baseMint
            ? fetchMint(connection, options.baseMint, commitment)
            : undefined,
    ])

    return {
        ...(quoteMint ? { quoteMint } : {}),
        ...(baseMint ? { baseMint } : {}),
        currentEpoch: epochInfo.epoch,
    }
}

/** ATAs for several (mint, owner) pairs and the create instructions for the missing ones. */
export async function getOrCreateATAs(
    connection: Connection,
    payer: PublicKey,
    accounts: { mint: PublicKey; owner: PublicKey; tokenProgram: PublicKey }[],
    commitment: Commitment = 'confirmed'
): Promise<{ addresses: PublicKey[]; instructions: TransactionInstruction[] }> {
    const results = await Promise.all(
        accounts.map(({ mint, owner, tokenProgram }) =>
            getOrCreateATAInstruction(
                connection,
                mint,
                owner,
                payer,
                tokenProgram,
                commitment
            )
        )
    )
    return {
        addresses: results.map((result) => result.ataPubkey),
        instructions: results.flatMap((result) =>
            result.ix ? [result.ix] : []
        ),
    }
}
