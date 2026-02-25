import { Commitment, Connection, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    createProgramAccountFilter,
    deriveDammV1MigrationMetadataAddress,
    getAccountData,
    getBaseTokenForSwap,
} from '../helpers'
import {
    LockEscrow,
    MeteoraDammMigrationMetadata,
    PartnerMetadata,
    PoolConfig,
    VirtualPool,
    VirtualPoolMetadata,
} from '../types'
import { ProgramAccount } from '@coral-xyz/anchor'
import BN from 'bn.js'
import Decimal from 'decimal.js'

export class StateService extends DynamicBondingCurveProgram {
    constructor(connection: Connection, commitment: Commitment) {
        super(connection, commitment)
    }

    /**
     * Get pool config data (partner config)
     * @param configAddress - The address of the pool config key
     * @returns A pool config
     */
    async getPoolConfig(
        configAddress: PublicKey | string
    ): Promise<PoolConfig> {
        return getAccountData<PoolConfig>(
            configAddress,
            'poolConfig',
            this.program,
            this.commitment
        )
    }

    /**
     * Get all config keys
     * @returns An array of config key accounts
     */
    async getPoolConfigs(): Promise<ProgramAccount<PoolConfig>[]> {
        return this.program.account.poolConfig.all()
    }

    /**
     * Get all config keys of an owner wallet address
     * @param owner - The owner of the config keys
     * @returns An array of config key accounts
     */
    async getPoolConfigsByOwner(
        owner: PublicKey | string
    ): Promise<ProgramAccount<PoolConfig>[]> {
        const filters = createProgramAccountFilter(owner, 72)
        return this.program.account.poolConfig.all(filters)
    }

    /**
     * Get virtual pool data
     * @param poolAddress - The address of the pool
     * @returns A virtual pool or null if not found
     */
    async getPool(poolAddress: PublicKey | string): Promise<VirtualPool> {
        return getAccountData<VirtualPool>(
            poolAddress,
            'virtualPool',
            this.program,
            this.commitment
        )
    }

    /**
     * Get all dynamic bonding curve pools
     * @returns Array of pool accounts with their addresses
     */
    async getPools(): Promise<ProgramAccount<VirtualPool>[]> {
        return this.program.account.virtualPool.all()
    }

    /**
     * Get all dynamic bonding curve pools by config key address
     * @param configAddress - The address of the config key
     * @returns Array of pool accounts with their addresses
     */
    async getPoolsByConfig(
        configAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]> {
        const filters = createProgramAccountFilter(configAddress, 72)
        return this.program.account.virtualPool.all(filters)
    }

    /**
     * Get all dynamic bonding curve pools by creator address
     * @param creatorAddress - The address of the creator
     * @returns Array of pool accounts with their addresses
     */
    async getPoolsByCreator(
        creatorAddress: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool>[]> {
        const filters = createProgramAccountFilter(creatorAddress, 104)
        return this.program.account.virtualPool.all(filters)
    }

    /**
     * Get pool by base mint
     * @param baseMint - The base mint address
     * @returns A virtual pool account
     */
    async getPoolByBaseMint(
        baseMint: PublicKey | string
    ): Promise<ProgramAccount<VirtualPool> | null> {
        const filters = createProgramAccountFilter(baseMint, 136)
        const pools = await this.program.account.virtualPool.all(filters)
        return pools.length > 0 ? pools[0] : null
    }

    /**
     * Get pool migration quote threshold
     * @param poolAddress - The address of the pool
     * @returns The migration quote threshold
     */
    async getPoolMigrationQuoteThreshold(
        poolAddress: PublicKey | string
    ): Promise<BN> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }
        const configAddress = pool.config
        const config = await this.getPoolConfig(configAddress)
        return config.migrationQuoteThreshold
    }

    /**
     * Get the progress of the curve by comparing current quote reserve to migration threshold
     * @param poolAddress - The address of the pool
     * @returns The progress as a ratio between 0 and 1
     */
    async getPoolQuoteTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        const config = await this.getPoolConfig(pool.config)
        const quoteReserve = pool.quoteReserve
        const migrationThreshold = config.migrationQuoteThreshold

        const quoteReserveDecimal = new Decimal(quoteReserve.toString())
        const thresholdDecimal = new Decimal(migrationThreshold.toString())

        const progress = quoteReserveDecimal.div(thresholdDecimal).toNumber()

        return Math.min(Math.max(progress, 0), 1)
    }

    /**
     * Get the progress of the curve based on base tokens sold relative to total base tokens available for trading.
     * @param poolAddress - The address of the pool
     * @returns The progress as a ratio between 0 and 1
     */
    async getPoolBaseTokenCurveProgress(
        poolAddress: PublicKey | string
    ): Promise<number> {
        const pool = await this.getPool(poolAddress)
        if (!pool) {
            throw new Error(`Pool not found: ${poolAddress.toString()}`)
        }

        const config = await this.getPoolConfig(pool.config)

        const baseSold = new Decimal(
            getBaseTokenForSwap(
                config.sqrtStartPrice,
                pool.sqrtPrice,
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
     * Get pool metadata
     * @param poolAddress - The address of the pool
     * @returns A pool metadata
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
     * Get partner metadata
     * @param partnerAddress - The address of the partner
     * @returns A partner metadata
     */
    async getPartnerMetadata(
        partnerAddress: PublicKey | string
    ): Promise<PartnerMetadata[]> {
        const filters = createProgramAccountFilter(partnerAddress, 8)
        const accounts = await this.program.account.partnerMetadata.all(filters)
        return accounts.map((account) => account.account)
    }

    /**
     * Get DAMM V1 lock escrow details
     * @param lockEscrowAddress - The address of the lock escrow
     * @returns A lock escrow account
     */
    async getDammV1LockEscrow(
        lockEscrowAddress: PublicKey | string
    ): Promise<LockEscrow | null> {
        const metadata = await this.program.account.lockEscrow.fetchNullable(
            lockEscrowAddress instanceof PublicKey
                ? lockEscrowAddress
                : new PublicKey(lockEscrowAddress)
        )

        return metadata
    }

    /**
     * Get fee metrics for a specific pool
     * @param poolAddress - The address of the pool
     * @returns Object containing current and total fee metrics
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
                partnerBaseFee: pool.partnerBaseFee,
                partnerQuoteFee: pool.partnerQuoteFee,
                creatorBaseFee: pool.creatorBaseFee,
                creatorQuoteFee: pool.creatorQuoteFee,
            },
            total: {
                totalTradingBaseFee: pool.metrics.totalTradingBaseFee,
                totalTradingQuoteFee: pool.metrics.totalTradingQuoteFee,
            },
        }
    }

    /**
     * Get fee breakdown for a specific pool
     * @param poolAddress - The address of the pool
     * @returns Object containing fee breakdown
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

        const config = await this.getPoolConfig(pool.config)
        if (!config) {
            throw new Error(`Config not found: ${pool.config.toString()}`)
        }

        const creatorTradingFeePercentage = config.creatorTradingFeePercentage

        const totalTradingBaseFee = pool.metrics.totalTradingBaseFee
        const totalTradingQuoteFee = pool.metrics.totalTradingQuoteFee

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

        const creatorUnclaimedBaseFee = pool.creatorBaseFee
        const creatorUnclaimedQuoteFee = pool.creatorQuoteFee

        const partnerUnclaimedBaseFee = pool.partnerBaseFee
        const partnerUnclaimedQuoteFee = pool.partnerQuoteFee

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
     * Get all fees for pools linked to a specific config key
     * @param configAddress - The address of the pool config
     * @returns Array of pools with their quote fees
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
            partnerBaseFee: pool.account.partnerBaseFee,
            partnerQuoteFee: pool.account.partnerQuoteFee,
            creatorBaseFee: pool.account.creatorBaseFee,
            creatorQuoteFee: pool.account.creatorQuoteFee,
            totalTradingBaseFee: pool.account.metrics.totalTradingBaseFee,
            totalTradingQuoteFee: pool.account.metrics.totalTradingQuoteFee,
        }))
    }

    /**
     * Get all fees for pools linked to a specific creator
     * @param creatorAddress - The address of the creator
     * @returns Array of pools with their base fees
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
            partnerBaseFee: pool.account.partnerBaseFee,
            partnerQuoteFee: pool.account.partnerQuoteFee,
            creatorBaseFee: pool.account.creatorBaseFee,
            creatorQuoteFee: pool.account.creatorQuoteFee,
            totalTradingBaseFee: pool.account.metrics.totalTradingBaseFee,
            totalTradingQuoteFee: pool.account.metrics.totalTradingQuoteFee,
        }))
    }

    /**
     * Get DAMM V1 migration metadata
     * @param poolAddress - The address of the pool
     * @returns A DAMM V1 migration metadata
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
}
