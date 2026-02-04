import {
    BaseFee,
    DynamicFeeParameters,
    BaseFeeMode,
    MigrationOption,
    Rounding,
    TokenDecimal,
    type LiquidityDistributionParameters,
    type LockedVestingParameters,
    ActivationType,
    type PoolConfig,
    CollectFeeMode,
    DammV2DynamicFeeMode,
    MigratedPoolFee,
    MigrationFeeOption,
    LiquidityVestingInfoParameters,
    DammV2BaseFeeMode,
    MigratedPoolMarketCapFeeSchedulerParameters,
    BaseFeeParams,
} from '../types'
import {
    BIN_STEP_BPS_DEFAULT,
    BIN_STEP_BPS_U128_DEFAULT,
    DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS,
    DYNAMIC_FEE_DECAY_PERIOD_DEFAULT,
    DYNAMIC_FEE_FILTER_PERIOD_DEFAULT,
    DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT,
    FEE_DENOMINATOR,
    MAX_BASIS_POINT,
    MAX_FEE_BPS,
    MAX_FEE_NUMERATOR,
    MAX_LOCK_DURATION_IN_SECONDS,
    MAX_PRICE_CHANGE_PERCENTAGE_DEFAULT,
    MAX_RATE_LIMITER_DURATION_IN_SECONDS,
    MAX_RATE_LIMITER_DURATION_IN_SLOTS,
    MAX_SQRT_PRICE,
    MIN_FEE_BPS,
    MIN_FEE_NUMERATOR,
    MIN_SQRT_PRICE,
    ONE_Q64,
    SWAP_BUFFER_PERCENTAGE,
    U128_MAX,
} from '../constants'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
    getInitialLiquidityFromDeltaBase,
    getInitialLiquidityFromDeltaQuote,
    getNextSqrtPriceFromInput,
} from '../math/curve'
import { Commitment, Connection, PublicKey } from '@solana/web3.js'
import type { DynamicBondingCurve } from '../idl/dynamic-bonding-curve/idl'
import { Program } from '@coral-xyz/anchor'
import { bpsToFeeNumerator, convertToLamports, fromDecimalToBN } from './utils'
import { getTokenDecimals } from './token'
import { mulDiv } from '../math'

/**
 * Get the first key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The first key
 */
export function getFirstKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf1
    }
    return buf2
}

/**
 * Get the second key
 * @param key1 - The first key
 * @param key2 - The second key
 * @returns The second key
 */
export function getSecondKey(key1: PublicKey, key2: PublicKey) {
    const buf1 = key1.toBuffer()
    const buf2 = key2.toBuffer()
    // Buf1 > buf2
    if (Buffer.compare(buf1, buf2) === 1) {
        return buf2
    }
    return buf1
}

/**
 * Generic account fetch helper
 * @param accountAddress - The address of the account to fetch
 * @param accountType - The type of account to fetch from program.account
 * @param program - The program instance
 * @param commitment - The commitment level
 * @returns The fetched account data
 */
export async function getAccountData<T>(
    accountAddress: PublicKey | string,
    accountType: keyof Program<DynamicBondingCurve>['account'],
    program: Program<DynamicBondingCurve>,
    commitment: Commitment
): Promise<T> {
    const address =
        accountAddress instanceof PublicKey
            ? accountAddress
            : new PublicKey(accountAddress)

    return (await program.account[accountType].fetchNullable(
        address,
        commitment
    )) as T
}

/**
 * Get creation timestamp for an account
 * @param accountAddress - The address of the account
 * @param connection - The Solana connection instance
 * @returns The creation timestamp as a Date object, or undefined if not found
 */
export async function getAccountCreationTimestamp(
    accountAddress: PublicKey | string,
    connection: Connection
): Promise<Date | undefined> {
    const address =
        accountAddress instanceof PublicKey
            ? accountAddress
            : new PublicKey(accountAddress)

    const signatures = await connection.getSignaturesForAddress(address, {
        limit: 1,
    })

    return signatures[0]?.blockTime
        ? new Date(signatures[0].blockTime * 1000)
        : undefined
}

/**
 * Get creation timestamps for multiple accounts
 * @param accountAddresses - Array of account addresses
 * @param connection - The Solana connection instance
 * @returns Array of creation timestamps corresponding to the input addresses
 */
export async function getAccountCreationTimestamps(
    accountAddresses: (PublicKey | string)[],
    connection: Connection
): Promise<(Date | undefined)[]> {
    const timestampPromises = accountAddresses.map((address) =>
        getAccountCreationTimestamp(address, connection)
    )
    return Promise.all(timestampPromises)
}

/**
 * Get the total token supply
 * @param swapBaseAmount - The swap base amount
 * @param migrationBaseThreshold - The migration base threshold
 * @param lockedVestingParams - The locked vesting parameters
 * @returns The total token supply
 */
export function getTotalTokenSupply(
    swapBaseAmount: BN,
    migrationBaseThreshold: BN,
    lockedVestingParams: {
        amountPerPeriod: BN
        numberOfPeriod: BN
        cliffUnlockAmount: BN
    }
): BN {
    try {
        // calculate total circulating amount
        const totalCirculatingAmount = swapBaseAmount.add(
            migrationBaseThreshold
        )

        // calculate total locked vesting amount
        const totalLockedVestingAmount =
            lockedVestingParams.cliffUnlockAmount.add(
                lockedVestingParams.amountPerPeriod.mul(
                    lockedVestingParams.numberOfPeriod
                )
            )

        // calculate total amount
        const totalAmount = totalCirculatingAmount.add(totalLockedVestingAmount)

        // check for overflow
        if (totalAmount.isNeg() || totalAmount.bitLength() > 64) {
            throw new Error('Math overflow')
        }

        return totalAmount
    } catch (error) {
        throw new Error(`Math overflow: ${error}`)
    }
}

/**
 * Get the price from the sqrt start price
 * @param sqrtStartPrice - The sqrt start price
 * @param tokenBaseDecimal - The base token decimal
 * @param tokenQuoteDecimal - The quote token decimal
 * @returns The initial price
 */
export function getPriceFromSqrtPrice(
    sqrtPrice: BN,
    tokenBaseDecimal: TokenDecimal,
    tokenQuoteDecimal: TokenDecimal
): Decimal {
    // lamport price = sqrtStartPrice * sqrtStartPrice / 2^128
    const sqrtPriceDecimal = new Decimal(sqrtPrice.toString())
    const lamportPrice = sqrtPriceDecimal
        .mul(sqrtPriceDecimal)
        .div(new Decimal(2).pow(128))

    // token price = lamport price * 10^(base_decimal - quote_decimal)
    const tokenPrice = lamportPrice.mul(
        new Decimal(10).pow(tokenBaseDecimal - tokenQuoteDecimal)
    )

    return tokenPrice
}

/**
 * Get the sqrt price from the price
 * @param price - The price
 * @param tokenADecimal - The decimal of token A
 * @param tokenBDecimal - The decimal of token B
 * @returns The sqrt price
 * price = (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
 */
export const getSqrtPriceFromPrice = (
    price: string,
    tokenADecimal: number,
    tokenBDecimal: number
): BN => {
    const decimalPrice = new Decimal(price)
    const adjustedByDecimals = decimalPrice.div(
        new Decimal(10 ** (tokenADecimal - tokenBDecimal))
    )
    const sqrtValue = Decimal.sqrt(adjustedByDecimals)
    const sqrtValueQ64 = sqrtValue.mul(Decimal.pow(2, 64))

    return new BN(sqrtValueQ64.floor().toFixed())
}

/**
 * Create the sqrt prices from the prices
 * @param prices - The prices
 * @returns The sqrt prices
 */
export const createSqrtPrices = (
    prices: number[],
    tokenBaseDecimal: TokenDecimal,
    tokenQuoteDecimal: TokenDecimal
) => {
    return prices.map((price) =>
        getSqrtPriceFromPrice(
            price.toString(),
            tokenBaseDecimal,
            tokenQuoteDecimal
        )
    )
}

/**
 * Get the sqrt price from the market cap
 * @param marketCap - The market cap
 * @param totalSupply - The total supply
 * @param tokenBaseDecimal - The decimal of the base token
 * @param tokenQuoteDecimal - The decimal of the quote token
 * @returns The sqrt price
 */
export const getSqrtPriceFromMarketCap = (
    marketCap: number,
    totalSupply: number,
    tokenBaseDecimal: number,
    tokenQuoteDecimal: number
): BN => {
    const price = new Decimal(marketCap).div(new Decimal(totalSupply))
    return getSqrtPriceFromPrice(
        price.toString(),
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
}

/**
 * Get the base token for swap
 * @param sqrtStartPrice - The start sqrt price
 * @param sqrtMigrationPrice - The migration sqrt price
 * @param curve - The curve
 * @returns The base token
 */
export function getBaseTokenForSwap(
    sqrtStartPrice: BN,
    sqrtMigrationPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN {
    let totalAmount = new BN(0)
    for (let i = 0; i < curve.length; i++) {
        const lowerSqrtPrice = i == 0 ? sqrtStartPrice : curve[i - 1].sqrtPrice
        if (curve[i].sqrtPrice && curve[i].sqrtPrice.gt(sqrtMigrationPrice)) {
            const deltaAmount = getDeltaAmountBaseUnsigned(
                lowerSqrtPrice,
                sqrtMigrationPrice,
                curve[i].liquidity,
                Rounding.Up
            )
            totalAmount = totalAmount.add(deltaAmount)
            break
        } else {
            const deltaAmount = getDeltaAmountBaseUnsigned(
                lowerSqrtPrice,
                curve[i].sqrtPrice,
                curve[i].liquidity,
                Rounding.Up
            )
            totalAmount = totalAmount.add(deltaAmount)
        }
    }
    return totalAmount
}

/**
 * Get migrationQuoteAmount from migrationQuoteThreshold and migrationFeePercent
 * @param migrationQuoteThreshold - The migration quote threshold
 * @param migrationFeePercent - The migration fee percent
 * @returns migration quote amount to deposit to pool
 */
export const getMigrationQuoteAmountFromMigrationQuoteThreshold = (
    migrationQuoteThreshold: Decimal,
    migrationFeePercent: number
): Decimal => {
    const migrationQuoteAmount = migrationQuoteThreshold
        .mul(new Decimal(100).sub(new Decimal(migrationFeePercent)))
        .div(new Decimal(100))
    return migrationQuoteAmount
}

/**
 * Get migrationQuoteThreshold from migrationQuoteAmount and migrationFeePercent
 * @param migrationQuoteAmount - The migration quote amount
 * @param migrationFeePercent - The migration fee percent
 * @returns migration quote threshold on bonding curve
 */
export const getMigrationQuoteThresholdFromMigrationQuoteAmount = (
    migrationQuoteAmount: Decimal,
    migrationFeePercent: Decimal
): Decimal => {
    const migrationQuoteThreshold = migrationQuoteAmount
        .mul(new Decimal(100))
        .div(new Decimal(100).sub(new Decimal(migrationFeePercent)))
    return migrationQuoteThreshold
}

/**
 * Calculates the protocol migration fee for both base and quote tokens.
 *
 * @param depositBaseAmount - Amount of base token to deposit in pool (BN)
 * @param depositQuoteAmount - Amount of quote token to deposit in pool (BN)
 * @param migrationSqrtPrice - Migration sqrt price (BN)
 * @param migrationFeeBps - Migration fee in basis points (number)
 * @param migrationOption - Migration option (MigrationOption, enum)
 * @returns [baseFeeAmount: BN, quoteFeeAmount: BN]
 */
export function getProtocolMigrationFee(
    depositBaseAmount: BN,
    depositQuoteAmount: BN,
    migrationSqrtPrice: BN,
    migrationFeeBps: number,
    migrationOption: MigrationOption
): [BN, BN] {
    // quote fee amount = (depositQuoteAmount * migrationFeeBps) / MAX_BASIS_POINT
    const quoteFeeAmount = mulDiv(
        depositQuoteAmount,
        new BN(migrationFeeBps),
        new BN(MAX_BASIS_POINT),
        Rounding.Down
    )

    if (migrationOption === MigrationOption.MET_DAMM) {
        // DAMM v1 migration: fee as same ratio for base
        const baseFeeAmount = mulDiv(
            depositBaseAmount,
            new BN(migrationFeeBps),
            new BN(MAX_BASIS_POINT),
            Rounding.Down
        )
        return [baseFeeAmount, quoteFeeAmount]
    } else if (migrationOption === MigrationOption.MET_DAMM_V2) {
        // DAMM v2 migration
        const feeLiquidity = getInitialLiquidityFromDeltaQuote(
            quoteFeeAmount,
            MIN_SQRT_PRICE,
            migrationSqrtPrice
        )
        const baseFeeAmount = getDeltaAmountBaseUnsigned(
            migrationSqrtPrice,
            MAX_SQRT_PRICE,
            feeLiquidity,
            Rounding.Down
        )
        return [baseFeeAmount, quoteFeeAmount]
    } else {
        throw new Error('Invalid migration option')
    }
}

/**
 * Get the base token for migration
 * @param migrationQuoteAmount - The migration quote amount to deposit to pool
 * @param sqrtMigrationPrice - The migration sqrt price
 * @param migrationOption - The migration option
 * @returns The base token
 */
export const getMigrationBaseToken = (
    migrationQuoteAmount: BN,
    sqrtMigrationPrice: BN,
    migrationOption: MigrationOption
): BN => {
    if (migrationOption == MigrationOption.MET_DAMM) {
        const price = sqrtMigrationPrice.mul(sqrtMigrationPrice)
        const quote = migrationQuoteAmount.shln(128)
        const { div: baseDiv, mod } = quote.divmod(price)
        let div = baseDiv
        if (!mod.isZero()) {
            div = div.add(new BN(1))
        }
        return div
    } else if (migrationOption == MigrationOption.MET_DAMM_V2) {
        const liquidity = getInitialLiquidityFromDeltaQuote(
            migrationQuoteAmount,
            MIN_SQRT_PRICE,
            sqrtMigrationPrice
        )
        // calculate base threshold
        const baseAmount = getDeltaAmountBaseUnsigned(
            sqrtMigrationPrice,
            MAX_SQRT_PRICE,
            liquidity,
            Rounding.Up
        )
        return baseAmount
    } else {
        throw Error('Invalid migration option')
    }
}

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
 * Get the liquidity
 * @param baseAmount - The base amount
 * @param quoteAmount - The quote amount
 * @param minSqrtPrice - The min sqrt price
 * @param maxSqrtPrice - The max sqrt price
 * @returns The liquidity
 */
export const getLiquidity = (
    baseAmount: BN,
    quoteAmount: BN,
    minSqrtPrice: BN,
    maxSqrtPrice: BN
): BN => {
    const liquidityFromBase = getInitialLiquidityFromDeltaBase(
        baseAmount,
        maxSqrtPrice,
        minSqrtPrice
    )
    const liquidityFromQuote = getInitialLiquidityFromDeltaQuote(
        quoteAmount,
        minSqrtPrice,
        maxSqrtPrice
    )
    return BN.min(liquidityFromBase, liquidityFromQuote)
}

/**
 * Get the first curve
 * @param migrationSqrPrice - The migration sqrt price
 * @param migrationAmount - The migration amount
 * @param swapAmount - The swap amount
 * @param migrationQuoteThreshold - The migration quote threshold
 * @param migrationFeePercent - The migration fee percent
 * @returns The first curve
 */
export const getFirstCurve = (
    migrationSqrtPrice: BN,
    migrationBaseAmount: BN,
    swapAmount: BN,
    migrationQuoteThreshold: BN,
    migrationFeePercent: number
) => {
    // Swap_amount = L * (1/Pmin - 1/Pmax) = L * (Pmax - Pmin) / (Pmax * Pmin)      (1)
    // Quote_amount = L * (Pmax - Pmin)                                             (2)
    // (Quote_amount * (1-migrationFeePercent/100) / Migration_amount = Pmax ^ 2    (3)
    const migrationSqrPriceDecimal = new Decimal(migrationSqrtPrice.toString())
    const migrationBaseAmountDecimal = new Decimal(
        migrationBaseAmount.toString()
    )
    const swapAmountDecimal = new Decimal(swapAmount.toString())
    const migrationFeePercentDecimal = new Decimal(
        migrationFeePercent.toString()
    )
    // From (1) and (2) => Quote_amount / Swap_amount = (Pmax * Pmin)               (4)
    // From (3) and (4) => Swap_amount * (1-migrationFeePercent/100) / Migration_amount = Pmax / Pmin
    // => Pmin = Pmax * Migration_amount / (Swap_amount * (1-migrationFeePercent/100))
    const denominator = swapAmountDecimal
        .mul(new Decimal(100).sub(migrationFeePercentDecimal))
        .div(new Decimal(100))

    const sqrtStartPriceDecimal = migrationSqrPriceDecimal
        .mul(migrationBaseAmountDecimal)
        .div(denominator)

    const sqrtStartPrice = new BN(sqrtStartPriceDecimal.floor().toFixed())

    const liquidity = getLiquidity(
        swapAmount,
        migrationQuoteThreshold,
        sqrtStartPrice,
        migrationSqrtPrice
    )
    return {
        sqrtStartPrice,
        curve: [
            {
                sqrtPrice: migrationSqrtPrice,
                liquidity,
            },
        ],
    }
}

/**
 * Get the total supply from curve
 * @param migrationQuoteThreshold - The migration quote threshold
 * @param sqrtStartPrice - The start sqrt price
 * @param curve - The curve
 * @param lockedVesting - The locked vesting
 * @param migrationOption - The migration option
 * @param leftover - The leftover
 * @param migrationFeePercent - The migration fee percent
 * @returns The total supply
 */
export const getTotalSupplyFromCurve = (
    migrationQuoteThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>,
    lockedVesting: LockedVestingParameters,
    migrationOption: MigrationOption,
    leftover: BN,
    migrationFeePercent: number
): BN => {
    const sqrtMigrationPrice = getMigrationThresholdPrice(
        migrationQuoteThreshold,
        sqrtStartPrice,
        curve
    )
    const swapBaseAmount = getBaseTokenForSwap(
        sqrtStartPrice,
        sqrtMigrationPrice,
        curve
    )
    const swapBaseAmountBuffer = getSwapAmountWithBuffer(
        swapBaseAmount,
        sqrtStartPrice,
        curve
    )

    const migrationQuoteAmount =
        getMigrationQuoteAmountFromMigrationQuoteThreshold(
            new Decimal(migrationQuoteThreshold.toString()),
            migrationFeePercent
        )
    const migrationBaseAmount = getMigrationBaseToken(
        fromDecimalToBN(migrationQuoteAmount),
        sqrtMigrationPrice,
        migrationOption
    )
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)
    const minimumBaseSupplyWithBuffer = swapBaseAmountBuffer
        .add(migrationBaseAmount)
        .add(totalVestingAmount)
        .add(leftover)
    return minimumBaseSupplyWithBuffer
}

/**
 * Get the migration threshold price
 * @param migrationThreshold - The migration threshold
 * @param sqrtStartPrice - The start sqrt price
 * @param curve - The curve
 * @returns The migration threshold price
 */
export const getMigrationThresholdPrice = (
    migrationThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN => {
    let nextSqrtPrice = sqrtStartPrice

    if (curve.length === 0) {
        throw Error('Curve is empty')
    }

    const totalAmount = getDeltaAmountQuoteUnsigned(
        nextSqrtPrice,
        curve[0].sqrtPrice,
        curve[0].liquidity,
        Rounding.Up
    )
    if (totalAmount.gt(migrationThreshold)) {
        nextSqrtPrice = getNextSqrtPriceFromInput(
            nextSqrtPrice,
            curve[0].liquidity,
            migrationThreshold,
            false
        )
    } else {
        let amountLeft = migrationThreshold.sub(totalAmount)
        nextSqrtPrice = curve[0].sqrtPrice
        for (let i = 1; i < curve.length; i++) {
            const maxAmount = getDeltaAmountQuoteUnsigned(
                nextSqrtPrice,
                curve[i].sqrtPrice,
                curve[i].liquidity,
                Rounding.Up
            )
            if (maxAmount.gt(amountLeft)) {
                nextSqrtPrice = getNextSqrtPriceFromInput(
                    nextSqrtPrice,
                    curve[i].liquidity,
                    amountLeft,
                    false
                )
                amountLeft = new BN(0)
                break
            } else {
                amountLeft = amountLeft.sub(maxAmount)
                nextSqrtPrice = curve[i].sqrtPrice
            }
        }
        if (!amountLeft.isZero()) {
            const migrationThresholdStr = migrationThreshold.toString()
            const amountLeftStr = amountLeft.toString()
            throw Error(
                `Not enough liquidity, migrationThreshold: ${migrationThresholdStr}  amountLeft: ${amountLeftStr}`
            )
        }
    }
    return nextSqrtPrice
}

/**
 * Calculate the quote amount allocated to each curve segment
 * Formula: Δb = L * (√P_upper - √P_lower) for each segment
 * @param migrationQuoteThreshold - The total migration quote threshold
 * @param sqrtStartPrice - The start sqrt price
 * @param curve - The curve segments with sqrtPrice and liquidity
 * @returns Array of quote amounts for each segment and the final sqrt price reached
 */
export const getCurveBreakdown = (
    migrationQuoteThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): {
    segmentAmounts: BN[]
    finalSqrtPrice: BN
    totalAmount: BN
} => {
    if (curve.length === 0) {
        throw Error('Curve is empty')
    }

    const segmentAmounts: BN[] = []
    let totalAllocated = new BN(0)
    let currentSqrtPrice = sqrtStartPrice
    let finalSqrtPrice = sqrtStartPrice

    for (let i = 0; i < curve.length; i++) {
        const lowerSqrtPrice = currentSqrtPrice
        const upperSqrtPrice = curve[i].sqrtPrice
        const liquidity = curve[i].liquidity

        // calculate max quote amount available in this segment
        // formula: Δb = L * (√P_upper - √P_lower)
        const maxSegmentAmount = getDeltaAmountQuoteUnsigned(
            lowerSqrtPrice,
            upperSqrtPrice,
            liquidity,
            Rounding.Up
        )

        if (maxSegmentAmount.gte(migrationQuoteThreshold)) {
            // this segment contains the migration point
            segmentAmounts.push(migrationQuoteThreshold)
            totalAllocated = totalAllocated.add(migrationQuoteThreshold)

            // calculate the exact sqrt price where migration threshold is reached
            finalSqrtPrice = getNextSqrtPriceFromInput(
                lowerSqrtPrice,
                liquidity,
                migrationQuoteThreshold,
                false
            )

            // fill remaining segments with zero
            for (let j = i + 1; j < curve.length; j++) {
                segmentAmounts.push(new BN(0))
            }
            break
        } else {
            // this segment is fully consumed
            segmentAmounts.push(maxSegmentAmount)
            totalAllocated = totalAllocated.add(maxSegmentAmount)
            currentSqrtPrice = upperSqrtPrice
            finalSqrtPrice = upperSqrtPrice

            // check if we've processed all segments but haven't reached threshold
            if (
                i === curve.length - 1 &&
                totalAllocated.lt(migrationQuoteThreshold)
            ) {
                const shortfall = migrationQuoteThreshold.sub(totalAllocated)
                throw Error(
                    `Not enough liquidity in curve. Total allocated: ${totalAllocated.toString()}, Required: ${migrationQuoteThreshold.toString()}, Shortfall: ${shortfall.toString()}`
                )
            }
        }
    }

    return {
        segmentAmounts,
        finalSqrtPrice,
        totalAmount: totalAllocated,
    }
}

/**
 * Get the swap amount with buffer
 * @param swapBaseAmount - The swap base amount
 * @param sqrtStartPrice - The start sqrt price
 * @param curve - The curve
 * @returns The swap amount with buffer
 */
export const getSwapAmountWithBuffer = (
    swapBaseAmount: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN => {
    const swapAmountBuffer = swapBaseAmount.add(
        swapBaseAmount.mul(new BN(SWAP_BUFFER_PERCENTAGE)).div(new BN(100))
    )
    const maxBaseAmountOnCurve = getBaseTokenForSwap(
        sqrtStartPrice,
        MAX_SQRT_PRICE,
        curve
    )
    return BN.min(swapAmountBuffer, maxBaseAmountOnCurve)
}

/**
 * Get the percentage of supply that should be allocated to initial liquidity
 * @param initialMarketCap - The initial market cap
 * @param migrationMarketCap - The migration market cap
 * @param lockedVesting - The locked vesting
 * @param totalLeftover - The leftover
 * @param totalTokenSupply - The total token supply
 * @returns The percentage of supply for initial liquidity
 */
export const getPercentageSupplyOnMigration = (
    initialMarketCap: Decimal,
    migrationMarketCap: Decimal,
    lockedVesting: LockedVestingParameters,
    totalLeftover: BN,
    totalTokenSupply: BN
): number => {
    // formula: x = sqrt(initialMC / migrationMC) * (100 - lockedVesting - leftover) / (1 + sqrt(initialMC / migrationMC))

    // sqrtRatio = sqrt(initial_MC / migration_MC)
    const marketCapRatio = initialMarketCap.div(migrationMarketCap)
    const sqrtRatio = Decimal.sqrt(marketCapRatio)

    // locked vesting percentage
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)
    const vestingPercentage = new Decimal(totalVestingAmount.toString())
        .mul(new Decimal(100))
        .div(new Decimal(totalTokenSupply.toString()))

    // leftover percentage
    const leftoverPercentage = new Decimal(totalLeftover.toString())
        .mul(new Decimal(100))
        .div(new Decimal(totalTokenSupply.toString()))

    // (100 * sqrtRatio - (vestingPercentage + leftoverPercentage) * sqrtRatio) / (1 + sqrtRatio)
    const numerator = new Decimal(100)
        .mul(sqrtRatio)
        .sub(vestingPercentage.add(leftoverPercentage).mul(sqrtRatio))
    const denominator = new Decimal(1).add(sqrtRatio)
    return numerator.div(denominator).toNumber()
}

/**
 * Calculate the adjusted percentageSupplyOnMigration that accounts for migrationFee
 *
 * Formula:
 * - D = desiredMarketCap
 * - M = migrationMarketCap
 * - f = migrationFee
 * - V = vesting percentage
 * - L = leftover percentage
 *
 * requiredRatio = sqrt(D / M)
 * percentageSupplyOnMigration = (requiredRatio * (1 - f) * (100 - V - L)) / (1 + requiredRatio * (1 - f))
 */
export function calculateAdjustedPercentageSupplyOnMigration(
    initialMarketCap: number,
    migrationMarketCap: number,
    migrationFee: { feePercentage: number },
    lockedVesting: LockedVestingParameters,
    totalLeftover: BN,
    totalTokenSupply: BN
): number {
    const D = new Decimal(initialMarketCap)
    const M = new Decimal(migrationMarketCap)
    const f = new Decimal(migrationFee.feePercentage).div(100)

    // calculate vesting and leftover percentages
    const totalVestingAmount = getTotalVestingAmount(lockedVesting)
    const V = new Decimal(totalVestingAmount.toString())
        .mul(100)
        .div(new Decimal(totalTokenSupply.toString()))
    const L = new Decimal(totalLeftover.toString())
        .mul(100)
        .div(new Decimal(totalTokenSupply.toString()))

    // requiredRatio = sqrt(D / M)
    const requiredRatio = Decimal.sqrt(D.div(M))

    // percentageSupplyOnMigration = (requiredRatio * (1 - f) * (100 - V - L)) / (1 + requiredRatio * (1 - f))
    const oneMinusF = new Decimal(1).sub(f)
    const availablePercentage = new Decimal(100).sub(V).sub(L)
    const numerator = requiredRatio.mul(oneMinusF).mul(availablePercentage)
    const denominator = new Decimal(1).add(requiredRatio.mul(oneMinusF))
    const percentageSupplyOnMigration = numerator.div(denominator).toNumber()

    return percentageSupplyOnMigration
}

/**
 * Get the migration quote amount
 * @param migrationMarketCap - The migration market cap
 * @param percentageSupplyOnMigration - The percentage of supply on migration
 * @returns The migration quote amount
 */
export const getMigrationQuoteAmount = (
    migrationMarketCap: Decimal,
    percentageSupplyOnMigration: Decimal
): Decimal => {
    // migrationMC * x / 100
    return migrationMarketCap
        .mul(percentageSupplyOnMigration)
        .div(new Decimal(100))
}

/**
 * Get the fee scheduler parameters
 * @param {number} startingBaseFeeBps - Starting fee in basis points
 * @param {number} endingBaseFeeBps - Ending fee in basis points
 * @param {BaseFeeMode} baseFeeMode - Mode for fee reduction (Linear or Exponential)
 * @param {number} numberOfPeriod - Number of periods over which to schedule fee reduction
 * @param {BN} totalDuration - Total duration of the fee scheduler
 *
 * @returns {BaseFee}
 */
export function getFeeSchedulerParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    baseFeeMode: BaseFeeMode,
    numberOfPeriod: number,
    totalDuration: number
): BaseFee {
    if (startingBaseFeeBps == endingBaseFeeBps) {
        if (numberOfPeriod != 0 || totalDuration != 0) {
            throw new Error(
                'numberOfPeriod and totalDuration must both be zero'
            )
        }

        return {
            cliffFeeNumerator: bpsToFeeNumerator(startingBaseFeeBps),
            firstFactor: 0,
            secondFactor: new BN(0),
            thirdFactor: new BN(0),
            baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        }
    }

    if (numberOfPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    if (startingBaseFeeBps > MAX_FEE_BPS) {
        throw new Error(
            `startingBaseFeeBps (${startingBaseFeeBps} bps) exceeds maximum allowed value of ${MAX_FEE_BPS} bps`
        )
    }

    if (endingBaseFeeBps < MIN_FEE_BPS) {
        throw new Error(
            `endingBaseFeeBps (${endingBaseFeeBps} bps) is less than minimum allowed value of ${MIN_FEE_BPS} bps`
        )
    }

    if (endingBaseFeeBps > startingBaseFeeBps) {
        throw new Error(
            'endingBaseFeeBps bps must be less than or equal to startingBaseFeeBps bps'
        )
    }

    if (numberOfPeriod == 0 || totalDuration == 0) {
        throw new Error(
            'numberOfPeriod and totalDuration must both greater than zero'
        )
    }

    const maxBaseFeeNumerator = bpsToFeeNumerator(startingBaseFeeBps)

    const minBaseFeeNumerator = bpsToFeeNumerator(endingBaseFeeBps)

    const periodFrequency = new BN(totalDuration / numberOfPeriod)

    let reductionFactor: BN
    if (baseFeeMode == BaseFeeMode.FeeSchedulerLinear) {
        const totalReduction = maxBaseFeeNumerator.sub(minBaseFeeNumerator)
        reductionFactor = totalReduction.divn(numberOfPeriod)
    } else {
        const ratio = new Decimal(minBaseFeeNumerator.toString()).div(
            new Decimal(maxBaseFeeNumerator.toString())
        )
        const decayBase = ratio.pow(new Decimal(1).div(numberOfPeriod))
        reductionFactor = new BN(
            new Decimal(MAX_BASIS_POINT)
                .mul(new Decimal(1).sub(decayBase))
                .floor()
                .toFixed()
        )
    }

    return {
        cliffFeeNumerator: maxBaseFeeNumerator,
        firstFactor: numberOfPeriod,
        secondFactor: periodFrequency,
        thirdFactor: reductionFactor,
        baseFeeMode,
    }
}

/**
 * Calculate the ending base fee of fee scheduler in basis points
 * @param cliffFeeNumerator - The cliff fee numerator
 * @param numberOfPeriod - The number of period
 * @param reductionFactor - The reduction factor
 * @param feeSchedulerMode - The fee scheduler mode
 * @returns The minimum base fee in basis points
 */
export function calculateFeeSchedulerEndingBaseFeeBps(
    cliffFeeNumerator: number,
    numberOfPeriod: number,
    periodFrequency: number,
    reductionFactor: number,
    baseFeeMode: BaseFeeMode
): number {
    if (numberOfPeriod === 0 || periodFrequency === 0) {
        return (cliffFeeNumerator / FEE_DENOMINATOR) * MAX_BASIS_POINT
    }

    let baseFeeNumerator: number
    if (baseFeeMode == BaseFeeMode.FeeSchedulerLinear) {
        // linear mode
        baseFeeNumerator = cliffFeeNumerator - numberOfPeriod * reductionFactor
    } else {
        // exponential mode
        const decayRate = new Decimal(1).sub(
            new Decimal(reductionFactor).div(MAX_BASIS_POINT)
        )
        baseFeeNumerator = new Decimal(cliffFeeNumerator)
            .mul(decayRate.pow(numberOfPeriod))
            .toNumber()
    }

    // ensure base fee is not negative
    return Math.max(0, (baseFeeNumerator / FEE_DENOMINATOR) * MAX_BASIS_POINT)
}

/**
 * Get the rate limiter parameters
 * @param baseFeeBps - The base fee in basis points
 * @param feeIncrementBps - The fee increment in basis points
 * @param referenceAmount - The reference amount
 * @param maxLimiterDuration - The max rate limiter duration
 * @param tokenQuoteDecimal - The token quote decimal
 * @param activationType - The activation type
 * @returns The rate limiter parameters
 */
export function getRateLimiterParams(
    baseFeeBps: number,
    feeIncrementBps: number,
    referenceAmount: number,
    maxLimiterDuration: number,
    tokenQuoteDecimal: TokenDecimal,
    activationType: ActivationType
): BaseFee {
    const cliffFeeNumerator = bpsToFeeNumerator(baseFeeBps)
    const feeIncrementNumerator = bpsToFeeNumerator(feeIncrementBps)

    if (
        baseFeeBps <= 0 ||
        feeIncrementBps <= 0 ||
        referenceAmount <= 0 ||
        maxLimiterDuration <= 0
    ) {
        throw new Error('All rate limiter parameters must be greater than zero')
    }

    if (baseFeeBps > MAX_FEE_BPS) {
        throw new Error(
            `Base fee (${baseFeeBps} bps) exceeds maximum allowed value of ${MAX_FEE_BPS} bps`
        )
    }

    if (baseFeeBps < MIN_FEE_BPS) {
        throw new Error(
            `Base fee (${baseFeeBps} bps) is less than minimum allowed value of ${MIN_FEE_BPS} bps`
        )
    }

    if (feeIncrementBps > MAX_FEE_BPS) {
        throw new Error(
            `Fee increment (${feeIncrementBps} bps) exceeds maximum allowed value of ${MAX_FEE_BPS} bps`
        )
    }

    if (feeIncrementNumerator.gte(new BN(FEE_DENOMINATOR))) {
        throw new Error(
            'Fee increment numerator must be less than FEE_DENOMINATOR'
        )
    }

    const deltaNumerator = new BN(MAX_FEE_NUMERATOR).sub(cliffFeeNumerator)
    const maxIndex = deltaNumerator.div(feeIncrementNumerator)
    if (maxIndex.lt(new BN(1))) {
        throw new Error('Fee increment is too large for the given base fee')
    }

    if (
        cliffFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        cliffFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        throw new Error('Base fee must be between 0.01% and 99%')
    }

    const maxDuration =
        activationType === ActivationType.Slot
            ? MAX_RATE_LIMITER_DURATION_IN_SLOTS
            : MAX_RATE_LIMITER_DURATION_IN_SECONDS

    if (maxLimiterDuration > maxDuration) {
        throw new Error(
            `Max duration exceeds maximum allowed value of ${maxDuration}`
        )
    }

    const referenceAmountInLamports = convertToLamports(
        referenceAmount,
        tokenQuoteDecimal
    )

    return {
        cliffFeeNumerator,
        firstFactor: feeIncrementBps,
        secondFactor: new BN(maxLimiterDuration),
        thirdFactor: new BN(referenceAmountInLamports),
        baseFeeMode: BaseFeeMode.RateLimiter,
    }
}

/**
 * Get the dynamic fee parameters (20% of base fee)
 * @param baseFeeBps - The base fee in basis points
 * @param maxPriceChangeBps - The max price change in basis points
 * @returns The dynamic fee parameters
 */
export function getDynamicFeeParams(
    baseFeeBps: number,
    maxPriceChangePercentage: number = MAX_PRICE_CHANGE_PERCENTAGE_DEFAULT // default 15%
): DynamicFeeParameters {
    if (maxPriceChangePercentage > MAX_PRICE_CHANGE_PERCENTAGE_DEFAULT) {
        throw new Error(
            `maxPriceChangePercentage (${maxPriceChangePercentage}%) must be less than or equal to ${MAX_PRICE_CHANGE_PERCENTAGE_DEFAULT}`
        )
    }

    const priceRatio = maxPriceChangePercentage / MAX_BASIS_POINT + 1
    // Q64
    const sqrtPriceRatioQ64 = new BN(
        Decimal.sqrt(priceRatio.toString())
            .mul(Decimal.pow(2, 64))
            .floor()
            .toFixed()
    )
    const deltaBinId = sqrtPriceRatioQ64
        .sub(ONE_Q64)
        .div(BIN_STEP_BPS_U128_DEFAULT)
        .muln(2)

    const maxVolatilityAccumulator = new BN(deltaBinId.muln(MAX_BASIS_POINT))

    const squareVfaBin = maxVolatilityAccumulator
        .mul(new BN(BIN_STEP_BPS_DEFAULT))
        .pow(new BN(2))

    const baseFeeNumerator = new BN(bpsToFeeNumerator(baseFeeBps))

    const maxDynamicFeeNumerator = baseFeeNumerator
        .muln(maxPriceChangePercentage)
        .divn(100) // default max dynamic fee = 20% of min base fee
    const vFee = maxDynamicFeeNumerator
        .mul(new BN(100_000_000_000))
        .sub(new BN(99_999_999_999))

    const variableFeeControl = vFee.div(squareVfaBin)

    return {
        binStep: BIN_STEP_BPS_DEFAULT,
        binStepU128: BIN_STEP_BPS_U128_DEFAULT,
        filterPeriod: DYNAMIC_FEE_FILTER_PERIOD_DEFAULT,
        decayPeriod: DYNAMIC_FEE_DECAY_PERIOD_DEFAULT,
        reductionFactor: DYNAMIC_FEE_REDUCTION_FACTOR_DEFAULT,
        maxVolatilityAccumulator: maxVolatilityAccumulator.toNumber(),
        variableFeeControl: variableFeeControl.toNumber(),
    }
}

/**
 * Derive the starting base fee BPS from baseFeeParams
 * For FeeSchedulerLinear/FeeSchedulerExponential: uses endingFeeBps (the fee at end of pre-migration curve)
 * For RateLimiter: uses baseFeeBps (the cliff fee)
 * @param baseFeeParams - The base fee parameters from the pre-migration pool
 * @returns The starting base fee in basis points for the migrated pool
 */
export function getStartingBaseFeeBpsFromBaseFeeParams(
    baseFeeParams: BaseFeeParams
): number {
    if (baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter) {
        return baseFeeParams.rateLimiterParam.baseFeeBps
    } else {
        return baseFeeParams.feeSchedulerParam.endingFeeBps
    }
}

/**
 * Get the migrated pool market cap fee scheduler parameters
 * @param startingBaseFeeBps - The starting base fee in basis points
 * @param endingBaseFeeBps - The ending base fee in basis points
 * @param dammV2BaseFeeMode - The DAMM V2 base fee mode
 * @param numberOfPeriod - The number of periods
 * @param sqrtPriceStepBps - The sqrt price step in basis points
 * @param schedulerExpirationDuration - The scheduler expiration duration
 * @returns The migrated pool market cap fee scheduler parameters
 */
export function getMigratedPoolMarketCapFeeSchedulerParams(
    startingBaseFeeBps: number,
    endingBaseFeeBps: number,
    dammV2BaseFeeMode: DammV2BaseFeeMode,
    numberOfPeriod: number,
    sqrtPriceStepBps: number,
    schedulerExpirationDuration: number
): MigratedPoolMarketCapFeeSchedulerParameters {
    if (
        dammV2BaseFeeMode === DammV2BaseFeeMode.FeeTimeSchedulerLinear ||
        dammV2BaseFeeMode === DammV2BaseFeeMode.FeeTimeSchedulerExponential
    ) {
        return DEFAULT_MIGRATED_POOL_MARKET_CAP_FEE_SCHEDULER_PARAMS
    }

    if (dammV2BaseFeeMode === DammV2BaseFeeMode.RateLimiter) {
        throw new Error(
            'RateLimiter is not supported for DAMM v2 migration. Use either FeeMarketCapSchedulerLinear or FeeMarketCapSchedulerExponential instead.'
        )
    }

    if (numberOfPeriod <= 0) {
        throw new Error('Total periods must be greater than zero')
    }

    const poolMaxFeeBps = MAX_FEE_BPS

    if (startingBaseFeeBps <= endingBaseFeeBps) {
        throw new Error(
            `startingBaseFeeBps (${startingBaseFeeBps} bps) must be greater than endingBaseFeeBps (${endingBaseFeeBps} bps)`
        )
    }

    if (startingBaseFeeBps > poolMaxFeeBps) {
        throw new Error(
            `startingBaseFeeBps (${startingBaseFeeBps} bps) exceeds maximum allowed value of ${poolMaxFeeBps} bps`
        )
    }

    if (
        numberOfPeriod == 0 ||
        sqrtPriceStepBps == 0 ||
        schedulerExpirationDuration == 0
    ) {
        throw new Error(
            'numberOfPeriod, sqrtPriceStepBps, and schedulerExpirationDuration must be greater than zero'
        )
    }

    const maxBaseFeeNumerator = bpsToFeeNumerator(startingBaseFeeBps)
    const minBaseFeeNumerator = bpsToFeeNumerator(endingBaseFeeBps)

    let reductionFactor: BN

    if (dammV2BaseFeeMode === DammV2BaseFeeMode.FeeMarketCapSchedulerLinear) {
        const totalReduction = maxBaseFeeNumerator.sub(minBaseFeeNumerator)
        reductionFactor = totalReduction.divn(numberOfPeriod)
    } else if (
        dammV2BaseFeeMode === DammV2BaseFeeMode.FeeMarketCapSchedulerExponential
    ) {
        const ratio = new Decimal(minBaseFeeNumerator.toString()).div(
            new Decimal(maxBaseFeeNumerator.toString())
        )
        const decayBase = ratio.pow(new Decimal(1).div(numberOfPeriod))
        reductionFactor = new BN(
            new Decimal(MAX_BASIS_POINT)
                .mul(new Decimal(1).sub(decayBase))
                .floor()
                .toFixed()
        )
    }

    return {
        numberOfPeriod,
        sqrtPriceStepBps,
        schedulerExpirationDuration,
        reductionFactor,
    }
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
 * Get the two curve
 * @param migrationSqrPrice - The migration sqrt price
 * @param initialSqrtPrice - The initial sqrt price
 * @param swapAmount - The swap amount
 * @param migrationQuoteThreshold - The migration quote threshold
 * @returns The two curve
 */
export const getTwoCurve = (
    migrationSqrtPrice: BN,
    midSqrtPrice: BN,
    initialSqrtPrice: BN,
    swapAmount: BN,
    migrationQuoteThreshold: BN
) => {
    const p0 = new Decimal(initialSqrtPrice.toString())
    const p1 = new Decimal(midSqrtPrice.toString())
    const p2 = new Decimal(migrationSqrtPrice.toString())

    const a1 = new Decimal(1).div(p0).sub(new Decimal(1).div(p1))
    const b1 = new Decimal(1).div(p1).sub(new Decimal(1).div(p2))
    const c1 = new Decimal(swapAmount.toString())

    const a2 = p1.sub(p0)
    const b2 = p2.sub(p1)
    const c2 = new Decimal(migrationQuoteThreshold.toString()).mul(
        Decimal.pow(2, 128)
    )

    // solve equation to find l0 and l1
    const l0 = c1
        .mul(b2)
        .sub(c2.mul(b1))
        .div(a1.mul(b2).sub(a2.mul(b1)))
    const l1 = c1
        .mul(a2)
        .sub(c2.mul(a1))
        .div(b1.mul(a2).sub(b2.mul(a1)))

    if (l0.isNeg() || l1.isNeg()) {
        return {
            isOk: false,
            sqrtStartPrice: new BN(0),
            curve: [],
        }
    }

    return {
        isOk: true,
        sqrtStartPrice: initialSqrtPrice,
        curve: [
            {
                sqrtPrice: midSqrtPrice,
                liquidity: new BN(l0.floor().toFixed()),
            },
            {
                sqrtPrice: migrationSqrtPrice,
                liquidity: new BN(l1.floor().toFixed()),
            },
        ],
    }
}

/**
 * Check if rate limiter should be applied based on pool configuration and state
 * @param baseFeeMode - The base fee mode
 * @param swapBaseForQuote - Whether the swap is from base to quote
 * @param currentPoint - The current point
 * @param activationPoint - The activation point
 * @param maxLimiterDuration - The maximum limiter duration
 * @returns Whether rate limiter should be applied
 */
export function checkRateLimiterApplied(
    baseFeeMode: BaseFeeMode,
    swapBaseForQuote: boolean,
    currentPoint: BN,
    activationPoint: BN,
    maxLimiterDuration: BN
): boolean {
    return (
        baseFeeMode === BaseFeeMode.RateLimiter &&
        !swapBaseForQuote &&
        currentPoint.gte(activationPoint) &&
        currentPoint.lte(activationPoint.add(maxLimiterDuration))
    )
}

/**
 * Get base fee parameters based on the base fee mode
 * @param baseFeeParams - The base fee parameters
 * @param tokenQuoteDecimal - The token quote decimal
 * @param activationType - The activation type
 * @returns The base fee parameters
 */
export function getBaseFeeParams(
    baseFeeParams: {
        baseFeeMode: BaseFeeMode
        rateLimiterParam?: {
            baseFeeBps: number
            feeIncrementBps: number
            referenceAmount: number
            maxLimiterDuration: number
        }
        feeSchedulerParam?: {
            startingFeeBps: number
            endingFeeBps: number
            numberOfPeriod: number
            totalDuration: number
        }
    },
    tokenQuoteDecimal: TokenDecimal,
    activationType: ActivationType
): BaseFee {
    if (baseFeeParams.baseFeeMode === BaseFeeMode.RateLimiter) {
        if (!baseFeeParams.rateLimiterParam) {
            throw new Error(
                'Rate limiter parameters are required for RateLimiter mode'
            )
        }
        const {
            baseFeeBps,
            feeIncrementBps,
            referenceAmount,
            maxLimiterDuration,
        } = baseFeeParams.rateLimiterParam

        return getRateLimiterParams(
            baseFeeBps,
            feeIncrementBps,
            referenceAmount,
            maxLimiterDuration,
            tokenQuoteDecimal,
            activationType
        )
    } else {
        if (!baseFeeParams.feeSchedulerParam) {
            throw new Error(
                'Fee scheduler parameters are required for FeeScheduler mode'
            )
        }
        const { startingFeeBps, endingFeeBps, numberOfPeriod, totalDuration } =
            baseFeeParams.feeSchedulerParam

        return getFeeSchedulerParams(
            startingFeeBps,
            endingFeeBps,
            baseFeeParams.baseFeeMode,
            numberOfPeriod,
            totalDuration
        )
    }
}

/**
 * Get the quote token amount from sqrt price
 * @param nextSqrtPrice - The next sqrt price
 * @param config - The pool configuration
 * @returns The total quote token amount
 */
export function getQuoteReserveFromNextSqrtPrice(
    nextSqrtPrice: BN,
    config: PoolConfig
): BN {
    let totalAmount = new BN(0)

    for (let i = 0; i < config.curve.length; i++) {
        const lowerSqrtPrice =
            i === 0 ? config.sqrtStartPrice : config.curve[i - 1].sqrtPrice

        if (nextSqrtPrice.gt(lowerSqrtPrice)) {
            const upperSqrtPrice = nextSqrtPrice.lt(config.curve[i].sqrtPrice)
                ? nextSqrtPrice
                : config.curve[i].sqrtPrice

            const maxAmountIn = getDeltaAmountQuoteUnsigned(
                lowerSqrtPrice,
                upperSqrtPrice,
                config.curve[i].liquidity,
                Rounding.Up
            )

            totalAmount = totalAmount.add(maxAmountIn)
        }
    }

    return totalAmount
}

/**
 * Get the tokenomics
 * @param initialMarketCap - The initial market cap
 * @param migrationMarketCap - The migration market cap
 * @param totalLockedVestingAmount - The total locked vesting amount
 * @param totalLeftover - The total leftover
 * @param totalTokenSupply - The total token supply
 * @returns The tokenomics
 */
export const getTokenomics = (
    initialMarketCap: Decimal,
    migrationMarketCap: Decimal,
    totalLockedVestingAmount: BN,
    totalLeftover: BN,
    totalTokenSupply: BN
): {
    bondingCurveSupply: BN
    migrationSupply: BN
    leftoverSupply: BN
    lockedVestingSupply: BN
} => {
    // formula: x = sqrt(initialMC / migrationMC) * (100 - lockedVesting - leftover) / (1 + sqrt(initialMC / migrationMC))

    // sqrtRatio = sqrt(initial_MC / migration_MC)
    const marketCapRatio = initialMarketCap.div(migrationMarketCap)
    const sqrtRatio = Decimal.sqrt(marketCapRatio)

    // locked vesting percentage
    const vestingPercentage = new Decimal(totalLockedVestingAmount.toString())
        .mul(new Decimal(100))
        .div(new Decimal(totalTokenSupply.toString()))

    // leftover percentage
    const leftoverPercentage = new Decimal(totalLeftover.toString())
        .mul(new Decimal(100))
        .div(new Decimal(totalTokenSupply.toString()))

    // (100 * sqrtRatio - (vestingPercentage + leftoverPercentage) * sqrtRatio) / (1 + sqrtRatio)
    const percentageSupplyOnMigration = new Decimal(100)
        .mul(sqrtRatio)
        .sub(vestingPercentage.add(leftoverPercentage).mul(sqrtRatio))
    const denominator = new Decimal(1).add(sqrtRatio)

    // Calculate migration supply as BN
    const migrationSupplyDecimal = percentageSupplyOnMigration
        .div(denominator)
        .mul(new Decimal(totalTokenSupply.toString()))
        .div(new Decimal(100))
    const migrationSupply = new BN(migrationSupplyDecimal.floor().toFixed())

    // Calculate bonding curve supply (remaining after subtracting known amounts)
    const bondingCurveSupply = totalTokenSupply
        .sub(migrationSupply)
        .sub(totalLeftover)
        .sub(totalLockedVestingAmount)

    return {
        bondingCurveSupply: bondingCurveSupply,
        migrationSupply: migrationSupply,
        leftoverSupply: totalLeftover,
        lockedVestingSupply: totalLockedVestingAmount,
    }
}

/**
 * Get migrated pool fee parameters based on migration options
 * @param migrationOption - The migration option (DAMM or DAMM_V2)
 * @param migrationFeeOption - The fee option (fixed rates 0-5 or customizable)
 * @param migratedPoolFee - Optional custom migrated pool fee parameters (only used with DAMM_V2 + Customizable)
 * @returns Migrated pool fee parameters with appropriate defaults
 */
export function getMigratedPoolFeeParams(
    migrationOption: MigrationOption,
    migrationFeeOption: MigrationFeeOption,
    migratedPoolFee?: MigratedPoolFee
): {
    collectFeeMode: CollectFeeMode
    dynamicFee: DammV2DynamicFeeMode
    poolFeeBps: number
} {
    // Default fee parameters for non-customizable scenarios
    const defaultFeeParams = {
        collectFeeMode: 0,
        dynamicFee: 0,
        poolFeeBps: 0,
    } as const

    // For DAMM_V1: always use default parameters
    if (migrationOption === MigrationOption.MET_DAMM) {
        return defaultFeeParams
    }

    // For DAMM_V2: use custom parameters only if Customizable option is selected
    if (migrationOption === MigrationOption.MET_DAMM_V2) {
        if (migrationFeeOption === MigrationFeeOption.Customizable) {
            return migratedPoolFee
        }
        // For fixed fee options (0-5), always use defaults
        return defaultFeeParams
    }

    return defaultFeeParams
}

/**
 * Get the current point based on activation type
 * @param connection - The Solana connection instance
 * @param activationType - The activation type (Slot or Time)
 * @returns The current point as a BN
 */
export async function getCurrentPoint(
    connection: Connection,
    activationType: ActivationType
): Promise<BN> {
    const currentSlot = await connection.getSlot()

    if (activationType === ActivationType.Slot) {
        return new BN(currentSlot)
    } else {
        const currentTime = await connection.getBlockTime(currentSlot)
        return new BN(currentTime)
    }
}

/**
 * Prepare the swap amount param
 * @param amount - The amount to swap
 * @param mintAddress - The mint address
 * @param connection - The Solana connection instance
 * @returns The amount in lamports
 */
export async function prepareSwapAmountParam(
    amount: number,
    mintAddress: PublicKey,
    connection: Connection
): Promise<BN> {
    const mintTokenDecimals = await getTokenDecimals(connection, mintAddress)

    return convertToLamports(amount, mintTokenDecimals)
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
