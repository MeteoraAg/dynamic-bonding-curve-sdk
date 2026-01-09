import BN from 'bn.js'
import {
    TradeDirection,
    BaseFeeMode,
    CollectFeeMode,
    ActivationType,
    BaseFeeHandler,
} from '../../types'
import {
    getFeeNumeratorFromIncludedAmount,
    getFeeNumeratorFromExcludedAmount,
    isRateLimiterApplied,
} from './rateLimiter'
import { getBaseFeeNumerator } from './feeScheduler'
import { validateFeeRateLimiter, validateFeeScheduler } from '../../helpers'

/**
 * Fee Rate Limiter implementation
 */
export class FeeRateLimiter implements BaseFeeHandler {
    constructor(
        public cliffFeeNumerator: BN,
        public feeIncrementBps: number,
        public maxLimiterDuration: BN,
        public referenceAmount: BN
    ) {}

    validate(
        collectFeeMode: CollectFeeMode,
        activationType: ActivationType
    ): boolean {
        return validateFeeRateLimiter(
            this.cliffFeeNumerator,
            new BN(this.feeIncrementBps),
            this.maxLimiterDuration,
            this.referenceAmount,
            collectFeeMode,
            activationType
        )
    }

    getBaseFeeNumeratorFromIncludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN,
        tradeDirection: TradeDirection,
        includedFeeAmount: BN
    ): BN {
        if (
            isRateLimiterApplied(
                currentPoint,
                activationPoint,
                tradeDirection,
                this.maxLimiterDuration,
                this.referenceAmount,
                new BN(this.feeIncrementBps)
            )
        ) {
            return getFeeNumeratorFromIncludedAmount(
                this.cliffFeeNumerator,
                this.referenceAmount,
                new BN(this.feeIncrementBps),
                includedFeeAmount
            )
        } else {
            return this.cliffFeeNumerator
        }
    }

    getBaseFeeNumeratorFromExcludedFeeAmount(
        currentPoint: BN,
        activationPoint: BN,
        tradeDirection: TradeDirection,
        excludedFeeAmount: BN
    ): BN {
        if (
            isRateLimiterApplied(
                currentPoint,
                activationPoint,
                tradeDirection,
                this.maxLimiterDuration,
                this.referenceAmount,
                new BN(this.feeIncrementBps)
            )
        ) {
            return getFeeNumeratorFromExcludedAmount(
                this.cliffFeeNumerator,
                this.referenceAmount,
                new BN(this.feeIncrementBps),
                excludedFeeAmount
            )
        } else {
            return this.cliffFeeNumerator
        }
    }
}

/**
 * Fee Scheduler implementation
 */
export class FeeScheduler implements BaseFeeHandler {
    constructor(
        public cliffFeeNumerator: BN,
        public numberOfPeriod: number,
        public periodFrequency: BN,
        public reductionFactor: BN,
        public feeSchedulerMode: BaseFeeMode
    ) {}

    validate(): boolean {
        return validateFeeScheduler(
            this.numberOfPeriod,
            this.periodFrequency,
            this.reductionFactor,
            this.cliffFeeNumerator,
            this.feeSchedulerMode
        )
    }

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
}

/**
 * Get base fee handler based on base fee mode
 * @param cliffFeeNumerator Cliff fee numerator
 * @param firstFactor First factor (feeScheduler: numberOfPeriod, rateLimiter: feeIncrementBps)
 * @param secondFactor Second factor (feeScheduler: periodFrequency, rateLimiter: maxLimiterDuration)
 * @param thirdFactor Third factor (feeScheduler: reductionFactor, rateLimiter: referenceAmount)
 * @param baseFeeMode Base fee mode
 * @returns Base fee handler instance
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
        case BaseFeeMode.FeeSchedulerExponential: {
            const feeScheduler = new FeeScheduler(
                cliffFeeNumerator,
                firstFactor,
                secondFactor,
                thirdFactor,
                baseFeeMode
            )
            return feeScheduler
        }
        case BaseFeeMode.RateLimiter: {
            const feeRateLimiter = new FeeRateLimiter(
                cliffFeeNumerator,
                firstFactor,
                secondFactor,
                thirdFactor
            )
            return feeRateLimiter
        }
        default:
            throw new Error('Invalid base fee mode')
    }
}
