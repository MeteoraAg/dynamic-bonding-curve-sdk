import BN from 'bn.js'
import { SafeMath } from './safeMath'
import { mulDiv } from './utilsMath'
import {
    BASIS_POINT_MAX,
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
} from '../constants'
import {
    CollectFeeMode,
    FeeMode,
    PoolConfig,
    Rounding,
    TradeDirection,
    type DynamicFeeConfig,
    type FeeOnAmountResult,
    type PoolFeesConfig,
    type VolatilityTracker,
} from '../types'
import { getBaseFeeHandler } from './poolFees/baseFee'
import { getVariableFeeNumerator } from './poolFees/dynamicFee'

/**
 * Convert basis points to fee numerator
 * @param bps - Basis points
 * @param feeDenominator - Fee denominator
 * @returns Fee numerator
 * @throws Error if calculation fails due to overflow or type conversion
 */
export function toNumerator(bps: BN, feeDenominator: BN): BN {
    try {
        const numerator = mulDiv(
            bps,
            feeDenominator,
            new BN(BASIS_POINT_MAX),
            Rounding.Down
        )
        return numerator
    } catch (error) {
        throw new Error(
            'Type cast failed or calculation overflow in toNumerator'
        )
    }
}

/**
 * Get fee mode
 * @param collectFeeMode Collect fee mode
 * @param tradeDirection Trade direction
 * @param hasReferral Whether referral is used
 * @returns Fee mode
 */
export function getFeeMode(
    collectFeeMode: CollectFeeMode,
    tradeDirection: TradeDirection,
    hasReferral: boolean
): FeeMode {
    // (CollectFeeMode::OutputToken, TradeDirection::BaseToQuote) => (false, false),
    // (CollectFeeMode::OutputToken, TradeDirection::QuoteToBase) => (false, true),
    // (CollectFeeMode::QuoteToken, TradeDirection::BaseToQuote) => (false, false),
    // (CollectFeeMode::QuoteToken, TradeDirection::QuoteToBase) => (true, false),

    let feesOnInput: boolean
    let feesOnBaseToken: boolean

    if (collectFeeMode === CollectFeeMode.OutputToken) {
        if (tradeDirection === TradeDirection.BaseToQuote) {
            feesOnInput = false
            feesOnBaseToken = false
        } else {
            // TradeDirection.QuoteToBase
            feesOnInput = false
            feesOnBaseToken = true
        }
    } else {
        // CollectFeeMode.QuoteToken
        if (tradeDirection === TradeDirection.BaseToQuote) {
            feesOnInput = false
            feesOnBaseToken = false
        } else {
            // TradeDirection.QuoteToBase
            feesOnInput = true
            feesOnBaseToken = false
        }
    }

    return {
        feesOnInput,
        feesOnBaseToken,
        hasReferral,
    }
}

/**
 * Get total fee numerator from included fee amount
 * @param poolFees Pool fees
 * @param volatilityTracker Volatility tracker
 * @param currentPoint Current point
 * @param activationPoint Activation point
 * @param includedFeeAmount Included fee amount
 * @param tradeDirection Trade direction
 * @returns Total fee numerator
 */
export function getTotalFeeNumeratorFromIncludedFeeAmount(
    poolFees: PoolFeesConfig,
    volatilityTracker: VolatilityTracker,
    currentPoint: BN,
    activationPoint: BN,
    includedFeeAmount: BN,
    tradeDirection: TradeDirection
): BN {
    const baseFeeHandler = getBaseFeeHandler(
        poolFees.baseFee.cliffFeeNumerator,
        poolFees.baseFee.firstFactor,
        poolFees.baseFee.secondFactor,
        poolFees.baseFee.thirdFactor,
        poolFees.baseFee.baseFeeMode
    )

    const baseFeeNumerator =
        baseFeeHandler.getBaseFeeNumeratorFromIncludedFeeAmount(
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

/**
 * Get total fee numerator from excluded fee amount
 * @param poolFees Pool fees
 * @param volatilityTracker Volatility tracker
 * @param currentPoint Current point
 * @param activationPoint Activation point
 * @param excludedFeeAmount Excluded fee amount
 * @param tradeDirection Trade direction
 * @returns Total fee numerator
 */
export function getTotalFeeNumeratorFromExcludedFeeAmount(
    poolFees: PoolFeesConfig,
    volatilityTracker: VolatilityTracker,
    currentPoint: BN,
    activationPoint: BN,
    excludedFeeAmount: BN,
    tradeDirection: TradeDirection
): BN {
    const baseFeeHandler = getBaseFeeHandler(
        poolFees.baseFee.cliffFeeNumerator,
        poolFees.baseFee.firstFactor,
        poolFees.baseFee.secondFactor,
        poolFees.baseFee.thirdFactor,
        poolFees.baseFee.baseFeeMode
    )

    const baseFeeNumerator =
        baseFeeHandler.getBaseFeeNumeratorFromExcludedFeeAmount(
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

/**
 * Get total fee numerator from base fee numerator and volatility tracker
 * @param baseFeeNumerator Base fee numerator
 * @param dynamicFee Dynamic fee configuration
 * @param volatilityTracker Volatility tracker
 * @returns Total fee numerator
 */
export function getTotalFeeNumerator(
    baseFeeNumerator: BN,
    dynamicFee: DynamicFeeConfig,
    volatilityTracker: VolatilityTracker
): BN {
    const variableFeeNumerator = getVariableFeeNumerator(
        dynamicFee,
        volatilityTracker
    )
    const totalFeeNumerator = SafeMath.add(
        variableFeeNumerator,
        baseFeeNumerator
    )

    // Cap the total fee at MAX_FEE_NUMERATOR
    const maxFeeNumeratorBN = new BN(MAX_FEE_NUMERATOR)
    const cappedTotalFeeNumerator = totalFeeNumerator.gt(maxFeeNumeratorBN)
        ? new BN(MAX_FEE_NUMERATOR)
        : totalFeeNumerator

    return cappedTotalFeeNumerator
}

/**
 * Get fee on amount with trade fee numerator
 * @param tradeFeeNumerator Trade fee numerator
 * @param amount Amount
 * @param poolFees Pool fees
 * @param hasReferral Whether referral is used
 * @returns Fee on amount result
 */
export function getFeeOnAmount(
    tradeFeeNumerator: BN,
    amount: BN,
    poolFees: PoolFeesConfig,
    hasReferral: boolean
): FeeOnAmountResult {
    const [amountAfterFee, tradingFee] = getExcludedFeeAmount(
        tradeFeeNumerator,
        amount
    )

    const protocolFee = mulDiv(
        tradingFee,
        new BN(poolFees.protocolFeePercent),
        new BN(100),
        Rounding.Down
    )

    // update trading fee
    const updatedTradingFee = SafeMath.sub(tradingFee, protocolFee)

    const referralFee = hasReferral
        ? mulDiv(
              protocolFee,
              new BN(poolFees.referralFeePercent),
              new BN(100),
              Rounding.Down
          )
        : new BN(0)

    const updatedProtocolFee = SafeMath.sub(protocolFee, referralFee)

    return {
        amount: amountAfterFee,
        protocolFee: updatedProtocolFee,
        referralFee,
        tradingFee: updatedTradingFee,
    }
}

/**
 * Get excluded fee amount from included fee amount
 * @param tradeFeeNumerator Trade fee numerator
 * @param includedFeeAmount Included fee amount
 * @returns [excluded fee amount, trading fee]
 */
export function getExcludedFeeAmount(
    tradeFeeNumerator: BN,
    includedFeeAmount: BN
): [BN, BN] {
    const tradingFee = mulDiv(
        includedFeeAmount,
        tradeFeeNumerator,
        new BN(FEE_DENOMINATOR),
        Rounding.Up
    )
    // update amount
    const excludedFeeAmount = SafeMath.sub(includedFeeAmount, tradingFee)
    return [excludedFeeAmount, tradingFee]
}

/**
 * Get included fee amount from excluded fee amount
 * @param tradeFeeNumerator Trade fee numerator
 * @param excludedFeeAmount Excluded fee amount
 * @returns [included fee amount, fee amount]
 */
export function getIncludedFeeAmount(
    tradeFeeNumerator: BN,
    excludedFeeAmount: BN
): [BN, BN] {
    const includedFeeAmount = mulDiv(
        excludedFeeAmount,
        new BN(FEE_DENOMINATOR),
        SafeMath.sub(new BN(FEE_DENOMINATOR), tradeFeeNumerator),
        Rounding.Up
    )
    const feeAmount = SafeMath.sub(includedFeeAmount, excludedFeeAmount)
    return [includedFeeAmount, feeAmount]
}

/**
 * Split fees into trading, protocol, and referral fees
 * @param poolFees Pool fees
 * @param feeAmount Total fee amount
 * @param hasReferral Whether referral is used
 * @returns [trading fee, protocol fee, referral fee]
 */
export function splitFees(
    poolFees: PoolFeesConfig,
    feeAmount: BN,
    hasReferral: boolean
): [BN, BN, BN] {
    const protocolFee = mulDiv(
        feeAmount,
        new BN(poolFees.protocolFeePercent),
        new BN(100),
        Rounding.Down
    )

    // update trading fee
    const tradingFee = SafeMath.sub(feeAmount, protocolFee)

    const referralFee = hasReferral
        ? mulDiv(
              protocolFee,
              new BN(poolFees.referralFeePercent),
              new BN(100),
              Rounding.Down
          )
        : new BN(0)

    const protocolFeeAfterReferral = SafeMath.sub(protocolFee, referralFee)

    return [tradingFee, protocolFeeAfterReferral, referralFee]
}
