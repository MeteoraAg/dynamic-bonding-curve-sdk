import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import { RESOLUTION } from '../constants'
import { Rounding } from '../types'

/**
 * Gets the delta amount_base for given liquidity and price range
 * Formula: Δa = L * (1 / √P_lower - 1 / √P_upper)
 * i.e. L * (√P_upper - √P_lower) / (√P_upper * √P_lower)
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
    if (liquidity.isZero()) {
        return new BN(0)
    }

    if (lowerSqrtPrice.isZero() || upperSqrtPrice.isZero()) {
        throw new Error('Sqrt price cannot be zero')
    }

    // numerator: (√P_upper - √P_lower)
    const numerator = SafeMath.sub(upperSqrtPrice, lowerSqrtPrice)

    // denominator: (√P_upper * √P_lower)
    const denominator = SafeMath.mul(lowerSqrtPrice, upperSqrtPrice)

    // L * (√P_upper - √P_lower) / (√P_upper * √P_lower)
    return mulDiv(liquidity, numerator, denominator, round)
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
    if (liquidity.isZero()) {
        return new BN(0)
    }

    // delta sqrt price: (√P_upper - √P_lower)
    const deltaSqrtPrice = SafeMath.sub(upperSqrtPrice, lowerSqrtPrice)

    // L * (√P_upper - √P_lower)
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
    if (sqrtPrice.isZero() || liquidity.isZero()) {
        throw new Error('Price or liquidity cannot be zero')
    }

    if (baseForQuote) {
        return getNextSqrtPriceFromAmountBaseRoundingUp(
            sqrtPrice,
            liquidity,
            amountIn
        )
    } else {
        return getNextSqrtPriceFromAmountQuoteRoundingDown(
            sqrtPrice,
            liquidity,
            amountIn
        )
    }
}

/**
 * Gets the next sqrt price from amount base rounding up
 * Formula: √P' = √P * L / (L + Δx * √P)
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amount Input amount
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromAmountBaseRoundingUp(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    if (amount.isZero()) {
        return sqrtPrice
    }

    // Δx * √P
    const product = SafeMath.mul(amount, sqrtPrice)

    // L + Δx * √P
    const denominator = SafeMath.add(liquidity, product)

    // √P * L / (L + Δx * √P) with rounding up
    return mulDiv(liquidity, sqrtPrice, denominator, Rounding.Up)
}

/**
 * Gets the next sqrt price given a delta of token_quote
 * Formula: √P' = √P + Δy / L
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param amount Input amount
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromAmountQuoteRoundingDown(
    sqrtPrice: BN,
    liquidity: BN,
    amount: BN
): BN {
    if (amount.isZero()) {
        return sqrtPrice
    }

    // quotient: Δy << (RESOLUTION * 2) / L
    const quotient = SafeMath.div(
        SafeMath.shl(amount, RESOLUTION * 2),
        liquidity
    )

    // √P + quotient
    return SafeMath.add(sqrtPrice, quotient)
}

/**
 * Gets the initial liquidity from delta quote
 * Formula: L = Δb / (√P_upper - √P_lower)
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
    const quoteAmountShifted = SafeMath.shl(quoteAmount, RESOLUTION * 2)

    return SafeMath.div(quoteAmountShifted, priceDelta)
}

/**
 * Gets the initial liquidity from delta base
 * Formula: L = Δa / (1/√P_lower - 1/√P_upper)
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
    // Calculate 1/√P_lower - 1/√P_upper = (√P_upper - √P_lower) / (√P_upper * √P_lower)
    const numerator = SafeMath.sub(sqrtMaxPrice, sqrtPrice)
    const denominator = SafeMath.mul(sqrtPrice, sqrtMaxPrice)

    // L = Δa / (1/√P_lower - 1/√P_upper) = Δa * (√P_upper * √P_lower) / (√P_upper - √P_lower)
    return mulDiv(baseAmount, denominator, numerator, Rounding.Down)
}

/**
 * Gets the initialize amounts
 * @param sqrtMinPrice Minimum sqrt price
 * @param sqrtMaxPrice Maximum sqrt price
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @returns [base amount, quote amount]
 */
export function getInitializeAmounts(
    sqrtMinPrice: BN,
    sqrtMaxPrice: BN,
    sqrtPrice: BN,
    liquidity: BN
): [BN, BN] {
    const amountBase = getDeltaAmountBaseUnsigned(
        sqrtPrice,
        sqrtMaxPrice,
        liquidity,
        Rounding.Up
    )

    const amountQuote = getDeltaAmountQuoteUnsigned(
        sqrtMinPrice,
        sqrtPrice,
        liquidity,
        Rounding.Up
    )

    return [amountBase, amountQuote]
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
    if (amount.isZero()) {
        return sqrtPrice
    }

    // quotient = (amount << 128 + liquidity - 1) / liquidity
    const amountShifted = SafeMath.shl(amount, 128)
    const step1 = SafeMath.add(amountShifted, liquidity)
    const step2 = SafeMath.sub(step1, new BN(1))
    const quotient = SafeMath.div(step2, liquidity)

    // √P - quotient
    return SafeMath.sub(sqrtPrice, quotient)
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

    // √P * L / (L - Δx * √P) with rounding up
    return mulDiv(liquidity, sqrtPrice, denominator, Rounding.Up)
}

/**
 * Gets the next sqrt price from output amount
 * @param sqrtPrice Current sqrt price
 * @param liquidity Liquidity
 * @param outAmount Output amount
 * @param baseForQuote Whether we're trading base for quote (true) or quote for base (false)
 * @returns Next sqrt price
 */
export function getNextSqrtPriceFromOutput(
    sqrtPrice: BN,
    liquidity: BN,
    outAmount: BN,
    baseForQuote: boolean
): BN {
    if (sqrtPrice.isZero()) {
        throw new Error('Sqrt price cannot be zero')
    }

    if (baseForQuote) {
        // when trading base for quote, output is quote token
        return getNextSqrtPriceFromQuoteAmountOutRoundingDown(
            sqrtPrice,
            liquidity,
            outAmount
        )
    } else {
        // when trading quote for base, output is base token
        return getNextSqrtPriceFromBaseAmountOutRoundingUp(
            sqrtPrice,
            liquidity,
            outAmount
        )
    }
}
