import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import {
    HOST_FEE_PERCENT,
    MAX_FEE_NUMERATOR,
    PROTOCOL_FEE_PERCENT,
} from '../constants'
import {
    CollectFeeMode,
    Rounding,
    TradeDirection,
    type FeeMode,
    type FeeOnAmountResult,
    type QuoteDynamicFee,
    type QuotePoolFees,
    type QuoteVolatilityTracker,
} from '../types'
import { getBaseFeeHandler } from './poolFees/baseFee'
import { getVariableFeeNumerator } from './poolFees/dynamicFee'
import { ProgramError } from './errors'
import { getExcludedFeeAmount } from './feeAmount'

export { getExcludedFeeAmount, getIncludedFeeAmount } from './feeAmount'

// (collect fee mode, trade direction) -> [fees on input, fees on base token]
const FEE_MODES: Partial<
    Record<CollectFeeMode, Partial<Record<TradeDirection, [boolean, boolean]>>>
> = {
    [CollectFeeMode.QuoteToken]: {
        [TradeDirection.BaseToQuote]: [false, false],
        [TradeDirection.QuoteToBase]: [true, false],
    },
    [CollectFeeMode.OutputToken]: {
        [TradeDirection.BaseToQuote]: [false, false],
        [TradeDirection.QuoteToBase]: [false, true],
    },
}

/** Which side of a swap the fee is taken from; the program's FeeMode::get_fee_mode. */
export function getFeeMode(
    collectFeeMode: CollectFeeMode,
    tradeDirection: TradeDirection,
    hasReferral: boolean
): FeeMode {
    const mode = FEE_MODES[collectFeeMode]?.[tradeDirection]
    if (!mode) {
        throw new Error(ProgramError.InvalidCollectFeeMode)
    }
    const [feesOnInput, feesOnBaseToken] = mode
    return { feesOnInput, feesOnBaseToken, hasReferral }
}

function baseFeeHandlerOf(poolFees: QuotePoolFees) {
    const { baseFee } = poolFees
    return getBaseFeeHandler(
        baseFee.cliffFeeNumerator,
        baseFee.firstFactor,
        baseFee.secondFactor,
        baseFee.thirdFactor,
        baseFee.baseFeeMode
    )
}

/** Base plus dynamic fee numerator for an amount that includes the fee. */
export function getTotalFeeNumeratorFromIncludedFeeAmount(
    poolFees: QuotePoolFees,
    volatilityTracker: QuoteVolatilityTracker,
    currentPoint: BN,
    activationPoint: BN,
    includedFeeAmount: BN,
    tradeDirection: TradeDirection
): BN {
    const baseFeeNumerator = baseFeeHandlerOf(
        poolFees
    ).getBaseFeeNumeratorFromIncludedFeeAmount(
        currentPoint,
        activationPoint,
        tradeDirection,
        includedFeeAmount
    )
    return getTotalFeeNumerator(
        baseFeeNumerator,
        poolFees.dynamicFee,
        volatilityTracker
    )
}

/** Base plus dynamic fee numerator for an amount that excludes the fee. */
export function getTotalFeeNumeratorFromExcludedFeeAmount(
    poolFees: QuotePoolFees,
    volatilityTracker: QuoteVolatilityTracker,
    currentPoint: BN,
    activationPoint: BN,
    excludedFeeAmount: BN,
    tradeDirection: TradeDirection
): BN {
    const baseFeeNumerator = baseFeeHandlerOf(
        poolFees
    ).getBaseFeeNumeratorFromExcludedFeeAmount(
        currentPoint,
        activationPoint,
        tradeDirection,
        excludedFeeAmount
    )
    return getTotalFeeNumerator(
        baseFeeNumerator,
        poolFees.dynamicFee,
        volatilityTracker
    )
}

/** Base plus dynamic fee numerator, capped at MAX_FEE_NUMERATOR. */
export function getTotalFeeNumerator(
    baseFeeNumerator: BN,
    dynamicFee: QuoteDynamicFee,
    volatilityTracker: QuoteVolatilityTracker
): BN {
    return BN.min(
        SafeMath.add(
            getVariableFeeNumerator(dynamicFee, volatilityTracker),
            baseFeeNumerator
        ),
        new BN(MAX_FEE_NUMERATOR)
    )
}

/** Take the fee out of an amount and split it; the program's get_fee_on_amount. */
export function getFeeOnAmount(
    tradeFeeNumerator: BN,
    amount: BN,
    hasReferral: boolean
): FeeOnAmountResult {
    const [amountAfterFee, feeAmount] = getExcludedFeeAmount(
        tradeFeeNumerator,
        amount
    )
    const [tradingFee, protocolFee, referralFee] = splitFees(
        feeAmount,
        hasReferral
    )
    return { amount: amountAfterFee, tradingFee, protocolFee, referralFee }
}

/**
 * [trading fee, protocol fee, referral fee]: the protocol takes
 * PROTOCOL_FEE_PERCENT of the fee and the referrer HOST_FEE_PERCENT of that,
 * both rounded down.
 */
export function splitFees(feeAmount: BN, hasReferral: boolean): [BN, BN, BN] {
    const protocolFee = mulDiv(
        feeAmount,
        new BN(PROTOCOL_FEE_PERCENT),
        new BN(100),
        Rounding.Down
    )
    const tradingFee = SafeMath.sub(feeAmount, protocolFee)
    const referralFee = hasReferral
        ? mulDiv(
              protocolFee,
              new BN(HOST_FEE_PERCENT),
              new BN(100),
              Rounding.Down
          )
        : new BN(0)
    return [tradingFee, SafeMath.sub(protocolFee, referralFee), referralFee]
}
