import BN from 'bn.js'
import {
    BaseFee,
    bpsToFeeNumerator,
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
} from '../../src'

// Helper function to convert BN values to decimal strings
export function convertBNToDecimal<T>(obj: T): T {
    if (obj instanceof BN) {
        return obj.toString(10) as T
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => convertBNToDecimal(item)) as T
    }
    if (obj && typeof obj === 'object') {
        const result = {} as T
        for (const key in obj) {
            result[key] = convertBNToDecimal(obj[key])
        }
        return result
    }
    return obj
}

// Q64.64 format helper
export const Q = (n: number) => {
    const bigIntValue = BigInt(Math.floor(n * 2 ** 64))
    return new BN(bigIntValue.toString())
}

export function calculateRateLimiterFee(params: BaseFee, inputAmount: BN): BN {
    // for input_amount <= reference_amount
    // --> fee = input_amount * cliff_fee_numerator

    // for input_amount > reference_amount

    // let x0 = reference_amount
    // let c = cliff_fee_numerator
    // let i = fee_increment
    // let a = (input_amount - x0) / x0 (integer division)
    // let b = (input_amount - x0) % x0 (remainder)

    // max_index =
    //     (MAX_FEE_NUMERATOR - cliff_fee_numerator) / fee_increment_numerator
    // where: fee_increment_numerator =
    //     (fee_increment_bps * FEE_DENOMINATOR) / 10_000

    // if a < max_index:
    // --> fee = x0 * (c + c*a + i*a*(a+1)/2) + b * (c + i*(a+1))

    // if a ≥ max_index:
    // --> fee = x0 * (c + c*max_index + i*max_index*(max_index+1)/2) + (d*x0 + b) * MAX_FEE
    // where:
    // d = a - max_index
    // MAX_FEE is the maximum allowed fee (9900 bps)

    const { cliffFeeNumerator, thirdFactor, firstFactor } = params

    const feeIncrementNumerator = bpsToFeeNumerator(firstFactor)

    // for input_amount <= reference_amount
    if (inputAmount.lte(thirdFactor)) {
        return inputAmount.mul(cliffFeeNumerator).div(new BN(FEE_DENOMINATOR))
    }

    // for input_amount > reference_amount
    const x0 = thirdFactor
    const c = cliffFeeNumerator
    const i = feeIncrementNumerator

    // calculate a and b
    const diff = inputAmount.sub(x0)
    const a = diff.div(x0)
    const b = diff.mod(x0)

    // calculate max_index
    const maxFeeNumerator = new BN(MAX_FEE_NUMERATOR)
    const deltaNumerator = maxFeeNumerator.sub(cliffFeeNumerator)
    const maxIndex = deltaNumerator.div(feeIncrementNumerator)

    let fee: BN
    if (a.lt(maxIndex)) {
        // if a < max_index
        const numerator1 = c.add(c.mul(a)).add(
            i
                .mul(a)
                .mul(a.add(new BN(1)))
                .div(new BN(2))
        )
        const numerator2 = c.add(i.mul(a.add(new BN(1))))
        const firstFee = x0.mul(numerator1)
        const secondFee = b.mul(numerator2)
        fee = firstFee.add(secondFee)
    } else {
        // if a >= max_index
        const numerator1 = c.add(c.mul(maxIndex)).add(
            i
                .mul(maxIndex)
                .mul(maxIndex.add(new BN(1)))
                .div(new BN(2))
        )
        const numerator2 = maxFeeNumerator
        const firstFee = x0.mul(numerator1)

        const d = a.sub(maxIndex)
        const leftAmount = d.mul(x0).add(b)
        const secondFee = leftAmount.mul(numerator2)
        fee = firstFee.add(secondFee)
    }

    return fee.div(new BN(FEE_DENOMINATOR))
}
