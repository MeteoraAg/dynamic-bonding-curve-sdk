import {
    TokenDecimal,
    type LockedVestingParameters,
    LiquidityVestingInfoParameters,
} from '../types'
import {
    MAX_BASIS_POINT,
    MAX_LOCK_DURATION_IN_SECONDS,
    U128_MAX,
} from '../constants'
import BN from 'bn.js'
import { convertToLamports } from './utils'
/**
 * Get the total vesting amount
 * @param lockedVesting - The locked vesting
 * @returns The total vesting amount
 */
export const getTotalVestingAmount = (
    lockedVesting: LockedVestingParameters
): BN => {
    const totalVestingAmount = lockedVesting.cliffUnlockAmount.add(
        lockedVesting.amountPerPeriod.mul(lockedVesting.numberOfPeriod)
    )
    return totalVestingAmount
}

/**
 * Calculate the locked vesting parameters
 * @param totalLockedVestingAmount - The total vesting amount
 * @param numberOfVestingPeriod - The number of periods
 * @param cliffUnlockAmount - The amount to unlock at cliff
 * @param totalVestingDuration - The total duration of vesting
 * @param cliffDurationFromMigrationTime - The cliff duration from migration time
 * @param tokenBaseDecimal - The decimal of the base token
 * @returns The locked vesting parameters
 * total_locked_vesting_amount = cliff_unlock_amount + (amount_per_period * number_of_period)
 */
export function getLockedVestingParams(
    totalLockedVestingAmount: number,
    numberOfVestingPeriod: number,
    cliffUnlockAmount: number,
    totalVestingDuration: number,
    cliffDurationFromMigrationTime: number,
    tokenBaseDecimal: TokenDecimal
): LockedVestingParameters {
    if (totalLockedVestingAmount == 0) {
        return {
            amountPerPeriod: new BN(0),
            cliffDurationFromMigrationTime: new BN(0),
            frequency: new BN(0),
            numberOfPeriod: new BN(0),
            cliffUnlockAmount: new BN(0),
        }
    }

    if (totalLockedVestingAmount == cliffUnlockAmount) {
        return {
            amountPerPeriod: convertToLamports(1, tokenBaseDecimal),
            cliffDurationFromMigrationTime: new BN(
                cliffDurationFromMigrationTime
            ),
            frequency: new BN(1),
            numberOfPeriod: new BN(1),
            cliffUnlockAmount: convertToLamports(
                totalLockedVestingAmount - 1,
                tokenBaseDecimal
            ),
        }
    }

    if (numberOfVestingPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    if (numberOfVestingPeriod == 0 || totalVestingDuration == 0) {
        throw new Error(
            'numberOfPeriod and totalVestingDuration must both be greater than zero'
        )
    }

    if (cliffUnlockAmount > totalLockedVestingAmount) {
        throw new Error(
            'Cliff unlock amount cannot be greater than total locked vesting amount'
        )
    }

    // amount_per_period = (total_locked_vesting_amount - cliff_unlock_amount) / number_of_period
    const amountPerPeriod =
        (totalLockedVestingAmount - cliffUnlockAmount) / numberOfVestingPeriod

    // round amountPerPeriod down to ensure we don't exceed total amount
    const roundedAmountPerPeriod = Math.floor(amountPerPeriod)

    // calculate the remainder from rounding down
    const totalPeriodicAmount = roundedAmountPerPeriod * numberOfVestingPeriod
    const remainder =
        totalLockedVestingAmount - (cliffUnlockAmount + totalPeriodicAmount)

    // add the remainder to cliffUnlockAmount to maintain total amount
    const adjustedCliffUnlockAmount = cliffUnlockAmount + remainder

    const periodFrequency = new BN(totalVestingDuration / numberOfVestingPeriod)

    return {
        amountPerPeriod: convertToLamports(
            roundedAmountPerPeriod,
            tokenBaseDecimal
        ),
        cliffDurationFromMigrationTime: new BN(cliffDurationFromMigrationTime),
        frequency: periodFrequency,
        numberOfPeriod: new BN(numberOfVestingPeriod),
        cliffUnlockAmount: convertToLamports(
            adjustedCliffUnlockAmount,
            tokenBaseDecimal
        ),
    }
}

export const getLiquidityVestingInfoParams = (
    vestingPercentage: number,
    bpsPerPeriod: number,
    numberOfPeriods: number,
    cliffDurationFromMigrationTime: number,
    totalDuration: number
): LiquidityVestingInfoParameters => {
    // validate vestingPercentage (0-100, u8)
    if (vestingPercentage < 0 || vestingPercentage > 100) {
        throw new Error('vestingPercentage must be between 0 and 100')
    }

    // if vestingPercentage is 0, all other params should be 0 (zero vesting case)
    if (vestingPercentage === 0) {
        if (
            bpsPerPeriod !== 0 ||
            numberOfPeriods !== 0 ||
            cliffDurationFromMigrationTime !== 0 ||
            totalDuration !== 0
        ) {
            throw new Error(
                'If vestingPercentage is 0, all other parameters must be 0'
            )
        }
        return {
            vestingPercentage: 0,
            bpsPerPeriod: 0,
            numberOfPeriods: 0,
            cliffDurationFromMigrationTime: 0,
            frequency: 0,
        }
    }

    if (bpsPerPeriod < 0 || bpsPerPeriod > MAX_BASIS_POINT) {
        throw new Error(`bpsPerPeriod must be between 0 and ${MAX_BASIS_POINT}`)
    }

    if (numberOfPeriods <= 0) {
        throw new Error(
            'numberOfPeriods must be greater than zero when vestingPercentage > 0'
        )
    }

    if (cliffDurationFromMigrationTime < 0) {
        throw new Error('cliffDurationFromMigrationTime must be >= 0')
    }

    if (totalDuration <= 0) {
        throw new Error('totalDuration must be greater than zero')
    }

    const frequency = totalDuration / numberOfPeriods

    if (frequency <= 0) {
        throw new Error(
            'frequency must be greater than zero (totalDuration / numberOfPeriods must be > 0)'
        )
    }

    const totalBps = bpsPerPeriod * numberOfPeriods
    if (totalBps > MAX_BASIS_POINT) {
        throw new Error(
            `Total BPS (bpsPerPeriod * numberOfPeriods = ${totalBps}) must not exceed ${MAX_BASIS_POINT}`
        )
    }

    const totalVestingDuration =
        cliffDurationFromMigrationTime + numberOfPeriods * frequency
    if (totalVestingDuration > MAX_LOCK_DURATION_IN_SECONDS) {
        throw new Error(
            `Total vesting duration (${totalVestingDuration}s) must not exceed ${MAX_LOCK_DURATION_IN_SECONDS}s (2 years)`
        )
    }

    if (cliffDurationFromMigrationTime === 0 && numberOfPeriods === 0) {
        throw new Error(
            'If cliffDurationFromMigrationTime is 0, numberOfPeriods must be > 0'
        )
    }

    return {
        vestingPercentage,
        bpsPerPeriod,
        numberOfPeriods,
        cliffDurationFromMigrationTime,
        frequency: Math.round(frequency),
    }
}

/**
 * Calculate the locked liquidity BPS for a single vesting info at a given time.
 * @param vestingInfo - The liquidity vesting info parameters
 * @param nSeconds - Number of seconds after migration
 * @returns The locked liquidity in BPS (basis points)
 */
export function getVestingLockedLiquidityBpsAtNSeconds(
    vestingInfo: LiquidityVestingInfoParameters | undefined,
    nSeconds: number
): number {
    // If no vesting info or vesting percentage is 0, return 0
    if (!vestingInfo || vestingInfo.vestingPercentage === 0) {
        return 0
    }

    const totalLiquidity = U128_MAX

    // total_vested_liquidity = floor(total_liquidity * vesting_percentage / 100)
    const totalVestedLiquidity = totalLiquidity
        .mul(new BN(vestingInfo.vestingPercentage))
        .div(new BN(100))

    const bpsPerPeriod = vestingInfo.bpsPerPeriod
    const numberOfPeriods = vestingInfo.numberOfPeriods
    const frequency = vestingInfo.frequency
    const cliffDuration = vestingInfo.cliffDurationFromMigrationTime

    // calculate total BPS that will be unlocked over all periods
    const totalBpsAfterCliff = bpsPerPeriod * numberOfPeriods

    // total_vesting_liquidity_after_cliff = floor(total_vested_liquidity * total_bps_after_cliff / MAX_BASIS_POINT)
    const totalVestingLiquidityAfterCliff = totalVestedLiquidity
        .mul(new BN(totalBpsAfterCliff))
        .div(new BN(MAX_BASIS_POINT))

    // liquidity_per_period = floor(total_vesting_liquidity_after_cliff / number_of_periods)
    let liquidityPerPeriod = new BN(0)
    let adjustedFrequency = frequency
    let adjustedNumberOfPeriods = numberOfPeriods
    let adjustedCliffDuration = cliffDuration

    if (numberOfPeriods > 0) {
        liquidityPerPeriod = totalVestingLiquidityAfterCliff.div(
            new BN(numberOfPeriods)
        )
    }

    // If liquidity_per_period == 0 (due to precision loss), make it cliff-only lock
    if (liquidityPerPeriod.isZero()) {
        adjustedNumberOfPeriods = 0
        adjustedFrequency = 0
        adjustedCliffDuration = Math.max(cliffDuration, 1)
    }

    // cliff_unlock_liquidity = total_vested_liquidity - (liquidity_per_period * number_of_periods)
    const cliffUnlockLiquidity = totalVestedLiquidity.sub(
        liquidityPerPeriod.mul(new BN(adjustedNumberOfPeriods))
    )

    // calculate unlocked liquidity at nSeconds using vesting parameters
    // cliff_point = current_timestamp (0) + cliff_duration
    const cliffPoint = new BN(adjustedCliffDuration)
    const currentPoint = new BN(nSeconds)

    let unlockedLiquidity = new BN(0)

    if (currentPoint.gte(cliffPoint)) {
        // past cliff - add cliff unlock amount
        unlockedLiquidity = cliffUnlockLiquidity

        // calculate periods elapsed after cliff
        if (adjustedFrequency > 0 && adjustedNumberOfPeriods > 0) {
            const timeAfterCliff = currentPoint.sub(cliffPoint)
            const periodsElapsed = timeAfterCliff
                .div(new BN(adjustedFrequency))
                .toNumber()
            const actualPeriodsElapsed = Math.min(
                periodsElapsed,
                adjustedNumberOfPeriods
            )
            unlockedLiquidity = unlockedLiquidity.add(
                liquidityPerPeriod.mul(new BN(actualPeriodsElapsed))
            )
        }
    }

    // locked_liquidity = total_vested_liquidity - unlocked_liquidity
    const lockedLiquidity = totalVestedLiquidity.sub(unlockedLiquidity)

    // liquidity_locked_bps = floor(locked_liquidity * MAX_BASIS_POINT / total_liquidity)
    const liquidityLockedBps = lockedLiquidity
        .mul(new BN(MAX_BASIS_POINT))
        .div(totalLiquidity)

    return liquidityLockedBps.toNumber()
}

/**
 * Calculate the locked liquidity BPS at a given time (in seconds) after migration
 * @param partnerPermanentLockedLiquidityPercentage - Partner's permanently locked liquidity percentage
 * @param creatorPermanentLockedLiquidityPercentage - Creator's permanently locked liquidity percentage
 * @param partnerLiquidityVestingInfo - Partner's liquidity vesting info (optional)
 * @param creatorLiquidityVestingInfo - Creator's liquidity vesting info (optional)
 * @param elapsedSeconds - Number of seconds after migration
 * @returns The total locked liquidity in BPS (basis points)
 */
export function calculateLockedLiquidityBpsAtTime(
    partnerPermanentLockedLiquidityPercentage: number,
    creatorPermanentLockedLiquidityPercentage: number,
    partnerLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined,
    creatorLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined,
    elapsedSeconds: number
): number {
    // calculate vested locked BPS using the same u128 arithmetic as on-chain
    const partnerVestedLockedLiquidityBps =
        getVestingLockedLiquidityBpsAtNSeconds(
            partnerLiquidityVestingInfo,
            elapsedSeconds
        )
    const creatorVestedLockedLiquidityBps =
        getVestingLockedLiquidityBpsAtNSeconds(
            creatorLiquidityVestingInfo,
            elapsedSeconds
        )

    const partnerPermanentLockedLiquidityBps =
        partnerPermanentLockedLiquidityPercentage * 100
    const creatorPermanentLockedLiquidityBps =
        creatorPermanentLockedLiquidityPercentage * 100

    // total locked = partner_vested + partner_permanent + creator_vested + creator_permanent
    const totalLockedLiquidityBpsAtNSeconds =
        partnerVestedLockedLiquidityBps +
        partnerPermanentLockedLiquidityBps +
        creatorVestedLockedLiquidityBps +
        creatorPermanentLockedLiquidityBps

    return totalLockedLiquidityBpsAtNSeconds
}
