import {
    Commitment,
    Connection,
    GetProgramAccountsFilter,
    PublicKey,
} from '@solana/web3.js'
import {
    createProgramAccountFilter,
    deriveDammV1MigrationMetadataAddress,
    deriveDbcPoolMetadata,
    derivePartnerMetadata,
    deriveTokenBadgeAddress,
    getBaseTokenForSwap,
    getSurplusBreakdown,
} from '../helpers'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'
import type {
    ConfigWithTransferHook,
    MeteoraDammMigrationMetadata,
    PartnerMetadata,
    PoolConfig,
    TokenBadge,
    TransferHookPool,
    VirtualPool,
    VirtualPoolMetadata,
} from '../types'
import type { Program, ProgramAccount } from '@coral-xyz/anchor'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import type { DbcProvider } from '../client'

// memcmp offsets: the 8-byte Anchor discriminator, then the account's fields
// in declaration order (state/config.rs, state/virtual_pool.rs, state/*_metadata.rs)
const DISCRIMINATOR_SIZE = 8
const PUBKEY_SIZE = 32
const VOLATILITY_TRACKER_SIZE = 64
// PoolConfig: quote_mint, fee_claimer, ...
const POOL_CONFIG_FEE_CLAIMER_OFFSET = DISCRIMINATOR_SIZE + PUBKEY_SIZE
// VirtualPool: volatility_tracker, config, creator, base_mint, ...
const VIRTUAL_POOL_CONFIG_OFFSET = DISCRIMINATOR_SIZE + VOLATILITY_TRACKER_SIZE
const VIRTUAL_POOL_CREATOR_OFFSET = VIRTUAL_POOL_CONFIG_OFFSET + PUBKEY_SIZE
const VIRTUAL_POOL_BASE_MINT_OFFSET = VIRTUAL_POOL_CREATOR_OFFSET + PUBKEY_SIZE

type AccountName = DynamicBondingCurveIDL['accounts'][number]['name']

export type PoolFeeSummary = {
    poolAddress: PublicKey
    partnerBaseFee: BN
    partnerQuoteFee: BN
    creatorBaseFee: BN
    creatorQuoteFee: BN
    totalTradingBaseFee: BN
    totalTradingQuoteFee: BN
}

function toPoolFeeSummary(pool: ProgramAccount<VirtualPool>): PoolFeeSummary {
    const { poolState } = pool.account
    return {
        poolAddress: pool.publicKey,
        partnerBaseFee: poolState.partnerBaseFee,
        partnerQuoteFee: poolState.partnerQuoteFee,
        creatorBaseFee: poolState.creatorBaseFee,
        creatorQuoteFee: poolState.creatorQuoteFee,
        totalTradingBaseFee: poolState.metrics.totalTradingBaseFee,
        totalTradingQuoteFee: poolState.metrics.totalTradingQuoteFee,
    }
}

function clampProgress(progress: number): number {
    return Math.min(Math.max(progress, 0), 1)
}

/** Read-only access to DBC accounts. Pools and configs come in a standard and a transfer-hook variant. */
export class StateService {
    program: Program<DynamicBondingCurveIDL>
    private connection: Connection
    private commitment: Commitment

    constructor(provider: DbcProvider) {
        this.program = provider.program
        this.connection = provider.connection
        this.commitment = provider.commitment
    }

    private hasDiscriminator(data: Buffer, accountName: AccountName): boolean {
        const discriminator = this.program.idl.accounts.find(
            (account) => account.name === accountName
        )?.discriminator
        return (
            discriminator !== undefined &&
            Buffer.from(discriminator).equals(
                data.subarray(0, discriminator.length)
            )
        )
    }

    private async fetchVirtualPools(
        filters?: GetProgramAccountsFilter[]
    ): Promise<ProgramAccount<VirtualPool>[]> {
        const [pools, transferHookPools] = await Promise.all([
            this.program.account.virtualPool.all(filters),
            this.program.account.transferHookPool.all(filters),
        ])
        return [...pools, ...transferHookPools]
    }

    private async fetchPoolConfigs(
        filters?: GetProgramAccountsFilter[]
    ): Promise<ProgramAccount<PoolConfig>[]> {
        const [configs, transferHookConfigs] = await Promise.all([
            this.program.account.poolConfig.all(filters),
            this.program.account.configWithTransferHook.all(filters),
        ])
        return [
            ...configs,
            ...transferHookConfigs.map((account) => ({
                publicKey: account.publicKey,
                account: account.account.config,
            })),
        ]
    }

    /** Fetch a config and say which account variant holds it. */
    async getPoolConfigWithKind(configAddress: PublicKey | string): Promise<{
        poolConfig: PoolConfig
        transferHookConfig: ConfigWithTransferHook | null
    } | null> {
        const accountInfo = await this.connection.getAccountInfo(
            new PublicKey(configAddress),
            this.commitment
        )
        if (!accountInfo) {
            return null
        }
        if (this.hasDiscriminator(accountInfo.data, 'poolConfig')) {
            return {
                poolConfig: this.program.coder.accounts.decode<PoolConfig>(
                    'poolConfig',
                    accountInfo.data
                ),
                transferHookConfig: null,
            }
        }
        if (this.hasDiscriminator(accountInfo.data, 'configWithTransferHook')) {
            const transferHookConfig =
                this.program.coder.accounts.decode<ConfigWithTransferHook>(
                    'configWithTransferHook',
                    accountInfo.data
                )
            return { poolConfig: transferHookConfig.config, transferHookConfig }
        }
        return null
    }

    async getPoolConfig(
        configAddress: PublicKey | string
    ): Promise<PoolConfig | null> {
        const found = await this.getPoolConfigWithKind(configAddress)
        return found?.poolConfig ?? null
    }

    async isTransferHookConfig(
        configAddress: PublicKey | string
    ): Promise<boolean> {
        const found = await this.getPoolConfigWithKind(configAddress)
        return found?.transferHookConfig !== null && found !== null
    }

    async getConfigWithTransferHook(
        configAddress: PublicKey | string
    ): Promise<ConfigWithTransferHook | null> {
        const found = await this.getPoolConfigWithKind(configAddress)
        return found?.transferHookConfig ?? null
    }

    async getPoolConfigs(): Promise<ProgramAccount<PoolConfig>[]> {
        return this.fetchPoolConfigs()
    }

    /** Fetch all pool configs whose fee claimer is a wallet. */
    async getPoolConfigsByOwner(
        owner: PublicKey | string
    ): Promise<ProgramAccount<PoolConfig>[]> {
        return this.fetchPoolConfigs(
            createProgramAccountFilter(owner, POOL_CONFIG_FEE_CLAIMER_OFFSET)
        )
    }

    /** Fetch a pool and say whether it is the transfer-hook variant. */
    async getPoolWithKind(poolAddress: PublicKey | string): Promise<{
        virtualPool: VirtualPool
        isTransferHookPool: boolean
    } | null> {
        const accountInfo = await this.connection.getAccountInfo(
            new PublicKey(poolAddress),
            this.commitment
        )
        if (!accountInfo) {
            return null
        }
        if (this.hasDiscriminator(accountInfo.data, 'virtualPool')) {
            return {
                virtualPool: this.program.coder.accounts.decode<VirtualPool>(
                    'virtualPool',
                    accountInfo.data
                ),
                isTransferHookPool: false,
            }
        }
        if (this.hasDiscriminator(accountInfo.data, 'transferHookPool')) {
            return {
                virtualPool:
                    this.program.coder.accounts.decode<TransferHookPool>(
                        'transferHookPool',
                        accountInfo.data
                    ),
                isTransferHookPool: true,
            }
        }
        return null
    }

    async getPool(
        poolAddress: PublicKey | string
    ): Promise<VirtualPool | null> {
        const found = await this.getPoolWithKind(poolAddress)
        return found?.virtualPool ?? null
    }

    async isTransferHookPool(
        poolAddress: PublicKey | string
    ): Promise<boolean> {
        const found = await this.getPoolWithKind(poolAddress)
        return found?.isTransferHookPool ?? false
    }

    private async getPoolAndConfig(
        poolAddress: PublicKey | string
    ): Promise<{ pool: VirtualPool; config: PoolConfig }> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }
        const config = await this.getPoolConfig(pool.poolState.config)
        if (!config) {
            throw new Error(
                `Config not found: ${pool.poolState.config.toString()}`
            )
        }
        return { pool, config }
    }

    async getPools(): Promise<ProgramAccount<VirtualPool>[]> {
        return this.fetchVirtualPools()
    }

    async getPoolsByConfig(
        configAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]> {
        return this.fetchVirtualPools(
            createProgramAccountFilter(
                configAddress,
                VIRTUAL_POOL_CONFIG_OFFSET
            )
        )
    }

    async getPoolsByCreator(
        creatorAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]> {
        return this.fetchVirtualPools(
            createProgramAccountFilter(
                creatorAddress,
                VIRTUAL_POOL_CREATOR_OFFSET
            )
        )
    }

    /** Fetch the first virtual pool that uses a base mint. */
    async getPoolByBaseMint(
        baseMint: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool> | null> {
        const pools = await this.fetchVirtualPools(
            createProgramAccountFilter(baseMint, VIRTUAL_POOL_BASE_MINT_OFFSET)
        )
        return pools[0] ?? null
    }

    async getPoolMigrationQuoteThreshold(
        poolAddress: PublicKey | string
    ): Promise<BN> {
        const { config } = await this.getPoolAndConfig(poolAddress)
        return config.migrationQuoteThreshold
    }

    /** Quote reserve over the migration threshold, from 0 to 1. */
    async getPoolQuoteTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number> {
        const { pool, config } = await this.getPoolAndConfig(poolAddress)
        return clampProgress(
            new Decimal(pool.poolState.quoteReserve.toString())
                .div(new Decimal(config.migrationQuoteThreshold.toString()))
                .toNumber()
        )
    }

    /** Base sold over the base the curve sells before migration, from 0 to 1. */
    async getPoolBaseTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number> {
        const { pool, config } = await this.getPoolAndConfig(poolAddress)
        const baseSold = getBaseTokenForSwap(
            config.sqrtStartPrice,
            pool.poolState.sqrtPrice,
            config.curve
        )
        const totalBaseForSale = getBaseTokenForSwap(
            config.sqrtStartPrice,
            config.migrationSqrtPrice,
            config.curve
        )
        return clampProgress(
            new Decimal(baseSold.toString())
                .div(new Decimal(totalBaseForSale.toString()))
                .toNumber()
        )
    }

    /** The metadata created with createPoolMetadata, or null when there is none. */
    async getPoolMetadata(
        poolAddress: PublicKey | string
    ): Promise<VirtualPoolMetadata | null> {
        return this.program.account.virtualPoolMetadata.fetchNullable(
            deriveDbcPoolMetadata(new PublicKey(poolAddress)),
            this.commitment
        )
    }

    /** The metadata created with createPartnerMetadata for a fee claimer, or null when there is none. */
    async getPartnerMetadata(
        partnerAddress: PublicKey | string
    ): Promise<PartnerMetadata | null> {
        return this.program.account.partnerMetadata.fetchNullable(
            derivePartnerMetadata(new PublicKey(partnerAddress)),
            this.commitment
        )
    }

    /**
     * The surplus split the program pays on partnerWithdrawSurplus and
     * creatorWithdrawSurplus, and whether each side has already withdrawn.
     */
    async getPoolSurplus(poolAddress: PublicKey | string): Promise<{
        total: BN
        partner: BN
        creator: BN
        protocol: BN
        partnerWithdrawn: boolean
        creatorWithdrawn: boolean
    }> {
        const { pool, config } = await this.getPoolAndConfig(poolAddress)
        return {
            ...getSurplusBreakdown(
                pool.poolState.quoteReserve,
                config.migrationQuoteThreshold,
                config.creatorTradingFeePercentage
            ),
            partnerWithdrawn: pool.poolState.isPartnerWithdrawSurplus === 1,
            creatorWithdrawn: pool.poolState.isCreatorWithdrawSurplus === 1,
        }
    }

    /** Unclaimed partner and creator fees, and lifetime trading fees, of a pool. */
    async getPoolFeeMetrics(poolAddress: PublicKey | string): Promise<{
        current: {
            partnerBaseFee: BN
            partnerQuoteFee: BN
            creatorBaseFee: BN
            creatorQuoteFee: BN
        }
        total: {
            totalTradingBaseFee: BN
            totalTradingQuoteFee: BN
        }
    }> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }
        const { poolState } = pool
        return {
            current: {
                partnerBaseFee: poolState.partnerBaseFee,
                partnerQuoteFee: poolState.partnerQuoteFee,
                creatorBaseFee: poolState.creatorBaseFee,
                creatorQuoteFee: poolState.creatorQuoteFee,
            },
            total: {
                totalTradingBaseFee: poolState.metrics.totalTradingBaseFee,
                totalTradingQuoteFee: poolState.metrics.totalTradingQuoteFee,
            },
        }
    }

    /**
     * Claimed, unclaimed and total trading fees split between creator and
     * partner. The program floors the creator share per swap, so the split of
     * the lifetime total is an estimate.
     */
    async getPoolFeeBreakdown(poolAddress: PublicKey | string): Promise<{
        creator: {
            unclaimedBaseFee: BN
            unclaimedQuoteFee: BN
            claimedBaseFee: BN
            claimedQuoteFee: BN
            totalBaseFee: BN
            totalQuoteFee: BN
        }
        partner: {
            unclaimedBaseFee: BN
            unclaimedQuoteFee: BN
            claimedBaseFee: BN
            claimedQuoteFee: BN
            totalBaseFee: BN
            totalQuoteFee: BN
        }
    }> {
        const { pool, config } = await this.getPoolAndConfig(poolAddress)
        const { poolState } = pool
        const creatorShare = new BN(config.creatorTradingFeePercentage)

        const split = (
            total: BN,
            creatorUnclaimed: BN,
            partnerUnclaimed: BN
        ) => {
            const creatorTotal = total.mul(creatorShare).divn(100)
            const partnerTotal = total.sub(creatorTotal)
            const creatorClaimed = BN.max(
                creatorTotal.sub(creatorUnclaimed),
                new BN(0)
            )
            const partnerClaimed = BN.max(
                partnerTotal.sub(partnerUnclaimed),
                new BN(0)
            )
            return { creatorClaimed, partnerClaimed }
        }
        const base = split(
            poolState.metrics.totalTradingBaseFee,
            poolState.creatorBaseFee,
            poolState.partnerBaseFee
        )
        const quote = split(
            poolState.metrics.totalTradingQuoteFee,
            poolState.creatorQuoteFee,
            poolState.partnerQuoteFee
        )

        return {
            creator: {
                unclaimedBaseFee: poolState.creatorBaseFee,
                unclaimedQuoteFee: poolState.creatorQuoteFee,
                claimedBaseFee: base.creatorClaimed,
                claimedQuoteFee: quote.creatorClaimed,
                totalBaseFee: poolState.creatorBaseFee.add(base.creatorClaimed),
                totalQuoteFee: poolState.creatorQuoteFee.add(
                    quote.creatorClaimed
                ),
            },
            partner: {
                unclaimedBaseFee: poolState.partnerBaseFee,
                unclaimedQuoteFee: poolState.partnerQuoteFee,
                claimedBaseFee: base.partnerClaimed,
                claimedQuoteFee: quote.partnerClaimed,
                totalBaseFee: poolState.partnerBaseFee.add(base.partnerClaimed),
                totalQuoteFee: poolState.partnerQuoteFee.add(
                    quote.partnerClaimed
                ),
            },
        }
    }

    async getPoolsFeesByConfig(
        configAddress: PublicKey | string
    ): Promise<PoolFeeSummary[]> {
        const pools = await this.getPoolsByConfig(configAddress)
        return pools.map(toPoolFeeSummary)
    }

    async getPoolsFeesByCreator(
        creatorAddress: PublicKey | string
    ): Promise<PoolFeeSummary[]> {
        const pools = await this.getPoolsByCreator(creatorAddress)
        return pools.map(toPoolFeeSummary)
    }

    async getDammV1MigrationMetadata(
        poolAddress: PublicKey
    ): Promise<MeteoraDammMigrationMetadata | null> {
        return this.program.account.meteoraDammMigrationMetadata.fetchNullable(
            deriveDammV1MigrationMetadataAddress(poolAddress),
            this.commitment
        )
    }

    async getTokenBadge(
        tokenMint: PublicKey | string
    ): Promise<TokenBadge | null> {
        return this.program.account.tokenBadge.fetchNullable(
            deriveTokenBadgeAddress(new PublicKey(tokenMint)),
            this.commitment
        )
    }
}
