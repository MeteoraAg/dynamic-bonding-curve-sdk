import { Commitment, Connection, PublicKey } from '@solana/web3.js'
import { DynamicBondingCurveProgram } from './program'
import {
    createMetLockProgram,
    createProgramAccountFilter,
    deriveBaseKeyForLocker,
    deriveDammV1MigrationMetadataAddress,
    deriveEscrow,
    getAccountData,
    getTotalSupplyFromCurve,
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
    async getPoolCurveProgress(
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
        walletAddress: PublicKey | string
    ): Promise<PartnerMetadata[]> {
        const filters = createProgramAccountFilter(walletAddress, 8)
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

    async getCirculatingSupply(
        configAddress: PublicKey | string,
        poolAddress: PublicKey | string,
        currentPoint: BN
    ) {
        // circulating supply = totalTokenSupply - amount migrated into the lp - amount locked in the escrow
        const poolConfigState = await this.getPoolConfig(configAddress)

        // amount sold in the curve
        const swapAmount = poolConfigState.swapBaseAmount

        // amount migrated into the lp
        let migrationAmount = poolConfigState.migrationBaseThreshold
        if (
            poolConfigState.partnerLockedLpPercentage === 0 &&
            poolConfigState.creatorLockedLpPercentage === 0
        ) {
            migrationAmount = new BN(0)
        }

        let totalTokenSupply = poolConfigState.postMigrationTokenSupply
        if (!poolConfigState.fixedTokenSupplyFlag) {
            totalTokenSupply = getTotalSupplyFromCurve(
                poolConfigState.migrationQuoteThreshold,
                poolConfigState.sqrtStartPrice,
                poolConfigState.curve,
                poolConfigState.lockedVestingConfig,
                poolConfigState.migrationOption,
                new BN(0),
                poolConfigState.migrationFeePercentage
            )
        }

        const metLockProgram = createMetLockProgram(this.connection)

        // amount locked in the escrow
        const base = deriveBaseKeyForLocker(
            poolAddress instanceof PublicKey
                ? poolAddress
                : new PublicKey(poolAddress)
        )
        const escrow = deriveEscrow(base)

        const escrowAccount =
            await metLockProgram.account.vestingEscrow.fetchNullable(escrow)

        let amountLockedInEscrow = new BN(0)
        if (escrowAccount) {
            // total_locked_vesting_amount = cliff_unlock_amount + (amount_per_period * number_of_period)
            const cliffUnlockAmount = escrowAccount.cliffUnlockAmount
            const amountPerPeriod = escrowAccount.amountPerPeriod
            const numberOfPeriod = escrowAccount.numberOfPeriod

            const totalLockedAmount = cliffUnlockAmount.add(
                amountPerPeriod.mul(numberOfPeriod)
            )

            let releasedAmount = new BN(0)

            // if cliff time has passed, cliffUnlockAmount is circulating
            if (currentPoint.gte(escrowAccount.cliffTime)) {
                releasedAmount = releasedAmount.add(cliffUnlockAmount)
            }

            // calculate how many periods have passed since vesting started
            if (currentPoint.gt(escrowAccount.vestingStartTime)) {
                const timeElapsed = currentPoint.sub(
                    escrowAccount.vestingStartTime
                )
                const frequency = escrowAccount.frequency

                const periodsPassed = timeElapsed.div(frequency)
                const actualPeriodsPassed = BN.min(
                    periodsPassed,
                    numberOfPeriod
                )

                // add the amount released from completed periods
                const periodicReleasedAmount =
                    amountPerPeriod.mul(actualPeriodsPassed)
                releasedAmount = releasedAmount.add(periodicReleasedAmount)
            }

            // amount still locked = total locked - released amount
            amountLockedInEscrow = totalLockedAmount.sub(releasedAmount)
        }

        const circulatingSupply = totalTokenSupply
            .sub(migrationAmount)
            .sub(amountLockedInEscrow)

        return {
            circulatingSupply,
            totalTokenSupply,
            migrationAmount,
            amountLockedInEscrow,
        }
    }
}
