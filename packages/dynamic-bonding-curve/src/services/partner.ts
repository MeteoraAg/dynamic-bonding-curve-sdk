import { SystemProgram, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    type ClaimPartnerPoolCreationFeeParams,
    type ClaimPartnerTradingFeeParams,
    type ClaimPartnerTradingFeeToReceiverParams,
    type CreateConfig2Params,
    type CreateConfigAndPoolParams,
    type CreateConfigAndPoolWithFirstBuyParams,
    type CreateConfigAndPoolWithFirstBuyWithTransferHookParams,
    type CreateConfigAndPoolWithTransferHookParams,
    type CreateConfigParams,
    type CreateConfigWithTransferHookParams,
    type CreatePartnerMetadataParams,
    type PartnerWithdrawSurplusParams,
    type WithdrawMigrationFeeParams,
} from '../types'
import { derivePartnerMetadata } from '../helpers'
import BN from 'bn.js'

export class PartnerService extends DynamicBondingCurveProgram {
    /**
     * Build a transaction that creates a partner-owned pool config.
     * @deprecated Use `createConfig2`. This instruction rejects a quote mint with a non-zero transfer fee or a live transfer fee config authority.
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

        const { transaction } = await this.buildCreateConfigTx({
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            tokenBadge,
        })
        return transaction
    }

    /**
     * Build a transaction that creates a partner-owned pool config.
     * `transferFeeParameters` sets the base mint fee, including at 0 basis points. Pass `null` when there is no base fee.
     */
    async createConfig2(params: CreateConfig2Params): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            tokenBadge,
            transferFeeParameters = null,
            ...configParam
        } = params

        const { transaction } = await this.buildCreateConfig2Tx({
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            tokenBadge,
            transferFeeParameters,
        })
        return transaction
    }

    /** Build a transaction that creates a partner-owned transfer-hook pool config. */
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

        const { transaction } = await this.buildCreateConfigWithTransferHookTx({
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            payer,
            quoteMint,
            tokenBadge,
            transferHookProgram,
        })
        return transaction
    }

    /**
     * Build one transaction that creates a config with createConfig2 and initializes its pool.
     * The transaction exceeds the 1232-byte limit once the curve has 8 or more points; use `createConfigAndPoolWithFirstBuy`, which returns the two transactions separately.
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
            transferFeeParameters = null,
            ...configParam
        } = params

        const { transaction: createConfigTx, quote } =
            await this.buildCreateConfig2Tx({
                configParam,
                config,
                feeClaimer,
                leftoverReceiver,
                payer,
                quoteMint,
                tokenBadge,
                transferFeeParameters,
            })
        const createPoolTx = await this.buildCreatePoolTx(
            { ...preCreatePoolParam, config, payer },
            params.tokenType,
            quote
        )

        return new Transaction().add(createConfigTx, createPoolTx)
    }

    /**
     * Build one transaction that creates a transfer-hook config and initializes its pool.
     * The transaction exceeds the 1232-byte limit once the curve has 8 or more points; use `createConfigAndPoolWithFirstBuyWithTransferHook`, which returns the two transactions separately.
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

        const { transaction: createConfigTx, quote } =
            await this.buildCreateConfigWithTransferHookTx({
                configParam,
                config,
                feeClaimer,
                leftoverReceiver,
                payer,
                quoteMint,
                tokenBadge,
                transferHookProgram,
            })
        const createPoolTx = await this.buildCreatePoolWithTransferHookTx(
            { ...preCreatePoolParam, config, payer },
            transferHookProgram,
            quote
        )

        return new Transaction().add(createConfigTx, createPoolTx)
    }

    /**
     * Build the config creation and the pool creation, with the first buy
     * appended to the pool transaction, as two transactions the caller can
     * send separately or bundle.
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
            transferFeeParameters = null,
            ...configParam
        } = params

        const { transaction: createConfigTx, quote } =
            await this.buildCreateConfig2Tx({
                configParam,
                config,
                feeClaimer,
                leftoverReceiver,
                payer,
                quoteMint,
                tokenBadge,
                transferFeeParameters,
            })
        const createPoolWithFirstBuyTx = await this.buildCreatePoolTx(
            { ...preCreatePoolParam, config, payer },
            params.tokenType,
            quote
        )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            createPoolWithFirstBuyTx.add(
                await this.buildSwapBuyTx(
                    firstBuyParam,
                    preCreatePoolParam.baseMint,
                    config,
                    params.tokenType,
                    quote,
                    configParam.enableFirstSwapWithMinFee
                )
            )
        }

        return { createConfigTx, createPoolWithFirstBuyTx }
    }

    /** createConfigAndPoolWithFirstBuy for a transfer-hook config. */
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

        const { transaction: createConfigTx, quote } =
            await this.buildCreateConfigWithTransferHookTx({
                configParam,
                config,
                feeClaimer,
                leftoverReceiver,
                payer,
                quoteMint,
                tokenBadge,
                transferHookProgram,
            })
        const createPoolWithFirstBuyTx =
            await this.buildCreatePoolWithTransferHookTx(
                { ...preCreatePoolParam, config, payer },
                transferHookProgram,
                quote
            )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            createPoolWithFirstBuyTx.add(
                await this.buildSwap2WithTransferHookBuyTx(
                    firstBuyParam,
                    preCreatePoolParam.baseMint,
                    config,
                    quote,
                    configParam.enableFirstSwapWithMinFee
                )
            )
        }

        return { createConfigTx, createPoolWithFirstBuyTx }
    }

    async createPartnerMetadata(
        params: CreatePartnerMetadataParams
    ): Promise<Transaction> {
        const { name, website, logo, feeClaimer, payer } = params

        return this.program.methods
            .createPartnerMetadata({
                padding: new Array(96).fill(0),
                name,
                website,
                logo,
            })
            .accountsPartial({
                partnerMetadata: derivePartnerMetadata(feeClaimer),
                payer,
                feeClaimer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    private async claimTradingFeeTx(
        params: ClaimPartnerTradingFeeToReceiverParams,
        transferHook: boolean
    ): Promise<Transaction> {
        const { feeClaimer, maxBaseAmount, maxQuoteAmount } = params
        const { accounts, config, hook, preInstructions, postInstructions } =
            await this.prepareTradingFeeClaim({
                payer: params.payer,
                feeReceiver: params.receiver,
                claimer: feeClaimer,
                pool: params.pool,
                transferHook,
                transferHookMethod: 'claimPartnerTradingFee2',
            })
        const instructionAccounts = { ...accounts, config, feeClaimer }

        if (!hook) {
            return this.program.methods
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(instructionAccounts)
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction()
        }
        return this.program.methods
            .claimTradingFee2(maxBaseAmount, maxQuoteAmount, hook.info)
            .accountsPartial(instructionAccounts)
            .remainingAccounts(hook.accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that claims partner trading fees to receiver, or to
     * feeClaimer when no receiver is given. A native SOL fee is unwrapped to
     * receiver through a temporary account derived from feeClaimer.
     */
    async claimPartnerTradingFee(
        params: ClaimPartnerTradingFeeParams
    ): Promise<Transaction> {
        return this.claimTradingFeeTx(
            { ...params, receiver: params.receiver ?? params.feeClaimer },
            false
        )
    }

    /** claimPartnerTradingFee with a required receiver. */
    async claimPartnerTradingFeeToReceiver(
        params: ClaimPartnerTradingFeeToReceiverParams
    ): Promise<Transaction> {
        return this.claimTradingFeeTx(params, false)
    }

    /** claimPartnerTradingFeeToReceiver for a pool whose base mint has a transfer hook. */
    async claimPartnerTradingFee2(
        params: ClaimPartnerTradingFeeToReceiverParams
    ): Promise<Transaction> {
        return this.claimTradingFeeTx(params, true)
    }

    async partnerWithdrawSurplus(
        params: PartnerWithdrawSurplusParams
    ): Promise<Transaction> {
        const { pool, feeClaimer } = params
        const { accounts, preInstructions, postInstructions } =
            await this.resolveWithdrawAccounts(pool, feeClaimer)

        return this.program.methods
            .partnerWithdrawSurplus()
            .accountsPartial({ ...accounts, feeClaimer })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    async partnerWithdrawMigrationFee(
        params: WithdrawMigrationFeeParams
    ): Promise<Transaction> {
        return this.buildWithdrawMigrationFeeTx(
            'partner',
            params.pool,
            params.sender
        )
    }

    /** Build a transaction that claims the partner pool creation fee; the config's feeClaimer signs. */
    async claimPartnerPoolCreationFee(
        params: ClaimPartnerPoolCreationFeeParams
    ): Promise<Transaction> {
        const { pool, feeReceiver } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)

        return this.program.methods
            .claimPartnerPoolCreationFee()
            .accountsPartial({
                config: virtualPool.poolState.config,
                pool,
                feeClaimer: poolConfigState.feeClaimer,
                feeReceiver,
            })
            .transaction()
    }
}
