import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import {
    AccountsType,
    type ClaimCreatorTradingFeeParams,
    type ClaimCreatorTradingFeeToReceiverParams,
    type CreatePoolParams,
    type CreatePoolWithFirstBuyParams,
    type CreatePoolWithFirstBuyWithTransferHookParams,
    type CreatePoolWithPartnerAndCreatorFirstBuyParams,
    type CreatePoolWithPartnerAndCreatorFirstBuyWithTransferHookParams,
    type CreatePoolWithTransferHookParams,
    type CreateVirtualPoolMetadataParams,
    type CreatorWithdrawSurplusParams,
    type FirstBuyParams,
    type FirstBuyWithTransferHookParams,
    type PoolConfig,
    type TransferPoolCreatorParams,
    type WithdrawMigrationFeeParams,
} from '../types'
import { DynamicBondingCurveProgram } from './program'
import {
    deriveDammV1MigrationMetadataAddress,
    deriveDbcPoolMetadata,
    getTokenProgram,
    assertConfigAllowsNewPool,
    hasMintAuthority,
    validateMinimumLockedLiquidity,
} from '../helpers'
import { getFeeSchedulerMinBaseFeeNumerator } from '../math/poolFees/feeScheduler'
import {
    LEGACY_CONFIG_VERSION,
    MIN_FEE_NUMERATOR,
    MIN_LOCKED_LIQUIDITY_BPS,
} from '../constants'
import BN from 'bn.js'

function toFirstBuyParams(
    buyer: PublicKey,
    params: Omit<FirstBuyWithTransferHookParams, 'buyer'>
): FirstBuyWithTransferHookParams {
    return { buyer, ...params }
}

export class CreatorService extends DynamicBondingCurveProgram {
    /**
     * The config a new pool is created from, after the checks initialize_pool
     * makes: the config variant matches the method, no deprecated options,
     * mint authority only on transfer-hook configs, 10% locked at day 1, and
     * a scheduler that stays above the minimum fee.
     */
    private async getPoolConfigForNewPool(
        config: PublicKey,
        transferHookProgram?: PublicKey
    ): Promise<PoolConfig> {
        const found = await this.state.getPoolConfigWithKind(config)
        if (!found) {
            throw new Error(`Pool config not found: ${config.toBase58()}`)
        }
        const { poolConfig, transferHookConfig } = found

        if (
            (transferHookConfig !== null) !==
            (transferHookProgram !== undefined)
        ) {
            throw new Error(
                transferHookConfig
                    ? 'Config uses a transfer hook, create the pool with the transfer-hook method'
                    : 'Config does not use a transfer hook, create the pool with the standard method'
            )
        }
        if (
            transferHookConfig &&
            transferHookProgram &&
            !transferHookConfig.transferHookProgram.equals(transferHookProgram)
        ) {
            throw new Error(
                `Transfer hook program does not match config: expected ${transferHookConfig.transferHookProgram.toBase58()}`
            )
        }

        assertConfigAllowsNewPool({
            baseFeeMode: poolConfig.poolFees.baseFee.baseFeeMode,
            migrationOption: poolConfig.migrationOption,
        })
        if (
            !transferHookConfig &&
            hasMintAuthority(poolConfig.tokenUpdateAuthority)
        ) {
            throw new Error(
                'Mint authority token update options are only supported for transfer-hook configs'
            )
        }
        if (
            !validateMinimumLockedLiquidity(
                poolConfig.partnerPermanentLockedLiquidityPercentage,
                poolConfig.creatorPermanentLockedLiquidityPercentage,
                poolConfig.partnerLiquidityVestingInfo,
                poolConfig.creatorLiquidityVestingInfo
            )
        ) {
            throw new Error(
                `Config must lock at least ${MIN_LOCKED_LIQUIDITY_BPS} BPS of migrated liquidity at day 1`
            )
        }

        const { baseFee } = poolConfig.poolFees
        const minBaseFeeNumerator = getFeeSchedulerMinBaseFeeNumerator(
            baseFee.cliffFeeNumerator,
            baseFee.firstFactor,
            baseFee.thirdFactor,
            baseFee.baseFeeMode
        )
        if (minBaseFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR))) {
            throw new Error(
                `Config minimum base fee numerator ${minBaseFeeNumerator.toString()} is below ${MIN_FEE_NUMERATOR}`
            )
        }

        return poolConfig
    }

    private createPoolTx(
        createPoolParam: CreatePoolParams,
        poolConfig: PoolConfig
    ): Promise<Transaction> {
        return this.buildCreatePoolTx(
            createPoolParam,
            poolConfig.tokenType,
            poolConfig.quoteMint,
            // a legacy config was never checked against the transfer fee rules
            poolConfig.version !== LEGACY_CONFIG_VERSION
        )
    }

    private createPoolWithTransferHookTx(
        createPoolParam: CreatePoolWithTransferHookParams,
        poolConfig: PoolConfig
    ): Promise<Transaction> {
        return this.buildCreatePoolWithTransferHookTx(
            createPoolParam,
            poolConfig.quoteMint,
            getTokenProgram(poolConfig.quoteTokenFlag)
        )
    }

    private async appendFirstBuys(
        transaction: Transaction,
        createPoolParam: CreatePoolParams,
        poolConfig: PoolConfig,
        firstBuys: (FirstBuyParams | undefined)[]
    ): Promise<Transaction> {
        for (const firstBuy of firstBuys) {
            if (firstBuy && firstBuy.buyAmount.gt(new BN(0))) {
                transaction.add(
                    await this.buildSwapBuyTx(
                        firstBuy,
                        createPoolParam.baseMint,
                        createPoolParam.config,
                        poolConfig.tokenType,
                        poolConfig.quoteMint,
                        poolConfig.enableFirstSwapWithMinFee === 1
                    )
                )
            }
        }
        return transaction
    }

    private async appendFirstBuysWithTransferHook(
        transaction: Transaction,
        createPoolParam: CreatePoolWithTransferHookParams,
        poolConfig: PoolConfig,
        firstBuys: (FirstBuyWithTransferHookParams | undefined)[]
    ): Promise<Transaction> {
        for (const firstBuy of firstBuys) {
            if (firstBuy && firstBuy.buyAmount.gt(new BN(0))) {
                transaction.add(
                    await this.buildSwap2WithTransferHookBuyTx(
                        firstBuy,
                        createPoolParam.baseMint,
                        createPoolParam.config,
                        poolConfig.collectFeeMode,
                        poolConfig.quoteMint,
                        poolConfig.enableFirstSwapWithMinFee === 1
                    )
                )
            }
        }
        return transaction
    }

    async createPoolMetadata(
        params: CreateVirtualPoolMetadataParams
    ): Promise<Transaction> {
        const { virtualPool, name, website, logo, creator, payer } = params

        return this.program.methods
            .createVirtualPoolMetadata({
                padding: new Array(96).fill(0),
                name,
                website,
                logo,
            })
            .accountsPartial({
                virtualPool,
                virtualPoolMetadata: deriveDbcPoolMetadata(virtualPool),
                creator,
                payer,
                systemProgram: SystemProgram.programId,
            })
            .transaction()
    }

    /** Build a transaction that initializes a pool from an existing config. */
    async createPool(params: CreatePoolParams): Promise<Transaction> {
        const poolConfig = await this.getPoolConfigForNewPool(params.config)
        return this.createPoolTx(params, poolConfig)
    }

    /** Build a transaction that initializes a Token-2022 transfer-hook pool from an existing config. */
    async createPoolWithTransferHook(
        params: CreatePoolWithTransferHookParams
    ): Promise<Transaction> {
        const poolConfig = await this.getPoolConfigForNewPool(
            params.config,
            params.transferHookProgram
        )
        return this.createPoolWithTransferHookTx(params, poolConfig)
    }

    /** Build one transaction that initializes a pool and appends the first buy when buyAmount is above zero. */
    async createPoolWithFirstBuy(
        params: CreatePoolWithFirstBuyParams
    ): Promise<Transaction> {
        const { createPoolParam, firstBuyParam } = params
        const poolConfig = await this.getPoolConfigForNewPool(
            createPoolParam.config
        )
        return this.appendFirstBuys(
            await this.createPoolTx(createPoolParam, poolConfig),
            createPoolParam,
            poolConfig,
            [firstBuyParam]
        )
    }

    /** createPoolWithFirstBuy for a transfer-hook config. */
    async createPoolWithFirstBuyWithTransferHook(
        params: CreatePoolWithFirstBuyWithTransferHookParams
    ): Promise<Transaction> {
        const { createPoolParam, firstBuyParam } = params
        const poolConfig = await this.getPoolConfigForNewPool(
            createPoolParam.config,
            createPoolParam.transferHookProgram
        )
        return this.appendFirstBuysWithTransferHook(
            await this.createPoolWithTransferHookTx(
                createPoolParam,
                poolConfig
            ),
            createPoolParam,
            poolConfig,
            [firstBuyParam]
        )
    }

    /** Build one transaction that initializes a pool and appends the partner's and the creator's first buys. */
    async createPoolWithPartnerAndCreatorFirstBuy(
        params: CreatePoolWithPartnerAndCreatorFirstBuyParams
    ): Promise<Transaction> {
        const { createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam } =
            params
        const poolConfig = await this.getPoolConfigForNewPool(
            createPoolParam.config
        )
        return this.appendFirstBuys(
            await this.createPoolTx(createPoolParam, poolConfig),
            createPoolParam,
            poolConfig,
            [
                partnerFirstBuyParam &&
                    toFirstBuyParams(
                        partnerFirstBuyParam.partner,
                        partnerFirstBuyParam
                    ),
                creatorFirstBuyParam &&
                    toFirstBuyParams(
                        creatorFirstBuyParam.creator,
                        creatorFirstBuyParam
                    ),
            ]
        )
    }

    /** createPoolWithPartnerAndCreatorFirstBuy for a transfer-hook config. */
    async createPoolWithPartnerAndCreatorFirstBuyWithTransferHook(
        params: CreatePoolWithPartnerAndCreatorFirstBuyWithTransferHookParams
    ): Promise<Transaction> {
        const { createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam } =
            params
        const poolConfig = await this.getPoolConfigForNewPool(
            createPoolParam.config,
            createPoolParam.transferHookProgram
        )
        return this.appendFirstBuysWithTransferHook(
            await this.createPoolWithTransferHookTx(
                createPoolParam,
                poolConfig
            ),
            createPoolParam,
            poolConfig,
            [
                partnerFirstBuyParam &&
                    toFirstBuyParams(
                        partnerFirstBuyParam.partner,
                        partnerFirstBuyParam
                    ),
                creatorFirstBuyParam &&
                    toFirstBuyParams(
                        creatorFirstBuyParam.creator,
                        creatorFirstBuyParam
                    ),
            ]
        )
    }

    private async claimTradingFeeTx(
        params: ClaimCreatorTradingFeeToReceiverParams,
        transferHook: boolean
    ): Promise<Transaction> {
        const { creator, pool, maxBaseAmount, maxQuoteAmount, payer } = params
        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool && !transferHook) {
            throw new Error(
                'Pool uses a transfer hook, use claimCreatorTradingFee2'
            )
        }

        const { accounts, preInstructions, postInstructions } =
            await this.resolveTradingFeeAccounts({
                payer,
                feeReceiver: params.receiver,
                claimer: creator,
                pool,
                virtualPool,
                poolConfigState,
            })

        if (!transferHook) {
            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial({ ...accounts, creator })
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
            .claimCreatorTradingFee2(
                maxBaseAmount,
                maxQuoteAmount,
                transferHookAccounts.info
            )
            .accountsPartial({ ...accounts, creator })
            .remainingAccounts(transferHookAccounts.accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that claims creator trading fees to receiver, or to
     * creator when no receiver is given. With a native SOL quote the fee
     * arrives in creator's wrapped SOL account and is unwrapped to receiver.
     */
    async claimCreatorTradingFee(
        params: ClaimCreatorTradingFeeParams
    ): Promise<Transaction> {
        return this.claimTradingFeeTx(
            { ...params, receiver: params.receiver ?? params.creator },
            false
        )
    }

    /** claimCreatorTradingFee with a required receiver. */
    async claimCreatorTradingFeeToReceiver(
        params: ClaimCreatorTradingFeeToReceiverParams
    ): Promise<Transaction> {
        return this.claimTradingFeeTx(params, false)
    }

    /** claimCreatorTradingFeeToReceiver for a pool whose base mint has a transfer hook. */
    async claimCreatorTradingFee2(
        params: ClaimCreatorTradingFeeToReceiverParams
    ): Promise<Transaction> {
        return this.claimTradingFeeTx(params, true)
    }

    async creatorWithdrawSurplus(
        params: CreatorWithdrawSurplusParams
    ): Promise<Transaction> {
        const { creator, pool } = params
        const { virtualPool, poolConfigState } =
            await this.getPoolWithConfig(pool)
        const {
            tokenQuoteAccount,
            tokenQuoteProgram,
            preInstructions,
            postInstructions,
        } = await this.buildWithdrawSurplusAccounts(creator, poolConfigState)

        return this.program.methods
            .creatorWithdrawSurplus()
            .accountsPartial({
                poolAuthority: this.poolAuthority,
                config: virtualPool.poolState.config,
                virtualPool: pool,
                tokenQuoteAccount,
                quoteVault: virtualPool.poolState.quoteVault,
                quoteMint: poolConfigState.quoteMint,
                creator,
                tokenQuoteProgram,
            })
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that transfers pool creator ownership.
     * Token-2022 and metadata authorities on the creator wallet are not moved.
     */
    async transferPoolCreator(
        params: TransferPoolCreatorParams
    ): Promise<Transaction> {
        const { pool, creator, newCreator } = params
        if (newCreator.equals(creator)) {
            throw new Error('newCreator must differ from creator')
        }

        const virtualPool = await this.state.getPool(pool)
        if (!virtualPool) {
            throw new Error(`Pool not found: ${pool.toString()}`)
        }

        // read only for a pool already migrated to DAMM v1
        const migrationMetadata = deriveDammV1MigrationMetadataAddress(pool)
        return this.program.methods
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
    }

    async creatorWithdrawMigrationFee(
        params: WithdrawMigrationFeeParams
    ): Promise<Transaction> {
        return this.buildWithdrawMigrationFeeTx(
            'creator',
            params.pool,
            params.sender
        )
    }
}
