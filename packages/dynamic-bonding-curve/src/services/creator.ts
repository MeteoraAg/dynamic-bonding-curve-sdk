import {
    Commitment,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    type Connection,
} from '@solana/web3.js'
import {
    ClaimCreatorTradingFeeParams,
    ClaimCreatorTradingFeeToReceiverParams,
    CreatePoolParams,
    CreatePoolWithFirstBuyWithTransferHookParams,
    CreatePoolWithTransferHookParams,
    CreatePoolWithFirstBuyParams,
    CreatePoolWithPartnerAndCreatorFirstBuyWithTransferHookParams,
    CreatePoolWithPartnerAndCreatorFirstBuyParams,
    CreateVirtualPoolMetadataParams,
    CreatorWithdrawSurplusParams,
    TransferPoolCreatorParams,
    WithdrawMigrationFeeParams,
} from '../types'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { DynamicBondingCurveProgram } from './program'
import {
    deriveDammV1MigrationMetadataAddress,
    deriveDbcPoolMetadata,
    findAssociatedTokenAddress,
    getTokenProgram,
    isNativeSol,
    unwrapSOLInstruction,
} from '../helpers'
import { StateService } from './state'
import BN from 'bn.js'

export class CreatorService extends DynamicBondingCurveProgram {
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
     * Build a transaction that creates metadata for a virtual pool.
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
     * Build a transaction that initializes a pool from an existing config.
     */
    async createPool(params: CreatePoolParams): Promise<Transaction> {
        const { config } = params

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        return this.buildCreatePoolTx(
            params,
            poolConfigState.tokenType,
            poolConfigState.quoteMint
        )
    }

    /**
     * Build a transaction that initializes a Token-2022 transfer-hook pool from an existing config.
     */
    async createPoolWithTransferHook(
        params: CreatePoolWithTransferHookParams
    ): Promise<Transaction> {
        const { config } = params

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        return this.buildCreatePoolWithTransferHookTx(
            params,
            poolConfigState.quoteMint,
            tokenQuoteProgram
        )
    }

    /**
     * Build one transaction that initializes a pool and optionally appends the first buy.
     *
     * The first-buy instruction is only included when `firstBuyParam.buyAmount` is greater than 0.
     */
    async createPoolWithFirstBuy(
        params: CreatePoolWithFirstBuyParams
    ): Promise<Transaction> {
        const { createPoolParam, firstBuyParam } = params
        const { config } = createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const createPoolWithFirstBuyTx = await this.buildCreatePoolTx(
            createPoolParam,
            poolConfigState.tokenType,
            poolConfigState.quoteMint
        )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            const swapBuyTx = await this.buildSwapBuyTx(
                firstBuyParam,
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                false,
                poolConfigState.activationType,
                poolConfigState.tokenType,
                poolConfigState.quoteMint,
                true
            )
            createPoolWithFirstBuyTx.add(swapBuyTx)
        }

        return createPoolWithFirstBuyTx
    }

    /**
     * Build one transaction that initializes a transfer-hook pool and optionally appends the first buy.
     */
    async createPoolWithFirstBuyWithTransferHook(
        params: CreatePoolWithFirstBuyWithTransferHookParams
    ): Promise<Transaction> {
        const { createPoolParam, firstBuyParam } = params
        const { config } = createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const createPoolWithFirstBuyTx =
            await this.buildCreatePoolWithTransferHookTx(
                createPoolParam,
                poolConfigState.quoteMint,
                getTokenProgram(poolConfigState.quoteTokenFlag)
            )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            const swapBuyTx = await this.buildSwap2WithTransferHookBuyTx(
                firstBuyParam,
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                poolConfigState.activationType,
                poolConfigState.quoteMint,
                true
            )
            createPoolWithFirstBuyTx.add(swapBuyTx)
        }

        return createPoolWithFirstBuyTx
    }

    /**
     * Build one transaction that initializes a pool and optionally appends partner and creator first buys.
     */
    async createPoolWithPartnerAndCreatorFirstBuy(
        params: CreatePoolWithPartnerAndCreatorFirstBuyParams
    ): Promise<Transaction> {
        const { createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam } =
            params
        const { config } = createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const createPoolWithFirstBuysTx = await this.buildCreatePoolTx(
            createPoolParam,
            poolConfigState.tokenType,
            poolConfigState.quoteMint
        )

        if (
            partnerFirstBuyParam &&
            partnerFirstBuyParam.buyAmount.gt(new BN(0))
        ) {
            const partnerSwapBuyTx = await this.buildSwapBuyTx(
                {
                    buyer: partnerFirstBuyParam.partner,
                    receiver: partnerFirstBuyParam.receiver,
                    buyAmount: partnerFirstBuyParam.buyAmount,
                    minimumAmountOut: partnerFirstBuyParam.minimumAmountOut,
                    referralTokenAccount:
                        partnerFirstBuyParam.referralTokenAccount,
                },
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                false,
                poolConfigState.activationType,
                poolConfigState.tokenType,
                poolConfigState.quoteMint,
                true
            )
            createPoolWithFirstBuysTx.add(partnerSwapBuyTx)
        }

        if (
            creatorFirstBuyParam &&
            creatorFirstBuyParam.buyAmount.gt(new BN(0))
        ) {
            const creatorSwapBuyTx = await this.buildSwapBuyTx(
                {
                    buyer: creatorFirstBuyParam.creator,
                    receiver: creatorFirstBuyParam.receiver,
                    buyAmount: creatorFirstBuyParam.buyAmount,
                    minimumAmountOut: creatorFirstBuyParam.minimumAmountOut,
                    referralTokenAccount:
                        creatorFirstBuyParam.referralTokenAccount,
                },
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                false,
                poolConfigState.activationType,
                poolConfigState.tokenType,
                poolConfigState.quoteMint,
                true
            )
            createPoolWithFirstBuysTx.add(creatorSwapBuyTx)
        }

        return createPoolWithFirstBuysTx
    }

    /**
     * Build one transaction that initializes a transfer-hook pool and optionally appends partner and creator first buys.
     */
    async createPoolWithPartnerAndCreatorFirstBuyWithTransferHook(
        params: CreatePoolWithPartnerAndCreatorFirstBuyWithTransferHookParams
    ): Promise<Transaction> {
        const { createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam } =
            params
        const { config } = createPoolParam

        const poolConfigState = await this.state.getPoolConfig(config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

        const createPoolWithFirstBuysTx =
            await this.buildCreatePoolWithTransferHookTx(
                createPoolParam,
                poolConfigState.quoteMint,
                getTokenProgram(poolConfigState.quoteTokenFlag)
            )

        if (
            partnerFirstBuyParam &&
            partnerFirstBuyParam.buyAmount.gt(new BN(0))
        ) {
            const partnerSwapBuyTx = await this.buildSwap2WithTransferHookBuyTx(
                {
                    buyer: partnerFirstBuyParam.partner,
                    receiver: partnerFirstBuyParam.receiver,
                    buyAmount: partnerFirstBuyParam.buyAmount,
                    minimumAmountOut: partnerFirstBuyParam.minimumAmountOut,
                    referralTokenAccount:
                        partnerFirstBuyParam.referralTokenAccount,
                    transferHookAccountsInfo:
                        partnerFirstBuyParam.transferHookAccountsInfo,
                    transferHookAccounts:
                        partnerFirstBuyParam.transferHookAccounts,
                },
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                poolConfigState.activationType,
                poolConfigState.quoteMint,
                true
            )
            createPoolWithFirstBuysTx.add(partnerSwapBuyTx)
        }

        if (
            creatorFirstBuyParam &&
            creatorFirstBuyParam.buyAmount.gt(new BN(0))
        ) {
            const creatorSwapBuyTx = await this.buildSwap2WithTransferHookBuyTx(
                {
                    buyer: creatorFirstBuyParam.creator,
                    receiver: creatorFirstBuyParam.receiver,
                    buyAmount: creatorFirstBuyParam.buyAmount,
                    minimumAmountOut: creatorFirstBuyParam.minimumAmountOut,
                    referralTokenAccount:
                        creatorFirstBuyParam.referralTokenAccount,
                    transferHookAccountsInfo:
                        creatorFirstBuyParam.transferHookAccountsInfo,
                    transferHookAccounts:
                        creatorFirstBuyParam.transferHookAccounts,
                },
                createPoolParam.baseMint,
                config,
                poolConfigState.poolFees.baseFee,
                poolConfigState.activationType,
                poolConfigState.quoteMint,
                true
            )
            createPoolWithFirstBuysTx.add(creatorSwapBuyTx)
        }

        return createPoolWithFirstBuysTx
    }

    /**
     * Build a transaction that claims creator trading fees.
     *
     * When the quote mint is SOL, the transaction may create and close a temporary wrapped SOL account.
     * If `receiver` differs from `creator`, provide `tempWSolAcc`.
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

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

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

            const result = await this.buildClaimTradingFeeAccountsForSol({
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
                .accountsPartial({ ...result.accounts, creator })
                .preInstructions(result.preInstructions)
                .postInstructions(result.postInstructions)
                .transaction()
        } else {
            // check if receiver is provided, use receiver, otherwise use creator
            const feeReceiver = receiver ? receiver : creator

            const result = await this.buildClaimTradingFeeAccountsForNonSol({
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
                .accountsPartial({ ...result.accounts, creator })
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
    }

    /**
     * Build a transaction that claims creator trading fees to an explicit receiver.
     */
    async claimCreatorTradingFeeToReceiver(
        params: ClaimCreatorTradingFeeToReceiverParams
    ): Promise<Transaction> {
        const {
            creator,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            payer,
        } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)
        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)

        if (isSOLQuoteMint) {
            const result = await this.buildClaimTradingFeeAccountsForSol({
                payer,
                feeReceiver: receiver,
                tempWSolAcc: creator,
                pool,
                virtualPool,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })

            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial({ ...result.accounts, creator })
                .preInstructions(result.preInstructions)
                .postInstructions(result.postInstructions)
                .transaction()
        } else {
            const result = await this.buildClaimTradingFeeAccountsForNonSol({
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
                .accountsPartial({ ...result.accounts, creator })
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
    }

    /**
     * Build a transaction that claims creator trading fees with transfer-hook support.
     */
    async claimCreatorTradingFee2(
        params: ClaimCreatorTradingFeeToReceiverParams
    ): Promise<Transaction> {
        const {
            creator,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            payer,
        } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const tokenBaseProgram = getTokenProgram(poolConfigState.tokenType)
        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const isSOLQuoteMint = isNativeSol(poolConfigState.quoteMint)
        const result = isSOLQuoteMint
            ? await this.buildClaimTradingFeeAccountsForSol({
                  payer,
                  feeReceiver: receiver,
                  tempWSolAcc: creator,
                  pool,
                  virtualPool,
                  poolConfigState,
                  tokenBaseProgram,
                  tokenQuoteProgram,
              })
            : await this.buildClaimTradingFeeAccountsForNonSol({
                  payer,
                  feeReceiver: receiver,
                  pool,
                  virtualPool,
                  poolConfigState,
                  tokenBaseProgram,
                  tokenQuoteProgram,
              })

        const {
            info: transferHookAccountsInfo,
            accounts: transferHookAccounts,
        } = await this.getRemainingAccountsForTransferHook(
            virtualPool.poolState.baseMint
        )
        const postInstructions: TransactionInstruction[] =
            isSOLQuoteMint && 'postInstructions' in result
                ? (result.postInstructions as TransactionInstruction[])
                : []

        return this.program.methods
            .claimCreatorTradingFee2(
                maxBaseAmount,
                maxQuoteAmount,
                transferHookAccountsInfo
            )
            .accountsPartial({ ...result.accounts, creator })
            .remainingAccounts(transferHookAccounts)
            .preInstructions(result.preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that withdraws creator surplus from a pool.
     */
    async creatorWithdrawSurplus(
        params: CreatorWithdrawSurplusParams
    ): Promise<Transaction> {
        const { creator, pool } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

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
     * Build a transaction that transfers pool creator ownership.
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
     * Build a transaction that withdraws the creator migration fee.
     */
    async creatorWithdrawMigrationFee(
        params: WithdrawMigrationFeeParams
    ): Promise<Transaction> {
        const { pool, sender } = params

        return this.buildWithdrawMigrationFeeTx('creator', pool, sender)
    }
}
