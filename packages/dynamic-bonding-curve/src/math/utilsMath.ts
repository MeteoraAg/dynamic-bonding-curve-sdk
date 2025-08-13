import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { Rounding } from '../types'

/**
 * Multiply and divide with rounding using BN
 * @param x First number
 * @param y Second number
 * @param denominator Denominator
 * @param rounding Rounding direction
 * @returns (x * y) / denominator
 * @throws If division by zero or overflow occurs
 */
export function mulDiv(x: BN, y: BN, denominator: BN, rounding: Rounding): BN {
    if (denominator.isZero()) {
        throw new Error('MulDiv: division by zero')
    }

    if (denominator.eq(new BN(1)) || x.isZero() || y.isZero()) {
        return x.mul(y)
    }

    const prod = x.mul(y)

    if (rounding === Rounding.Up) {
        // Calculate ceiling division: (prod + denominator - 1) / denominator
        const numerator = prod.add(denominator.sub(new BN(1)))
        return numerator.div(denominator)
    } else {
        return prod.div(denominator)
    }
}

/**
 * Multiply and shift right with BN
 * @param x First number
 * @param y Second number
 * @param offset Number of bits to shift
 * @returns (x * y) >> offset
 */
export function mulShr(x: BN, y: BN, offset: number): BN {
    if (offset === 0 || x.isZero() || y.isZero()) {
        return x.mul(y)
    }

    const prod = SafeMath.mul(x, y)

    return SafeMath.shr(prod, offset)
}

/**
 * Calculate square root of a BN number using Newton's method
 * @param value - The value to calculate square root for
 * @returns Square root of the value
 */
export function sqrt(value: BN): BN {
    if (value.isZero()) {
        return new BN(0)
    }

    if (value.eq(new BN(1))) {
        return new BN(1)
    }

    let x = value
    let y = value.add(new BN(1)).div(new BN(2))

    while (y.lt(x)) {
        x = y
        y = x.add(value.div(x)).div(new BN(2))
    }

    return x
}
