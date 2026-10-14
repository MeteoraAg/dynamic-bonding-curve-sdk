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
    PARTNER_AND_CREATOR_SURPLUS_SHARE,
} from '../constants'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
    getDeltaAmountQuoteUnsigned256,
    getInitialLiquidityFromDeltaBase,
    getInitialLiquidityFromDeltaQuote,
    getNextSqrtPriceFromInput,
    liveCurve,
} from '../math/curve'
import { mulDiv, sqrt } from '../math/utilsMath'
import { SafeMath } from '../math/safeMath'
import { fromDecimalToBN } from './utils'
import {
    calculateTransferFeeExcludedAmount,
    type EpochTransferFee,
} from '../math/transferFee'
import { ProgramError } from '../math/errors'

/** The base supply a config needs: swap base, migration base and locked vesting (u64). */
export function getTotalTokenSupply(
    swapBaseAmount: BN,
    migrationBaseThreshold: BN,
    lockedVestingParams: LockedVestingParameters
): BN {
    const totalAmount = swapBaseAmount
        .add(migrationBaseThreshold)
        .add(getTotalVestingAmount(lockedVestingParams))
    if (totalAmount.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return totalAmount
}

/**
 * Unrounded quote amount deposited after the migration fee, for sizing a curve.
 * getMigrationQuoteAmountFromThreshold is the program's rounded-up integer form.
 */
export const getMigrationQuoteAmountFromMigrationQuoteThreshold = (
    migrationQuoteThreshold: Decimal,
    migrationFeePercent: number
): Decimal =>
    migrationQuoteThreshold
        .mul(new Decimal(100).sub(new Decimal(migrationFeePercent)))
        .div(new Decimal(100))

/** Unrounded migration quote threshold that deposits migrationQuoteAmount after the fee. */
export const getMigrationQuoteThresholdFromMigrationQuoteAmount = (
    migrationQuoteAmount: Decimal,
    migrationFeePercent: Decimal
): Decimal =>
    migrationQuoteAmount
        .mul(new Decimal(100))
        .div(new Decimal(100).sub(new Decimal(migrationFeePercent)))

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
        throw new Error(ProgramError.InvalidMigrationOption)
    }
}

/**
 * Get the constant product base amount for a quote amount at a sqrt price
 * @param sqrtMigrationPrice - The migration sqrt price
 * @returns The base amount, rounded up
 */
export function constantProductBaseFromQuote(
    migrationQuoteAmount: BN,
    sqrtMigrationPrice: BN
): BN {
    if (sqrtMigrationPrice.isZero()) {
        throw new Error(ProgramError.MathOverflow)
    }
    const price = sqrtMigrationPrice.mul(sqrtMigrationPrice)
    const quote = migrationQuoteAmount.shln(128)
    const { div, mod } = quote.divmod(price)
    const base = mod.isZero() ? div : div.add(new BN(1))
    if (base.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return base
}

/**
 * Get the base token for migration
 * @param migrationQuoteAmount - The migration quote amount to deposit to pool
 * @param sqrtMigrationPrice - The migration sqrt price
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
        migrationOption === MigrationOption.MET_DAMM ||
        migratedCollectFeeMode === MigratedCollectFeeMode.Compounding
    ) {
        return constantProductBaseFromQuote(
            migrationQuoteAmount,
            sqrtMigrationPrice
        )
    } else if (migrationOption === MigrationOption.MET_DAMM_V2) {
        const liquidity = getInitialLiquidityFromDeltaQuote(
            migrationQuoteAmount,
            MIN_SQRT_PRICE,
            sqrtMigrationPrice
        )
        return getDeltaAmountBaseUnsigned(
            sqrtMigrationPrice,
            MAX_SQRT_PRICE,
            liquidity,
            Rounding.Up
        )
    } else {
        throw new Error(ProgramError.InvalidMigrationOption)
    }
}

/**
 * Get the quote amount a migration threshold deposits into the migrated pool
 * @param migrationQuoteThreshold - The migration quote threshold in lamports
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
 * @param sqrtMigrationPrice - The migration sqrt price
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
        throw new Error(ProgramError.InvalidMigrationOption)
    }
}

/**
 * Get the migration base amount per unit of migration quote at a sqrt price
 * @param sqrtMigrationPrice - The migration sqrt price
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

/** Quote rounds down and base rounds up, so the price stays at or below the budget ratio. */
export function getMigrationDepositAmounts(
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
        : mulDiv(baseBudget, quoteAmount, quoteBudget, Rounding.Up)
    const depositQuote = baseSideBinds
        ? mulDiv(quoteBudget, baseAmount, baseBudget, Rounding.Down)
        : quoteAmount

    if (depositBase.isZero() || depositQuote.isZero()) {
        throw new Error(ProgramError.AmountIsZero)
    }
    return [depositBase, depositQuote]
}

const SPLIT_POSITION_DENOMINATOR = new BN(1_000_000_000)

export type TransferFeeMigrationPositionSplit = {
    numerator: BN
    secondPositionLiquidity: BN
    secondPosition: 'partner' | 'creator'
}

function assertWholePercentage(name: string, percentage: number): void {
    if (!Number.isInteger(percentage) || percentage < 0 || percentage > 100) {
        throw new Error(`${name} must be an integer from 0 to 100`)
    }
}

/**
 * Liquidity moved into the second DAMM v2 position on a transfer-fee migration.
 * The percentage is the configured share, not the sum of the rounded liquidity buckets.
 */
export function getTransferFeeMigrationPositionSplit(params: {
    distributableLiquidity: BN
    partnerLiquidityPercentage: number
    partnerPermanentLockedLiquidityPercentage: number
    partnerVestingPercentage: number
}): TransferFeeMigrationPositionSplit {
    assertWholePercentage(
        'partnerLiquidityPercentage',
        params.partnerLiquidityPercentage
    )
    assertWholePercentage(
        'partnerPermanentLockedLiquidityPercentage',
        params.partnerPermanentLockedLiquidityPercentage
    )
    assertWholePercentage(
        'partnerVestingPercentage',
        params.partnerVestingPercentage
    )

    const partnerPercentage =
        params.partnerLiquidityPercentage +
        params.partnerPermanentLockedLiquidityPercentage +
        params.partnerVestingPercentage
    if (partnerPercentage > 100) {
        throw new Error('Invalid liquidity percentage')
    }

    const liquidity = params.distributableLiquidity
    const partnerTotal = liquidity
        .muln(params.partnerLiquidityPercentage)
        .divn(100)
        .add(
            liquidity
                .muln(params.partnerPermanentLockedLiquidityPercentage)
                .divn(100)
        )
        .add(liquidity.muln(params.partnerVestingPercentage).divn(100))
    const creatorTotal = liquidity.sub(partnerTotal)
    const secondPosition = partnerTotal.gt(creatorTotal) ? 'creator' : 'partner'
    const percentage =
        secondPosition === 'creator'
            ? 100 - partnerPercentage
            : partnerPercentage
    const numerator = SPLIT_POSITION_DENOMINATOR.divn(100).muln(percentage)

    return {
        numerator,
        secondPositionLiquidity: mulDiv(
            liquidity,
            numerator,
            SPLIT_POSITION_DENOMINATOR,
            Rounding.Down
        ),
        secondPosition,
    }
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
    const [depositBase, depositQuote] = getMigrationDepositAmounts(
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

const getLiquidity = (
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

/** One constant product segment that reaches migrationQuoteThreshold with swapAmount base. */
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
 * @param sqrtStartPrice - The start sqrt price
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
    return swapBaseAmountBuffer
        .add(migrationBaseAmount)
        .add(getTotalVestingAmount(lockedVesting))
        .add(leftover)
}

/**
 * The sqrt price at which the curve has taken migrationThreshold quote,
 * the program's get_migration_threshold_price (Rounding::Up per segment).
 */
export const getMigrationThresholdPrice = (
    migrationThreshold: BN,
    sqrtStartPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN => {
    const points = liveCurve(curve)
    if (points.length === 0) {
        throw new Error('Curve is empty')
    }

    let amountLeft = migrationThreshold
    let sqrtPrice = sqrtStartPrice
    for (const point of points) {
        const maxAmount = getDeltaAmountQuoteUnsigned256(
            sqrtPrice,
            point.sqrtPrice,
            point.liquidity,
            Rounding.Up
        )
        if (maxAmount.gt(amountLeft)) {
            return getNextSqrtPriceFromInput(
                sqrtPrice,
                point.liquidity,
                amountLeft,
                false
            )
        }
        amountLeft = SafeMath.sub(amountLeft, maxAmount)
        sqrtPrice = point.sqrtPrice
    }
    if (!amountLeft.isZero()) {
        throw new Error(
            `${ProgramError.NotEnoughLiquidity}: the curve holds ${migrationThreshold.sub(amountLeft).toString()} quote, the threshold is ${migrationThreshold.toString()}`
        )
    }
    return sqrtPrice
}

/**
 * Split a migration quote threshold across the curve segments.
 * A segment holds L * (√P_upper - √P_lower) quote, rounded up like the program.
 * Segments past the threshold get zero, and finalSqrtPrice is where the
 * threshold is reached.
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
    const points = liveCurve(curve)
    if (points.length === 0) {
        throw new Error('Curve is empty')
    }

    const segmentAmounts: BN[] = []
    let remaining = migrationQuoteThreshold
    let lowerSqrtPrice = sqrtStartPrice
    let finalSqrtPrice = sqrtStartPrice

    for (const { sqrtPrice: upperSqrtPrice, liquidity } of points) {
        if (remaining.isZero()) {
            segmentAmounts.push(new BN(0))
            continue
        }

        const maxSegmentAmount = getDeltaAmountQuoteUnsigned256(
            lowerSqrtPrice,
            upperSqrtPrice,
            liquidity,
            Rounding.Up
        )

        if (maxSegmentAmount.gt(remaining)) {
            segmentAmounts.push(remaining)
            finalSqrtPrice = getNextSqrtPriceFromInput(
                lowerSqrtPrice,
                liquidity,
                remaining,
                false
            )
            remaining = new BN(0)
        } else {
            segmentAmounts.push(maxSegmentAmount)
            finalSqrtPrice = upperSqrtPrice
            remaining = remaining.sub(maxSegmentAmount)
            lowerSqrtPrice = upperSqrtPrice
        }
    }

    if (!remaining.isZero()) {
        throw new Error(
            `${ProgramError.NotEnoughLiquidity}: the curve holds ${migrationQuoteThreshold.sub(remaining).toString()} quote, the threshold is ${migrationQuoteThreshold.toString()}`
        )
    }

    return {
        segmentAmounts,
        finalSqrtPrice,
        totalAmount: migrationQuoteThreshold,
    }
}

/**
 * Get the swap amount with buffer
 * @param sqrtStartPrice - The start sqrt price
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
    const swapAmountWithBuffer = BN.min(swapAmountBuffer, maxBaseAmountOnCurve)
    if (swapAmountWithBuffer.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return swapAmountWithBuffer
}

// x = r * (100 - V - L) / (1 + r) with r = sqrt(initialMC / migrationMC) * (1 - f),
// V and L the vesting and leftover shares of the total supply in percent
function migrationSupplyPercentage(
    initialMarketCap: Decimal,
    migrationMarketCap: Decimal,
    feePercentage: number,
    totalVestingAmount: BN,
    totalLeftover: BN,
    totalTokenSupply: BN
): Decimal {
    const r = initialMarketCap
        .div(migrationMarketCap)
        .sqrt()
        .mul(new Decimal(100 - feePercentage).div(100))
    const supply = new Decimal(totalTokenSupply.toString())
    const vestingPercentage = new Decimal(totalVestingAmount.toString())
        .mul(100)
        .div(supply)
    const leftoverPercentage = new Decimal(totalLeftover.toString())
        .mul(100)
        .div(supply)
    return r
        .mul(new Decimal(100).sub(vestingPercentage).sub(leftoverPercentage))
        .div(new Decimal(1).add(r))
}

/** Percentage of the supply on migration for a market cap pair without a migration fee. */
export const getPercentageSupplyOnMigration = (
    initialMarketCap: Decimal,
    migrationMarketCap: Decimal,
    lockedVesting: LockedVestingParameters,
    totalLeftover: BN,
    totalTokenSupply: BN
): number =>
    migrationSupplyPercentage(
        initialMarketCap,
        migrationMarketCap,
        0,
        getTotalVestingAmount(lockedVesting),
        totalLeftover,
        totalTokenSupply
    ).toNumber()

/** Percentage of the supply on migration, with the migration fee taken off the deposit. */
export function calculateAdjustedPercentageSupplyOnMigration(
    initialMarketCap: number,
    migrationMarketCap: number,
    migrationFee: { feePercentage: number },
    lockedVesting: LockedVestingParameters,
    totalLeftover: BN,
    totalTokenSupply: BN
): number {
    return migrationSupplyPercentage(
        new Decimal(initialMarketCap),
        new Decimal(migrationMarketCap),
        migrationFee.feePercentage,
        getTotalVestingAmount(lockedVesting),
        totalLeftover,
        totalTokenSupply
    ).toNumber()
}

/**
 * Get the migration quote amount
 * @param percentageSupplyOnMigration - The percentage of supply on migration
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
 * Two constant product segments through midSqrtPrice that reach
 * migrationQuoteThreshold with swapAmount base. isOk is false when a segment
 * would need negative liquidity.
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

/** Supply split for a market cap pair: bonding curve, migration, leftover and locked vesting. */
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
    const migrationSupply = fromDecimalToBN(
        migrationSupplyPercentage(
            initialMarketCap,
            migrationMarketCap,
            0,
            totalLockedVestingAmount,
            totalLeftover,
            totalTokenSupply
        )
            .mul(new Decimal(totalTokenSupply.toString()))
            .div(100)
    )

    return {
        bondingCurveSupply: totalTokenSupply
            .sub(migrationSupply)
            .sub(totalLeftover)
            .sub(totalLockedVestingAmount),
        migrationSupply,
        leftoverSupply: totalLeftover,
        lockedVestingSupply: totalLockedVestingAmount,
    }
}

/**
 * The surplus the program pays out once the curve is complete: the quote
 * reserve above the migration threshold. Partner and creator share
 * PARTNER_AND_CREATOR_SURPLUS_SHARE percent of it, split by the creator
 * trading fee percentage with the creator rounded down, and the protocol
 * keeps the rest. Every amount is zero before the curve completes.
 */
export function getSurplusBreakdown(
    quoteReserve: BN,
    migrationQuoteThreshold: BN,
    creatorTradingFeePercentage: number
): { total: BN; partner: BN; creator: BN; protocol: BN } {
    if (quoteReserve.lt(migrationQuoteThreshold)) {
        const zero = new BN(0)
        return { total: zero, partner: zero, creator: zero, protocol: zero }
    }
    const total = quoteReserve.sub(migrationQuoteThreshold)
    const partnerAndCreator = total
        .muln(PARTNER_AND_CREATOR_SURPLUS_SHARE)
        .divn(100)
    const creator = partnerAndCreator
        .muln(creatorTradingFeePercentage)
        .divn(100)
    return {
        total,
        partner: partnerAndCreator.sub(creator),
        creator,
        protocol: total.sub(partnerAndCreator),
    }
}
