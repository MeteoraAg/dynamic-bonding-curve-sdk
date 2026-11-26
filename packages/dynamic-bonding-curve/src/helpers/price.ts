import {
    Rounding,
    TokenDecimal,
    type LiquidityDistributionParameters,
    type PoolConfig,
} from '../types'
import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    getDeltaAmountBaseUnsigned256,
    getDeltaAmountQuoteUnsigned,
    liveCurve,
} from '../math/curve'

/** Price of one base token in quote tokens: (sqrtPrice / 2^64)^2 * 10^(baseDecimal - quoteDecimal). */
export function getPriceFromSqrtPrice(
    sqrtPrice: BN,
    tokenBaseDecimal: TokenDecimal,
    tokenQuoteDecimal: number
): Decimal {
    const sqrtPriceDecimal = new Decimal(sqrtPrice.toString())
    const lamportPrice = sqrtPriceDecimal
        .mul(sqrtPriceDecimal)
        .div(new Decimal(2).pow(128))
    return lamportPrice.mul(
        new Decimal(10).pow(tokenBaseDecimal - tokenQuoteDecimal)
    )
}

/** Q64 sqrt price of a base token price in quote tokens, rounded down. */
export const getSqrtPriceFromPrice = (
    price: string,
    tokenBaseDecimal: number,
    tokenQuoteDecimal: number
): BN => {
    const lamportPrice = new Decimal(price).div(
        Decimal.pow(10, tokenBaseDecimal - tokenQuoteDecimal)
    )
    const sqrtValueQ64 = Decimal.sqrt(lamportPrice).mul(Decimal.pow(2, 64))
    return new BN(sqrtValueQ64.floor().toFixed())
}

/** Q64 sqrt prices of base token prices in quote tokens. */
export const createSqrtPrices = (
    prices: number[],
    tokenBaseDecimal: TokenDecimal,
    tokenQuoteDecimal: number
): BN[] =>
    prices.map((price) =>
        getSqrtPriceFromPrice(
            price.toString(),
            tokenBaseDecimal,
            tokenQuoteDecimal
        )
    )

/** Q64 sqrt price at which totalSupply base tokens are worth marketCap quote tokens. */
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
 * Base tokens sold from sqrtStartPrice to sqrtMigrationPrice, rounded up per
 * segment like the program's get_base_token_for_swap.
 */
export function getBaseTokenForSwap(
    sqrtStartPrice: BN,
    sqrtMigrationPrice: BN,
    curve: Array<LiquidityDistributionParameters>
): BN {
    let totalAmount = new BN(0)
    let lowerSqrtPrice = sqrtStartPrice
    for (const point of liveCurve(curve)) {
        const upperSqrtPrice = BN.min(point.sqrtPrice, sqrtMigrationPrice)
        totalAmount = totalAmount.add(
            getDeltaAmountBaseUnsigned256(
                lowerSqrtPrice,
                upperSqrtPrice,
                point.liquidity,
                Rounding.Up
            )
        )
        if (point.sqrtPrice.gt(sqrtMigrationPrice)) {
            break
        }
        lowerSqrtPrice = point.sqrtPrice
    }
    return totalAmount
}

/** Quote tokens the curve holds once it has been bought up to nextSqrtPrice. */
export function getQuoteReserveFromNextSqrtPrice(
    nextSqrtPrice: BN,
    config: Pick<PoolConfig, 'curve' | 'sqrtStartPrice'>
): BN {
    let totalAmount = new BN(0)
    let lowerSqrtPrice = config.sqrtStartPrice
    for (const point of liveCurve(config.curve)) {
        if (nextSqrtPrice.gt(lowerSqrtPrice)) {
            totalAmount = totalAmount.add(
                getDeltaAmountQuoteUnsigned(
                    lowerSqrtPrice,
                    BN.min(nextSqrtPrice, point.sqrtPrice),
                    point.liquidity,
                    Rounding.Up
                )
            )
        }
        lowerSqrtPrice = point.sqrtPrice
    }
    return totalAmount
}
