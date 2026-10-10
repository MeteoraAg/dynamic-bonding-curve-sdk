import { SystemProgram, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    AccountsType,
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
import {
    derivePartnerMetadata,
    getTokenProgram,
    getTokenType,
} from '../helpers'
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

        return this.buildCreateConfigTx(
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            tokenBadge
        )
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

        return this.buildCreateConfig2Tx(
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            transferFeeParameters,
            tokenBadge
        )
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

        return this.buildCreateConfigWithTransferHookTx(
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            transferHookProgram,
            payer,
            tokenBadge
        )
    }

    /** Build one transaction that creates a config with createConfig2 and initializes its pool. */
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

        const createConfigTx = await this.buildCreateConfig2Tx(
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            transferFeeParameters,
            tokenBadge
        )
        const createPoolTx = await this.buildCreatePoolTx(
            { ...preCreatePoolParam, config, payer, tokenBadge },
            params.tokenType,
            quoteMint
        )

        return new Transaction().add(createConfigTx, createPoolTx)
    }

    /** Build one transaction that creates a transfer-hook config and initializes its pool. */
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

        const createConfigTx = await this.buildCreateConfigWithTransferHookTx(
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            transferHookProgram,
            payer,
            tokenBadge
        )
        const createPoolTx = await this.buildCreatePoolWithTransferHookTx(
            {
                ...preCreatePoolParam,
                config,
                payer,
                transferHookProgram,
                tokenBadge,
            },
            quoteMint,
            getTokenProgram(
                await getTokenType(this.connection, quoteMint, this.commitment)
            )
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

        const createConfigTx = await this.buildCreateConfig2Tx(
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            transferFeeParameters,
            tokenBadge
        )
        const createPoolWithFirstBuyTx = await this.buildCreatePoolTx(
            { ...preCreatePoolParam, config, payer, tokenBadge },
            params.tokenType,
            quoteMint
        )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            createPoolWithFirstBuyTx.add(
                await this.buildSwapBuyTx(
                    firstBuyParam,
                    preCreatePoolParam.baseMint,
                    config,
                    params.tokenType,
                    quoteMint,
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

        const createConfigTx = await this.buildCreateConfigWithTransferHookTx(
            configParam,
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            transferHookProgram,
            payer,
            tokenBadge
        )
        const createPoolWithFirstBuyTx =
            await this.buildCreatePoolWithTransferHookTx(
                {
                    ...preCreatePoolParam,
                    config,
                    payer,
                    transferHookProgram,
                    tokenBadge,
                },
                quoteMint,
                getTokenProgram(
                    await getTokenType(
                        this.connection,
                        quoteMint,
                        this.commitment
                    )
                )
            )

        if (firstBuyParam && firstBuyParam.buyAmount.gt(new BN(0))) {
            createPoolWithFirstBuyTx.add(
                await this.buildSwap2WithTransferHookBuyTx(
                    firstBuyParam,
                    preCreatePoolParam.baseMint,
                    config,
                    configParam.collectFeeMode,
                    quoteMint,
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
        const { feeClaimer, payer, pool, maxBaseAmount, maxQuoteAmount } =
            params
        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool && !transferHook) {
            throw new Error(
                'Pool uses a transfer hook, use claimPartnerTradingFee2'
            )
        }

        const { accounts, preInstructions, postInstructions } =
            await this.resolveTradingFeeAccounts({
                payer,
                feeReceiver: params.receiver,
                claimer: feeClaimer,
                pool,
                virtualPool,
                poolConfigState,
            })
        const instructionAccounts = {
            ...accounts,
            config: virtualPool.poolState.config,
            feeClaimer,
        }

        if (!transferHook) {
            return this.program.methods
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(instructionAccounts)
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction()
        }

        const transferHookAccounts =
            await this.getRemainingAccountsForTransferHook(
                virtualPool.poolState.baseMint,
                [
                    {
                        accountsType: AccountsType.TransferHookBase,
                        source: virtualPool.poolState.baseVault,
                        destination: accounts.tokenAAccount,
                        authority: this.poolAuthority,
                    },
                ]
            )
        return this.program.methods
            .claimTradingFee2(
                maxBaseAmount,
                maxQuoteAmount,
                transferHookAccounts.info
            )
            .accountsPartial(instructionAccounts)
            .remainingAccounts(transferHookAccounts.accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that claims partner trading fees to receiver, or to
     * feeClaimer when no receiver is given. With a native SOL quote the fee
     * arrives in feeClaimer's wrapped SOL account and is unwrapped to receiver.
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
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const {
            tokenQuoteAccount,
            tokenQuoteProgram,
            preInstructions,
            postInstructions,
        } = await this.buildWithdrawSurplusAccounts(feeClaimer, poolConfigState)

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
