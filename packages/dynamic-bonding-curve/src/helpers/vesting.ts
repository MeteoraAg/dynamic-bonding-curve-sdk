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

export const getTotalVestingAmount = (
    lockedVesting: LockedVestingParameters
): BN => {
    const totalVestingAmount = lockedVesting.cliffUnlockAmount.add(
        lockedVesting.amountPerPeriod.mul(lockedVesting.numberOfPeriod)
    )
    return totalVestingAmount
}

/**
 * Calculate the locked vesting parameters, where
 * `totalLockedVestingAmount = cliffUnlockAmount + amountPerPeriod * numberOfPeriod`.
 */
export function getLockedVestingParams(
    totalLockedVestingAmount: number,
    numberOfVestingPeriod: number,
    cliffUnlockAmount: number,
    totalVestingDuration: number,
    cliffDurationFromMigrationTime: number,
    tokenBaseDecimal: TokenDecimal
): LockedVestingParameters {
    if (totalLockedVestingAmount === 0) {
        return {
            amountPerPeriod: new BN(0),
            cliffDurationFromMigrationTime: new BN(0),
            frequency: new BN(0),
            numberOfPeriod: new BN(0),
            cliffUnlockAmount: new BN(0),
        }
    }

    // The program requires a non-zero frequency and total, so an all-cliff
    // schedule vests one token over one period after the cliff.
    if (totalLockedVestingAmount === cliffUnlockAmount) {
        if (totalLockedVestingAmount < 1) {
            throw new Error(
                'totalLockedVestingAmount must be at least 1 token when it is all unlocked at the cliff'
            )
        }
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

    if (numberOfVestingPeriod <= 0 || totalVestingDuration <= 0) {
        throw new Error(
            'numberOfPeriod and totalVestingDuration must both be greater than zero'
        )
    }

    if (cliffUnlockAmount > totalLockedVestingAmount) {
        throw new Error(
            'Cliff unlock amount cannot be greater than total locked vesting amount'
        )
    }

    // amount_per_period rounds down; the remainder is added to the cliff unlock
    const roundedAmountPerPeriod = Math.floor(
        (totalLockedVestingAmount - cliffUnlockAmount) / numberOfVestingPeriod
    )
    const adjustedCliffUnlockAmount =
        totalLockedVestingAmount -
        roundedAmountPerPeriod * numberOfVestingPeriod

    const periodFrequency = Math.floor(
        totalVestingDuration / numberOfVestingPeriod
    )
    if (periodFrequency === 0) {
        throw new Error(
            'totalVestingDuration must be at least numberOfVestingPeriod seconds'
        )
    }

    return {
        amountPerPeriod: convertToLamports(
            roundedAmountPerPeriod,
            tokenBaseDecimal
        ),
        cliffDurationFromMigrationTime: new BN(cliffDurationFromMigrationTime),
        frequency: new BN(periodFrequency),
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
    if (vestingPercentage < 0 || vestingPercentage > 100) {
        throw new Error('vestingPercentage must be between 0 and 100')
    }

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

    const frequency = Math.floor(totalDuration / numberOfPeriods)

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

    return {
        vestingPercentage,
        bpsPerPeriod,
        numberOfPeriods,
        cliffDurationFromMigrationTime,
        frequency,
    }
}

/**
 * Port of the program's `get_damm_v2_vesting_parameters`. When rounding leaves
 * no liquidity per period, the schedule collapses to a cliff-only lock.
 */
export function getDammV2VestingParameters(
    vestingInfo: LiquidityVestingInfoParameters
): {
    totalVestedLiquidity: BN
    liquidityPerPeriod: BN
    numberOfPeriods: number
    frequency: number
    cliffDuration: number
} {
    const totalVestedLiquidity = U128_MAX.mul(
        new BN(vestingInfo.vestingPercentage)
    ).div(new BN(100))

    const totalBpsAfterCliff =
        vestingInfo.bpsPerPeriod * vestingInfo.numberOfPeriods
    const totalVestingLiquidityAfterCliff = totalVestedLiquidity
        .mul(new BN(totalBpsAfterCliff))
        .div(new BN(MAX_BASIS_POINT))

    const liquidityPerPeriod =
        vestingInfo.numberOfPeriods > 0
            ? totalVestingLiquidityAfterCliff.div(
                  new BN(vestingInfo.numberOfPeriods)
              )
            : new BN(0)

    if (liquidityPerPeriod.isZero()) {
        return {
            totalVestedLiquidity,
            liquidityPerPeriod,
            numberOfPeriods: 0,
            frequency: 0,
            cliffDuration: Math.max(
                vestingInfo.cliffDurationFromMigrationTime,
                1
            ),
        }
    }

    return {
        totalVestedLiquidity,
        liquidityPerPeriod,
        numberOfPeriods: vestingInfo.numberOfPeriods,
        frequency: vestingInfo.frequency,
        cliffDuration: vestingInfo.cliffDurationFromMigrationTime,
    }
}

/** Get the liquidity still locked, in BPS of total liquidity, `nSeconds` after migration. */
export function getVestingLockedLiquidityBpsAtNSeconds(
    vestingInfo: LiquidityVestingInfoParameters | undefined,
    nSeconds: number
): number {
    if (!vestingInfo || vestingInfo.vestingPercentage === 0) {
        return 0
    }

    const {
        totalVestedLiquidity,
        liquidityPerPeriod,
        numberOfPeriods,
        frequency,
        cliffDuration,
    } = getDammV2VestingParameters(vestingInfo)

    const cliffUnlockLiquidity = totalVestedLiquidity.sub(
        liquidityPerPeriod.mul(new BN(numberOfPeriods))
    )

    const cliffPoint = new BN(cliffDuration)
    const currentPoint = new BN(nSeconds)

    let unlockedLiquidity = new BN(0)

    if (currentPoint.gte(cliffPoint)) {
        unlockedLiquidity = cliffUnlockLiquidity

        if (frequency > 0 && numberOfPeriods > 0) {
            const periodsElapsed = currentPoint
                .sub(cliffPoint)
                .div(new BN(frequency))
                .toNumber()
            unlockedLiquidity = unlockedLiquidity.add(
                liquidityPerPeriod.mul(
                    new BN(Math.min(periodsElapsed, numberOfPeriods))
                )
            )
        }
    }

    return totalVestedLiquidity
        .sub(unlockedLiquidity)
        .mul(new BN(MAX_BASIS_POINT))
        .div(U128_MAX)
        .toNumber()
}

/** Calculate the total locked liquidity in BPS `elapsedSeconds` after migration. */
export function calculateLockedLiquidityBpsAtTime(
    partnerPermanentLockedLiquidityPercentage: number,
    creatorPermanentLockedLiquidityPercentage: number,
    partnerLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined,
    creatorLiquidityVestingInfo: LiquidityVestingInfoParameters | undefined,
    elapsedSeconds: number
): number {
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

    const totalLockedLiquidityBpsAtNSeconds =
        partnerVestedLockedLiquidityBps +
        partnerPermanentLockedLiquidityBps +
        creatorVestedLockedLiquidityBps +
        creatorPermanentLockedLiquidityBps

    return totalLockedLiquidityBpsAtNSeconds
}
