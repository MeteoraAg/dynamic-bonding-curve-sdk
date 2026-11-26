import BN from 'bn.js'
import { U128_MAX, U64_MAX } from '../constants'
import { ProgramError } from './errors'

export function requireU64(value: BN): BN {
    if (value.gt(U64_MAX)) {
        throw new Error(ProgramError.MathOverflow)
    }
    return value
}

export function requireU128(value: BN): BN {
    if (value.gt(U128_MAX)) {
        throw new Error(ProgramError.TypeCastFailed)
    }
    return value
}
