import {
    Commitment,
    PublicKey,
    SystemProgram,
    TransactionInstruction,
    type Connection,
    type Transaction,
} from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    type ClaimTradingFeeParam,
    type CreateConfigParam,
    type CreatePartnerMetadataParam,
    type CreatePartnerMetadataParameters,
    type PartnerWithdrawSurplusParam,
    ClaimPartnerTradingFeeWithQuoteMintNotSolParam,
    ClaimPartnerTradingFeeWithQuoteMintSolParam,
    ClaimTradingFee2Param,
    WithdrawMigrationFeeParam,
} from '../types'
import {
    derivePartnerMetadata,
    unwrapSOLInstruction,
    validateConfigParameters,
    getTokenProgram,
    getOrCreateATAInstruction,
    isNativeSol,
    findAssociatedTokenAddress,
} from '../helpers'
import {
    createAssociatedTokenAccountIdempotentInstruction,
    NATIVE_MINT,
} from '@solana/spl-token'
import { StateService } from './state'

export class PartnerService extends DynamicBondingCurveProgram {
    private state: StateService

    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
        this.state = new StateService(connection, commitment)
    }

    /**
     * Create a new config
     * @param createConfigParam - The config parameters
     * @param feeClaimer - The partner's fee claimer address
     * @param leftoverReceiver - The leftover receiver address
     * @param quoteMint - The quote mint
     * @param payer - The payer of the transaction
     * @returns A new config
     */
    async createConfig(params: CreateConfigParam): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = params

        // error checks
        validateConfigParameters({ ...configParam, leftoverReceiver })

        return this.program.methods
            .createConfig(configParam)
            .accountsPartial({
                config,
                feeClaimer,
                leftoverReceiver,
                quoteMint,
                payer,
            })
            .transaction()
    }

    /**
     * Create partner metadata
     * @param name - The name of the partner
     * @param website - The website of the partner
     * @param logo - The logo of the partner
     * @param feeClaimer - The partner's fee claimer address
     * @param payer - The payer of the transaction
     * @returns A create partner metadata transaction
     */
    async createPartnerMetadata(
        params: CreatePartnerMetadataParam
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
     * Private method to claim trading fee with quote mint SOL
     * @param feeClaimer - The partner's fee claimer address
     * @param payer - The payer of the transaction
     * @param feeReceiver - The wallet that will receive the tokens
     * @param tempWSolAcc - The temporary wallet that will receive the SOL
     * @param config - The config address
     * @param pool - The pool address
     * @param poolState - The pool state
     * @param poolConfigState - The pool config state
     * @param tokenBaseProgram - The token base program
     * @param tokenQuoteProgram - The token quote program
     * @returns A claim trading fee with quote mint SOL accounts, pre instructions and post instructions
     */
    private async claimWithQuoteMintSol(
        params: ClaimPartnerTradingFeeWithQuoteMintSolParam
    ): Promise<{
        accounts: {
            poolAuthority: PublicKey
            config: PublicKey
            pool: PublicKey
            tokenAAccount: PublicKey
            tokenBAccount: PublicKey
            baseVault: PublicKey
            quoteVault: PublicKey
            baseMint: PublicKey
            quoteMint: PublicKey
            feeClaimer: PublicKey
            tokenBaseProgram: PublicKey
            tokenQuoteProgram: PublicKey
        }
        preInstructions: TransactionInstruction[]
        postInstructions: TransactionInstruction[]
    }> {
        const {
            feeClaimer,
            payer,
            feeReceiver,
            config,
            tempWSolAcc,
            pool,
            poolState,
            poolConfigState,
            tokenBaseProgram,
            tokenQuoteProgram,
        } = params

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
            config,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: poolState.baseVault,
            quoteVault: poolState.quoteVault,
            baseMint: poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            feeClaimer,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions, postInstructions }
    }

    /**
     * Private method to claim trading fee with quote mint not SOL
     * @param feeClaimer - The partner's fee claimer address
     * @param payer - The payer of the transaction
     * @param feeReceiver - The wallet that will receive the tokens
     * @param config - The config address
     * @param pool - The pool address
     * @param poolState - The pool state
     * @param poolConfigState - The pool config state
     * @param tokenBaseProgram - The token base program
     * @param tokenQuoteProgram - The token quote program
     * @returns A claim trading fee with quote mint not SOL accounts and pre instructions
     */
    private async claimWithQuoteMintNotSol(
        params: ClaimPartnerTradingFeeWithQuoteMintNotSolParam
    ): Promise<{
        accounts: {
            poolAuthority: PublicKey
            config: PublicKey
            pool: PublicKey
            tokenAAccount: PublicKey
            tokenBAccount: PublicKey
            baseVault: PublicKey
            quoteVault: PublicKey
            baseMint: PublicKey
            quoteMint: PublicKey
            feeClaimer: PublicKey
            tokenBaseProgram: PublicKey
            tokenQuoteProgram: PublicKey
        }
        preInstructions: TransactionInstruction[]
    }> {
        const {
            feeClaimer,
            payer,
            feeReceiver,
            config,
            pool,
            poolState,
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
            poolState.baseMint,
            poolConfigState.quoteMint,
            tokenBaseProgram,
            tokenQuoteProgram
        )

        const accounts = {
            poolAuthority: this.poolAuthority,
            config,
            pool,
            tokenAAccount: tokenBaseAccount,
            tokenBAccount: tokenQuoteAccount,
            baseVault: poolState.baseVault,
            quoteVault: poolState.quoteVault,
            baseMint: poolState.baseMint,
            quoteMint: poolConfigState.quoteMint,
            feeClaimer,
            tokenBaseProgram,
            tokenQuoteProgram,
        }

        return { accounts, preInstructions }
    }

    /**
     * Claim partner trading fee
     * @param feeClaimer - The partner's fee claimer address
     * @param payer - The payer of the transaction
     * @param pool - The pool address
     * @param maxBaseAmount - The maximum base amount
     * @param maxQuoteAmount - The maximum quote amount
     * @param receiver - The wallet that will receive the tokens (Optional)
     * @param tempWSolAcc - The temporary wallet that will receive the SOL (Optional)
     * @returns A claim trading fee transaction
     */
    async claimPartnerTradingFee(
        params: ClaimTradingFeeParam
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

        const poolState = await this.state.getPool(pool)
        if (!poolState) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

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

            const result = await this.claimWithQuoteMintSol({
                feeClaimer,
                payer,
                feeReceiver,
                config: poolState.config,
                tempWSolAcc: tempWSol,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })

            return this.program.methods
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .postInstructions(result.postInstructions)
                .transaction()
        } else {
            const feeReceiver = receiver ? receiver : feeClaimer

            const result = await this.claimWithQuoteMintNotSol({
                feeClaimer,
                payer,
                feeReceiver,
                config: poolState.config,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })

            return this.program.methods
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .transaction()
        }
    }

    /**
     * Claim partner trading fee
     * @param feeClaimer - The partner's fee claimer address
     * @param payer - The payer of the transaction
     * @param pool - The pool address
     * @param maxBaseAmount - The maximum base amount
     * @param maxQuoteAmount - The maximum quote amount
     * @param receiver - The wallet that will receive the tokens
     * @returns A claim trading fee transaction
     */
    async claimPartnerTradingFee2(
        params: ClaimTradingFee2Param
    ): Promise<Transaction> {
        const {
            feeClaimer,
            payer,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
        } = params

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
                feeClaimer,
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
                    feeClaimer,
                    poolConfigState.quoteMint,
                    tokenQuoteProgram
                )
            createTokenQuoteAccountIx &&
                preInstructions.push(createTokenQuoteAccountIx)

            const unwrapSolIx = unwrapSOLInstruction(feeClaimer, receiver)
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
                feeClaimer,
                tokenBaseProgram,
                tokenQuoteProgram,
            }

            return this.program.methods
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(accounts)
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction()
        } else {
            const result = await this.claimWithQuoteMintNotSol({
                feeClaimer,
                payer,
                feeReceiver: receiver,
                config: poolState.config,
                pool,
                poolState,
                poolConfigState,
                tokenBaseProgram,
                tokenQuoteProgram,
            })
            return this.program.methods
                .claimTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial(result.accounts)
                .preInstructions(result.preInstructions)
                .postInstructions([])
                .transaction()
        }
    }

    /**
     * Partner withdraw surplus
     * @param virtualPool - The virtual pool address
     * @param feeClaimer - The partner's fee claimer address
     * @returns A partner withdraw surplus transaction
     */
    async partnerWithdrawSurplus(
        params: PartnerWithdrawSurplusParam
    ): Promise<Transaction> {
        const { virtualPool, feeClaimer } = params

        const poolState = await this.state.getPool(virtualPool)
        if (!poolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)
        if (!poolConfigState) {
            throw new Error(`Pool config not found for virtual pool`)
        }

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
                config: poolState.config,
                virtualPool,
                tokenQuoteAccount,
                quoteVault: poolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                feeClaimer,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Partner withdraw migration fee
     * @param virtualPool - The virtual pool address
     * @param sender - The sender of the pool
     * @returns A partner withdraw migration fee transaction
     */
    async partnerWithdrawMigrationFee(
        params: WithdrawMigrationFeeParam
    ): Promise<Transaction> {
        const { virtualPool, sender } = params

        const virtualPoolState = await this.state.getPool(virtualPool)
        if (!virtualPoolState) {
            throw new Error(`Pool not found: ${virtualPool.toString()}`)
        }

        const configState = await this.state.getPoolConfig(
            virtualPoolState.config
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
            .withdrawMigrationFee(0) // 0 as partner and 1 as creator
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
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()

        return transaction
    }
}
