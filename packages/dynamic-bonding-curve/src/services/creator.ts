import {
    Commitment,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    type Connection,
} from '@solana/web3.js'
import {
    ClaimCreatorTradingFee2Param,
    ClaimCreatorTradingFeeParam,
    ClaimCreatorTradingFeeWithQuoteMintNotSolParam,
    ClaimCreatorTradingFeeWithQuoteMintSolParam,
    CreateVirtualPoolMetadataParam,
    CreatorWithdrawSurplusParam,
    TransferPoolCreatorParam,
    WithdrawMigrationFeeParam,
} from '../types'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    NATIVE_MINT,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { DynamicBondingCurveProgram } from './program'
import {
    deriveDammV1MigrationMetadataAddress,
    deriveDbcPoolMetadata,
    findAssociatedTokenAddress,
    getOrCreateATAInstruction,
    getTokenProgram,
    isNativeSol,
    unwrapSOLInstruction,
} from '../helpers'
import { StateService } from './state'

export class CreatorService extends DynamicBondingCurveProgram {
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Create virtual pool metadata
     * @param createVirtualPoolMetadataParam - The parameters for the virtual pool metadata
     * @returns A create virtual pool metadata transaction
     */
    async createPoolMetadata(
        createVirtualPoolMetadataParam: CreateVirtualPoolMetadataParam
    ): Promise<Transaction> {
        const virtualPoolMetadata = deriveDbcPoolMetadata(
            createVirtualPoolMetadataParam.virtualPool
        )
        return this.program.methods
            .createVirtualPoolMetadata({
                padding: new Array(96).fill(0),
                name: createVirtualPoolMetadataParam.name,
                website: createVirtualPoolMetadataParam.website,
                logo: createVirtualPoolMetadataParam.logo,
            })
            .accountsPartial({
                virtualPool: createVirtualPoolMetadataParam.virtualPool,
                virtualPoolMetadata,
                creator: createVirtualPoolMetadataParam.creator,
                payer: createVirtualPoolMetadataParam.payer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    /**
     * Private method to claim trading fee with quote mint SOL
     * @param claimWithQuoteMintSolParam - The parameters for the claim with quote mint SOL
     * @returns A claim trading fee with quote mint SOL accounts, pre instructions and post instructions
     */
    private async claimWithQuoteMintSol(
        claimWithQuoteMintSolParam: ClaimCreatorTradingFeeWithQuoteMintSolParam
    ): Promise<{
        accounts: {
            poolAuthority: PublicKey
            pool: PublicKey
            tokenAAccount: PublicKey
            tokenBAccount: PublicKey
            baseVault: PublicKey
            quoteVault: PublicKey
            baseMint: PublicKey
            quoteMint: PublicKey
            creator: PublicKey
            tokenBaseProgram: PublicKey
            tokenQuoteProgram: PublicKey
        }
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
    }> {
        const {
            creator,
            payer,
            feeReceiver,
            tempWSolAcc,
            pool,
            poolState,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = claimWithQuoteMintSolParam

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const tokenBaseAccount = findAssociatedTokenAddress(
            feeReceiver,
            poolState.baseMint,
            tokenBaseProgram
        )

        const tokenQuoteAccount = findAssociatedTokenAddress(
            tempWSolAcc,
            poolConfigState.quoteMint,
            tokenQuoteProgram
        )

        const createTokenBaseAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                tokenBaseAccount,
                feeReceiver,
                poolState.baseMint,
                tokenBaseProgram
            )
        createTokenBaseAccountIx &&
            preInstructions.push(createTokenBaseAccountIx)

        const createTokenQuoteAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                payer,
                tokenQuoteAccount,
                tempWSolAcc,
                poolConfigState.quoteMint,
                tokenQuoteProgram
            )
        createTokenQuoteAccountIx &&
            preInstructions.push(createTokenQuoteAccountIx)

        const unwrapSolIx = unwrapSOLInstruction(tempWSolAcc, feeReceiver)
        unwrapSolIx && postInstructions.push(unwrapSolIx)

        const accounts = {
            poolAuthority: this.poolAuthority,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: poolState.baseVault,
            quoteVault: poolState.quoteVault,
            baseMint: poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            creator,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions, postInstructions }
    }

    /**
     * Private method to claim trading fee with quote mint not SOL
     * @param claimWithQuoteMintNotSolParam - The parameters for the claim with quote mint not SOL
     * @returns A claim trading fee with quote mint not SOL accounts and pre instructions
     */
    private async claimWithQuoteMintNotSol(
        claimWithQuoteMintNotSolParam: ClaimCreatorTradingFeeWithQuoteMintNotSolParam
    ): Promise<{
        accounts: {
            poolAuthority: PublicKey
            pool: PublicKey
            tokenAAccount: PublicKey
            tokenBAccount: PublicKey
            baseVault: PublicKey
            quoteVault: PublicKey
            baseMint: PublicKey
            quoteMint: PublicKey
            creator: PublicKey
            tokenBaseProgram: PublicKey
            tokenQuoteProgram: PublicKey
        }
        preInstructions: TransactionInstruction[]
    }> {
        const {
            creator,
            payer,
            feeReceiver,
            pool,
            poolState,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = claimWithQuoteMintNotSolParam

        const {
            ataTokenA: tokenBaseAccount,
            ataTokenB: tokenQuoteAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            feeReceiver,
            payer,
            poolState.baseMint,
            poolConfigState.quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram
        )

        const accounts = {
            poolAuthority: this.poolAuthority,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: poolState.baseVault,
            quoteVault: poolState.quoteVault,
            baseMint: poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            creator,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions }
    }

    /**
     * Claim creator trading fee
     * @param claimCreatorTradingFeeParam - The parameters for the claim creator trading fee
     * @returns A claim creator trading fee transaction
     */
    async claimCreatorTradingFee(
        claimCreatorTradingFeeParam: ClaimCreatorTradingFeeParam
    ): Promise<Transaction> {
        const {
            creator,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            payer,
            tempWSolAcc,
        } = claimCreatorTradingFeeParam

        const poolState = await this.state.getPool(pool)

        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        if (!poolConfigState) {
            throw new Error(`Pool config not found: ${pool.toString()}`)
        }

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)
        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)

        if (isSOLQuoteMint) {
            // if receiver is present and not equal to creator, use tempWSolAcc, otherwise use creator
            const tempWSol =
                receiver && !receiver.equals(creator) ? tempWSolAcc : creator
            // if receiver is provided, use receiver, otherwise use creator
            const feeReceiver = receiver ? receiver : creator

            const result = await this.claimWithQuoteMintSol({
                creator,
                payer,
                feeReceiver,
                tempWSolAcc: tempWSol,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })

            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .postInstructions(result.postInstructions)
                .transaction()
        } else {
            // check if receiver is provided, use receiver, otherwise use creator
            const feeReceiver = receiver ? receiver : creator

            const result = await this.claimWithQuoteMintNotSol({
                creator,
                payer,
                feeReceiver,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })
            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
    }

    /**
     * Claim creator trading fee
     * @param claimCreatorTradingFeeParam - The parameters for the claim creator trading fee
     * @returns A claim creator trading fee transaction
     */
    async claimCreatorTradingFee2(
        claimCreatorTradingFee2Param: ClaimCreatorTradingFee2Param
    ): Promise<Transaction> {
        const {
            creator,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            payer,
        } = claimCreatorTradingFee2Param

        const poolState = await this.state.getPool(pool)

        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        if (!poolConfigState) {
            throw new Error(`Pool config not found: ${pool.toString()}`)
        }

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)
        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)

        if (isSOLQuoteMint) {
            const preInstructions: TransactionInstruction[] = []
            const postInstructions: TransactionInstruction[] = []

            const tokenBaseAccount = findAssociatedTokenAddress(
                receiver,
                poolState.baseMint,
                tokenBaseProgram
            )

            const tokenQuoteAccount = findAssociatedTokenAddress(
                creator,
                poolConfigState.quoteMint,
                tokenQuoteProgram
            )

            const createTokenBaseAccountIx =
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    tokenBaseAccount,
                    receiver,
                    poolState.baseMint,
                    tokenBaseProgram
                )
            createTokenBaseAccountIx &&
                preInstructions.push(createTokenBaseAccountIx)

            const createTokenQuoteAccountIx =
                createAssociatedTokenAccountIdempotentInstruction(
                    payer,
                    tokenQuoteAccount,
                    creator,
                    poolConfigState.quoteMint,
                    tokenQuoteProgram
                )
            createTokenQuoteAccountIx &&
                preInstructions.push(createTokenQuoteAccountIx)

            const unwrapSolIx = unwrapSOLInstruction(creator, receiver)
            unwrapSolIx && postInstructions.push(unwrapSolIx)

            const accounts = {
                poolAuthority: this.poolAuthority,
                pool,
                tokenAAccount: tokenBaseAccount,
                tokenBAccount: tokenQuoteAccount,
                baseVault: poolState.baseVault,
                quoteVault: poolState.quoteVault,
                baseMint: poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                creator,
                tokenBaseProgram,
                tokenQuoteProgram,
            }

            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(accounts)
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction()
        } else {
            const result = await this.claimWithQuoteMintNotSol({
                creator,
                payer,
                feeReceiver: receiver,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })
            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
    }

    /**
     * Withdraw creator surplus
     * @param creatorWithdrawSurplusParam - The parameters for the creator withdraw surplus
     * @returns A creator withdraw surplus transaction
     */
    async creatorWithdrawSurplus(
        creatorWithdrawSurplusParam: CreatorWithdrawSurplusParam
    ): Promise<Transaction> {
        const { creator, virtualPool } = creatorWithdrawSurplusParam

        const poolState = await this.state.getPool(virtualPool)

        if (!poolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        if (!poolConfigState) {
            throw new Error(`Pool config not found: ${virtualPool.toString()}`)
        }

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const tokenQuoteAccount = findAssociatedTokenAddress(
            creator,
            poolConfigState.quoteMint,
            TOKEN_PROGRAM_ID
        )

        const createQuoteTokenAccountIx =
            createAssociatedTokenAccountIdempotentInstruction(
                creator,
                tokenQuoteAccount,
                creator,
                poolConfigState.quoteMint,
                TOKEN_PROGRAM_ID
            )

        if (createQuoteTokenAccountIx) {
            preInstructions.push(createQuoteTokenAccountIx)
        }

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)

        if (isSOLQuoteMint) {
            const unwrapIx = unwrapSOLInstruction(creator, creator)
            if (unwrapIx) {
                postInstructions.push(unwrapIx)
            }
        }

        const accounts = {
            poolAuthority: this.poolAuthority,
            config: poolState.config,
            virtualPool,
            tokenQuoteAccount,
            quoteVault: poolState.quoteVault,
            quoteMint: poolConfigState.quoteMint,
            creator,
            tokenQuoteProgram: TOKEN_PROGRAM_ID,
        }

        return this.program.methods
            .creatorWithdrawSurplus()
            .accountsPartial(accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Transfer pool creator
     * @param transferPoolCreatorParams - The parameters for the transfer pool creator
     * @returns A transfer pool creator transaction
     */
    async transferPoolCreator(
        transferPoolCreatorParams: TransferPoolCreatorParam
    ): Promise<Transaction> {
        const { virtualPool, creator, newCreator } = transferPoolCreatorParams
        const virtualPoolState = await this.state.getPool(virtualPool)
        const migrationMetadata =
            deriveDammV1MigrationMetadataAddress(virtualPool)
        const transaction = await this.program.methods
            .transferPoolCreator()
            .accountsPartial({
                virtualPool,
                newCreator,
                config: virtualPoolState.config,
                creator,
            })
            .remainingAccounts([
                {
                    isSigner: false,
                    isWritable: false,
                    pubkey: migrationMetadata,
                },
            ])
            .transaction()

        return transaction
    }

    /**
     * Creator withdraw migration fee
     * @param withdrawMigrationFeeParams - The parameters for the creator withdraw migration fee
     * @returns A creator withdraw migration fee transaction
     */
    async creatorWithdrawMigrationFee(
        withdrawMigrationFeeParams: WithdrawMigrationFeeParam
    ): Promise<Transaction> {
        const { virtualPool, sender, feePayer } = withdrawMigrationFeeParams
        const virtualPoolState = await this.state.getPool(virtualPool)
        const configState = await this.state.getPoolConfig(
            virtualPoolState.config
        )
        const { ataPubkey: tokenQuoteAccount, ix: preInstruction } =
            await getOrCreateATAInstruction(
                this.program.provider.connection,
                configState.quoteMint,
                sender,
                feePayer ?? sender,
                true,
                getTokenProgram(configState.quoteTokenFlag)
            )
        const postInstruction: TransactionInstruction[] = []
        if (configState.quoteMint.equals(NATIVE_MINT)) {
            const unwarpSOLIx = unwrapSOLInstruction(sender, sender)
            unwarpSOLIx && postInstruction.push(unwarpSOLIx)
        }

        const transaction = await this.program.methods
            .withdrawMigrationFee(1) // 0 as partner and 1 as creator
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPoolState.config,
                virtualPool,
                tokenQuoteAccount,
                quoteVault: virtualPoolState.quoteVault,
                quoteMint: configState.quoteMint,
                sender,
                tokenQuoteProgram: getTokenProgram(configState.quoteTokenFlag),
            })
            .preInstructions([preInstruction])
            .postInstructions(postInstruction)
            .transaction()

        return transaction
    }
}
