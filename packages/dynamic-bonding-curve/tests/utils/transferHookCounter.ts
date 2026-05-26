import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor'
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import {
    AccountMeta,
    Commitment,
    Connection,
    PublicKey,
    SystemProgram,
} from '@solana/web3.js'
import {
    AccountsType,
    TransferHookAccountsInfo,
    type TransferHookRemainingAccounts,
} from '../../src'
import type { TransferHookCounter } from '../idl/transfer-hook-counter/idl'
import TransferHookCounterIDL from '../idl/transfer-hook-counter/idl.json'

export const TRANSFER_HOOK_COUNTER_PROGRAM_ID = new PublicKey(
    'EBZDYx7599krFc4m2govwBdZcicr4GgepqC78m71nsHS'
)

export function deriveExtraAccountMetaList(mint: PublicKey): PublicKey {
    const [extraAccountMetaList] = PublicKey.findProgramAddressSync(
        [Buffer.from('extra-account-metas'), mint.toBuffer()],
        TRANSFER_HOOK_COUNTER_PROGRAM_ID
    )

    return extraAccountMetaList
}

export function deriveCounterAccount(mint: PublicKey): PublicKey {
    const [counterAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('counter'), mint.toBuffer()],
        TRANSFER_HOOK_COUNTER_PROGRAM_ID
    )

    return counterAccount
}

export function createTransferHookCounterProgram(
    connection: Connection,
    commitment: Commitment = 'confirmed'
): Program<TransferHookCounter> {
    const provider = new AnchorProvider(connection, null as unknown as Wallet, {
        commitment,
    })

    return new Program<TransferHookCounter>(
        TransferHookCounterIDL as TransferHookCounter,
        provider
    )
}

export async function initializeExtraAccountMetaListTx(params: {
    connection: Connection
    payer: PublicKey
    mint: PublicKey
}) {
    const { connection, payer, mint } = params
    const extraAccountMetaList = deriveExtraAccountMetaList(mint)
    const counterAccount = deriveCounterAccount(mint)

    return createTransferHookCounterProgram(connection)
        .methods.initializeExtraAccountMetaList()
        .accountsPartial({
            payer,
            extraAccountMetaList,
            mint,
            counterAccount,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
        })
        .transaction()
}

export function getTransferHookRemainingAccounts(
    mint: PublicKey,
    accountTypes = [AccountsType.TransferHookBase]
): TransferHookRemainingAccounts {
    const transferHookAccounts = accountTypes.flatMap(() =>
        getTransferHookCounterAccountMetas(mint)
    )
    const transferHookAccountsInfo: TransferHookAccountsInfo = {
        slices: accountTypes.map((accountsType) => ({
            accountsType,
            length: getTransferHookCounterAccountMetas(mint).length,
        })),
    }

    return {
        transferHookAccountsInfo,
        transferHookAccounts,
    }
}

export async function getCounterValue(
    connection: Connection,
    mint: PublicKey
): Promise<number> {
    const counterAccount = deriveCounterAccount(mint)
    const account = await createTransferHookCounterProgram(
        connection
    ).account.counterAccount.fetch(counterAccount)

    return account.counter
}

function getTransferHookCounterAccountMetas(mint: PublicKey): AccountMeta[] {
    return [
        {
            pubkey: deriveExtraAccountMetaList(mint),
            isSigner: false,
            isWritable: false,
        },
        {
            pubkey: deriveCounterAccount(mint),
            isSigner: false,
            isWritable: true,
        },
        {
            pubkey: TRANSFER_HOOK_COUNTER_PROGRAM_ID,
            isSigner: false,
            isWritable: false,
        },
    ]
}
