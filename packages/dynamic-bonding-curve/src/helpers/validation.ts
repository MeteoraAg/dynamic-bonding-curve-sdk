import BN from 'bn.js'
import {
    MAX_CREATOR_MIGRATION_FEE_PERCENTAGE,
    MAX_CURVE_POINT,
    MAX_MIGRATION_FEE_PERCENTAGE,
    MAX_SQRT_PRICE,
    MIN_SQRT_PRICE,
} from '../constants'
import {
    ActivationType,
    BaseFee,
    BaseFeeMode,
    CollectFeeMode,
    LockedVestingParameters,
    MigrationFeeOption,
    MigrationOption,
    PoolFeeParameters,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
    type CreateConfigParam,
    type PoolConfig,
} from '../types'
import { Connection, PublicKey } from '@solana/web3.js'
import {
    getBaseTokenForSwap,
    getMigrationBaseToken,
    getMigrationQuoteAmountFromMigrationQuoteThreshold,
    getMigrationThresholdPrice,
    getSwapAmountWithBuffer,
    getTotalTokenSupply,
} from './common'
import {
    convertDecimalToBN,
    isDefaultLockedVesting,
    isNativeSol,
} from './utils'
import Decimal from 'decimal.js'
import {
    FEE_DENOMINATOR,
    MAX_FEE_NUMERATOR,
    MAX_RATE_LIMITER_DURATION_IN_SECONDS,
    MAX_RATE_LIMITER_DURATION_IN_SLOTS,
    MIN_FEE_NUMERATOR,
} from '../constants'
import { bpsToFeeNumerator } from './utils'
import { getFeeNumeratorOnRateLimiter } from '../math/rateLimiter'

/**
 * Validate the pool fees
 * @param poolFees - The pool fees
 * @param collectFeeMode - The collect fee mode
 * @param activationType - The activation type
 * @returns true if the pool fees are valid, false otherwise
 */
export function validatePoolFees(
    poolFees: PoolFeeParameters,
    collectFeeMode: CollectFeeMode,
    activationType: ActivationType
): boolean {
    if (!poolFees) return false

    // check base fee if it exists
    if (poolFees.baseFee) {
        if (poolFees.baseFee.cliffFeeNumerator.lte(new BN(0))) {
            return false
        }

        // validate fee scheduler if it exists
        if (
            poolFees.baseFee.baseFeeMode === BaseFeeMode.FeeSchedulerLinear ||
            poolFees.baseFee.baseFeeMode === BaseFeeMode.FeeSchedulerExponential
        ) {
            if (!validateFeeScheduler(poolFees.baseFee)) {
                return false
            }
        }

        // validate fee rate limiter if it exists
        if (poolFees.baseFee.baseFeeMode === BaseFeeMode.RateLimiter) {
            if (
                !validateFeeRateLimiter(
                    poolFees.baseFee,
                    collectFeeMode,
                    activationType
                )
            ) {
                return false
            }
        }
    }

    return true
}

/**
 * Validate the fee scheduler parameters
 * @param feeScheduler - The fee scheduler parameters
 * @returns true if the fee scheduler parameters are valid, false otherwise
 */
export function validateFeeScheduler(feeScheduler: BaseFee): boolean {
    if (!feeScheduler) return true

    // if any parameter is set, all must be set
    if (
        feeScheduler.firstFactor !== 0 ||
        feeScheduler.secondFactor.gt(new BN(0)) ||
        feeScheduler.thirdFactor.gt(new BN(0))
    ) {
        if (
            feeScheduler.firstFactor === 0 ||
            feeScheduler.secondFactor.eq(new BN(0)) ||
            feeScheduler.thirdFactor.eq(new BN(0))
        ) {
            return false
        }
    }

    // validate cliff fee numerator
    if (feeScheduler.cliffFeeNumerator.lte(new BN(0))) {
        return false
    }

    // validate fee scheduler mode
    if (
        feeScheduler.baseFeeMode !== BaseFeeMode.FeeSchedulerLinear &&
        feeScheduler.baseFeeMode !== BaseFeeMode.FeeSchedulerExponential
    ) {
        return false
    }

    // for linear mode, validate that the final fee won't be negative
    if (feeScheduler.baseFeeMode === BaseFeeMode.FeeSchedulerLinear) {
        const finalFee = feeScheduler.cliffFeeNumerator.sub(
            feeScheduler.secondFactor.mul(new BN(feeScheduler.firstFactor))
        )
        if (finalFee.lt(new BN(0))) {
            return false
        }
    }

    // validate min and max fee numerators
    const minFeeNumerator = feeScheduler.cliffFeeNumerator.sub(
        feeScheduler.secondFactor.mul(new BN(feeScheduler.firstFactor))
    )
    const maxFeeNumerator = feeScheduler.cliffFeeNumerator

    // validate against fee denominator
    if (
        minFeeNumerator.gte(new BN(FEE_DENOMINATOR)) ||
        maxFeeNumerator.gte(new BN(FEE_DENOMINATOR))
    ) {
        return false
    }

    // validate against min and max fee numerators
    if (
        minFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        maxFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        return false
    }

    return true
}

/**
 * Validate the fee rate limiter parameters
 * @param feeRateLimiter - The fee rate limiter parameters
 * @param collectFeeMode - The collect fee mode
 * @param activationType - The activation type
 * @returns true if the fee rate limiter parameters are valid, false otherwise
 */
export function validateFeeRateLimiter(
    feeRateLimiter: BaseFee,
    collectFeeMode: CollectFeeMode,
    activationType: ActivationType
): boolean {
    if (!feeRateLimiter) return true

    // can only be applied in quote token collect fee mode
    if (collectFeeMode !== CollectFeeMode.QuoteToken) {
        return false
    }

    // check if it's a zero rate limiter
    if (
        !feeRateLimiter.firstFactor &&
        !feeRateLimiter.secondFactor &&
        !feeRateLimiter.thirdFactor
    ) {
        return true
    }

    // check if it's a non-zero rate limiter
    if (
        !feeRateLimiter.firstFactor ||
        !feeRateLimiter.secondFactor ||
        !feeRateLimiter.thirdFactor
    ) {
        return false
    }

    // validate max limiter duration based on activation type
    const maxDuration =
        activationType === ActivationType.Slot
            ? MAX_RATE_LIMITER_DURATION_IN_SLOTS
            : MAX_RATE_LIMITER_DURATION_IN_SECONDS

    if (feeRateLimiter.secondFactor.gt(new BN(maxDuration))) {
        return false
    }

    // validate fee increment numerator
    const feeIncrementNumerator = bpsToFeeNumerator(feeRateLimiter.firstFactor)
    if (feeIncrementNumerator.gte(new BN(FEE_DENOMINATOR))) {
        return false
    }

    // validate cliff fee numerator
    if (
        feeRateLimiter.cliffFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        feeRateLimiter.cliffFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        return false
    }

    // validate min and max fee numerators based on amounts
    const minFeeNumerator = getFeeNumeratorOnRateLimiter(
        feeRateLimiter.cliffFeeNumerator,
        feeRateLimiter.thirdFactor,
        new BN(feeRateLimiter.firstFactor),
        new BN(0)
    )

    const maxFeeNumerator = getFeeNumeratorOnRateLimiter(
        feeRateLimiter.cliffFeeNumerator,
        feeRateLimiter.thirdFactor,
        new BN(feeRateLimiter.firstFactor),
        new BN(Number.MAX_SAFE_INTEGER)
    )

    if (
        minFeeNumerator.lt(new BN(MIN_FEE_NUMERATOR)) ||
        maxFeeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ) {
        return false
    }

    return true
}

/**
 * Validate the collect fee mode
 * @param collectFeeMode - The collect fee mode
 * @returns true if the collect fee mode is valid, false otherwise
 */
export function validateCollectFeeMode(
    collectFeeMode: CollectFeeMode
): boolean {
    return [CollectFeeMode.QuoteToken, CollectFeeMode.OutputToken].includes(
        collectFeeMode
    )
}

/**
 * Validate the migration and token type
 * @param migrationOption - The migration option
 * @param tokenType - The token type
 * @returns true if the migration and token type are valid, false otherwise
 */
export function validateMigrationAndTokenType(
    migrationOption: MigrationOption,
    tokenType: TokenType
): boolean {
    if (migrationOption === MigrationOption.MET_DAMM) {
        return tokenType === TokenType.SPL
    }
    return true
}

/**
 * Validate the activation type
 * @param activationType - The activation type
 * @returns true if the activation type is valid, false otherwise
 */
export function validateActivationType(
    activationType: ActivationType
): boolean {
    return [ActivationType.Slot, ActivationType.Timestamp].includes(
        activationType
    )
}

/**
 * Validate the migration fee option
 * @param migrationFeeOption - The migration fee option
 * @returns true if the migration fee option is valid, false otherwise
 */
export function validateMigrationFeeOption(
    migrationFeeOption: MigrationFeeOption
): boolean {
    return [
        MigrationFeeOption.FixedBps25,
        MigrationFeeOption.FixedBps30,
        MigrationFeeOption.FixedBps100,
        MigrationFeeOption.FixedBps200,
        MigrationFeeOption.FixedBps400,
        MigrationFeeOption.FixedBps600,
    ].includes(migrationFeeOption)
}

/**
 * Validate the token decimals
 * @param tokenDecimal - The token decimal
 * @returns true if the token decimal is valid, false otherwise
 */
export function validateTokenDecimals(tokenDecimal: TokenDecimal): boolean {
    return tokenDecimal >= TokenDecimal.SIX && tokenDecimal <= TokenDecimal.NINE
}

/**
 * Validate the LP percentages
 * @param partnerLpPercentage - The partner LP percentage
 * @param partnerLockedLpPercentage - The partner locked LP percentage
 * @param creatorLpPercentage - The creator LP percentage
 * @param creatorLockedLpPercentage - The creator locked LP percentage
 * @returns true if the LP percentages are valid, false otherwise
 */
export function validateLPPercentages(
    partnerLpPercentage: number,
    partnerLockedLpPercentage: number,
    creatorLpPercentage: number,
    creatorLockedLpPercentage: number
): boolean {
    const totalLPPercentage =
        partnerLpPercentage +
        partnerLockedLpPercentage +
        creatorLpPercentage +
        creatorLockedLpPercentage
    return totalLPPercentage === 100
}

/**
 * Validate the curve
 * @param curve - The curve
 * @param sqrtStartPrice - The sqrt start price
 * @returns true if the curve is valid, false otherwise
 */
export function validateCurve(
    curve: Array<{ sqrtPrice: BN; liquidity: BN }>,
    sqrtStartPrice: BN
): boolean {
    if (!curve || curve.length === 0 || curve.length > MAX_CURVE_POINT) {
        return false
    }

    // first curve point validation
    if (
        curve[0]?.sqrtPrice.lte(sqrtStartPrice) ||
        curve[0]?.liquidity.lte(new BN(0)) ||
        curve[0]?.sqrtPrice.gt(new BN(MAX_SQRT_PRICE))
    ) {
        return false
    }

    // validate curve points are in ascending order and have positive liquidity
    for (let i = 1; i < curve.length; i++) {
        const currentPoint = curve[i]
        const previousPoint = curve[i - 1]

        if (!currentPoint || !previousPoint) {
            return false
        }

        if (
            currentPoint.sqrtPrice.lte(previousPoint.sqrtPrice) ||
            currentPoint.liquidity.lte(new BN(0))
        ) {
            return false
        }
    }

    // validate last curve point
    return !curve[curve.length - 1]?.sqrtPrice.gt(new BN(MAX_SQRT_PRICE))
}

/**
 * Validate token supply
 * @param tokenSupply - The token supply
 * @param leftoverReceiver - The leftover receiver
 * @param swapBaseAmount - The swap base amount
 * @param migrationBaseAmount - The migration base amount
 * @param lockedVesting - The locked vesting parameters
 * @param swapBaseAmountBuffer - The swap base amount buffer
 * @returns true if the token supply is valid, false otherwise
 */
export function validateTokenSupply(
    tokenSupply: {
        preMigrationTokenSupply: BN
        postMigrationTokenSupply: BN
    },
    leftoverReceiver: PublicKey,
    swapBaseAmount: BN,
    migrationBaseAmount: BN,
    lockedVesting: LockedVestingParameters,
    swapBaseAmountBuffer: BN
): boolean {
    if (!tokenSupply) return true

    if (!leftoverReceiver) {
        return false
    }

    // Check if it's a PublicKey instance
    if (!(leftoverReceiver instanceof PublicKey)) {
        return false
    }

    // Check if it's not the default public key (all zeros)
    if (leftoverReceiver.equals(PublicKey.default)) {
        return false
    }

    const minimumBaseSupplyWithBuffer = getTotalTokenSupply(
        swapBaseAmountBuffer,
        migrationBaseAmount,
        lockedVesting
    )

    const minimumBaseSupplyWithoutBuffer = getTotalTokenSupply(
        swapBaseAmount,
        migrationBaseAmount,
        lockedVesting
    )

    return !(
        minimumBaseSupplyWithoutBuffer.gt(
            new BN(tokenSupply.postMigrationTokenSupply)
        ) ||
        new BN(tokenSupply.postMigrationTokenSupply).gt(
            new BN(tokenSupply.preMigrationTokenSupply)
        ) ||
        minimumBaseSupplyWithBuffer.gt(
            new BN(tokenSupply.preMigrationTokenSupply)
        )
    )
}

/**
 * Validate the update authority option
 * @param option  - The update authority option
 * @returns true if the token update authority option is valid, false otherwise
 */
export function validateTokenUpdateAuthorityOptions(
    option: TokenUpdateAuthorityOption
): boolean {
    return [
        TokenUpdateAuthorityOption.CreatorUpdateAuthority,
        TokenUpdateAuthorityOption.Immutable,
        TokenUpdateAuthorityOption.PartnerUpdateAuthority,
        TokenUpdateAuthorityOption.CreatorUpdateAndMintAuthority,
        TokenUpdateAuthorityOption.PartnerUpdateAndMintAuthority,
    ].includes(option)
}

/**
 * Validate the config parameters
 * @param configParam - The config parameters
 */
export function validateConfigParameters(
    configParam: Omit<
        CreateConfigParam,
        'config' | 'feeClaimer' | 'quoteMint' | 'payer'
    >
) {
    // Pool fees validation
    if (!configParam.poolFees) {
        throw new Error('Pool fees are required')
    }
    if (
        !validatePoolFees(
            configParam.poolFees,
            configParam.collectFeeMode,
            configParam.activationType
        )
    ) {
        throw new Error('Invalid pool fees')
    }

    // Collect fee mode validation
    if (!validateCollectFeeMode(configParam.collectFeeMode)) {
        throw new Error('Invalid collect fee mode')
    }

    // Update token authority option validation
    if (
        !validateTokenUpdateAuthorityOptions(configParam.tokenUpdateAuthority)
    ) {
        throw new Error('Invalid option for token update authority')
    }

    // Migration and token type validation
    if (
        !validateMigrationAndTokenType(
            configParam.migrationOption,
            configParam.tokenType
        )
    ) {
        throw new Error('Token type must be SPL for MeteoraDamm migration')
    }

    // Activation type validation
    if (!validateActivationType(configParam.activationType)) {
        throw new Error('Invalid activation type')
    }

    // Migration fee validation
    if (!validateMigrationFeeOption(configParam.migrationFeeOption)) {
        throw new Error('Invalid migration fee option')
    }

    // Migration fee percentages validation
    if (
        configParam.migrationFee.feePercentage < 0 ||
        configParam.migrationFee.feePercentage > MAX_MIGRATION_FEE_PERCENTAGE
    ) {
        throw new Error(
            `Migration fee percentage must be between 0 and ${MAX_MIGRATION_FEE_PERCENTAGE}`
        )
    }
    if (
        configParam.migrationFee.creatorFeePercentage < 0 ||
        configParam.migrationFee.creatorFeePercentage >
            MAX_CREATOR_MIGRATION_FEE_PERCENTAGE
    ) {
        throw new Error(
            `Creator fee percentage must be between 0 and ${MAX_CREATOR_MIGRATION_FEE_PERCENTAGE}`
        )
    }

    // Token decimals validation
    if (!validateTokenDecimals(configParam.tokenDecimal)) {
        throw new Error('Token decimal must be between 6 and 9')
    }

    // LP percentages validation
    if (
        !validateLPPercentages(
            configParam.partnerLpPercentage,
            configParam.partnerLockedLpPercentage,
            configParam.creatorLpPercentage,
            configParam.creatorLockedLpPercentage
        )
    ) {
        throw new Error('Sum of LP percentages must equal 100')
    }

    // Migration quote threshold validation
    if (configParam.migrationQuoteThreshold.lte(new BN(0))) {
        throw new Error('Migration quote threshold must be greater than 0')
    }

    // Price validation
    if (
        new BN(configParam.sqrtStartPrice).lt(new BN(MIN_SQRT_PRICE)) ||
        new BN(configParam.sqrtStartPrice).gte(new BN(MAX_SQRT_PRICE))
    ) {
        throw new Error('Invalid sqrt start price')
    }

    // Curve validation
    if (!validateCurve(configParam.curve, configParam.sqrtStartPrice)) {
        throw new Error('Invalid curve')
    }

    // Locked vesting validation
    if (!isDefaultLockedVesting(configParam.lockedVesting)) {
        try {
            const totalAmount = configParam.lockedVesting.cliffUnlockAmount.add(
                configParam.lockedVesting.amountPerPeriod.mul(
                    new BN(configParam.lockedVesting.numberOfPeriod)
                )
            )
            if (
                configParam.lockedVesting.frequency.eq(new BN(0)) ||
                totalAmount.eq(new BN(0))
            ) {
                throw new Error('Invalid vesting parameters')
            }
        } catch (error) {
            throw new Error('Invalid vesting parameters')
        }
    }

    // Token supply validation
    if (configParam.tokenSupply) {
        const sqrtMigrationPrice = getMigrationThresholdPrice(
            configParam.migrationQuoteThreshold,
            configParam.sqrtStartPrice,
            configParam.curve
        )

        const swapBaseAmount = getBaseTokenForSwap(
            configParam.sqrtStartPrice,
            sqrtMigrationPrice,
            configParam.curve
        )

        const migrationBaseAmount = getMigrationBaseToken(
            convertDecimalToBN(
                getMigrationQuoteAmountFromMigrationQuoteThreshold(
                    new Decimal(configParam.migrationQuoteThreshold.toString()),
                    configParam.migrationFee.feePercentage
                )
            ),
            sqrtMigrationPrice,
            configParam.migrationOption
        )

        const swapBaseAmountBuffer = getSwapAmountWithBuffer(
            swapBaseAmount,
            configParam.sqrtStartPrice,
            configParam.curve
        )

        if (
            !validateTokenSupply(
                configParam.tokenSupply,
                new PublicKey(configParam.leftoverReceiver),
                swapBaseAmount,
                migrationBaseAmount,
                configParam.lockedVesting,
                swapBaseAmountBuffer
            )
        ) {
            throw new Error('Invalid token supply')
        }
    }
}

/**
 * Validate that the base token type matches the pool config token type
 * @param baseTokenType - The base token type from create pool parameters
 * @param poolConfig - The pool config state
 * @returns true if the token types match, false otherwise
 */
export function validateBaseTokenType(
    baseTokenType: TokenType,
    poolConfig: PoolConfig
): boolean {
    return baseTokenType === poolConfig.tokenType
}

/**
 * Validate that the user has sufficient balance for the swap
 * @param connection - The Solana connection
 * @param owner - The owner's public key
 * @param inputMint - The mint of the input token
 * @param amountIn - The input amount for the swap
 * @param inputTokenAccount - The token account to check balance for
 * @returns true if the balance is sufficient, throws error if insufficient
 */
export async function validateBalance(
    connection: Connection,
    owner: PublicKey,
    inputMint: PublicKey,
    amountIn: BN,
    inputTokenAccount: PublicKey
): Promise<boolean> {
    const isSOLInput = isNativeSol(inputMint)

    if (isSOLInput) {
        const balance = await connection.getBalance(owner)
        const requiredBalance = BigInt(amountIn.toString()) + BigInt(10000000) // Add 0.01 SOL for fees and rent

        if (balance < Number(requiredBalance)) {
            throw new Error(
                `Insufficient SOL balance. Required: ${requiredBalance.toString()} lamports, Found: ${balance} lamports`
            )
        }
    } else {
        try {
            const tokenBalance =
                await connection.getTokenAccountBalance(inputTokenAccount)
            const balance = new BN(tokenBalance.value.amount)

            if (balance.lt(amountIn)) {
                throw new Error(
                    `Insufficient token balance. Required: ${amountIn.toString()}, Found: ${balance.toString()}`
                )
            }
        } catch (error) {
            throw new Error(
                `Failed to fetch token balance or token account doesn't exist`
            )
        }
    }

    return true
}

/**
 * Validate that the swap amount is valid
 * @param amountIn - The input amount for the swap
 * @returns true if the amount is valid, throws error if invalid
 */
export function validateSwapAmount(amountIn: BN): boolean {
    if (amountIn.lte(new BN(0))) {
        throw new Error('Swap amount must be greater than 0')
    }
    return true
}
