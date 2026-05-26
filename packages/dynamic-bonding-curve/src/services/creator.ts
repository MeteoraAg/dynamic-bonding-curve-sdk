import {
    Commitment,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    type Connection,
} from '@solana/web3.js'
import {
    ClaimCreatorTradingFee2Params,
    ClaimCreatorTradingFeeParams,
    ClaimCreatorTradingFeeWithQuoteMintNotSolParams,
    ClaimCreatorTradingFeeWithQuoteMintSolParams,
    CreateVirtualPoolMetadataParams,
    CreatorWithdrawSurplusParams,
    TransferPoolCreatorParams,
    WithdrawMigrationFeeParams,
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
     * @param virtualPool - The virtual pool address
     * @param name - The name of the pool
     * @param website - The website of the pool
     * @param logo - The logo of the pool
     * @param creator - The creator of the pool
     * @param payer - The payer of the transaction
     * @returns A create virtual pool metadata transaction
     */
    async createPoolMetadata(
        params: CreateVirtualPoolMetadataParams
    ): Promise<Transaction> {
        const { virtualPool, name, website, logo, creator, payer } = params

        const virtualPoolMetadata = deriveDbcPoolMetadata(virtualPool)

        return this.program.methods
            .createVirtualPoolMetadata({
                padding: new Array(96).fill(0),
                name,
                website,
                logo,
            })
            .accountsPartial({
                virtualPool,
                virtualPoolMetadata,
                creator,
                payer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    /**
     * Private method to claim trading fee with quote mint SOL
     * @param creator - The creator of the pool
     * @param payer - The payer of the transaction
     * @param feeReceiver - The wallet that will receive the tokens
     * @param pool - The pool address
     * @param poolState - The pool state
     * @param poolConfigState - The pool config state
     * @param tokenBaseProgram - The token base program
     * @param tokenQuoteProgram - The token quote program
     * @param tempWSolAcc - The temporary wallet that will receive the SOL
     * @returns A claim trading fee with quote mint SOL accounts, pre instructions and post instructions
     */
    private async claimWithQuoteMintSol(
        params: ClaimCreatorTradingFeeWithQuoteMintSolParams
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
            virtualPool,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = params

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const tokenBaseAccount = findAssociatedTokenAddress(
            feeReceiver,
            virtualPool.poolState.baseMint,
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
                virtualPool.poolState.baseMint,
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
            baseVault: virtualPool.poolState.baseVault,
            quoteVault: virtualPool.poolState.quoteVault,
            baseMint: virtualPool.poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            creator,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions, postInstructions }
    }

    /**
     * Private method to claim trading fee with quote mint not SOL
     * @param creator - The creator of the pool
     * @param payer - The payer of the transaction
     * @param feeReceiver - The wallet that will receive the tokens
     * @param pool - The pool address
     * @param poolState - The pool state
     * @param poolConfigState - The pool config state
     * @param tokenBaseProgram - The token base program
     * @param tokenQuoteProgram - The token quote program
     * @returns A claim trading fee with quote mint not SOL accounts and pre instructions
     */
    private async claimWithQuoteMintNotSol(
        params: ClaimCreatorTradingFeeWithQuoteMintNotSolParams
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
            virtualPool,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = params

        const {
            ataTokenA: tokenBaseAccount,
            ataTokenB: tokenQuoteAccount,
            instructions: preInstructions,
        } = await this.prepareTokenAccounts(
            feeReceiver,
            payer,
            virtualPool.poolState.baseMint,
            poolConfigState.quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram
        )

        const accounts = {
            poolAuthority: this.poolAuthority,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: virtualPool.poolState.baseVault,
            quoteVault: virtualPool.poolState.quoteVault,
            baseMint: virtualPool.poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            creator,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions }
    }

    /**
     * Claim creator trading fee
     * @param creator - The creator of the pool
     * @param payer - The payer of the transaction
     * @param pool - The pool address
     * @param maxBaseAmount - The maximum base amount
     * @param maxQuoteAmount - The maximum quote amount
     * @param receiver - The wallet that will receive the tokens (Optional)
     * @param tempWSolAcc - The temporary wallet that will receive the SOL (Optional)
     * @returns A claim creator trading fee transaction
     */
    async claimCreatorTradingFee(
        params: ClaimCreatorTradingFeeParams
    ): Promise<Transaction> {
        const {
            creator,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            payer,
            tempWSolAcc,
        } = params

        const virtualPool = await this.state.getPool(pool)
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPool.poolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
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
                virtualPool,
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
                virtualPool,
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
     * @param creator - The creator of the pool
     * @param payer - The payer of the transaction
     * @param pool - The pool address
     * @param maxBaseAmount - The maximum base amount
     * @param maxQuoteAmount - The maximum quote amount
     * @param receiver - The wallet that will receive the tokens
     * @returns A claim creator trading fee transaction
     */
    async claimCreatorTradingFee2(
        params: ClaimCreatorTradingFee2Params
    ): Promise<Transaction> {
        const {
            creator,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            payer,
        } = params

        const virtualPool = await this.state.getPool(pool)
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPool.poolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
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
                virtualPool.poolState.baseMint,
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
                    virtualPool.poolState.baseMint,
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
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                baseMint: virtualPool.poolState.baseMint,
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
                virtualPool,
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
     * @param creator - The creator of the pool
     * @param virtualPool - The virtual pool address
     * @returns A creator withdraw surplus transaction
     */
    async creatorWithdrawSurplus(
        params: CreatorWithdrawSurplusParams
    ): Promise<Transaction> {
        const { creator, pool } = params

        const virtualPool = await this.state.getPool(pool)
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(
            virtualPool.poolState.config
        )
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
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
            config: virtualPool.poolState.config,
            virtualPool: pool,
            tokenQuoteAccount,
            quoteVault: virtualPool.poolState.quoteVault,
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
     * @param virtualPool - The virtual pool address
     * @param creator - The creator of the pool
     * @param newCreator - The new creator of the pool
     * @returns A transfer pool creator transaction
     */
    async transferPoolCreator(
        params: TransferPoolCreatorParams
    ): Promise<Transaction> {
        const { pool, creator, newCreator } = params

        const virtualPool = await this.state.getPool(pool)
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const migrationMetadata = deriveDammV1MigrationMetadataAddress(pool)
        const transaction = await this.program.methods
            .transferPoolCreator()
            .accountsPartial({
                virtualPool: pool,
                newCreator,
                config: virtualPool.poolState.config,
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
     * @param virtualPool - The virtual pool address
     * @param sender - The sender of the pool
     * @returns A creator withdraw migration fee transaction
     */
    async creatorWithdrawMigrationFee(
        params: WithdrawMigrationFeeParams
    ): Promise<Transaction> {
        const { pool, sender } = params

        const virtualPool = await this.state.getPool(pool)
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const configState = await this.state.getPoolConfig(
            virtualPool.poolState.config
        )
        if (!configState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const { ataPubkey: tokenQuoteAccount, ix: createTokenQuoteAccountIx } =
            await getOrCreateATAInstruction(
                this.program.provider.connection,
                configState.quoteMint,
                sender,
                sender,
                true,
                getTokenProgram(configState.quoteTokenFlag)
            )
        createTokenQuoteAccountIx &&
            preInstructions.push(createTokenQuoteAccountIx)

        if (configState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(sender, sender)
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        }

        const transaction = await this.program.methods
            .withdrawMigrationFee(1) // 0 as partner and 1 as creator
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPool.poolState.config,
                virtualPool: pool,
                tokenQuoteAccount,
                quoteVault: virtualPool.poolState.quoteVault,
                quoteMint: configState.quoteMint,
                sender,
                tokenQuoteProgram: getTokenProgram(configState.quoteTokenFlag),
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()

        return transaction
    }
}
