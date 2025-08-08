import {
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
    deriveDbcPoolAuthority,
    deriveLockerEventAuthority,
} from '../helpers'
import type { DammV1 } from '../idl/damm-v1/idl'
import type {
    CreateDammV1MigrationMetadataParam,
    CreateDammV2MigrationMetadataParam,
    CreateLockerParam,
    DammLpTokenParam,
    MigrateToDammV1Param,
    MigrateToDammV2Param,
    MigrateToDammV2Response,
    WithdrawLeftoverParam,
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
     * @param createLockerParam - The parameters for the locker
     * @returns A create locker transaction
     */
    async createLocker(
        createLockerParam: CreateLockerParam
    ): Promise<Transaction> {
        const poolAuthority = deriveDbcPoolAuthority()
        const lockerEventAuthority = deriveLockerEventAuthority()

        const virtualPoolState = await this.state.getPool(
            createLockerParam.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${createLockerParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPoolState.config
        )

        const base = deriveBaseKeyForLocker(createLockerParam.virtualPool)

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
                createLockerParam.payer,
                escrowToken,
                escrow,
                virtualPoolState.baseMint,
                tokenProgram
            )

        preInstructions.push(createOwnerEscrowVaultTokenXIx)

        const accounts = {
            virtualPool: createLockerParam.virtualPool,
            config: virtualPoolState.config,
            poolAuthority,
            baseVault: virtualPoolState.baseVault,
            baseMint: virtualPoolState.baseMint,
            base,
            creator: virtualPoolState.creator,
            escrow,
            escrowToken,
            payer: createLockerParam.payer,
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
     * @param withdrawLeftoverParam - The parameters for the withdraw leftover
     * @returns A withdraw leftover transaction
     */
    async withdrawLeftover(
        withdrawLeftoverParam: WithdrawLeftoverParam
    ): Promise<Transaction> {
        const poolState = await this.state.getPool(
            withdrawLeftoverParam.virtualPool
        )

        if (!poolState) {
            throw new Error(
                `Pool not found: ${withdrawLeftoverParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)

        const preInstructions: TransactionInstruction[] = []
        const { ataPubkey: tokenBaseAccount, ix: createBaseTokenAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                poolState.baseMint,
                poolConfigState.leftoverReceiver,
                withdrawLeftoverParam.payer,
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
                virtualPool: withdrawLeftoverParam.virtualPool,
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
     * @param createDammV1MigrationMetadataParam - The parameters for the migration
     * @returns A migration transaction
     */
    async createDammV1MigrationMetadata(
        createDammV1MigrationMetadataParam: CreateDammV1MigrationMetadataParam
    ): Promise<Transaction> {
        const migrationMetadata = deriveDammV1MigrationMetadataAddress(
            createDammV1MigrationMetadataParam.virtualPool
        )

        const accounts = {
            virtualPool: createDammV1MigrationMetadataParam.virtualPool,
            config: createDammV1MigrationMetadataParam.config,
            migrationMetadata: migrationMetadata,
            payer: createDammV1MigrationMetadataParam.payer,
            systemProgram: SystemProgram.programId,
        }

        return this.program.methods
            .migrationMeteoraDammCreateMetadata()
            .accountsPartial(accounts)
            .transaction()
    }

    /**
     * Migrate to DAMM V1
     * @param migrateToDammV1Param - The parameters for the migration
     * @returns A migrate transaction
     */
    async migrateToDammV1(
        migrateToDammV1Param: MigrateToDammV1Param
    ): Promise<Transaction> {
        const poolState = await this.state.getPool(
            migrateToDammV1Param.virtualPool
        )
        if (!poolState) {
            throw new Error(
                `Pool not found: ${migrateToDammV1Param.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(
            migrateToDammV1Param.virtualPool
        )

        const dammPool = deriveDammV1PoolAddress(
            migrateToDammV1Param.dammConfig,
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
                    migrateToDammV1Param.payer,
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
                    migrateToDammV1Param.payer,
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
                virtualPool: migrateToDammV1Param.virtualPool,
                migrationMetadata,
                config: poolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                dammConfig: migrateToDammV1Param.dammConfig,
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
                payer: migrateToDammV1Param.payer,
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
     * @param lockDammV1LpTokenParam - The parameters for the lock
     * @returns A lock transaction
     */
    async lockDammV1LpToken(
        lockDammV1LpTokenParam: DammLpTokenParam
    ): Promise<Transaction> {
        const poolState = await this.state.getPool(
            lockDammV1LpTokenParam.virtualPool
        )

        if (!poolState) {
            throw new Error(
                `Pool not found: ${lockDammV1LpTokenParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        const dammPool = deriveDammV1PoolAddress(
            lockDammV1LpTokenParam.dammConfig,
            poolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(
            lockDammV1LpTokenParam.virtualPool
        )

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
                    lockDammV1LpTokenParam.payer,
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
                    lockDammV1LpTokenParam.payer,
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

        if (lockDammV1LpTokenParam.isPartner) {
            lockEscrowKey = deriveDammV1LockEscrowAddress(
                dammPool,
                poolConfigState.feeClaimer
            )

            const lockEscrowData =
                await this.connection.getAccountInfo(lockEscrowKey)

            if (!lockEscrowData) {
                const ix = await createLockEscrowIx(
                    lockDammV1LpTokenParam.payer,
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
                    lockDammV1LpTokenParam.payer,
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
                lockDammV1LpTokenParam.payer,
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
                virtualPool: lockDammV1LpTokenParam.virtualPool,
                migrationMetadata,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                lpMint,
                lockEscrow: lockEscrowKey,
                owner: lockDammV1LpTokenParam.isPartner
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
     * @param claimDammV1LpTokenParam - The parameters for the claim
     * @returns A claim transaction
     */
    async claimDammV1LpToken(
        claimDammV1LpTokenParam: DammLpTokenParam
    ): Promise<Transaction> {
        const poolAuthority = deriveDbcPoolAuthority()

        const virtualPoolState = await this.state.getPool(
            claimDammV1LpTokenParam.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${claimDammV1LpTokenParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPoolState.config
        )

        const dammPool = deriveDammV1PoolAddress(
            claimDammV1LpTokenParam.dammConfig,
            virtualPoolState.baseMint,
            poolConfigState.quoteMint
        )

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(
            claimDammV1LpTokenParam.virtualPool
        )

        const lpMint = deriveDammV1LpMintAddress(dammPool)

        let destinationToken: PublicKey
        if (claimDammV1LpTokenParam.isPartner) {
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
                claimDammV1LpTokenParam.payer,
                destinationToken,
                claimDammV1LpTokenParam.isPartner
                    ? poolConfigState.feeClaimer
                    : virtualPoolState.creator,
                lpMint,
                TOKEN_PROGRAM_ID
            )

        preInstructions.push(createDestinationTokenIx)

        const sourceToken = getAssociatedTokenAddressSync(
            lpMint,
            poolAuthority,
            true
        )

        const accounts = {
            virtualPool: claimDammV1LpTokenParam.virtualPool,
            migrationMetadata,
            poolAuthority,
            lpMint,
            sourceToken,
            destinationToken,
            owner: claimDammV1LpTokenParam.isPartner
                ? poolConfigState.feeClaimer
                : virtualPoolState.creator,
            sender: claimDammV1LpTokenParam.payer,
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
     * Create metadata for the migration of Meteora DAMM V2
     * @param createDammV2MigrationMetadataParam - The parameters for the migration
     * @returns A migration transaction
     */
    async createDammV2MigrationMetadata(
        createDammV2MigrationMetadataParam: CreateDammV2MigrationMetadataParam
    ): Promise<Transaction> {
        const migrationMetadata = deriveDammV2MigrationMetadataAddress(
            createDammV2MigrationMetadataParam.virtualPool
        )

        const accounts = {
            virtualPool: createDammV2MigrationMetadataParam.virtualPool,
            config: createDammV2MigrationMetadataParam.config,
            migrationMetadata: migrationMetadata,
            payer: createDammV2MigrationMetadataParam.payer,
            systemProgram: SystemProgram.programId,
        }

        return this.program.methods
            .migrationDammV2CreateMetadata()
            .accountsPartial(accounts)
            .transaction()
    }

    /**
     * Migrate to DAMM V2
     * @param migrateToDammV2Param - The parameters for the migration
     * @returns A migrate transaction
     */
    async migrateToDammV2(
        migrateToDammV2Param: MigrateToDammV2Param
    ): Promise<MigrateToDammV2Response> {
        const poolAuthority = deriveDbcPoolAuthority()
        const dammPoolAuthority = deriveDammV2PoolAuthority()
        const dammEventAuthority = deriveDammV2EventAuthority()

        const virtualPoolState = await this.state.getPool(
            migrateToDammV2Param.virtualPool
        )

        if (!virtualPoolState) {
            throw new Error(
                `Pool not found: ${migrateToDammV2Param.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPoolState.config
        )

        const migrationMetadata = deriveDammV2MigrationMetadataAddress(
            migrateToDammV2Param.virtualPool
        )

        const dammPool = deriveDammV2PoolAddress(
            migrateToDammV2Param.dammConfig,
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

        const tx = await this.program.methods
            .migrationDammV2()
            .accountsStrict({
                virtualPool: migrateToDammV2Param.virtualPool,
                migrationMetadata,
                config: virtualPoolState.config,
                poolAuthority,
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
                payer: migrateToDammV2Param.payer,
                tokenBaseProgram,
                tokenQuoteProgram,
                token2022Program: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                dammEventAuthority,
            })
            .remainingAccounts([
                {
                    isSigner: false,
                    isWritable: false,
                    pubkey: migrateToDammV2Param.dammConfig,
                },
            ])
            .transaction()

        const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 500000,
        })

        tx.add(modifyComputeUnits)

        return {
            transaction: tx,
            firstPositionNftKeypair: firstPositionNftKP,
            secondPositionNftKeypair: secondPositionNftKP,
        }
    }
}
