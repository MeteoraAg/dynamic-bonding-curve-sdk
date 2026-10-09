import BN from 'bn.js'
import { RESOLUTION, U128_MAX } from '../constants'

/**
 * Safe math operations for BN
 */
export class SafeMath {
    /**
     * Safe addition
     * @param a First number
     * @param b Second number
     * @returns Sum of a and b
     */
    static add(a: BN, b: BN): BN {
        return a.add(b)
    }

    /**
     * Safe subtraction
     * @param a First number
     * @param b Second number
     * @returns Difference of a and b
     * @throws Error if b > a
     */
    static sub(a: BN, b: BN): BN {
        if (b.gt(a)) {
            throw new Error('SafeMath: subtraction overflow')
        }
        return a.sub(b)
    }

    /**
     * Safe multiplication
     * @param a First number
     * @param b Second number
     * @returns Product of a and b
     */
    static mul(a: BN, b: BN): BN {
        return a.mul(b)
    }

    /**
     * Safe division
     * @param a First number
     * @param b Second number
     * @returns Quotient of a and b
     * @throws Error if b is zero
     */
    static div(a: BN, b: BN): BN {
        if (b.isZero()) {
            throw new Error('SafeMath: division by zero')
        }
        return a.div(b)
    }

    /**
     * Safe modulo
     * @param a First number
     * @param b Second number
     * @returns Remainder of a divided by b
     * @throws Error if b is zero
     */
    static mod(a: BN, b: BN): BN {
        if (b.isZero()) {
            throw new Error('SafeMath: modulo by zero')
        }
        return a.mod(b)
    }

    /**
     * Safe left shift
     * @param a Number to shift
     * @param b Number of bits to shift
     * @returns a << b
     */
    static shl(a: BN, b: number): BN {
        return a.shln(b)
    }

    /**
     * Safe right shift
     * @param a Number to shift
     * @param b Number of bits to shift
     * @returns a >> b
     */
    static shr(a: BN, b: number): BN {
        return a.shrn(b)
    }
}

const MAX_EXPONENTIAL = 0x80000
const I32_MIN = new BN('-2147483648')

function mulQ64(left: BN, right: BN): BN {
    const product = left.mul(right)
    if (product.gt(U128_MAX)) {
        throw new Error('Math overflow')
    }
    return product.shrn(RESOLUTION)
}

/**
 * Q64 power, matching the program. A base at or above 1 is inverted through
 * u128::MAX so each multiplication stays inside u128.
 */
export function pow(base: BN, exponent: BN, scaling: boolean = true): BN {
    const one = new BN(1).shln(RESOLUTION)

    if (exponent.eq(I32_MIN) || base.isNeg() || base.gt(U128_MAX)) {
        throw new Error('Math overflow')
    }
    if (exponent.isZero()) {
        return one
    }

    let invert = exponent.isNeg()
    const exp = invert ? exponent.neg() : exponent
    if (exp.gte(new BN(MAX_EXPONENTIAL))) {
        throw new Error('Math overflow')
    }

    let squaredBase = base
    let result = one
    if (squaredBase.gte(result)) {
        if (squaredBase.isZero()) {
            throw new Error('Math overflow')
        }
        squaredBase = U128_MAX.div(squaredBase)
        invert = !invert
    }

    let remaining = exp
    while (!remaining.isZero()) {
        if (!remaining.and(new BN(1)).isZero()) {
            result = mulQ64(result, squaredBase)
        }
        squaredBase = mulQ64(squaredBase, squaredBase)
        remaining = remaining.shrn(1)
    }

    if (result.isZero()) {
        throw new Error('Math overflow')
    }
    if (invert) {
        result = U128_MAX.div(result)
    }

    return scaling ? result : result.shrn(RESOLUTION)
}
