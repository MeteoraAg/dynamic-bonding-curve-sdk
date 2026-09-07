import {
    Connection,
    Keypair,
    PublicKey,
    sendAndConfirmTransaction,
    SystemProgram,
    Transaction,
} from '@solana/web3.js'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    createInitializeMint2Instruction,
    createInitializePermanentDelegateInstruction,
    createMintToInstruction,
    ExtensionType,
    getAssociatedTokenAddressSync,
    getMintLen,
    TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token'
import BN from 'bn.js'
import {
    ActivationType,
    CollectFeeMode,
    createDbcProgram,
    createDammV2Program,
    DAMM_V2_PROGRAM_ID,
    DammV2BaseFeeMode,
    deriveDbcPoolAuthority,
    deriveTokenBadgeAddress,
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
    MAX_SQRT_PRICE,
    MIN_SQRT_PRICE,
} from '../../src'

// dynamic-bonding-curve/src/state/operator.rs
enum DbcOperatorPermission {
    ClaimProtocolFee,
    ZapProtocolFee,
    CreateTokenBadge,
    CloseTokenBadge,
}

// cp-amm/src/state/operator.rs
enum DammV2OperatorPermission {
    CreateConfigKey,
}

// cp-amm/src/state/config.rs
enum DammV2ConfigPermission {
    CreatePoolWithoutMintValidation,
}

function deriveOperatorAddress(
    whitelistedAddress: PublicKey,
    programId: PublicKey
): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('operator'), whitelistedAddress.toBuffer()],
        programId
    )[0]
}

function deriveDammV2ConfigAddress(index: BN): PublicKey {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('config'), index.toArrayLike(Buffer, 'le', 8)],
        DAMM_V2_PROGRAM_ID
    )[0]
}

export async function createStockQuoteMint(
    connection: Connection,
    payer: Keypair
): Promise<PublicKey> {
    const mintKeypair = Keypair.generate()
    const mintLen = getMintLen([ExtensionType.PermanentDelegate])
    const lamports = await connection.getMinimumBalanceForRentExemption(mintLen)

    const tx = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: mintLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializePermanentDelegateInstruction(
            mintKeypair.publicKey,
            payer.publicKey,
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMint2Instruction(
            mintKeypair.publicKey,
            6,
            payer.publicKey,
            null,
            TOKEN_2022_PROGRAM_ID
        )
    )
    tx.feePayer = payer.publicKey
    await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair])

    return mintKeypair.publicKey
}

export async function mintToken2022(
    connection: Connection,
    payer: Keypair,
    mint: PublicKey,
    destinationOwner: PublicKey,
    amount: bigint
): Promise<void> {
    const ata = getAssociatedTokenAddressSync(
        mint,
        destinationOwner,
        true,
        TOKEN_2022_PROGRAM_ID
    )
    const tx = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
            payer.publicKey,
            ata,
            destinationOwner,
            mint,
            TOKEN_2022_PROGRAM_ID
        ),
        createMintToInstruction(
            mint,
            ata,
            payer.publicKey,
            amount,
            [],
            TOKEN_2022_PROGRAM_ID
        )
    )
    tx.feePayer = payer.publicKey
    await sendAndConfirmTransaction(connection, tx, [payer])
}

export async function createDbcTokenBadge(
    connection: Connection,
    admin: Keypair,
    operator: Keypair,
    tokenMint: PublicKey
): Promise<PublicKey> {
    const program = createDbcProgram(connection).program
    const operatorPda = deriveOperatorAddress(
        operator.publicKey,
        DYNAMIC_BONDING_CURVE_PROGRAM_ID
    )

    const createOperatorTx = await program.methods
        .createOperatorAccount(
            new BN(1).shln(DbcOperatorPermission.CreateTokenBadge)
        )
        .accountsPartial({
            operator: operatorPda,
            whitelistedAddress: operator.publicKey,
            signer: admin.publicKey,
            payer: admin.publicKey,
        })
        .transaction()
    createOperatorTx.feePayer = admin.publicKey
    await sendAndConfirmTransaction(connection, createOperatorTx, [admin])

    const tokenBadge = deriveTokenBadgeAddress(tokenMint)
    const createBadgeTx = await program.methods
        .createTokenBadge()
        .accountsPartial({
            tokenBadge,
            tokenMint,
            operator: operatorPda,
            signer: operator.publicKey,
            payer: operator.publicKey,
        })
        .transaction()
    createBadgeTx.feePayer = operator.publicKey
    await sendAndConfirmTransaction(connection, createBadgeTx, [operator])
    return tokenBadge
}

export async function createDammV2MigrationConfig(
    connection: Connection,
    admin: Keypair
): Promise<PublicKey> {
    const program = createDammV2Program(connection)
    const operatorPda = deriveOperatorAddress(
        admin.publicKey,
        DAMM_V2_PROGRAM_ID
    )

    const createOperatorTx = await program.methods
        .createOperatorAccount(
            new BN(1).shln(DammV2OperatorPermission.CreateConfigKey)
        )
        .accountsPartial({
            operator: operatorPda,
            whitelistedAddress: admin.publicKey,
            signer: admin.publicKey,
            payer: admin.publicKey,
        })
        .transaction()
    createOperatorTx.feePayer = admin.publicKey
    await sendAndConfirmTransaction(connection, createOperatorTx, [admin])

    const index = new BN(
        Keypair.generate().publicKey.toBuffer().subarray(0, 8),
        'le'
    )
    const config = deriveDammV2ConfigAddress(index)
    const baseFeeData = program.coder.types.encode('borshFeeTimeScheduler', {
        cliffFeeNumerator: new BN(2_500_000),
        numberOfPeriod: 0,
        periodFrequency: new BN(0),
        reductionFactor: new BN(0),
        baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
    })

    const createConfigTx = await program.methods
        .createConfig(index, {
            poolFees: {
                baseFee: {
                    data: Array.from(baseFeeData),
                },
                compoundingFeeBps: 0,
                padding: 0,
                dynamicFee: null,
            },
            sqrtMinPrice: MIN_SQRT_PRICE,
            sqrtMaxPrice: MAX_SQRT_PRICE,
            vaultConfigKey: PublicKey.default,
            poolCreatorAuthority: deriveDbcPoolAuthority(),
            activationType: ActivationType.Timestamp,
            collectFeeMode: CollectFeeMode.QuoteToken,
            permission: new BN(1).shln(
                DammV2ConfigPermission.CreatePoolWithoutMintValidation
            ),
        })
        .accountsPartial({
            config,
            operator: operatorPda,
            signer: admin.publicKey,
            payer: admin.publicKey,
        })
        .transaction()
    createConfigTx.feePayer = admin.publicKey
    await sendAndConfirmTransaction(connection, createConfigTx, [admin])
    return config
}
