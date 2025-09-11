import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import { RESOLUTION, U128_MAX } from '../constants'
import { Rounding } from '../types'

/**
 * Gets the initial liquidity from delta quote
 * Formula: Δb = L (√P_upper - √P_lower) => L = Δb / (√P_upper - √P_lower)
 * @param quoteAmount Quote amount
 * @param sqrtMinPrice Minimum sqrt price
 * @param sqrtPrice Current sqrt price
 * @returns Initial liquidity
 */
export function getInitialLiquidityFromDeltaQuote(
    quoteAmount: BN,
    sqrtMinPrice: BN,
    sqrtPrice: BN
): BN {
    const priceDelta = SafeMath.sub(sqrtPrice, sqrtMinPrice)
    const quoteAmountShifted = SafeMath.shl(quoteAmount, 128)

    return SafeMath.div(quoteAmountShifted, priceDelta) // round down
}

/**
 * Gets the initial liquidity from delta base
 * Formula: Δa = L * (1 / √P_lower - 1 / √P_upper) => L = Δa / (1 / √P_lower - 1 / √P_upper)
 * @param baseAmount Base amount
 * @param sqrtMaxPrice Maximum sqrt price (√P_upper)
 * @param sqrtPrice Current sqrt price (√P_lower)
 * @returns Initial liquidity
 */
export function getInitialLiquidityFromDeltaBase(
    baseAmount: BN,
    sqrtMaxPrice: BN,
    sqrtPrice: BN
): BN {
    const priceDelta = SafeMath.sub(sqrtMaxPrice, sqrtPrice)
    const prod = SafeMath.mul(SafeMath.mul(baseAmount, sqrtPrice), sqrtMaxPrice)
    const liquidity = SafeMath.div(prod, priceDelta) // round down
    return liquidity
}

/**
 * Gets the delta amount_a for given liquidity and price range
 *
 * Formula:
 * - Δa = L * (1 / √P_lower - 1 / √P_upper)
 * - i.e. L * (√P_upper - √P_lower) / (√P_upper * √P_lower)
 *
 * @param lowerSqrtPrice Lower sqrt price
 * @param upperSqrtPrice Upper sqrt price
 * @param liquidity Liquidity
 * @param round Rounding direction
 * @returns Delta amount base
 */
export function getDeltaAmountBaseUnsigned(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const result = getDeltaAmountBaseUnsigned256(
        lowerSqrtPrice,
        upperSqrtPrice,
        liquidity,
        round
    )

    return result
}

export function getDeltaAmountBaseUnsigned256(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const result = getDeltaAmountBaseUnsignedUnchecked(
        lowerSqrtPrice,
        upperSqrtPrice,
        liquidity,
        round
    )

    return result
}

/**
 * i.e. L * (√P_upper - √P_lower) / (√P_upper * √P_lower)
 */
export function getDeltaAmountBaseUnsignedUnchecked(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const numerator1 = liquidity
    const numerator2 = SafeMath.sub(upperSqrtPrice, lowerSqrtPrice)

    const denominator = SafeMath.mul(lowerSqrtPrice, upperSqrtPrice)

    if (denominator.isZero()) {
        throw new Error('Denominator cannot be zero')
    }

    const result = mulDiv(numerator1, numerator2, denominator, round)
    return result
}

/**
 * Gets the delta amount_quote for given liquidity and price range
 * Formula: Δb = L (√P_upper - √P_lower)
 * @param lowerSqrtPrice Lower sqrt price
 * @param upperSqrtPrice Upper sqrt price
 * @param liquidity Liquidity
 * @param round Rounding direction
 * @returns Delta amount quote
 */
export function getDeltaAmountQuoteUnsigned(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const result = getDeltaAmountQuoteUnsigned256(
        lowerSqrtPrice,
        upperSqrtPrice,
        liquidity,
        round
    )

    return result
}

export function getDeltaAmountQuoteUnsigned256(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const result = getDeltaAmountQuoteUnsignedUnchecked(
        lowerSqrtPrice,
        upperSqrtPrice,
        liquidity,
        round
    )

    return result
}

/**
 * Δb = L (√P_upper - √P_lower)
 */
export function getDeltaAmountQuoteUnsignedUnchecked(
    lowerSqrtPrice: BN,
    upperSqrtPrice: BN,
    liquidity: BN,
    round: Rounding
): BN {
    const deltaSqrtPrice = SafeMath.sub(upperSqrtPrice, lowerSqrtPrice)
    const prod = SafeMath.mul(liquidity, deltaSqrtPrice)

    if (round === Rounding.Up) {
        const denominator = new BN(1).shln(RESOLUTION * 2)
        // ceiling division: (a + b - 1) / b
        const numerator = SafeMath.add(
            prod,
            SafeMath.sub(denominator, new BN(1))
        )
        return SafeMath.div(numerator, denominator)
    } else {
        return SafeMath.shr(prod, RESOLUTION * 2)
    }
}

/**
 * Gets the next sqrt price given an input amount of token_a or token_b
 * Throws if price or liquidity are 0, or if the next price is out of bounds
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amountIn Input amount
 * @param baseForQuote Whether the input is base token for quote token
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromInput(
    sqrtPrice: BN,
    liquidity: BN,
    amountIn: BN,
    baseForQuote: boolean
): BN {
    if (sqrtPrice.isZero()) {
        throw new Error('sqrt_price must be greater than 0')
    }
    if (liquidity.isZero()) {
        throw new Error('liquidity must be greater than 0')
    }

    // round to make sure that we don't pass the target price
    if (baseForQuote) {
        return getNextSqrtPriceFromBaseAmountInRoundingUp(
            sqrtPrice,
            liquidity,
            amountIn
        )
    } else {
        return getNextSqrtPriceFromQuoteAmountInRoundingDown(
            sqrtPrice,
            liquidity,
            amountIn
        )
    }
}

/**
 * Gets the next sqrt price from output amount
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amountOut Output amount
 * @param baseForQuote Whether we're trading base for quote (true) or quote for base (false)
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromOutput(
    sqrtPrice: BN,
    liquidity: BN,
    amountOut: BN,
    baseForQuote: boolean
): BN {
    if (sqrtPrice.isZero()) {
        throw new Error('sqrt_price must be greater than 0')
    }
    if (liquidity.isZero()) {
        throw new Error('liquidity must be greater than 0')
    }

    if (baseForQuote) {
        return getNextSqrtPriceFromQuoteAmountOutRoundingDown(
            sqrtPrice,
            liquidity,
            amountOut
        )
    } else {
        return getNextSqrtPriceFromBaseAmountOutRoundingUp(
            sqrtPrice,
            liquidity,
            amountOut
        )
    }
}

/**
 * Gets the next sqrt price from amount quote output rounding down
 * Formula: √P' = √P - Δy / L
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amount Output amount
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromQuoteAmountOutRoundingDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    // q_amount = amount << 128
    const qAmount = SafeMath.shl(amount, 128)

    // quotient = q_amount.div_ceil(liquidity)
    // div_ceil is equivalent to (a + b - 1) / b
    const numerator = SafeMath.add(qAmount, SafeMath.sub(liquidity, new BN(1)))
    const quotient = SafeMath.div(numerator, liquidity)

    // √P - quotient
    const result = SafeMath.sub(sqrtPrice, quotient)

    return result
}

/**
 * Gets the next sqrt price from amount base output rounding up
 * Formula: √P' = √P * L / (L - Δx * √P)
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amount Output amount
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromBaseAmountOutRoundingUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    if (amount.isZero()) {
        return sqrtPrice
    }

    // Δx * √P
    const product = SafeMath.mul(amount, sqrtPrice)

    // L - Δx * √P
    const denominator = SafeMath.sub(liquidity, product)

    if (denominator.isZero() || denominator.isNeg()) {
        throw new Error(
            'Invalid denominator: liquidity must be greater than amount * sqrt_price'
        )
    }

    // √P * L / (L - Δx * √P) with rounding up
    return mulDiv(liquidity, sqrtPrice, denominator, Rounding.Up)
}

/**
 * Gets the next sqrt price from amount base input rounding up
 * Always round up because:
 * 1. In the exact output case, token 0 supply decreases leading to price increase.
 *    Move price up so that exact output is met.
 * 2. In the exact input case, token 0 supply increases leading to price decrease.
 *    Do not round down to minimize price impact. We only need to meet input
 *    change and not guarantee exact output.
 *
 * Formula: √P' = √P * L / (L + Δx * √P)
 * If Δx * √P overflows, use alternate form √P' = L / (L/√P + Δx)
 *
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amount Input amount
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromBaseAmountInRoundingUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    if (amount.isZero()) {
        return sqrtPrice
    }

    // Check for potential overflow in Δx * √P
    const product = SafeMath.mul(amount, sqrtPrice)

    // Check if product would overflow - if so, use alternate form
    if (product.gt(U128_MAX)) {
        // Alternate form: √P' = L / (L/√P + Δx)
        const quotient = SafeMath.div(liquidity, sqrtPrice)
        const denominator = SafeMath.add(quotient, amount)
        return SafeMath.div(liquidity, denominator)
    }

    // Standard form: √P' = √P * L / (L + Δx * √P)
    const denominator = SafeMath.add(liquidity, product)
    return mulDiv(liquidity, sqrtPrice, denominator, Rounding.Up)
}

/**
 * Gets the next sqrt price from amount quote input rounding down
 * Always round down because:
 * 1. In the exact output case, token 1 supply decreases leading to price decrease.
 *    Move price down by rounding down so that exact output of token 0 is met.
 * 2. In the exact input case, token 1 supply increases leading to price increase.
 *    Do not round down to minimize price impact. We only need to meet input
 *    change and not guarantee exact output for token 0.
 *
 * Formula: √P' = √P + Δy / L
 *
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amount Input amount
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromQuoteAmountInRoundingDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    // quotient: Δy << (RESOLUTION * 2) / L
    const quotient = SafeMath.div(
        SafeMath.shl(amount, RESOLUTION * 2),
        liquidity
    )

    // √P' = √P + Δy / L
    return SafeMath.add(sqrtPrice, quotient)
}
