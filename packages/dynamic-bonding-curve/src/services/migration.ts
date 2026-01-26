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
import type { DynamicVault } from '../idl/dynamic-vault/idl'
import type { Program } from '@coral-xyz/anchor'
import {
    createDammV1Program,
    createVaultProgram,
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
    deriveDammV2PositionVestingAccount,
} from '../helpers'
import type { DammV1 } from '../idl/damm-v1/idl'
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
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Get vault program instance
     * @returns The vault program instance
     */
    private getVaultProgram(): Program<DynamicVault> {
        return createVaultProgram(this.connection)
    }

    /**
     * Get DAMM V1 program instance
     * @returns The DAMM V1 program instance
     */
    private getDammV1Program(): Program<DammV1> {
        return createDammV1Program(this.connection)
    }

    /**
     * Create Locker (if there is lockedVesting)
     * @param payer - The payer of the transaction
     * @param virtualPool - The virtual pool address
     * @returns A create locker transaction
     */
    async createLocker(params: CreateLockerParams): Promise<Transaction> {
        const { virtualPool, payer } = params

        const lockerEventAuthority = deriveLockerEventAuthority()

        const virtualPoolState = await this.state.getPool(virtualPool)
        if (!virtualPoolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPoolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const base = deriveBaseKeyForLocker(virtualPool)

        const escrow = deriveEscrow(base)

        const tokenProgram =
            poolConfigState.tokenType === 0
                ? TOKEN_PROGRAM_ID
                : TOKEN_2022_PROGRAM_ID

        const escrowToken = findAssociatedTokenAddress(
            escrow,
            virtualPoolState.baseMint,
            tokenProgram
        )

        const preInstructions: TransactionInstruction[] = []

        const createOwnerEscrowVaultTokenXIx =
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                escrowToken,
                escrow,
                virtualPoolState.baseMint,
                tokenProgram
            )

        preInstructions.push(createOwnerEscrowVaultTokenXIx)

        const accounts = {
            virtualPool,
            config: virtualPoolState.config,
            poolAuthority: this.poolAuthority,
            baseVault: virtualPoolState.baseVault,
            baseMint: virtualPoolState.baseMint,
            base,
            creator: virtualPoolState.creator,
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
     * Withdraw leftover
     * @param payer - The payer of the transaction
     * @param virtualPool - The virtual pool address
     * @returns A withdraw leftover transaction
     */
    async withdrawLeftover(
        params: WithdrawLeftoverParams
    ): Promise<Transaction> {
        const { virtualPool, payer } = params

        const poolState = await this.state.getPool(virtualPool)
        if (!poolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)

        const preInstructions: TransactionInstruction[] = []

        const { ataPubkey: tokenBaseAccount, ix: createBaseTokenAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                poolState.baseMint,
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
                config: poolState.config,
                virtualPool,
                tokenBaseAccount,
                baseVault: poolState.baseVault,
                baseMint: poolState.baseMint,
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
     * Create metadata for the migration of Meteora DAMM V1
     * @param payer - The payer of the transaction
     * @param virtualPool - The virtual pool address
     * @param config - The config address
     * @returns A migration transaction
     */
    async createDammV1MigrationMetadata(
        params: CreateDammV1MigrationMetadataParams
    ): Promise<Transaction> {
        const { virtualPool, config, payer } = params

        const migrationMetadata =
            deriveDammV1MigrationMetadataAddress(new PublicKey(virtualPool))

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
     * Migrate to DAMM V1
     * @param payer - The payer of the transaction
     * @param virtualPool - The virtual pool address
     * @param dammConfig - The damm config address
     * @returns A migrate transaction
     */
    async migrateToDammV1(params: MigrateToDammV1Params): Promise<Transaction> {
        const { virtualPool, dammConfig, payer } = params

        const poolState = await this.state.getPool(virtualPool)
        if (!poolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)
        if (!poolConfigState) {
            throw new Error(
                `Pool config not found for virtual pool: ${virtualPool.toString()}`
            )
        }

        const migrationMetadata =
            deriveDammV1MigrationMetadataAddress(virtualPool)

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            poolState.baseMint,
            poolConfigState.quoteMint
        )

        const lpMint = deriveDammV1LpMintAddress(dammPool)

        const mintMetadata = deriveMintMetadata(lpMint)

        const [protocolTokenAFee, protocolTokenBFee] = [
            deriveDammV1ProtocolFeeAddress(poolState.baseMint, dammPool),
            deriveDammV1ProtocolFeeAddress(poolConfigState.quoteMint, dammPool),
        ]

        const vaultProgram = this.getVaultProgram()

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
            deriveVaultPdas(poolState.baseMint),
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
                    poolState.baseMint,
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
                virtualPool,
                migrationMetadata,
                config: poolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                dammConfig,
                lpMint,
                tokenAMint: poolState.baseMint,
                tokenBMint: poolConfigState.quoteMint,
                aVault,
                bVault,
                aTokenVault,
                bTokenVault,
                aVaultLpMint,
                bVaultLpMint,
                aVaultLp,
                bVaultLp,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
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
     * Lock DAMM V1 LP token for creator or partner
     * @param payer - The payer of the transaction
     * @param virtualPool - The virtual pool address
     * @param dammConfig - The damm config address
     * @param isPartner - Whether the partner is locking the LP token
     * @returns A lock transaction
     */
    async lockDammV1LpToken(params: DammLpTokenParams): Promise<Transaction> {
        const { virtualPool, dammConfig, payer, isPartner } = params

        const poolState = await this.state.getPool(params.virtualPool)
        if (!poolState) {
            throw new Error(`Pool not found: ${params.virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            poolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata =
            deriveDammV1MigrationMetadataAddress(virtualPool)

        const vaultProgram = this.getVaultProgram()

        const [
            { vaultPda: aVault, lpMintPda: aLpMintPda },
            { vaultPda: bVault, lpMintPda: bLpMintPda },
        ] = [
            deriveVaultPdas(poolState.baseMint),
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
                    poolState.baseMint,
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
                poolState.creator
            )

            const lockEscrowData =
                await this.connection.getAccountInfo(lockEscrowKey)

            if (!lockEscrowData) {
                const ix = await createLockEscrowIx(
                    payer,
                    dammPool,
                    lpMint,
                    poolState.creator,
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
                virtualPool,
                migrationMetadata,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                lpMint,
                lockEscrow: lockEscrowKey,
                owner: isPartner
                    ? poolConfigState.feeClaimer
                    : poolState.creator,
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
     * Claim DAMM V1 LP token for creator or partner
     * @param payer - The payer of the transaction
     * @param virtualPool - The virtual pool address
     * @param dammConfig - The damm config address
     * @param isPartner - Whether the partner is claiming the LP token
     * @returns A claim transaction
     */
    async claimDammV1LpToken(params: DammLpTokenParams): Promise<Transaction> {
        const { virtualPool, dammConfig, payer, isPartner } = params

        const virtualPoolState = await this.state.getPool(virtualPool)
        if (!virtualPoolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPoolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            virtualPoolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata =
            deriveDammV1MigrationMetadataAddress(virtualPool)

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
                virtualPoolState.creator,
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
                    : virtualPoolState.creator,
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
            virtualPool,
            migrationMetadata,
            poolAuthority: this.poolAuthority,
            lpMint,
            sourceToken,
            destinationToken,
            owner: isPartner
                ? poolConfigState.feeClaimer
                : virtualPoolState.creator,
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
     * Migrate to DAMM V2
     * @param payer - The payer of the transaction
     * @param virtualPool - The virtual pool address
     * @param dammConfig - The damm config address
     * @returns A migrate transaction
     */
    async migrateToDammV2(
        params: MigrateToDammV2Params
    ): Promise<MigrateToDammV2Response> {
        const { virtualPool, dammConfig, payer } = params

        const dammPoolAuthority = deriveDammV2PoolAuthority()
        const dammEventAuthority = deriveDammV2EventAuthority()

        const virtualPoolState = await this.state.getPool(virtualPool)
        if (!virtualPoolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPoolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const migrationMetadata =
            deriveDammV2MigrationMetadataAddress(virtualPool)

        const dammPool = deriveDammV2PoolAddress(
            dammConfig,
            virtualPoolState.baseMint,
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
            virtualPoolState.baseMint
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

        const firstPositionVestingAddress =
            deriveDammV2PositionVestingAccount(firstPosition)

        const secondPositionVestingAddress =
            deriveDammV2PositionVestingAccount(secondPosition)

        const remainingAccounts: AccountMeta[] = [
            {
                isSigner: false,
                isWritable: false,
                pubkey: dammConfig,
            },
            {
                isSigner: false,
                isWritable: true,
                pubkey: firstPositionVestingAddress,
            },
            {
                isSigner: false,
                isWritable: true,
                pubkey: secondPositionVestingAddress,
            },
        ]

        const tx = await this.program.methods
            .migrationDammV2()
            .accountsStrict({
                virtualPool,
                migrationMetadata,
                config: virtualPoolState.config,
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
                baseMint: virtualPoolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                tokenAVault,
                tokenBVault,
                baseVault: virtualPoolState.baseVault,
                quoteVault: virtualPoolState.quoteVault,
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
