import {
    AccountMeta,
    Commitment,
    ComputeBudgetProgram,
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import type { Vault } from '../idl/dynamic-vault/idl'
import type { Program } from '@coral-xyz/anchor'
import {
    createDammV1Program,
    createDynamicVaultProgram,
    findAssociatedTokenAddress,
    deriveBaseKeyForLocker,
    deriveDammV1MigrationMetadataAddress,
    deriveDammV2MigrationMetadataAddress,
    deriveDammV1PoolAddress,
    deriveDammV2EventAuthority,
    deriveDammV2PoolAddress,
    deriveEscrow,
    deriveMintMetadata,
    derivePositionAddress,
    derivePositionNftAccount,
    deriveVaultPdas,
    createInitializePermissionlessDynamicVaultIx,
    createLockEscrowIx,
    getTokenProgram,
    getOrCreateATAInstruction,
    deriveDammV2PoolAuthority,
    deriveDammV2TokenVaultAddress,
    deriveDammV1VaultLPAddress,
    deriveDammV1LpMintAddress,
    deriveDammV1LockEscrowAddress,
    deriveDammV1ProtocolFeeAddress,
    deriveLockerEventAuthority,
} from '../helpers'
import type { Amm } from '../idl/damm-v1/idl'
import type {
    CreateDammV1MigrationMetadataParams,
    CreateLockerParams,
    DammLpTokenParams,
    MigrateToDammV1Params,
    MigrateToDammV2Params,
    MigrateToDammV2Response,
    WithdrawLeftoverParams,
} from '../types'
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
    DAMM_V1_PROGRAM_ID,
    DAMM_V2_PROGRAM_ID,
    LOCKER_PROGRAM_ID,
    METAPLEX_PROGRAM_ID,
    VAULT_PROGRAM_ID,
} from '../constants'
import { StateService } from './state'

export class MigrationService extends DynamicBondingCurveProgram {
    constructor(
        connection: Connection,
        commitment: Commitment,
        state?: StateService
    ) {
        super(
            connection,
            commitment,
            state ?? new StateService(connection, commitment)
        )
    }

    /**
     * Create a Dynamic Vault program client.
     */
    private getDynamicVaultProgram(): Program<Vault> {
        return createDynamicVaultProgram(this.connection)
    }

    /**
     * Create a DAMM V1 program client.
     */
    private getDammV1Program(): Program<Amm> {
        return createDammV1Program(this.connection)
    }

    /**
     * Build a transaction that creates the locker for locked vesting tokens.
     */
    async createLocker(params: CreateLockerParams): Promise<Transaction> {
        const { pool, payer } = params

        const lockerEventAuthority = deriveLockerEventAuthority()

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const base = deriveBaseKeyForLocker(pool)

        const escrow = deriveEscrow(base)

        const tokenProgram =
            poolConfigState.tokenType === 0
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const escrowToken = findAssociatedTokenAddress(
            escrow,
            virtualPool.poolState.baseMint,
            tokenProgram
        )

        const preInstructions: TransactionInstruction[] = []

        const createOwnerEscrowVaultTokenXIx =
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                escrowToken,
                escrow,
                virtualPool.poolState.baseMint,
                tokenProgram
            )

        preInstructions.push(createOwnerEscrowVaultTokenXIx)

        const accounts = {
            virtualPool: pool,
            config: virtualPool.poolState.config,
            poolAuthority: this.poolAuthority,
            baseVault: virtualPool.poolState.baseVault,
            baseMint: virtualPool.poolState.baseMint,
            base,
            creator: virtualPool.poolState.creator,
            escrow,
            escrowToken,
            payer,
            tokenProgram,
            lockerProgram: LOCKER_PROGRAM_ID,
            lockerEventAuthority,
            systemProgram: SystemProgram.programId,
        }

        return this.program.methods
            .createLocker()
            .accountsPartial(accounts)
            .preInstructions(preInstructions)
            .transaction()
    }

    /**
     * Build a transaction that withdraws leftover base tokens after migration.
     */
    async withdrawLeftover(
        params: WithdrawLeftoverParams
    ): Promise<Transaction> {
        const { pool, payer } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)

        const preInstructions: TransactionInstruction[] = []

        const { ataPubkey: tokenBaseAccount, ix: createBaseTokenAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                virtualPool.poolState.baseMint,
                poolConfigState.leftoverReceiver,
                payer,
                true,
                tokenBaseProgram
            )
        createBaseTokenAccountIx &&
            preInstructions.push(createBaseTokenAccountIx)

        return this.program.methods
            .withdrawLeftover()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPool.poolState.config,
                virtualPool: pool,
                tokenBaseAccount,
                baseVault: virtualPool.poolState.baseVault,
                baseMint: virtualPool.poolState.baseMint,
                leftoverReceiver: poolConfigState.leftoverReceiver,
                tokenBaseProgram,
            })
            .preInstructions(preInstructions)
            .transaction()
    }

    ///////////////////////
    // DAMM V1 FUNCTIONS //
    ///////////////////////

    /**
     * Build a transaction that creates DAMM V1 migration metadata.
     */
    async createDammV1MigrationMetadata(
        params: CreateDammV1MigrationMetadataParams
    ): Promise<Transaction> {
        const { virtualPool, config, payer } = params

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(
            new PublicKey(virtualPool)
        )

        const accounts = {
            virtualPool,
            config,
            migrationMetadata: migrationMetadata,
            payer: payer,
            systemProgram: SystemProgram.programId,
        }

        return this.program.methods
            .migrationMeteoraDammCreateMetadata()
            .accountsPartial(accounts)
            .transaction()
    }

    /**
     * Build a transaction that migrates a completed virtual pool to DAMM V1.
     */
    async migrateToDammV1(params: MigrateToDammV1Params): Promise<Transaction> {
        const { pool, dammConfig, payer } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(pool)

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            virtualPool.poolState.baseMint,
            poolConfigState.quoteMint
        )

        const lpMint = deriveDammV1LpMintAddress(dammPool)

        const mintMetadata = deriveMintMetadata(lpMint)

        const [protocolTokenAFee, protocolTokenBFee] = [
            deriveDammV1ProtocolFeeAddress(
                virtualPool.poolState.baseMint,
                dammPool
            ),
            deriveDammV1ProtocolFeeAddress(poolConfigState.quoteMint, dammPool),
        ]

        const vaultProgram = this.getDynamicVaultProgram()

        const [
            {
                vaultPda: aVault,
                tokenVaultPda: aTokenVault,
                lpMintPda: aLpMintPda,
            },
            {
                vaultPda: bVault,
                tokenVaultPda: bTokenVault,
                lpMintPda: bLpMintPda,
            },
        ] = [
            deriveVaultPdas(virtualPool.poolState.baseMint),
            deriveVaultPdas(poolConfigState.quoteMint),
        ]

        const [aVaultAccount, bVaultAccount] = await Promise.all([
            vaultProgram.account.vault.fetchNullable(aVault),
            vaultProgram.account.vault.fetchNullable(bVault),
        ])

        let aVaultLpMint = aLpMintPda
        let bVaultLpMint = bLpMintPda
        const preInstructions: TransactionInstruction[] = []

        if (!aVaultAccount) {
            const createVaultAIx =
                await createInitializePermissionlessDynamicVaultIx(
                    virtualPool.poolState.baseMint,
                    payer,
                    vaultProgram
                )
            if (createVaultAIx) {
                preInstructions.push(createVaultAIx.instruction)
            }
        } else {
            aVaultLpMint = aVaultAccount.lpMint
        }
        if (!bVaultAccount) {
            const createVaultBIx =
                await createInitializePermissionlessDynamicVaultIx(
                    poolConfigState.quoteMint,
                    payer,
                    vaultProgram
                )
            if (createVaultBIx) {
                preInstructions.push(createVaultBIx.instruction)
            }
        } else {
            bVaultLpMint = bVaultAccount.lpMint
        }

        const [aVaultLp, bVaultLp] = [
            deriveDammV1VaultLPAddress(aVault, dammPool),
            deriveDammV1VaultLPAddress(bVault, dammPool),
        ]

        const virtualPoolLp = getAssociatedTokenAddressSync(
            lpMint,
            this.poolAuthority,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        )

        const transaction = await this.program.methods
            .migrateMeteoraDamm()
            .accountsPartial({
                virtualPool: pool,
                migrationMetadata,
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                dammConfig,
                lpMint,
                tokenAMint: virtualPool.poolState.baseMint,
                tokenBMint: poolConfigState.quoteMint,
                aVault,
                bVault,
                aTokenVault,
                bTokenVault,
                aVaultLpMint,
                bVaultLpMint,
                aVaultLp,
                bVaultLp,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                virtualPoolLp,
                protocolTokenAFee,
                protocolTokenBFee,
                payer,
                rent: SYSVAR_RENT_PUBKEY,
                mintMetadata,
                metadataProgram: METAPLEX_PROGRAM_ID,
                ammProgram: DAMM_V1_PROGRAM_ID,
                vaultProgram: VAULT_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500000,
        })

        transaction.add(modifyComputeUnits)

        return transaction
    }

    /**
     * Build a transaction that locks DAMM V1 LP tokens for the creator or partner.
     */
    async lockDammV1LpToken(params: DammLpTokenParams): Promise<Transaction> {
        const { pool, dammConfig, payer, isPartner } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            virtualPool.poolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(pool)

        const vaultProgram = this.getDynamicVaultProgram()

        const [
            { vaultPda: aVault, lpMintPda: aLpMintPda },
            { vaultPda: bVault, lpMintPda: bLpMintPda },
        ] = [
            deriveVaultPdas(virtualPool.poolState.baseMint),
            deriveVaultPdas(poolConfigState.quoteMint),
        ]

        const [aVaultAccount, bVaultAccount] = await Promise.all([
            vaultProgram.account.vault.fetchNullable(aVault),
            vaultProgram.account.vault.fetchNullable(bVault),
        ])

        let aVaultLpMint = aLpMintPda
        let bVaultLpMint = bLpMintPda
        const preInstructions: TransactionInstruction[] = []

        if (!aVaultAccount) {
            const createVaultAIx =
                await createInitializePermissionlessDynamicVaultIx(
                    virtualPool.poolState.baseMint,
                    payer,
                    vaultProgram
                )
            if (createVaultAIx) {
                preInstructions.push(createVaultAIx.instruction)
            }
        } else {
            aVaultLpMint = aVaultAccount.lpMint
        }
        if (!bVaultAccount) {
            const createVaultBIx =
                await createInitializePermissionlessDynamicVaultIx(
                    poolConfigState.quoteMint,
                    payer,
                    vaultProgram
                )
            if (createVaultBIx) {
                preInstructions.push(createVaultBIx.instruction)
            }
        } else {
            bVaultLpMint = bVaultAccount.lpMint
        }

        const [aVaultLp, bVaultLp] = [
            deriveDammV1VaultLPAddress(aVault, dammPool),
            deriveDammV1VaultLPAddress(bVault, dammPool),
        ]

        const lpMint = deriveDammV1LpMintAddress(dammPool)

        const dammV1Program = this.getDammV1Program()

        let lockEscrowKey: PublicKey

        if (isPartner) {
            lockEscrowKey = deriveDammV1LockEscrowAddress(
                dammPool,
                poolConfigState.feeClaimer
            )

            const lockEscrowData =
                await this.connection.getAccountInfo(lockEscrowKey)

            if (!lockEscrowData) {
                const ix = await createLockEscrowIx(
                    payer,
                    dammPool,
                    lpMint,
                    poolConfigState.feeClaimer,
                    lockEscrowKey,
                    dammV1Program
                )
                preInstructions.push(ix)
            }
        } else {
            lockEscrowKey = deriveDammV1LockEscrowAddress(
                dammPool,
                virtualPool.poolState.creator
            )

            const lockEscrowData =
                await this.connection.getAccountInfo(lockEscrowKey)

            if (!lockEscrowData) {
                const ix = await createLockEscrowIx(
                    payer,
                    dammPool,
                    lpMint,
                    virtualPool.poolState.creator,
                    lockEscrowKey,
                    dammV1Program
                )
                preInstructions.push(ix)
            }
        }

        const escrowVault = getAssociatedTokenAddressSync(
            lpMint,
            lockEscrowKey,
            true,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
        )

        const createEscrowVaultIx =
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                escrowVault,
                lockEscrowKey,
                lpMint,
                TOKEN_PROGRAM_ID,
                ASSOCIATED_TOKEN_PROGRAM_ID
            )

        preInstructions.push(createEscrowVaultIx)

        const sourceTokens = getAssociatedTokenAddressSync(
            lpMint,
            this.poolAuthority,
            true
        )

        return this.program.methods
            .migrateMeteoraDammLockLpToken()
            .accountsPartial({
                virtualPool: pool,
                migrationMetadata,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                lpMint,
                lockEscrow: lockEscrowKey,
                owner: isPartner
                    ? poolConfigState.feeClaimer
                    : virtualPool.poolState.creator,
                sourceTokens,
                escrowVault,
                aVault,
                bVault,
                aVaultLp,
                bVaultLp,
                aVaultLpMint,
                bVaultLpMint,
                ammProgram: DAMM_V1_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()
    }

    /**
     * Build a transaction that claims DAMM V1 LP tokens for the creator or partner.
     */
    async claimDammV1LpToken(params: DammLpTokenParams): Promise<Transaction> {
        const { pool, dammConfig, payer, isPartner } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            virtualPool.poolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(pool)

        const lpMint = deriveDammV1LpMintAddress(dammPool)

        let destinationToken: PublicKey
        if (isPartner) {
            destinationToken = findAssociatedTokenAddress(
                poolConfigState.feeClaimer,
                lpMint,
                TOKEN_PROGRAM_ID
            )
        } else {
            destinationToken = findAssociatedTokenAddress(
                virtualPool.poolState.creator,
                lpMint,
                TOKEN_PROGRAM_ID
            )
        }

        const preInstructions: TransactionInstruction[] = []

        const createDestinationTokenIx =
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                destinationToken,
                isPartner
                    ? poolConfigState.feeClaimer
                    : virtualPool.poolState.creator,
                lpMint,
                TOKEN_PROGRAM_ID
            )

        preInstructions.push(createDestinationTokenIx)

        const sourceToken = getAssociatedTokenAddressSync(
            lpMint,
            this.poolAuthority,
            true
        )

        const accounts = {
            virtualPool: pool,
            migrationMetadata,
            poolAuthority: this.poolAuthority,
            lpMint,
            sourceToken,
            destinationToken,
            owner: isPartner
                ? poolConfigState.feeClaimer
                : virtualPool.poolState.creator,
            sender: payer,
            tokenProgram: TOKEN_PROGRAM_ID,
        }

        return this.program.methods
            .migrateMeteoraDammClaimLpToken()
            .accountsPartial(accounts)
            .preInstructions(preInstructions)
            .transaction()
    }

    ///////////////////////
    // DAMM V2 FUNCTIONS //
    ///////////////////////

    /**
     * Build transactions and derived addresses for migrating a completed virtual pool to DAMM V2.
     */
    async migrateToDammV2(
        params: MigrateToDammV2Params
    ): Promise<MigrateToDammV2Response> {
        const { pool, dammConfig, payer } = params

        const dammPoolAuthority = deriveDammV2PoolAuthority()
        const dammEventAuthority = deriveDammV2EventAuthority()

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const migrationMetadata = deriveDammV2MigrationMetadataAddress(pool)

        const dammPool = deriveDammV2PoolAddress(
            dammConfig,
            virtualPool.poolState.baseMint,
            poolConfigState.quoteMint
        )

        const firstPositionNftKP = Keypair.generate()
        const firstPosition = derivePositionAddress(
            firstPositionNftKP.publicKey
        )
        const firstPositionNftAccount = derivePositionNftAccount(
            firstPositionNftKP.publicKey
        )

        const secondPositionNftKP = Keypair.generate()
        const secondPosition = derivePositionAddress(
            secondPositionNftKP.publicKey
        )
        const secondPositionNftAccount = derivePositionNftAccount(
            secondPositionNftKP.publicKey
        )

        const tokenAVault = deriveDammV2TokenVaultAddress(
            dammPool,
            virtualPool.poolState.baseMint
        )

        const tokenBVault = deriveDammV2TokenVaultAddress(
            dammPool,
            poolConfigState.quoteMint
        )

        const tokenBaseProgram =
            poolConfigState.tokenType == 0
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const tokenQuoteProgram =
            poolConfigState.quoteTokenFlag == 0
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const remainingAccounts: AccountMeta[] = [
            {
                isSigner: false,
                isWritable: false,
                pubkey: dammConfig,
            },
        ]

        const tx = await this.program.methods
            .migrationDammV2()
            .accountsStrict({
                virtualPool: pool,
                migrationMetadata,
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                firstPositionNftMint: firstPositionNftKP.publicKey,
                firstPosition,
                firstPositionNftAccount,
                secondPositionNftMint: secondPositionNftKP.publicKey,
                secondPosition,
                secondPositionNftAccount,
                dammPoolAuthority,
                ammProgram: DAMM_V2_PROGRAM_ID,
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                tokenAVault,
                tokenBVault,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                payer,
                tokenBaseProgram,
                tokenQuoteProgram,
                token2022Program: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                dammEventAuthority,
            })
            .remainingAccounts(remainingAccounts)
            .transaction()

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 600000,
        })

        tx.add(modifyComputeUnits)

        return {
            transaction: tx,
            firstPositionNftKeypair: firstPositionNftKP,
            secondPositionNftKeypair: secondPositionNftKP,
        }
    }
}
