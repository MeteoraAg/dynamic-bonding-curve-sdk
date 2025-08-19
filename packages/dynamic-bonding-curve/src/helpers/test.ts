import BN from 'bn.js'
import { getDeltaAmountBaseUnsigned, getDeltaAmountQuoteUnsigned } from '../math/curve'
import { Rounding } from '../types'

const P0 = new BN('10312044770285001')
const P1 = new BN('41248173712355948')
const P2 = new BN('79226673521066979257578248091')

const L0 = new BN('10999513467186856574015959876923')
const L1 = new BN('3436021254348803974616125')

const base1 = getDeltaAmountBaseUnsigned(P0, P1, L0, Rounding.Up)
const base2 = getDeltaAmountBaseUnsigned(P1, P2, L1, Rounding.Up)
const baseSum = base1.add(base2)

const quote1 = getDeltaAmountQuoteUnsigned(P0, P1, L0, Rounding.Up)
const quote2 = getDeltaAmountQuoteUnsigned(P1, P2, L1, Rounding.Up)
const quoteSum = quote1.add(quote2)

console.log('baseSum', baseSum.toString())
console.log('quoteSum', quoteSum.toString())