import {
    Rounding,
    TokenDecimal,
    type LiquidityDistributionParameters,
    type PoolConfig,
} from '../types'
import { MAX_BASIS_POINT } from '../constants'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    getDeltaAmountBaseUnsigned,
    getDeltaAmountQuoteUnsigned,
} from '../math/curve'
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
    tokenQuoteDecimal: number
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
    tokenQuoteDecimal: number
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
        const lowerSqrtPrice = i === 0 ? sqrtStartPrice : curve[i - 1].sqrtPrice
        if (curve[i].sqrtPrice.gt(sqrtMigrationPrice)) {
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
 * Computes the sqrtPriceStepBps needed so that the fee schedule is fully
 * exhausted when spot price reaches a given multiple of the initial price.
 * @param priceMultiple - Target spot-price multiple (e.g. 1000 for 1000x)
 * @param numberOfPeriod - Number of fee reduction periods
 * @returns The sqrtPriceStepBps value to use on-chain
 */
export function computeSqrtPriceStepBps(
    priceMultiple: number,
    numberOfPeriod: number
): number {
    if (priceMultiple <= 1) {
        throw new Error('priceMultiple must be greater than 1')
    }
    if (numberOfPeriod <= 0) {
        throw new Error('numberOfPeriod must be greater than 0')
    }
    const sqrtPriceStepBps = Math.floor(
        ((Math.sqrt(priceMultiple) - 1) * MAX_BASIS_POINT) / numberOfPeriod
    )
    if (sqrtPriceStepBps <= 0) {
        throw new Error(
            'Computed sqrtPriceStepBps is 0 — increase priceMultiple or decrease numberOfPeriod'
        )
    }
    return sqrtPriceStepBps
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
