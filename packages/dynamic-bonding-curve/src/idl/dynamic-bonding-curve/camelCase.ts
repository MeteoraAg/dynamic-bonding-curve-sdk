// Not re-exported from the package root. Program applies it to its IDL, so coders built
// from this IDL use the same camelCase names and fields as Program's.
import { convertIdlToCamelCase } from '@coral-xyz/anchor/dist/cjs/idl.js'
import type { DynamicBondingCurve } from './idl'
import DynamicBondingCurveIDL from './idl.json'

export const dynamicBondingCurveIdl = convertIdlToCamelCase(
    DynamicBondingCurveIDL as DynamicBondingCurve
)
