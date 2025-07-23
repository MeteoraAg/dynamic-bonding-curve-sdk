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
     * @param createConfigParam - The parameters for the config
     * @returns A new config
     */
    async createConfig(
        createConfigParam: CreateConfigParam
    ): Promise<Transaction> {
        const {
            config,
            feeClaimer,
            leftoverReceiver,
            quoteMint,
            payer,
            ...configParam
        } = createConfigParam

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
     * @param createPartnerMetadataParam - The parameters for the partner metadata
     * @returns A create partner metadata transaction
     */
    async createPartnerMetadata(
        createPartnerMetadataParam: CreatePartnerMetadataParam
    ): Promise<Transaction> {
        const partnerMetadata = derivePartnerMetadata(
            createPartnerMetadataParam.feeClaimer
        )

        const partnerMetadataParam: CreatePartnerMetadataParameters = {
            padding: new Array(96).fill(0),
            name: createPartnerMetadataParam.name,
            website: createPartnerMetadataParam.website,
            logo: createPartnerMetadataParam.logo,
        }

        return this.program.methods
            .createPartnerMetadata(partnerMetadataParam)
            .accountsPartial({
                partnerMetadata,
                payer: createPartnerMetadataParam.payer,
                feeClaimer: createPartnerMetadataParam.feeClaimer,
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
        claimWithQuoteMintSolParam: ClaimPartnerTradingFeeWithQuoteMintSolParam
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
     * @param claimWithQuoteMintNotSolParam - The parameters for the claim with quote mint not SOL
     * @returns A claim trading fee with quote mint not SOL accounts and pre instructions
     */
    private async claimWithQuoteMintNotSol(
        claimWithQuoteMintNotSolParam: ClaimPartnerTradingFeeWithQuoteMintNotSolParam
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
     * @param claimTradingFeeParam - The parameters for the claim trading fee
     * @returns A claim trading fee transaction
     */
    async claimPartnerTradingFee(
        claimTradingFeeParam: ClaimTradingFeeParam
    ): Promise<Transaction> {
        const {
            feeClaimer,
            payer,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
            tempWSolAcc,
        } = claimTradingFeeParam

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
     * @param claimTradingFee2Param - The parameters for the claim trading fee
     * @returns A claim trading fee transaction
     */
    async claimPartnerTradingFee2(
        claimTradingFee2Param: ClaimTradingFee2Param
    ): Promise<Transaction> {
        const {
            feeClaimer,
            payer,
            pool,
            maxBaseAmount,
            maxQuoteAmount,
            receiver,
        } = claimTradingFee2Param

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
     * @param partnerWithdrawSurplusParam - The parameters for the partner withdraw surplus
     * @returns A partner withdraw surplus transaction
     */
    async partnerWithdrawSurplus(
        partnerWithdrawSurplusParam: PartnerWithdrawSurplusParam
    ): Promise<Transaction> {
        const poolState = await this.state.getPool(
            partnerWithdrawSurplusParam.virtualPool
        )
        if (!poolState) {
            throw new Error(
                `Pool not found: ${partnerWithdrawSurplusParam.virtualPool.toString()}`
            )
        }

        const poolConfigState = await this.state.getPoolConfig(poolState.config)

        const tokenQuoteProgram = getTokenProgram(
            poolConfigState.quoteTokenFlag
        )

        const preInstructions: TransactionInstruction[] = []
        const postInstructions: TransactionInstruction[] = []

        const { ataPubkey: tokenQuoteAccount, ix: createQuoteTokenAccountIx } =
            await getOrCreateATAInstruction(
                this.connection,
                poolConfigState.quoteMint,
                partnerWithdrawSurplusParam.feeClaimer,
                partnerWithdrawSurplusParam.feeClaimer,
                true,
                tokenQuoteProgram
            )

        createQuoteTokenAccountIx &&
            preInstructions.push(createQuoteTokenAccountIx)

        if (poolConfigState.quoteMint.equals(NATIVE_MINT)) {
            const unwrapSolIx = unwrapSOLInstruction(
                partnerWithdrawSurplusParam.feeClaimer,
                partnerWithdrawSurplusParam.feeClaimer
            )
            unwrapSolIx && postInstructions.push(unwrapSolIx)
        }
        return this.program.methods
            .partnerWithdrawSurplus()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: poolState.config,
                virtualPool: partnerWithdrawSurplusParam.virtualPool,
                tokenQuoteAccount,
                quoteVault: poolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                feeClaimer: partnerWithdrawSurplusParam.feeClaimer,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Partner withdraw migration fee
     * @param withdrawMigrationFeeParams - The parameters for the partner withdraw migration fee
     * @returns A partner withdraw migration fee transaction
     */
    async partnerWithdrawMigrationFee(
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
            .preInstructions([preInstruction])
            .postInstructions(postInstruction)
            .transaction()

        return transaction
    }
}
