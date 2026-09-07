import {
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    type ClaimPartnerTradingFeeParams,
    type CreateConfigAndPoolWithTransferHookParams,
    type CreateConfigAndPoolParams,
    type CreateConfigAndPoolWithFirstBuyWithTransferHookParams,
    type CreateConfigAndPoolWithFirstBuyParams,
    type CreateConfigParams,
    type CreateConfigWithTransferHookParams,
    type CreatePoolParams,
    type CreatePartnerMetadataParams,
    type CreatePartnerMetadataParameters,
    type PartnerWithdrawSurplusParams,
    WithdrawMigrationFeeParams,
    ClaimPartnerPoolCreationFeeParams,
    ClaimPartnerTradingFeeToReceiverParams,
} from '../types'
import {
    derivePartnerMetadata,
    unwrapSOLInstruction,
    getTokenProgram,
    getOrCreateATAInstruction,
    isNativeSol,
    getTokenType,
} from '../helpers'
import { NATIVE_MINT } from '@solana/spl-token'
import BN from 'bn.js'

export class PartnerService extends DynamicBondingCurveProgram {
    /**
     * Build a transaction that creates a partner-owned pool config.
     */
    async createConfig(params: CreateConfigParams): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            tokenBadge,
            ...configParam
        } = params

        return this.buildCreateConfigTx(
            configParam,
            new PublicKey(config),
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            new PublicKey(quoteMint),
            new PublicKey(payer),
            tokenBadge ? new PublicKey(tokenBadge) : undefined
        )
    }

    /**
     * Build a transaction that creates a partner-owned transfer-hook pool config.
     */
    async createConfigWithTransferHook(
        params: CreateConfigWithTransferHookParams
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            transferHookProgram,
            payer,
            tokenBadge,
            ...configParam
        } = params

        return this.buildCreateConfigWithTransferHookTx(
            configParam,
            new PublicKey(config),
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            new PublicKey(quoteMint),
            new PublicKey(transferHookProgram),
            new PublicKey(payer),
            tokenBadge ? new PublicKey(tokenBadge) : undefined
        )
    }

    /**
     * Build one transaction that creates a config and initializes its pool.
     */
    async createConfigAndPool(
        params: CreateConfigAndPoolParams
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            preCreatePoolParam,
            tokenBadge,
            ...configParam
        } = params

        const tx = new Transaction()
        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)
        const tokenBadgeKey = tokenBadge ? new PublicKey(tokenBadge) : undefined

        const createConfigTx = await this.buildCreateConfigTx(
            configParam,
            configKey,
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            quoteMintToken,
            payerAddress,
            tokenBadgeKey
        )

        const createPoolTx = await this.buildCreatePoolTx(
            {
                ...preCreatePoolParam,
                config: configKey,
                payer: payerAddress,
                tokenBadge: tokenBadgeKey,
            },
            params.tokenType,
            quoteMintToken
        )

        tx.add(createConfigTx, createPoolTx)
        return tx
    }

    /**
     * Build one transaction that creates a transfer-hook config and initializes its pool.
     */
    async createConfigAndPoolWithTransferHook(
        params: CreateConfigAndPoolWithTransferHookParams
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            transferHookProgram,
            payer,
            preCreatePoolParam,
            tokenBadge,
            ...configParam
        } = params

        const tx = new Transaction()
        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)
        const tokenBadgeKey = tokenBadge ? new PublicKey(tokenBadge) : undefined

        const createConfigTx = await this.buildCreateConfigWithTransferHookTx(
            configParam,
            configKey,
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            quoteMintToken,
            new PublicKey(transferHookProgram),
            payerAddress,
            tokenBadgeKey
        )

        const tokenQuoteProgram = getTokenProgram(
            await getTokenType(this.connection, quoteMintToken)
        )

        const createPoolTx = await this.buildCreatePoolWithTransferHookTx(
            {
                ...preCreatePoolParam,
                config: configKey,
                payer: payerAddress,
                transferHookProgram: new PublicKey(transferHookProgram),
                tokenBadge: tokenBadgeKey,
            },
            quoteMintToken,
            tokenQuoteProgram
        )

        tx.add(createConfigTx, createPoolTx)
        return tx
    }

    /**
     * Build separate transactions for config creation and pool creation with an optional first buy.
     *
     * The transactions are returned separately so clients can send them independently or bundle them
     */
    async createConfigAndPoolWithFirstBuy(
        params: CreateConfigAndPoolWithFirstBuyParams
    ): Promise<{
        createConfigTx: Transaction
        createPoolWithFirstBuyTx: Transaction
    }> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            preCreatePoolParam,
            firstBuyParam,
            tokenBadge,
            ...configParam
        } = params

        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)
        const tokenBadgeKey = tokenBadge ? new PublicKey(tokenBadge) : undefined

        const createConfigTx = await this.buildCreateConfigTx(
            configParam,
            configKey,
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            quoteMintToken,
            payerAddress,
            tokenBadgeKey
        )

        const createPoolParam: CreatePoolParams = {
            ...preCreatePoolParam,
            config: configKey,
            payer: payerAddress,
            tokenBadge: tokenBadgeKey,
        }

        const createPoolWithFirstBuyTx = await this.buildCreatePoolTx(
            createPoolParam,
            params.tokenType,
            quoteMintToken
        )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            const swapBuyTx = await this.buildSwapBuyTx(
                firstBuyParam,
                preCreatePoolParam.baseMint,
                configKey,
                configParam.poolFees.baseFee,
                false,
                configParam.activationType,
                params.tokenType,
                quoteMintToken,
                true
            )
            createPoolWithFirstBuyTx.add(swapBuyTx)
        }

        return {
            createConfigTx,
            createPoolWithFirstBuyTx,
        }
    }

    /**
     * Build separate transactions for transfer-hook config creation and pool creation with an optional first buy.
     */
    async createConfigAndPoolWithFirstBuyWithTransferHook(
        params: CreateConfigAndPoolWithFirstBuyWithTransferHookParams
    ): Promise<{
        createConfigTx: Transaction
        createPoolWithFirstBuyTx: Transaction
    }> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            transferHookProgram,
            payer,
            preCreatePoolParam,
            firstBuyParam,
            tokenBadge,
            ...configParam
        } = params

        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)
        const transferHookProgramKey = new PublicKey(transferHookProgram)
        const tokenBadgeKey = tokenBadge ? new PublicKey(tokenBadge) : undefined

        const createConfigTx = await this.buildCreateConfigWithTransferHookTx(
            configParam,
            configKey,
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            quoteMintToken,
            transferHookProgramKey,
            payerAddress,
            tokenBadgeKey
        )

        const tokenQuoteProgram = getTokenProgram(
            await getTokenType(this.connection, quoteMintToken)
        )

        const createPoolWithFirstBuyTx =
            await this.buildCreatePoolWithTransferHookTx(
                {
                    ...preCreatePoolParam,
                    config: configKey,
                    payer: payerAddress,
                    transferHookProgram: transferHookProgramKey,
                    tokenBadge: tokenBadgeKey,
                },
                quoteMintToken,
                tokenQuoteProgram
            )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            const swapBuyTx = await this.buildSwap2WithTransferHookBuyTx(
                firstBuyParam,
                preCreatePoolParam.baseMint,
                configKey,
                configParam.poolFees.baseFee,
                configParam.activationType,
                quoteMintToken,
                true
            )
            createPoolWithFirstBuyTx.add(swapBuyTx)
        }

        return {
            createConfigTx,
            createPoolWithFirstBuyTx,
        }
    }

    /**
     * Build a transaction that creates partner metadata for a fee claimer.
     */
    async createPartnerMetadata(
        params: CreatePartnerMetadataParams
    ): Promise<Transaction> {
        const { name, website, logo, feeClaimer, payer } = params

        const partnerMetadata = derivePartnerMetadata(feeClaimer)

        const partnerMetadataParam: CreatePartnerMetadataParameters = {
            padding: new Array(96).fill(0),
            name,
            website,
            logo,
        }

        return this.program.methods
            .createPartnerMetadata(partnerMetadataParam)
            .accountsPartial({
                partnerMetadata,
                payer,
                feeClaimer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    /**
     * Build a transaction that claims partner trading fees.
     *
     * When the quote mint is SOL, the transaction may create and close a temporary wrapped SOL account.
     * If `receiver` differs from `feeClaimer`, provide `tempWSolAcc`.
     */
    async claimPartnerTradingFee(
        params: ClaimPartnerTradingFeeParams
    ): Promise<Transaction> {
        const {
            feeClaimer,
            payer,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
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
            // if receiver is present and not equal to feeClaimer, use tempWSolAcc, otherwise use feeClaimer
            const tempWSol =
                receiver && !receiver.equals(feeClaimer)
                    ? tempWSolAcc
                    : feeClaimer
            // if receiver is provided, use receiver as the fee receiver, otherwise use feeClaimer
            const feeReceiver = receiver ? receiver : feeClaimer

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
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial({
                    ...result.accounts,
                    config: virtualPool.poolState.config,
                    feeClaimer,
                })
                .preInstructions(result.preInstructions)
                .postInstructions(result.postInstructions)
                .transaction()
        } else {
            const feeReceiver = receiver ? receiver : feeClaimer

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
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial({
                    ...result.accounts,
                    config: virtualPool.poolState.config,
                    feeClaimer,
                })
                .preInstructions(result.preInstructions)
                .transaction()
        }
    }

    /**
     * Build a transaction that claims partner trading fees to an explicit receiver.
     */
    async claimPartnerTradingFeeToReceiver(
        params: ClaimPartnerTradingFeeToReceiverParams
    ): Promise<Transaction> {
        const {
            feeClaimer,
            payer,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
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
                tempWSolAcc: feeClaimer,
                pool,
                virtualPool,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })

            return this.program.methods
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial({
                    ...result.accounts,
                    config: virtualPool.poolState.config,
                    feeClaimer,
                })
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
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial({
                    ...result.accounts,
                    config: virtualPool.poolState.config,
                    feeClaimer,
                })
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
    }

    /**
     * Build a transaction that claims partner trading fees with transfer-hook support.
     */
    async claimPartnerTradingFee2(
        params: ClaimPartnerTradingFeeToReceiverParams
    ): Promise<Transaction> {
        const {
            feeClaimer,
            payer,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
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
                  tempWSolAcc: feeClaimer,
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
            .claimTradingFee2(
                maxBaseAmount,
                maxQuoteAmount,
                transferHookAccountsInfo
            )
            .accountsPartial({
                ...result.accounts,
                config: virtualPool.poolState.config,
                feeClaimer,
            })
            .remainingAccounts(transferHookAccounts)
            .preInstructions(result.preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that withdraws partner surplus from a pool.
     */
    async partnerWithdrawSurplus(
        params: PartnerWithdrawSurplusParams
    ): Promise<Transaction> {
        const { pool, feeClaimer } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const { ataPubkey: tokenQuoteAccount, ix: createQuoteTokenAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                poolConfigState.quoteMint,
                feeClaimer,
                feeClaimer,
                true,
                tokenQuoteProgram
            )

        createQuoteTokenAccountIx &&
            preInstructions.push(createQuoteTokenAccountIx)

        if (poolConfigState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(feeClaimer, feeClaimer)
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        }
        return this.program.methods
            .partnerWithdrawSurplus()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPool.poolState.config,
                virtualPool: pool,
                tokenQuoteAccount,
                quoteVault: virtualPool.poolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                feeClaimer,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that withdraws the partner migration fee.
     */
    async partnerWithdrawMigrationFee(
        params: WithdrawMigrationFeeParams
    ): Promise<Transaction> {
        const { pool, sender } = params

        return this.buildWithdrawMigrationFeeTx('partner', pool, sender)
    }

    /**
     * Build a transaction that claims the partner pool creation fee.
     */
    async claimPartnerPoolCreationFee(
        params: ClaimPartnerPoolCreationFeeParams
    ): Promise<Transaction> {
        const { pool, feeReceiver } = params

        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        const config = virtualPool.poolState.config

        const feeClaimer = poolConfigState.feeClaimer

        const transaction = await this.program.methods
            .claimPartnerPoolCreationFee()
            .accountsPartial({
                config,
                pool,
                feeClaimer,
                feeReceiver,
            })
            .transaction()

        return transaction
    }
}
