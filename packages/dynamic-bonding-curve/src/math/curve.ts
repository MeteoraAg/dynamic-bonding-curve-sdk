import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import { RESOLUTION, U128_MAX, U64_MAX } from '../constants'
import { Rounding } from '../types'
import { ProgramError } from './errors'

function requireU64(value: BN): BN {
    if (value.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return value
}

function requireU128(value: BN): BN {
    if (value.gt(U128_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return value
}

/** L = Δb / (√P_upper - √P_lower), rounded down, bounded by u128. */
export function getInitialLiquidityFromDeltaQuote(
    quoteAmount: BN,
    sqrtMinPrice: BN,
    sqrtPrice: BN
): BN {
    const priceDelta = SafeMath.sub(sqrtPrice, sqrtMinPrice)
    return requireU128(SafeMath.div(SafeMath.shl(quoteAmount, 128), priceDelta))
}

/** L = Δa * √P_lower * √P_upper / (√P_upper - √P_lower), rounded down. */
export function getInitialLiquidityFromDeltaBase(
    baseAmount: BN,
    sqrtMaxPrice: BN,
    sqrtPrice: BN
): BN {
    const priceDelta = SafeMath.sub(sqrtMaxPrice, sqrtPrice)
    const prod = SafeMath.mul(SafeMath.mul(baseAmount, sqrtPrice), sqrtMaxPrice)
    return SafeMath.div(prod, priceDelta)
}

/** Δa = L * (√P_upper - √P_lower) / (√P_upper * √P_lower), bounded by u64. */
export function getDeltaAmountBaseUnsigned(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    return requireU64(
        getDeltaAmountBaseUnsigned256(
            lowerSqrtPrice,
            upperSqrtPrice,
            liquidity,
            round
        )
    )
}

/** Δa = L * (√P_upper - √P_lower) / (√P_upper * √P_lower), unbounded. */
export function getDeltaAmountBaseUnsigned256(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const numerator = SafeMath.sub(upperSqrtPrice, lowerSqrtPrice)
    const denominator = SafeMath.mul(lowerSqrtPrice, upperSqrtPrice)
    return mulDiv(liquidity, numerator, denominator, round)
}

/** Δb = L * (√P_upper - √P_lower), bounded by u64. */
export function getDeltaAmountQuoteUnsigned(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    return requireU64(
        getDeltaAmountQuoteUnsigned256(
            lowerSqrtPrice,
            upperSqrtPrice,
            liquidity,
            round
        )
    )
}

/** Δb = L * (√P_upper - √P_lower), unbounded. */
export function getDeltaAmountQuoteUnsigned256(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const prod = SafeMath.mul(
        liquidity,
        SafeMath.sub(upperSqrtPrice, lowerSqrtPrice)
    )
    if (round === Rounding.Up) {
        const denominator = new BN(1).shln(RESOLUTION * 2)
        return SafeMath.div(
            SafeMath.add(prod, denominator.subn(1)),
            denominator
        )
    }
    return SafeMath.shr(prod, RESOLUTION * 2)
}

function requireSwapInputs(sqrtPrice: BN, liquidity: BN, amount: BN): void {
    requireU128(sqrtPrice)
    requireU128(liquidity)
    requireU64(amount)
    if (sqrtPrice.isZero()) {
        throw new Error('sqrt_price must be greater than 0')
    }
    if (liquidity.isZero()) {
        throw new Error('liquidity must be greater than 0')
    }
}

/** Next sqrt price after amountIn of base (baseForQuote) or quote enters the segment. */
export function getNextSqrtPriceFromInput(
    sqrtPrice: BN,
    liquidity: BN,
    amountIn: BN,
    baseForQuote: boolean
): BN {
    requireSwapInputs(sqrtPrice, liquidity, amountIn)
    // round so the target price is not passed
    return baseForQuote
        ? getNextSqrtPriceFromBaseAmountInRoundingUp(
              sqrtPrice,
              liquidity,
              amountIn
          )
        : getNextSqrtPriceFromQuoteAmountInRoundingDown(
              sqrtPrice,
              liquidity,
              amountIn
          )
}

/** Next sqrt price after amountOut of quote (baseForQuote) or base leaves the segment. */
export function getNextSqrtPriceFromOutput(
    sqrtPrice: BN,
    liquidity: BN,
    amountOut: BN,
    baseForQuote: boolean
): BN {
    requireSwapInputs(sqrtPrice, liquidity, amountOut)
    return baseForQuote
        ? getNextSqrtPriceFromQuoteAmountOutRoundingDown(
              sqrtPrice,
              liquidity,
              amountOut
          )
        : getNextSqrtPriceFromBaseAmountOutRoundingUp(
              sqrtPrice,
              liquidity,
              amountOut
          )
}

/** √P' = √P - ceil(Δy / L) */
export function getNextSqrtPriceFromQuoteAmountOutRoundingDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    const qAmount = SafeMath.shl(amount, 128)
    const quotient = SafeMath.div(
        SafeMath.add(qAmount, SafeMath.sub(liquidity, new BN(1))),
        liquidity
    )
    return requireU128(SafeMath.sub(sqrtPrice, quotient))
}

/** √P' = √P * L / (L - Δx * √P), rounded up */
export function getNextSqrtPriceFromBaseAmountOutRoundingUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    if (amount.isZero()) {
        return sqrtPrice
    }
    const denominator = SafeMath.sub(liquidity, SafeMath.mul(amount, sqrtPrice))
    if (denominator.isZero()) {
        throw new Error(ProgramError.TypeCastFailed)
    }
    return requireU128(mulDiv(liquidity, sqrtPrice, denominator, Rounding.Up))
}

/**
 * √P' = √P * L / (L + Δx * √P), rounded up so an exact output is met and an
 * exact input does not move the price further than necessary.
 */
export function getNextSqrtPriceFromBaseAmountInRoundingUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    if (amount.isZero()) {
        return sqrtPrice
    }
    const denominator = SafeMath.add(liquidity, SafeMath.mul(amount, sqrtPrice))
    return requireU128(mulDiv(liquidity, sqrtPrice, denominator, Rounding.Up))
}

/**
 * √P' = √P + Δy / L, rounded down so an exact output is met and an exact
 * input does not move the price further than necessary.
 */
export function getNextSqrtPriceFromQuoteAmountInRoundingDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    const quotient = SafeMath.div(
        SafeMath.shl(amount, RESOLUTION * 2),
        liquidity
    )
    return requireU128(SafeMath.add(sqrtPrice, quotient))
}

/**
 * The points of a stored curve up to the first zero point. PoolConfig.curve
 * holds MAX_CURVE_POINT entries and the unused ones are zero; the program
 * stops at the first of them.
 */
export function liveCurve<T extends { sqrtPrice: BN; liquidity: BN }>(
    curve: T[]
): T[] {
    const end = curve.findIndex(
        (point) => point.sqrtPrice.isZero() || point.liquidity.isZero()
    )
    return end === -1 ? curve : curve.slice(0, end)
}
