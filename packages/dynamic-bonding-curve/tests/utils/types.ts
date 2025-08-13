import { Program } from '@coral-xyz/anchor'
import { DynamicBondingCurve as DynamicBondingCurveIDL } from '../../src/idl/dynamic-bonding-curve/idl'

export type DynamicCurveProgram = Program<DynamicBondingCurveIDL>
