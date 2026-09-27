import { getBaseTokenForSwap } from './price'
import { getTotalVestingAmount } from './vesting'

import {
    MigratedCollectFeeMode,
    MigrationOption,
    Rounding,
    type LiquidityDistributionParameters,
    type LockedVestingParameters,
} from '../types'
import {
    MAX_BASIS_POINT,
    DAMM_V2_COMPOUNDING_DEAD_LIQUIDITY,
    MAX_SQRT_PRICE,
    MIN_SQRT_PRICE,
    PROTOCOL_LIQUIDITY_MIGRATION_FEE_BPS,
    U64_MAX,
    SWAP_BUFFER_PERCENTAGE,
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
import { mulDiv, sqrt } from '../math/utilsMath'
import {
    calculateTransferFeeExcludedAmount,
    type EpochTransferFee,
} from '../math/transferFee'

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
 * @param migratedCollectFeeMode - Migrated DAMM v2 collect fee mode
 * @returns [baseFeeAmount: BN, quoteFeeAmount: BN]
 */
export function getProtocolMigrationFee(
    depositBaseAmount: BN,
    depositQuoteAmount: BN,
    migrationSqrtPrice: BN,
    migrationFeeBps: number,
    migrationOption: MigrationOption,
    migratedCollectFeeMode: MigratedCollectFeeMode = MigratedCollectFeeMode.QuoteToken
): [BN, BN] {
    // quote fee amount = (depositQuoteAmount * migrationFeeBps) / MAX_BASIS_POINT
    const quoteFeeAmount = mulDiv(
        depositQuoteAmount,
        new BN(migrationFeeBps),
        new BN(MAX_BASIS_POINT),
        Rounding.Down
    )

    if (
        migrationOption === MigrationOption.MET_DAMM ||
        migratedCollectFeeMode === MigratedCollectFeeMode.Compounding
    ) {
        // DAMM v1 and compounding DAMM v2 migration: fee as same ratio for base
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
 * Get the constant product base amount for a quote amount at a sqrt price
 * @param migrationQuoteAmount - The migration quote amount
 * @param sqrtMigrationPrice - The migration sqrt price
 * @returns The base amount, rounded up
 */
export function constantProductBaseFromQuote(
    migrationQuoteAmount: BN,
    sqrtMigrationPrice: BN
): BN {
    if (sqrtMigrationPrice.isZero()) {
        throw new Error('Math overflow')
    }
    const price = sqrtMigrationPrice.mul(sqrtMigrationPrice)
    const quote = migrationQuoteAmount.shln(128)
    const { div, mod } = quote.divmod(price)
    const base = mod.isZero() ? div : div.add(new BN(1))
    if (base.gt(U64_MAX)) {
        throw new Error('Math overflow')
    }
    return base
}

/**
 * Get the base token for migration
 * @param migrationQuoteAmount - The migration quote amount to deposit to pool
 * @param sqrtMigrationPrice - The migration sqrt price
 * @param migrationOption - The migration option
 * @param migratedCollectFeeMode - Migrated DAMM v2 collect fee mode. Compounding uses constant product.
 * @returns The base token
 */
export const getMigrationBaseToken = (
    migrationQuoteAmount: BN,
    sqrtMigrationPrice: BN,
    migrationOption: MigrationOption,
    migratedCollectFeeMode: MigratedCollectFeeMode = MigratedCollectFeeMode.QuoteToken
): BN => {
    if (
        migrationOption == MigrationOption.MET_DAMM ||
        migratedCollectFeeMode === MigratedCollectFeeMode.Compounding
    ) {
        return constantProductBaseFromQuote(
            migrationQuoteAmount,
            sqrtMigrationPrice
        )
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
 * Get the quote amount a migration threshold deposits into the migrated pool
 * @param migrationQuoteThreshold - The migration quote threshold in lamports
 * @param migrationFeePercentage - The migration fee percentage
 * @returns The migration quote amount in lamports, rounded up
 */
export function getMigrationQuoteAmountFromThreshold(
    migrationQuoteThreshold: BN,
    migrationFeePercentage: number
): BN {
    return mulDiv(
        migrationQuoteThreshold,
        new BN(100 - migrationFeePercentage),
        new BN(100),
        Rounding.Up
    )
}

/**
 * Get the quote amount that sizes a migration base amount at a sqrt price
 * @param migrationBaseAmount - The migration base amount
 * @param sqrtMigrationPrice - The migration sqrt price
 * @param migrationOption - The migration option
 * @param migratedCollectFeeMode - Migrated DAMM v2 collect fee mode. Compounding uses constant product.
 * @returns The migration quote amount, rounded down
 */
export function getMigrationQuoteAmountFromMigrationBase(
    migrationBaseAmount: BN,
    sqrtMigrationPrice: BN,
    migrationOption: MigrationOption,
    migratedCollectFeeMode: MigratedCollectFeeMode = MigratedCollectFeeMode.QuoteToken
): BN {
    if (
        migrationOption === MigrationOption.MET_DAMM ||
        migratedCollectFeeMode === MigratedCollectFeeMode.Compounding
    ) {
        return migrationBaseAmount
            .mul(sqrtMigrationPrice)
            .mul(sqrtMigrationPrice)
            .shrn(128)
    } else if (migrationOption === MigrationOption.MET_DAMM_V2) {
        const liquidity = getInitialLiquidityFromDeltaBase(
            migrationBaseAmount,
            MAX_SQRT_PRICE,
            sqrtMigrationPrice
        )
        return getDeltaAmountQuoteUnsigned(
            MIN_SQRT_PRICE,
            sqrtMigrationPrice,
            liquidity,
            Rounding.Down
        )
    } else {
        throw Error('Invalid migration option')
    }
}

/**
 * Get the migration base amount per unit of migration quote at a sqrt price
 * @param sqrtMigrationPrice - The migration sqrt price
 * @param migrationOption - The migration option
 * @param migratedCollectFeeMode - Migrated DAMM v2 collect fee mode. Compounding uses constant product.
 * @returns The migration base weight, unrounded
 */
export function getMigrationBaseWeight(
    sqrtMigrationPrice: BN,
    migrationOption: MigrationOption,
    migratedCollectFeeMode: MigratedCollectFeeMode
): Decimal {
    const p = new Decimal(sqrtMigrationPrice.toString())
    if (
        migrationOption === MigrationOption.MET_DAMM ||
        migratedCollectFeeMode === MigratedCollectFeeMode.Compounding
    ) {
        return new Decimal(1).div(p.mul(p))
    }
    const maxSqrtPrice = new Decimal(MAX_SQRT_PRICE.toString())
    const minSqrtPrice = new Decimal(MIN_SQRT_PRICE.toString())
    return maxSqrtPrice.sub(p).div(p.sub(minSqrtPrice).mul(p).mul(maxSqrtPrice))
}

function migrationDepositAmounts(
    baseBudget: BN,
    quoteBudget: BN,
    baseAmount: BN,
    quoteAmount: BN
): [BN, BN] {
    if (baseAmount.eq(baseBudget) && quoteAmount.eq(quoteBudget)) {
        return [baseBudget, quoteBudget]
    }

    const baseSideBinds = baseAmount
        .mul(quoteBudget)
        .lte(quoteAmount.mul(baseBudget))
    const depositBase = baseSideBinds
        ? baseAmount
        : mulDiv(baseBudget, quoteAmount, quoteBudget, Rounding.Down)
    const depositQuote = baseSideBinds
        ? mulDiv(quoteBudget, baseAmount, baseBudget, Rounding.Down)
        : quoteAmount

    if (depositBase.isZero() || depositQuote.isZero()) {
        throw new Error('Amount is zero')
    }
    return [depositBase, depositQuote]
}

function compoundingInitialSqrtPriceAndLiquidity(
    baseAmount: BN,
    quoteAmount: BN
): { sqrtPrice: BN; liquidity: BN } {
    if (baseAmount.isZero()) {
        throw new Error('Math overflow')
    }
    const shiftedQuote = quoteAmount.shln(128)
    const sqrtPrice = sqrt(
        shiftedQuote.add(baseAmount).sub(new BN(1)).div(baseAmount)
    )
    if (sqrtPrice.lt(MIN_SQRT_PRICE) || sqrtPrice.gt(MAX_SQRT_PRICE)) {
        throw new Error(
            'Invalid compounding parameters: the migration deposit sqrt price is out of range'
        )
    }
    const liquidity = sqrt(shiftedQuote.div(baseAmount)).mul(baseAmount)
    return { sqrtPrice, liquidity }
}

/**
 * Validate the compounding DAMM v2 deposit a config migrates with, after protocol and transfer fees.
 * Throws when the pool would start below dead liquidity or more than 1% away from the migration price.
 */
export function validateCompoundingMigrationDeposit(params: {
    migrationQuoteThreshold: BN
    migrationFeePercentage: number
    migrationSqrtPrice: BN
    baseTransferFee?: EpochTransferFee | null
    quoteTransferFee?: EpochTransferFee | null
}): void {
    const quoteAmount = getMigrationQuoteAmountFromThreshold(
        params.migrationQuoteThreshold,
        params.migrationFeePercentage
    )
    const baseAmount = constantProductBaseFromQuote(
        quoteAmount,
        params.migrationSqrtPrice
    )
    const [protocolBaseFee, protocolQuoteFee] = getProtocolMigrationFee(
        baseAmount,
        quoteAmount,
        params.migrationSqrtPrice,
        PROTOCOL_LIQUIDITY_MIGRATION_FEE_BPS,
        MigrationOption.MET_DAMM_V2,
        MigratedCollectFeeMode.Compounding
    )
    const excludedProtocolBase = baseAmount.sub(protocolBaseFee)
    const excludedProtocolQuote = quoteAmount.sub(protocolQuoteFee)
    const excludedTransferBase = calculateTransferFeeExcludedAmount(
        params.baseTransferFee ?? null,
        excludedProtocolBase
    ).amount
    const excludedTransferQuote = calculateTransferFeeExcludedAmount(
        params.quoteTransferFee ?? null,
        excludedProtocolQuote
    ).amount
    const [depositBase, depositQuote] = migrationDepositAmounts(
        excludedProtocolBase,
        excludedProtocolQuote,
        excludedTransferBase,
        excludedTransferQuote
    )
    const { sqrtPrice, liquidity } = compoundingInitialSqrtPriceAndLiquidity(
        depositBase,
        depositQuote
    )
    if (liquidity.lte(DAMM_V2_COMPOUNDING_DEAD_LIQUIDITY)) {
        throw new Error('Insufficient liquidity for migration')
    }
    const priceGap = params.migrationSqrtPrice.sub(sqrtPrice).abs()
    const largerPrice = BN.max(params.migrationSqrtPrice, sqrtPrice)
    if (priceGap.mul(new BN(100)).gt(largerPrice)) {
        throw new Error(
            'Invalid curve: the compounding migration deposit is more than 1% away from the migration price'
        )
    }
}

/**
 * Get the total vesting amount
 * @param lockedVesting - The locked vesting
 * @returns The total vesting amount
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
 * @param migrationSqrtPrice - The migration sqrt price
 * @param swapAmount - The swap amount
 * @param migrationQuoteThreshold - The migration quote threshold
 * @returns The first curve
 */
export const getFirstCurve = (
    migrationSqrtPrice: BN,
    swapAmount: BN,
    migrationQuoteThreshold: BN
) => {
    // Swap_amount = L * (Pmax - Pmin) / (Pmax * Pmin)      (1)
    // Quote_amount = L * (Pmax - Pmin) / 2^128             (2)
    // From (1) and (2) => Pmin = Quote_amount * 2^128 / (Swap_amount * Pmax)
    const sqrtStartPrice = migrationQuoteThreshold
        .shln(128)
        .div(swapAmount.mul(migrationSqrtPrice))

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
 * @param migratedCollectFeeMode - Migrated DAMM v2 collect fee mode
 * @returns The total supply
 */
export const getTotalSupplyFromCurve = (
    migrationQuoteThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>,
    lockedVesting: LockedVestingParameters,
    migrationOption: MigrationOption,
    leftover: BN,
    migrationFeePercent: number,
    migratedCollectFeeMode: MigratedCollectFeeMode = MigratedCollectFeeMode.QuoteToken
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

    const migrationQuoteAmount = getMigrationQuoteAmountFromThreshold(
        migrationQuoteThreshold,
        migrationFeePercent
    )
    const migrationBaseAmount = getMigrationBaseToken(
        migrationQuoteAmount,
        sqrtMigrationPrice,
        migrationOption,
        migratedCollectFeeMode
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
