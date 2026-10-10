import BN from 'bn.js'
import { TradeDirection, BaseFeeMode, type BaseFeeHandler } from '../../types'
import {
    getFeeNumeratorFromIncludedAmount,
    getFeeNumeratorFromExcludedAmount,
    isRateLimiterApplied,
} from './rateLimiter'
import {
    getBaseFeeNumerator,
    getFeeSchedulerMinBaseFeeNumerator,
} from './feeScheduler'
import { ProgramError } from '../errors'

export class FeeRateLimiter implements BaseFeeHandler {
    constructor(
        public cliffFeeNumerator: BN,
        public feeIncrementBps: number,
        public maxLimiterDuration: BN,
        public referenceAmount: BN
    ) {}

    getMinBaseFeeNumerator(): BN {
        return this.cliffFeeNumerator
    }

    private isApplied(
        currentPoint: BN,
        activationPoint: BN,
        tradeDirection: TradeDirection
    ): boolean {
        return isRateLimiterApplied(
            currentPoint,
            activationPoint,
            tradeDirection,
            this.maxLimiterDuration,
            this.referenceAmount,
            new BN(this.feeIncrementBps)
        )
    }

    getBaseFeeNumeratorFromIncludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN,
        tradeDirection: TradeDirection,
        includedFeeAmount: BN
    ): BN {
        if (!this.isApplied(currentPoint, activationPoint, tradeDirection)) {
            return this.cliffFeeNumerator
        }
        return getFeeNumeratorFromIncludedAmount(
            this.cliffFeeNumerator,
            this.referenceAmount,
            new BN(this.feeIncrementBps),
            includedFeeAmount
        )
    }

    getBaseFeeNumeratorFromExcludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN,
        tradeDirection: TradeDirection,
        excludedFeeAmount: BN
    ): BN {
        if (!this.isApplied(currentPoint, activationPoint, tradeDirection)) {
            return this.cliffFeeNumerator
        }
        return getFeeNumeratorFromExcludedAmount(
            this.cliffFeeNumerator,
            this.referenceAmount,
            new BN(this.feeIncrementBps),
            excludedFeeAmount
        )
    }
}

export class FeeScheduler implements BaseFeeHandler {
    constructor(
        public cliffFeeNumerator: BN,
        public numberOfPeriod: number,
        public periodFrequency: BN,
        public reductionFactor: BN,
        public feeSchedulerMode: BaseFeeMode
    ) {}

    getMinBaseFeeNumerator(): BN {
        return getFeeSchedulerMinBaseFeeNumerator(
            this.cliffFeeNumerator,
            this.numberOfPeriod,
            this.reductionFactor,
            this.feeSchedulerMode
        )
    }

    // a scheduler's fee depends on the point, not on the amount
    getBaseFeeNumeratorFromIncludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN
    ): BN {
        return getBaseFeeNumerator(
            this.cliffFeeNumerator,
            this.numberOfPeriod,
            this.periodFrequency,
            this.reductionFactor,
            this.feeSchedulerMode,
            currentPoint,
            activationPoint
        )
    }

    getBaseFeeNumeratorFromExcludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN
    ): BN {
        return this.getBaseFeeNumeratorFromIncludedFeeAmount(
            currentPoint,
            activationPoint
        )
    }
}

/**
 * The handler for a base fee config. The factors are the scheduler's
 * numberOfPeriod, periodFrequency and reductionFactor, or the rate limiter's
 * feeIncrementBps, maxLimiterDuration and referenceAmount.
 */
export function getBaseFeeHandler(
    cliffFeeNumerator: BN,
    firstFactor: number,
    secondFactor: BN,
    thirdFactor: BN,
    baseFeeMode: BaseFeeMode
): BaseFeeHandler {
    switch (baseFeeMode) {
        case BaseFeeMode.FeeSchedulerLinear:
        case BaseFeeMode.FeeSchedulerExponential:
            return new FeeScheduler(
                cliffFeeNumerator,
                firstFactor,
                secondFactor,
                thirdFactor,
                baseFeeMode
            )
        case BaseFeeMode.RateLimiter:
            return new FeeRateLimiter(
                cliffFeeNumerator,
                firstFactor,
                secondFactor,
                thirdFactor
            )
        default:
            throw new Error(ProgramError.InvalidBaseFeeMode)
    }
}
