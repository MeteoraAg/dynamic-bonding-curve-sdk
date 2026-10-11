import {
    ComputeBudgetProgram,
    Keypair,
    PublicKey,
    SystemProgram,
    SYSVAR_RENT_PUBKEY,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js'
import BN from 'bn.js'
import { DynamicBondingCurveProgram } from './program'
import type { Vault } from '../idl/dynamic-vault/idl'
import type { Program } from '@coral-xyz/anchor'
import {
    createDammV1Program,
    createDynamicVaultProgram,
    deriveBaseKeyForLocker,
    deriveDammV1MigrationMetadataAddress,
    deriveDammV2MigrationMetadataAddress,
    deriveDammV1PoolAddress,
    deriveDammV2EventAuthority,
    deriveDammV2PoolAddress,
    deriveLockerEscrowAddress,
    deriveMintMetadata,
    derivePositionAddress,
    derivePositionNftAccount,
    deriveVaultPdas,
    createInitializePermissionlessDynamicVaultIx,
    createLockEscrowIx,
    getTokenProgram,
    getOrCreateATAs,
    deriveDammV2PoolAuthority,
    deriveDammV2TokenVaultAddress,
    deriveDammV1VaultLPAddress,
    deriveDammV1LpMintAddress,
    deriveDammV1LockEscrowAddress,
    deriveDammV1ProtocolFeeAddress,
    deriveLockerEventAuthority,
    hasTransferFeeOrConfigAuthority,
    validateTransferFeeRestrictions,
} from '../helpers'
import type {
    CreateDammV1MigrationMetadataParams,
    CreateLockerParams,
    DammLpTokenParams,
    MigrateToDammV1Params,
    MigrateToDammV2Params,
    MigrateToDammV2Response,
    PoolConfig,
    VirtualPool,
    WithdrawLeftoverParams,
} from '../types'
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    getAccount,
    getAssociatedTokenAddressSync,
    getMint,
    unpackMint,
    TOKEN_2022_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import {
    DAMM_V1_PROGRAM_ID,
    DAMM_V2_PROGRAM_ID,
    LEGACY_CONFIG_VERSION,
    LOCKER_PROGRAM_ID,
    METAPLEX_PROGRAM_ID,
    VAULT_PROGRAM_ID,
} from '../constants'
import {
    calculateTransferFeeExcludedAmount,
    getEpochTransferFee,
    isZeroTransferFee,
    type EpochTransferFee,
} from '../math/transferFee'

const MIGRATE_DAMM_V1_COMPUTE_UNITS = 500_000
const MIGRATE_DAMM_V2_COMPUTE_UNITS = 600_000

export class MigrationService extends DynamicBondingCurveProgram {
    /** Build a transaction that creates the locker escrow for the pool's locked vesting tokens. */
    async createLocker(params: CreateLockerParams): Promise<Transaction> {
        const { pool, payer } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const { baseMint } = virtualPool.poolState
        const base = deriveBaseKeyForLocker(pool)
        const escrow = deriveLockerEscrowAddress(base)
        const tokenProgram = getTokenProgram(poolConfigState.tokenType)
        const escrowToken = getAssociatedTokenAddressSync(
            baseMint,
            escrow,
            true,
            tokenProgram
        )

        return this.program.methods
            .createLocker()
            .accountsPartial({
                virtualPool: pool,
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                baseVault: virtualPool.poolState.baseVault,
                baseMint,
                base,
                creator: virtualPool.poolState.creator,
                escrow,
                escrowToken,
                payer,
                tokenProgram,
                lockerProgram: LOCKER_PROGRAM_ID,
                lockerEventAuthority: deriveLockerEventAuthority(),
                systemProgram: SystemProgram.programId,
            })
            .preInstructions([
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    escrowToken,
                    escrow,
                    baseMint,
                    tokenProgram
                ),
            ])
            .transaction()
    }

    /**
     * The checks migration_damm_v2 makes on the quote mint's transfer fee: a
     * legacy config rejects a non-zero fee; any other config on the transfer
     * fee path has to satisfy the transfer fee restrictions.
     */
    private async assertDammV2MigrationTransferFee(
        poolConfig: PoolConfig
    ): Promise<void> {
        const quoteMintInfo = await this.connection.getAccountInfo(
            poolConfig.quoteMint,
            this.commitment
        )
        if (!quoteMintInfo) {
            throw new Error(
                `Quote mint ${poolConfig.quoteMint.toBase58()} not found`
            )
        }

        let epochTransferFee: EpochTransferFee | null = null
        let quoteHasTransferFee = false
        if (quoteMintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
            const quoteMint = unpackMint(
                poolConfig.quoteMint,
                quoteMintInfo,
                quoteMintInfo.owner
            )
            const { epoch } = await this.connection.getEpochInfo(
                this.commitment
            )
            epochTransferFee = getEpochTransferFee(quoteMint, epoch)
            quoteHasTransferFee = hasTransferFeeOrConfigAuthority(
                quoteMint,
                epoch
            )
        }

        if (poolConfig.version === LEGACY_CONFIG_VERSION) {
            if (!isZeroTransferFee(epochTransferFee)) {
                throw new Error('Quote mint has a non-zero transfer fee')
            }
            return
        }
        if (poolConfig.transferFeeFlag === 1 || quoteHasTransferFee) {
            validateTransferFeeRestrictions(poolConfig)
        }
    }

    /** Whether withdraw_leftover would charge a base transfer fee, in which case leftoverReceiver must sign. */
    private async leftoverWithdrawalChargesTransferFee(
        virtualPool: VirtualPool,
        tokenBaseProgram: PublicKey
    ): Promise<boolean> {
        const { poolState } = virtualPool
        const baseMint = await getMint(
            this.connection,
            poolState.baseMint,
            this.commitment,
            tokenBaseProgram
        )
        const { epoch } = await this.connection.getEpochInfo(this.commitment)
        const transferFee = getEpochTransferFee(baseMint, epoch)
        if (isZeroTransferFee(transferFee)) {
            return false
        }

        const vault = await getAccount(
            this.connection,
            poolState.baseVault,
            this.commitment,
            tokenBaseProgram
        )
        const reserved = poolState.partnerBaseFee
            .add(poolState.protocolBaseFee)
            .add(poolState.creatorBaseFee)
            .add(poolState.protocolMigrationBaseFeeAmount)
        const vaultAmount = new BN(vault.amount.toString())
        if (vaultAmount.lte(reserved)) {
            return false
        }
        return calculateTransferFeeExcludedAmount(
            transferFee,
            vaultAmount.sub(reserved)
        ).transferFee.gtn(0)
    }

    /**
     * Build a transaction that withdraws leftover base tokens after migration.
     * leftoverReceiver signs when the transfer charges a fee.
     */
    async withdrawLeftover(
        params: WithdrawLeftoverParams
    ): Promise<Transaction> {
        const { pool, payer } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)
        const { leftoverReceiver } = poolConfigState

        const {
            addresses: [tokenBaseAccount],
            instructions: preInstructions,
        } = await getOrCreateATAs(
            this.connection,
            payer,
            [
                {
                    mint: virtualPool.poolState.baseMint,
                    owner: leftoverReceiver,
                    tokenProgram: tokenBaseProgram,
                },
            ],
            this.commitment
        )

        const instruction = await this.program.methods
            .withdrawLeftover()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPool.poolState.config,
                virtualPool: pool,
                tokenBaseAccount,
                baseVault: virtualPool.poolState.baseVault,
                baseMint: virtualPool.poolState.baseMint,
                leftoverReceiver,
                tokenBaseProgram,
            })
            .instruction()
        if (
            await this.leftoverWithdrawalChargesTransferFee(
                virtualPool,
                tokenBaseProgram
            )
        ) {
            for (const key of instruction.keys) {
                if (key.pubkey.equals(leftoverReceiver)) {
                    key.isSigner = true
                }
            }
        }

        return new Transaction().add(...preInstructions, instruction)
    }

    async createDammV1MigrationMetadata(
        params: CreateDammV1MigrationMetadataParams
    ): Promise<Transaction> {
        const { virtualPool, config, payer } = params

        return this.program.methods
            .migrationMeteoraDammCreateMetadata()
            .accountsPartial({
                virtualPool,
                config,
                migrationMetadata: deriveDammV1MigrationMetadataAddress(
                    new PublicKey(virtualPool)
                ),
                payer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    /**
     * The dynamic vaults of both mints, with an initialize instruction for
     * each vault that does not exist yet.
     */
    private async ensureDynamicVaults(
        payer: PublicKey,
        mints: [PublicKey, PublicKey],
        vaultProgram: Program<Vault>
    ): Promise<{
        vaults: {
            vault: PublicKey
            tokenVault: PublicKey
            lpMint: PublicKey
        }[]
        preInstructions: TransactionInstruction[]
    }> {
        const pdas = mints.map((mint) => deriveVaultPdas(mint))
        const accounts = await Promise.all(
            pdas.map(({ vaultPda }) =>
                vaultProgram.account.vault.fetchNullable(vaultPda)
            )
        )
        const preInstructions: TransactionInstruction[] = []
        const vaults = []
        for (const [i, mint] of mints.entries()) {
            const account = accounts[i]
            if (!account) {
                const { instruction } =
                    await createInitializePermissionlessDynamicVaultIx(
                        mint,
                        payer,
                        vaultProgram
                    )
                preInstructions.push(instruction)
            }
            vaults.push({
                vault: pdas[i].vaultPda,
                tokenVault: pdas[i].tokenVaultPda,
                lpMint: account?.lpMint ?? pdas[i].lpMintPda,
            })
        }
        return { vaults, preInstructions }
    }

    /** Build a transaction that migrates a completed virtual pool to DAMM v1. */
    async migrateToDammV1(params: MigrateToDammV1Params): Promise<Transaction> {
        const { pool, dammConfig, payer } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const { baseMint } = virtualPool.poolState
        const { quoteMint } = poolConfigState

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            baseMint,
            quoteMint
        )
        const lpMint = deriveDammV1LpMintAddress(dammPool)
        const {
            vaults: [a, b],
            preInstructions,
        } = await this.ensureDynamicVaults(
            payer,
            [baseMint, quoteMint],
            createDynamicVaultProgram(this.connection, this.commitment)
        )

        const transaction = await this.program.methods
            .migrateMeteoraDamm()
            .accountsPartial({
                virtualPool: pool,
                migrationMetadata: deriveDammV1MigrationMetadataAddress(pool),
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                dammConfig,
                lpMint,
                tokenAMint: baseMint,
                tokenBMint: quoteMint,
                aVault: a.vault,
                bVault: b.vault,
                aTokenVault: a.tokenVault,
                bTokenVault: b.tokenVault,
                aVaultLpMint: a.lpMint,
                bVaultLpMint: b.lpMint,
                aVaultLp: deriveDammV1VaultLPAddress(a.vault, dammPool),
                bVaultLp: deriveDammV1VaultLPAddress(b.vault, dammPool),
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                virtualPoolLp: getAssociatedTokenAddressSync(
                    lpMint,
                    this.poolAuthority,
                    true,
                    TOKEN_PROGRAM_ID
                ),
                protocolTokenAFee: deriveDammV1ProtocolFeeAddress(
                    baseMint,
                    dammPool
                ),
                protocolTokenBFee: deriveDammV1ProtocolFeeAddress(
                    quoteMint,
                    dammPool
                ),
                payer,
                rent: SYSVAR_RENT_PUBKEY,
                mintMetadata: deriveMintMetadata(lpMint),
                metadataProgram: METAPLEX_PROGRAM_ID,
                ammProgram: DAMM_V1_PROGRAM_ID,
                vaultProgram: VAULT_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()

        return transaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({
                units: MIGRATE_DAMM_V1_COMPUTE_UNITS,
            })
        )
    }

    /** Build a transaction that locks the partner's or the creator's DAMM v1 LP tokens. */
    async lockDammV1LpToken(params: DammLpTokenParams): Promise<Transaction> {
        const { pool, dammConfig, payer, isPartner } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const { baseMint } = virtualPool.poolState
        const { quoteMint } = poolConfigState
        const owner = isPartner
            ? poolConfigState.feeClaimer
            : virtualPool.poolState.creator

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            baseMint,
            quoteMint
        )
        const lpMint = deriveDammV1LpMintAddress(dammPool)
        const {
            vaults: [a, b],
            preInstructions,
        } = await this.ensureDynamicVaults(
            payer,
            [baseMint, quoteMint],
            createDynamicVaultProgram(this.connection, this.commitment)
        )

        const lockEscrow = deriveDammV1LockEscrowAddress(dammPool, owner)
        if (
            !(await this.connection.getAccountInfo(lockEscrow, this.commitment))
        ) {
            preInstructions.push(
                await createLockEscrowIx(
                    payer,
                    dammPool,
                    lpMint,
                    owner,
                    lockEscrow,
                    createDammV1Program(this.connection, this.commitment)
                )
            )
        }
        const escrowVault = getAssociatedTokenAddressSync(
            lpMint,
            lockEscrow,
            true,
            TOKEN_PROGRAM_ID
        )
        preInstructions.push(
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                escrowVault,
                lockEscrow,
                lpMint,
                TOKEN_PROGRAM_ID
            )
        )

        return this.program.methods
            .migrateMeteoraDammLockLpToken()
            .accountsPartial({
                virtualPool: pool,
                migrationMetadata: deriveDammV1MigrationMetadataAddress(pool),
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                lpMint,
                lockEscrow,
                owner,
                sourceTokens: getAssociatedTokenAddressSync(
                    lpMint,
                    this.poolAuthority,
                    true
                ),
                escrowVault,
                aVault: a.vault,
                bVault: b.vault,
                aVaultLp: deriveDammV1VaultLPAddress(a.vault, dammPool),
                bVaultLp: deriveDammV1VaultLPAddress(b.vault, dammPool),
                aVaultLpMint: a.lpMint,
                bVaultLpMint: b.lpMint,
                ammProgram: DAMM_V1_PROGRAM_ID,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .preInstructions(preInstructions)
            .transaction()
    }

    /** Build a transaction that sends the partner's or the creator's DAMM v1 LP tokens to them. */
    async claimDammV1LpToken(params: DammLpTokenParams): Promise<Transaction> {
        const { pool, dammConfig, payer, isPartner } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const owner = isPartner
            ? poolConfigState.feeClaimer
            : virtualPool.poolState.creator

        const dammPool = deriveDammV1PoolAddress(
            dammConfig,
            virtualPool.poolState.baseMint,
            poolConfigState.quoteMint
        )
        const lpMint = deriveDammV1LpMintAddress(dammPool)
        const destinationToken = getAssociatedTokenAddressSync(
            lpMint,
            owner,
            true,
            TOKEN_PROGRAM_ID
        )

        return this.program.methods
            .migrateMeteoraDammClaimLpToken()
            .accountsPartial({
                virtualPool: pool,
                migrationMetadata: deriveDammV1MigrationMetadataAddress(pool),
                poolAuthority: this.poolAuthority,
                lpMint,
                sourceToken: getAssociatedTokenAddressSync(
                    lpMint,
                    this.poolAuthority,
                    true
                ),
                destinationToken,
                owner,
                sender: payer,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .preInstructions([
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    destinationToken,
                    owner,
                    lpMint,
                    TOKEN_PROGRAM_ID
                ),
            ])
            .transaction()
    }

    /**
     * Build the transaction that migrates a completed virtual pool to DAMM v2,
     * with the keypairs of the two position NFT mints it creates.
     */
    async migrateToDammV2(
        params: MigrateToDammV2Params
    ): Promise<MigrateToDammV2Response> {
        const { pool, dammConfig, payer } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        await this.assertDammV2MigrationTransferFee(poolConfigState)
        const { baseMint } = virtualPool.poolState
        const { quoteMint } = poolConfigState

        const dammPool = deriveDammV2PoolAddress(
            dammConfig,
            baseMint,
            quoteMint
        )
        const firstPositionNftKeypair = Keypair.generate()
        const secondPositionNftKeypair = Keypair.generate()

        const transaction = await this.program.methods
            .migrationDammV2()
            .accountsStrict({
                virtualPool: pool,
                migrationMetadata: deriveDammV2MigrationMetadataAddress(pool),
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                pool: dammPool,
                firstPositionNftMint: firstPositionNftKeypair.publicKey,
                firstPosition: derivePositionAddress(
                    firstPositionNftKeypair.publicKey
                ),
                firstPositionNftAccount: derivePositionNftAccount(
                    firstPositionNftKeypair.publicKey
                ),
                secondPositionNftMint: secondPositionNftKeypair.publicKey,
                secondPosition: derivePositionAddress(
                    secondPositionNftKeypair.publicKey
                ),
                secondPositionNftAccount: derivePositionNftAccount(
                    secondPositionNftKeypair.publicKey
                ),
                dammPoolAuthority: deriveDammV2PoolAuthority(),
                ammProgram: DAMM_V2_PROGRAM_ID,
                baseMint,
                quoteMint,
                tokenAVault: deriveDammV2TokenVaultAddress(dammPool, baseMint),
                tokenBVault: deriveDammV2TokenVaultAddress(dammPool, quoteMint),
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                payer,
                tokenBaseProgram: getTokenProgram(poolConfigState.tokenType),
                tokenQuoteProgram: getTokenProgram(
                    poolConfigState.quoteTokenFlag
                ),
                token2022Program: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
                dammEventAuthority: deriveDammV2EventAuthority(),
            })
            .remainingAccounts([
                { isSigner: false, isWritable: false, pubkey: dammConfig },
            ])
            .transaction()
        transaction.add(
            ComputeBudgetProgram.setComputeUnitLimit({
                units: MIGRATE_DAMM_V2_COMPUTE_UNITS,
            })
        )

        return {
            transaction,
            firstPositionNftKeypair,
            secondPositionNftKeypair,
        }
    }
}
