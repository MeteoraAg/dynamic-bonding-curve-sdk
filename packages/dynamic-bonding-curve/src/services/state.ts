import {
    Commitment,
    Connection,
    GetProgramAccountsFilter,
    PublicKey,
} from '@solana/web3.js'
import {
    createDbcProgram,
    createProgramAccountFilter,
    deriveDammV1MigrationMetadataAddress,
    deriveTokenBadgeAddress,
    getBaseTokenForSwap,
} from '../helpers'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from '../idl/dynamic-bonding-curve/idl'
import {
    MeteoraDammMigrationMetadata,
    PartnerMetadata,
    PoolConfig,
    TokenBadge,
    VirtualPool,
    VirtualPoolMetadata,
} from '../types'
import type { Program, ProgramAccount } from '@coral-xyz/anchor'
import BN from 'bn.js'
import Decimal from 'decimal.js'

export class StateService {
    program: Program<DynamicBondingCurveIDL>
    private commitment: Commitment

    constructor(connection: Connection, commitment: Commitment) {
        const { program } = createDbcProgram(connection, commitment)
        this.program = program
        this.commitment = commitment
    }

    getProgram(): Program<DynamicBondingCurveIDL> {
        return this.program
    }

    /**
     * Fetch virtual pools across both the standard and transfer-hook account variants.
     */
    private async fetchVirtualPools(
        filters?: GetProgramAccountsFilter[]
    ): Promise<ProgramAccount<VirtualPool>[]> {
        const [pools, transferHookPools] = await Promise.all([
            this.program.account.virtualPool.all(filters),
            this.program.account.transferHookPool.all(filters),
        ])
        return [...pools, ...transferHookPools]
    }

    /**
     * Fetch pool configs across both the standard and transfer-hook account variants.
     */
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

    /**
     * Fetch a pool config account.
     */
    async getPoolConfig(
        configAddress: PublicKey | string
    ): Promise<PoolConfig | null> {
        const address =
            configAddress instanceof PublicKey
                ? configAddress
                : new PublicKey(configAddress)

        try {
            const poolConfig =
                await this.program.account.poolConfig.fetchNullable(
                    address,
                    this.commitment
                )
            if (poolConfig) {
                return poolConfig
            }
        } catch {
            // Transfer-hook configs use a different discriminator but embed PoolConfig.
        }

        const configWithTransferHook =
            await this.program.account.configWithTransferHook.fetchNullable(
                address,
                this.commitment
            )

        return configWithTransferHook?.config ?? null
    }

    /**
     * Fetch all pool config accounts.
     */
    async getPoolConfigs(): Promise<ProgramAccount<PoolConfig>[]> {
        return this.fetchPoolConfigs()
    }

    /**
     * Fetch all pool configs owned by a wallet.
     */
    async getPoolConfigsByOwner(
        owner: PublicKey | string
    ): Promise<ProgramAccount<PoolConfig>[]> {
        const filters = createProgramAccountFilter(owner, 72)
        return this.fetchPoolConfigs(filters)
    }

    /**
     * Fetch a virtual pool account.
     */
    async getPool(
        poolAddress: PublicKey | string
    ): Promise<VirtualPool | null> {
        const address =
            poolAddress instanceof PublicKey
                ? poolAddress
                : new PublicKey(poolAddress)

        try {
            const virtualPool =
                await this.program.account.virtualPool.fetchNullable(
                    address,
                    this.commitment
                )
            if (virtualPool) {
                return virtualPool
            }
        } catch {
            // Transfer-hook pools use a different discriminator but embed PoolState.
        }

        return await this.program.account.transferHookPool.fetchNullable(
            address,
            this.commitment
        )
    }

    /**
     * Fetch all virtual pool accounts.
     */
    async getPools(): Promise<ProgramAccount<VirtualPool>[]> {
        return this.fetchVirtualPools()
    }

    /**
     * Fetch all virtual pools that use a config.
     */
    async getPoolsByConfig(
        configAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]> {
        const filters = createProgramAccountFilter(configAddress, 72)
        return this.fetchVirtualPools(filters)
    }

    /**
     * Fetch all virtual pools created by a wallet.
     */
    async getPoolsByCreator(
        creatorAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]> {
        const filters = createProgramAccountFilter(creatorAddress, 104)
        return this.fetchVirtualPools(filters)
    }

    /**
     * Fetch the first virtual pool that uses a base mint.
     */
    async getPoolByBaseMint(
        baseMint: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool> | null> {
        const filters = createProgramAccountFilter(baseMint, 136)
        const pools = await this.fetchVirtualPools(filters)
        return pools.length > 0 ? pools[0] : null
    }

    /**
     * Fetch the migration quote threshold for a pool.
     */
    async getPoolMigrationQuoteThreshold(
        poolAddress: PublicKey | string
    ): Promise<BN> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }
        const configAddress = pool.poolState.config
        const config = await this.getPoolConfig(configAddress)
        return config.migrationQuoteThreshold
    }

    /**
     * Return quote-token curve progress as a ratio between 0 and 1.
     */
    async getPoolQuoteTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        const config = await this.getPoolConfig(pool.poolState.config)
        const quoteReserve = pool.poolState.quoteReserve
        const migrationThreshold = config.migrationQuoteThreshold

        const quoteReserveDecimal = new Decimal(quoteReserve.toString())
        const thresholdDecimal = new Decimal(migrationThreshold.toString())

        const progress = quoteReserveDecimal.div(thresholdDecimal).toNumber()

        return Math.min(Math.max(progress, 0), 1)
    }

    /**
     * Return base-token curve progress as a ratio between 0 and 1.
     */
    async getPoolBaseTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        const config = await this.getPoolConfig(pool.poolState.config)

        const baseSold = new Decimal(
            getBaseTokenForSwap(
                config.sqrtStartPrice,
                pool.poolState.sqrtPrice,
                config.curve
            ).toString()
        )

        const totalBaseCouldBeSold = new Decimal(
            getBaseTokenForSwap(
                config.sqrtStartPrice,
                config.migrationSqrtPrice,
                config.curve
            ).toString()
        )

        const progress = baseSold.div(totalBaseCouldBeSold).toNumber()

        return Math.min(Math.max(progress, 0), 1)
    }

    /**
     * Fetch metadata accounts for a virtual pool.
     */
    async getPoolMetadata(
        poolAddress: PublicKey | string
    ): Promise<VirtualPoolMetadata[]> {
        const filters = createProgramAccountFilter(poolAddress, 8)
        const accounts =
            await this.program.account.virtualPoolMetadata.all(filters)
        return accounts.map((account) => account.account)
    }

    /**
     * Fetch metadata accounts for a partner.
     */
    async getPartnerMetadata(
        partnerAddress: PublicKey | string
    ): Promise<PartnerMetadata[]> {
        const filters = createProgramAccountFilter(partnerAddress, 8)
        const accounts = await this.program.account.partnerMetadata.all(filters)
        return accounts.map((account) => account.account)
    }

    /**
     * Fetch current unclaimed fees and lifetime trading fee metrics for a pool.
     */
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

        return {
            current: {
                partnerBaseFee: pool.poolState.partnerBaseFee,
                partnerQuoteFee: pool.poolState.partnerQuoteFee,
                creatorBaseFee: pool.poolState.creatorBaseFee,
                creatorQuoteFee: pool.poolState.creatorQuoteFee,
            },
            total: {
                totalTradingBaseFee: pool.poolState.metrics.totalTradingBaseFee,
                totalTradingQuoteFee:
                    pool.poolState.metrics.totalTradingQuoteFee,
            },
        }
    }

    /**
     * Calculate claimed, unclaimed, and total trading fees split by creator and partner.
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
        // totalTradingFee * creatorTradingFeePercentage / 100 = creatorTotalTradingFee
        // partnerTotalTradingFee = totalTradingFee - creatorTotalTradingFee

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

        const creatorTradingFeePercentage = config.creatorTradingFeePercentage

        const totalTradingBaseFee = pool.poolState.metrics.totalTradingBaseFee
        const totalTradingQuoteFee = pool.poolState.metrics.totalTradingQuoteFee

        let creatorTotalTradingBaseFee = new BN(0)
        let creatorTotalTradingQuoteFee = new BN(0)
        let partnerTotalTradingBaseFee = totalTradingBaseFee
        let partnerTotalTradingQuoteFee = totalTradingQuoteFee

        if (creatorTradingFeePercentage > 0) {
            creatorTotalTradingBaseFee = totalTradingBaseFee
                .mul(new BN(creatorTradingFeePercentage))
                .div(new BN(100))
            creatorTotalTradingQuoteFee = totalTradingQuoteFee
                .mul(new BN(creatorTradingFeePercentage))
                .div(new BN(100))
            partnerTotalTradingBaseFee = totalTradingBaseFee.sub(
                creatorTotalTradingBaseFee
            )
            partnerTotalTradingQuoteFee = totalTradingQuoteFee.sub(
                creatorTotalTradingQuoteFee
            )
        }

        const creatorUnclaimedBaseFee = pool.poolState.creatorBaseFee
        const creatorUnclaimedQuoteFee = pool.poolState.creatorQuoteFee

        const partnerUnclaimedBaseFee = pool.poolState.partnerBaseFee
        const partnerUnclaimedQuoteFee = pool.poolState.partnerQuoteFee

        const creatorClaimedBaseFee = creatorTotalTradingBaseFee.sub(
            creatorUnclaimedBaseFee
        )
        const creatorClaimedQuoteFee = creatorTotalTradingQuoteFee.sub(
            creatorUnclaimedQuoteFee
        )
        const partnerClaimedBaseFee = partnerTotalTradingBaseFee.sub(
            partnerUnclaimedBaseFee
        )
        const partnerClaimedQuoteFee = partnerTotalTradingQuoteFee.sub(
            partnerUnclaimedQuoteFee
        )

        return {
            creator: {
                unclaimedBaseFee: creatorUnclaimedBaseFee,
                unclaimedQuoteFee: creatorUnclaimedQuoteFee,
                claimedBaseFee: creatorClaimedBaseFee,
                claimedQuoteFee: creatorClaimedQuoteFee,
                totalBaseFee: creatorTotalTradingBaseFee,
                totalQuoteFee: creatorTotalTradingQuoteFee,
            },
            partner: {
                unclaimedBaseFee: partnerUnclaimedBaseFee,
                unclaimedQuoteFee: partnerUnclaimedQuoteFee,
                claimedBaseFee: partnerClaimedBaseFee,
                claimedQuoteFee: partnerClaimedQuoteFee,
                totalBaseFee: partnerTotalTradingBaseFee,
                totalQuoteFee: partnerTotalTradingQuoteFee,
            },
        }
    }

    /**
     * Fetch fee metrics for every pool linked to a config.
     */
    async getPoolsFeesByConfig(configAddress: PublicKey | string): Promise<
        Array<{
            poolAddress: PublicKey
            partnerBaseFee: BN
            partnerQuoteFee: BN
            creatorBaseFee: BN
            creatorQuoteFee: BN
            totalTradingBaseFee: BN
            totalTradingQuoteFee: BN
        }>
    > {
        const filteredPools = await this.getPoolsByConfig(configAddress)

        return filteredPools.map((pool) => ({
            poolAddress: pool.publicKey,
            partnerBaseFee: pool.account.poolState.partnerBaseFee,
            partnerQuoteFee: pool.account.poolState.partnerQuoteFee,
            creatorBaseFee: pool.account.poolState.creatorBaseFee,
            creatorQuoteFee: pool.account.poolState.creatorQuoteFee,
            totalTradingBaseFee:
                pool.account.poolState.metrics.totalTradingBaseFee,
            totalTradingQuoteFee:
                pool.account.poolState.metrics.totalTradingQuoteFee,
        }))
    }

    /**
     * Fetch fee metrics for every pool linked to a creator.
     */
    async getPoolsFeesByCreator(creatorAddress: PublicKey | string): Promise<
        Array<{
            poolAddress: PublicKey
            partnerBaseFee: BN
            partnerQuoteFee: BN
            creatorBaseFee: BN
            creatorQuoteFee: BN
            totalTradingBaseFee: BN
            totalTradingQuoteFee: BN
        }>
    > {
        const filteredPools = await this.getPoolsByCreator(creatorAddress)

        return filteredPools.map((pool) => ({
            poolAddress: pool.publicKey,
            partnerBaseFee: pool.account.poolState.partnerBaseFee,
            partnerQuoteFee: pool.account.poolState.partnerQuoteFee,
            creatorBaseFee: pool.account.poolState.creatorBaseFee,
            creatorQuoteFee: pool.account.poolState.creatorQuoteFee,
            totalTradingBaseFee:
                pool.account.poolState.metrics.totalTradingBaseFee,
            totalTradingQuoteFee:
                pool.account.poolState.metrics.totalTradingQuoteFee,
        }))
    }

    /**
     * Fetch DAMM V1 migration metadata for a pool.
     */
    async getDammV1MigrationMetadata(
        poolAddress: PublicKey
    ): Promise<MeteoraDammMigrationMetadata> {
        const migrationMetadataAddress =
            deriveDammV1MigrationMetadataAddress(poolAddress)
        const metadata =
            await this.program.account.meteoraDammMigrationMetadata.fetch(
                migrationMetadataAddress
            )

        return metadata
    }

    /**
     * Fetch the DBC token badge for a mint, if one exists.
     */
    async getTokenBadge(
        tokenMint: PublicKey | string
    ): Promise<TokenBadge | null> {
        const mint =
            tokenMint instanceof PublicKey
                ? tokenMint
                : new PublicKey(tokenMint)
        const address = deriveTokenBadgeAddress(mint)
        return this.program.account.tokenBadge.fetchNullable(
            address,
            this.commitment
        )
    }
}
