import {
    Commitment,
    PublicKey,
    SystemProgram,
    Transaction,
    TransactionInstruction,
    type Connection,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    type ClaimPartnerTradingFeeParams,
    type CreateConfigAndPoolParams,
    type CreateConfigAndPoolWithFirstBuyParams,
    type CreateConfigParams,
    type CreatePoolParams,
    type CreatePartnerMetadataParams,
    type CreatePartnerMetadataParameters,
    type PartnerWithdrawSurplusParams,
    WithdrawMigrationFeeParams,
    ClaimPartnerPoolCreationFeeParams,
    ClaimPartnerTradingFee2Params,
} from '../types'
import {
    derivePartnerMetadata,
    unwrapSOLInstruction,
    getTokenProgram,
    getOrCreateATAInstruction,
    isNativeSol,
} from '../helpers'
import { NATIVE_MINT } from '@solana/spl-token'
import { StateService } from './state'
import BN from 'bn.js'

export class PartnerService extends DynamicBondingCurveProgram {
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
     * Build a transaction that creates a partner-owned pool config.
     */
    async createConfig(params: CreateConfigParams): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = params

        return this.buildCreateConfigTx(
            configParam,
            new PublicKey(config),
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            new PublicKey(quoteMint),
            new PublicKey(payer)
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
            ...configParam
        } = params

        const tx = new Transaction()
        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)

        const createConfigTx = await this.buildCreateConfigTx(
            configParam,
            configKey,
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            quoteMintToken,
            payerAddress
        )

        const createPoolTx = await this.buildCreatePoolTx(
            {
                ...preCreatePoolParam,
                config: configKey,
                payer: payerAddress,
            },
            params.tokenType,
            quoteMintToken
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
            ...configParam
        } = params

        const configKey = new PublicKey(config)
        const quoteMintToken = new PublicKey(quoteMint)
        const payerAddress = new PublicKey(payer)

        const createConfigTx = await this.buildCreateConfigTx(
            configParam,
            configKey,
            new PublicKey(feeClaimer),
            new PublicKey(leftoverReceiver),
            quoteMintToken,
            payerAddress
        )

        const createPoolParam: CreatePoolParams = {
            ...preCreatePoolParam,
            config: configKey,
            payer: payerAddress,
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
        params: ClaimPartnerTradingFee2Params
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
                .accountsPartial({ ...result.accounts, feeClaimer })
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
                .accountsPartial({ ...result.accounts, feeClaimer })
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
    }

    async claimPartnerTradingFee2() {}

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
