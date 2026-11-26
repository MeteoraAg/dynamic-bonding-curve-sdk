import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js'
import {
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

function toFirstBuyParams<T extends { receiver: PublicKey }>(
    buyer: PublicKey,
    params: T
): T & { buyer: PublicKey } {
    return { buyer, ...params }
}

export class CreatorService extends DynamicBondingCurveProgram {
    private async fetchConfigForNewPool(config: PublicKey) {
        const found = await this.state.getPoolConfigWithKind(config)
        if (!found) {
            throw new Error(`Pool config not found: ${config.toBase58()}`)
        }
        return found
    }

    /**
     * The checks initialize_pool makes on a config after its variant: no
     * deprecated options, mint authority only on transfer-hook configs, 10%
     * locked at day 1, and a scheduler that stays above the minimum fee.
     */
    private assertNewPoolAllowed(
        poolConfig: PoolConfig,
        isTransferHook: boolean
    ): void {
        assertConfigAllowsNewPool({
            baseFeeMode: poolConfig.poolFees.baseFee.baseFeeMode,
            migrationOption: poolConfig.migrationOption,
        })
        if (
            !isTransferHook &&
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
    }

    /** The config a standard pool is created from. */
    private async getPoolConfigForNewPool(
        config: PublicKey
    ): Promise<PoolConfig> {
        const { poolConfig, transferHookConfig } =
            await this.fetchConfigForNewPool(config)
        if (transferHookConfig) {
            throw new Error(
                'Config uses a transfer hook, create the pool with the transfer-hook method'
            )
        }
        this.assertNewPoolAllowed(poolConfig, false)
        return poolConfig
    }

    /**
     * The config a transfer-hook pool is created from and its hook program.
     * `transferHookProgram` must match the config's when given.
     */
    private async getTransferHookPoolConfigForNewPool(
        config: PublicKey,
        transferHookProgram?: PublicKey
    ): Promise<{ poolConfig: PoolConfig; transferHookProgram: PublicKey }> {
        const { poolConfig, transferHookConfig } =
            await this.fetchConfigForNewPool(config)
        if (!transferHookConfig) {
            throw new Error(
                'Config does not use a transfer hook, create the pool with the standard method'
            )
        }
        if (
            transferHookProgram &&
            !transferHookConfig.transferHookProgram.equals(transferHookProgram)
        ) {
            throw new Error(
                `Transfer hook program does not match config: expected ${transferHookConfig.transferHookProgram.toBase58()}`
            )
        }
        this.assertNewPoolAllowed(poolConfig, true)
        return {
            poolConfig,
            transferHookProgram: transferHookConfig.transferHookProgram,
        }
    }

    private async createPoolWithFirstBuys(
        createPoolParam: CreatePoolParams,
        firstBuys: (FirstBuyParams | undefined)[]
    ): Promise<Transaction> {
        const poolConfig = await this.getPoolConfigForNewPool(
            createPoolParam.config
        )
        const quote = await this.resolveQuoteMint(
            poolConfig.quoteMint,
            createPoolParam.tokenBadge,
            // a legacy config was never checked against the transfer fee rules
            poolConfig.version !== LEGACY_CONFIG_VERSION
        )
        const transaction = await this.buildCreatePoolTx(
            createPoolParam,
            poolConfig.tokenType,
            quote
        )
        for (const firstBuy of firstBuys) {
            if (firstBuy && firstBuy.buyAmount.gt(new BN(0))) {
                transaction.add(
                    await this.buildSwapBuyTx(
                        firstBuy,
                        createPoolParam.baseMint,
                        createPoolParam.config,
                        poolConfig.tokenType,
                        quote,
                        poolConfig.enableFirstSwapWithMinFee === 1
                    )
                )
            }
        }
        return transaction
    }

    private async createPoolWithTransferHookFirstBuys(
        createPoolParam: CreatePoolWithTransferHookParams,
        firstBuys: (FirstBuyWithTransferHookParams | undefined)[]
    ): Promise<Transaction> {
        const { poolConfig, transferHookProgram } =
            await this.getTransferHookPoolConfigForNewPool(
                createPoolParam.config,
                createPoolParam.transferHookProgram
            )
        const quote = await this.resolveQuoteMint(
            poolConfig.quoteMint,
            createPoolParam.tokenBadge,
            false
        )
        const transaction = await this.buildCreatePoolWithTransferHookTx(
            createPoolParam,
            transferHookProgram,
            quote
        )
        for (const firstBuy of firstBuys) {
            if (firstBuy && firstBuy.buyAmount.gt(new BN(0))) {
                transaction.add(
                    await this.buildSwap2WithTransferHookBuyTx(
                        firstBuy,
                        createPoolParam.baseMint,
                        createPoolParam.config,
                        quote,
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
        return this.createPoolWithFirstBuys(params, [])
    }

    /**
     * Build a transaction that initializes a Token-2022 transfer-hook pool from an existing config.
     * `transferHookProgram` defaults to the config's.
     */
    async createPoolWithTransferHook(
        params: CreatePoolWithTransferHookParams
    ): Promise<Transaction> {
        return this.createPoolWithTransferHookFirstBuys(params, [])
    }

    /** Build one transaction that initializes a pool and appends the first buy when buyAmount is above zero. */
    async createPoolWithFirstBuy(
        params: CreatePoolWithFirstBuyParams
    ): Promise<Transaction> {
        const { createPoolParam, firstBuyParam } = params
        return this.createPoolWithFirstBuys(createPoolParam, [firstBuyParam])
    }

    /** createPoolWithFirstBuy for a transfer-hook config. */
    async createPoolWithFirstBuyWithTransferHook(
        params: CreatePoolWithFirstBuyWithTransferHookParams
    ): Promise<Transaction> {
        const { createPoolParam, firstBuyParam } = params
        return this.createPoolWithTransferHookFirstBuys(createPoolParam, [
            firstBuyParam,
        ])
    }

    /** Build one transaction that initializes a pool and appends the partner's and the creator's first buys. */
    async createPoolWithPartnerAndCreatorFirstBuy(
        params: CreatePoolWithPartnerAndCreatorFirstBuyParams
    ): Promise<Transaction> {
        const { createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam } =
            params
        return this.createPoolWithFirstBuys(createPoolParam, [
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
        ])
    }

    /** createPoolWithPartnerAndCreatorFirstBuy for a transfer-hook config. */
    async createPoolWithPartnerAndCreatorFirstBuyWithTransferHook(
        params: CreatePoolWithPartnerAndCreatorFirstBuyWithTransferHookParams
    ): Promise<Transaction> {
        const { createPoolParam, partnerFirstBuyParam, creatorFirstBuyParam } =
            params
        return this.createPoolWithTransferHookFirstBuys(createPoolParam, [
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
        ])
    }

    private async claimTradingFeeTx(
        params: ClaimCreatorTradingFeeToReceiverParams,
        transferHook: boolean
    ): Promise<Transaction> {
        const { creator, maxBaseAmount, maxQuoteAmount } = params
        const { accounts, hook, preInstructions, postInstructions } =
            await this.prepareTradingFeeClaim({
                payer: params.payer,
                feeReceiver: params.receiver,
                claimer: creator,
                pool: params.pool,
                transferHook,
                transferHookMethod: 'claimCreatorTradingFee2',
            })

        if (!hook) {
            return this.program.methods
                .claimCreatorTradingFee(maxBaseAmount, maxQuoteAmount)
                .accountsPartial({ ...accounts, creator })
                .preInstructions(preInstructions)
                .postInstructions(postInstructions)
                .transaction()
        }
        return this.program.methods
            .claimCreatorTradingFee2(maxBaseAmount, maxQuoteAmount, hook.info)
            .accountsPartial({ ...accounts, creator })
            .remainingAccounts(hook.accounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a transaction that claims creator trading fees to receiver, or to
     * creator when no receiver is given. A native SOL fee is unwrapped to
     * receiver through a temporary account derived from creator.
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
        const { accounts, preInstructions, postInstructions } =
            await this.resolveWithdrawAccounts(pool, creator)

        return this.program.methods
            .creatorWithdrawSurplus()
            .accountsPartial({ ...accounts, creator })
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
