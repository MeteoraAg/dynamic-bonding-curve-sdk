import BN from 'bn.js'
import { Rounding } from '../types'
import { MAX_BASIS_POINT } from '../constants'
import { ProgramError } from './errors'

/** (x * y) / denominator with the given rounding; the program's mul_div. */
export function mulDiv(x: BN, y: BN, denominator: BN, rounding: Rounding): BN {
    if (denominator.isZero()) {
        throw new Error(ProgramError.MathOverflow)
    }
    const prod = x.mul(y)
    if (rounding === Rounding.Up) {
        return prod.add(denominator.subn(1)).div(denominator)
    }
    return prod.div(denominator)
}

/** bps * feeDenominator / 10_000, rounded down; the program's to_numerator. */
export function toNumerator(bps: BN, feeDenominator: BN): BN {
    return mulDiv(bps, feeDenominator, new BN(MAX_BASIS_POINT), Rounding.Down)
}

/** Integer square root by Newton's method, rounded down; the program's sqrt_u256. */
export function sqrt(value: BN): BN {
    if (value.lten(1)) {
        return value
    }
    let x = value
    let y = value.addn(1).divn(2)
    while (y.lt(x)) {
        x = y
        y = x.add(value.div(x)).divn(2)
    }
    return x
}
