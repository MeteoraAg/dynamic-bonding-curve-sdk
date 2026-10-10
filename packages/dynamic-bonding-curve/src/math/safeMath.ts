import BN from 'bn.js'
import { RESOLUTION, U128_MAX } from '../constants'
import { ProgramError } from './errors'

/**
 * The program's safe_math on BN. BN is arbitrary precision, so only
 * subtraction and division can fail here; the u64 and u128 bounds are
 * checked by the callers.
 */
export class SafeMath {
    static add(a: BN, b: BN): BN {
        return a.add(b)
    }

    static sub(a: BN, b: BN): BN {
        if (b.gt(a)) {
            throw new Error(ProgramError.MathOverflow)
        }
        return a.sub(b)
    }

    static mul(a: BN, b: BN): BN {
        return a.mul(b)
    }

    static div(a: BN, b: BN): BN {
        if (b.isZero()) {
            throw new Error(ProgramError.MathOverflow)
        }
        return a.div(b)
    }

    static shl(a: BN, b: number): BN {
        return a.shln(b)
    }

    static shr(a: BN, b: number): BN {
        return a.shrn(b)
    }
}

const MAX_EXPONENTIAL = 0x80000
const I32_MIN = new BN('-2147483648')

function mulQ64(left: BN, right: BN): BN {
    const product = left.mul(right)
    if (product.gt(U128_MAX)) {
        throw new Error(ProgramError.MathOverflow)
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
        throw new Error(ProgramError.MathOverflow)
    }
    if (exponent.isZero()) {
        return one
    }

    let invert = exponent.isNeg()
    const exp = invert ? exponent.neg() : exponent
    if (exp.gte(new BN(MAX_EXPONENTIAL))) {
        throw new Error(ProgramError.MathOverflow)
    }

    let squaredBase = base
    let result = one
    if (squaredBase.gte(result)) {
        squaredBase = U128_MAX.div(squaredBase)
        invert = !invert
    }

    let remaining = exp
    while (!remaining.isZero()) {
        if (remaining.isOdd()) {
            result = mulQ64(result, squaredBase)
        }
        squaredBase = mulQ64(squaredBase, squaredBase)
        remaining = remaining.shrn(1)
    }

    if (result.isZero()) {
        throw new Error(ProgramError.MathOverflow)
    }
    if (invert) {
        result = U128_MAX.div(result)
    }

    return scaling ? result : result.shrn(RESOLUTION)
}
