import { Transaction } from '@solana/web3.js'
import {
    DynamicBondingCurveProgram,
    type TransferHookTransfer,
} from './program'
import {
    AccountsType,
    SwapMode,
    SwapQuote2Params,
    SwapQuoteParams,
    Swap2Params,
    type SwapParams,
    SwapQuoteResult,
    SwapQuote2Result,
    TradeDirection,
    type SimulatedQuoteFromInputAmountParams,
    type SimulatedQuoteFromOutputAmountParams,
} from '../types'
import { validateSwapAmount } from '../helpers'
import { quoteSwap2 } from '../helpers/quoteSwap'
import { swapQuote, getFeeMode } from '../math'
import { prepareSwapAccounts, rateLimiterApplied } from '../helpers/swap'
import BN from 'bn.js'

export class PoolService extends DynamicBondingCurveProgram {
    /**
     * Build an exact-in swap transaction for an existing pool.
     *
     * The transaction prepares token accounts, wraps SOL when SOL is the input mint,
     * and unwraps SOL after the swap when either side of the trade is SOL.
     */
    async swap(params: SwapParams): Promise<Transaction> {
        const {
            amountIn,
            minimumAmountOut,
            swapBaseForQuote,
            owner,
            payer,
            pool,
            referralTokenAccount,
        } = params

        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool) {
            throw new Error(
                'Pool uses a transfer hook, use swap2WithTransferHook'
            )
        }

        validateSwapAmount(amountIn)

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: poolConfigState.poolFees.baseFee.baseFeeMode,
            firstFactor: poolConfigState.poolFees.baseFee.firstFactor,
            secondFactor: poolConfigState.poolFees.baseFee.secondFactor,
            thirdFactor: poolConfigState.poolFees.baseFee.thirdFactor,
            activationType: poolConfigState.activationType,
            activationPoint: virtualPool.poolState.activationPoint,
            swapBaseForQuote,
        })

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                swapBaseForQuote,
                virtualPool.poolState,
                poolConfigState
            )

        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: payer ? payer : owner,
            inputOwner: owner,
            outputOwner: owner,
            unwrapAuthority: owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount: amountIn,
            includeInstructionSysvar:
                rateLimited ||
                Boolean(poolConfigState.enableFirstSwapWithMinFee),
        })

        return this.program.methods
            .swap({
                amountIn,
                minimumAmountOut,
            })
            .accountsPartial({
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount,
                inputTokenAccount,
                outputTokenAccount,
                payer: owner,
                tokenBaseProgram: swapBaseForQuote
                    ? inputTokenProgram
                    : outputTokenProgram,
                tokenQuoteProgram: swapBaseForQuote
                    ? outputTokenProgram
                    : inputTokenProgram,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a swap transaction using `SwapMode.ExactIn`, `SwapMode.PartialFill`, or `SwapMode.ExactOut`.
     *
     * Exact-out swaps use `amountOut` and `maximumAmountIn`;
     * Exact-in and Partial-fill swaps use `amountIn` and `minimumAmountOut`.
     */
    async swap2(params: Swap2Params): Promise<Transaction> {
        const {
            pool,
            swapBaseForQuote,
            swapMode,
            owner,
            payer,
            referralTokenAccount,
        } = params

        let amount0: BN
        let amount1: BN

        if (swapMode === SwapMode.ExactOut) {
            amount0 = params.amountOut
            amount1 = params.maximumAmountIn
        } else {
            amount0 = params.amountIn
            amount1 = params.minimumAmountOut
        }

        validateSwapAmount(amount0)

        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool) {
            throw new Error(
                'Pool uses a transfer hook, use swap2WithTransferHook'
            )
        }

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: poolConfigState.poolFees.baseFee.baseFeeMode,
            firstFactor: poolConfigState.poolFees.baseFee.firstFactor,
            secondFactor: poolConfigState.poolFees.baseFee.secondFactor,
            thirdFactor: poolConfigState.poolFees.baseFee.thirdFactor,
            activationType: poolConfigState.activationType,
            activationPoint: virtualPool.poolState.activationPoint,
            swapBaseForQuote,
        })

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                swapBaseForQuote,
                virtualPool.poolState,
                poolConfigState
            )

        const wrapAmount =
            swapMode === SwapMode.ExactIn || swapMode === SwapMode.PartialFill
                ? amount0
                : amount1
        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: payer ? payer : owner,
            inputOwner: owner,
            outputOwner: owner,
            unwrapAuthority: owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount,
            includeInstructionSysvar:
                rateLimited ||
                Boolean(poolConfigState.enableFirstSwapWithMinFee),
        })

        return this.program.methods
            .swap2({
                amount0,
                amount1,
                swapMode: swapMode,
            })
            .accountsPartial({
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount: referralTokenAccount,
                inputTokenAccount,
                outputTokenAccount,
                payer: owner,
                tokenBaseProgram: swapBaseForQuote
                    ? inputTokenProgram
                    : outputTokenProgram,
                tokenQuoteProgram: swapBaseForQuote
                    ? outputTokenProgram
                    : inputTokenProgram,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a swap2 transaction for transfer-hook pools.
     */
    async swap2WithTransferHook(params: Swap2Params): Promise<Transaction> {
        const {
            pool,
            swapBaseForQuote,
            swapMode,
            owner,
            payer,
            referralTokenAccount,
        } = params

        let amount0: BN
        let amount1: BN

        if (swapMode === SwapMode.ExactOut) {
            amount0 = params.amountOut
            amount1 = params.maximumAmountIn
        } else {
            amount0 = params.amountIn
            amount1 = params.minimumAmountOut
        }

        validateSwapAmount(amount0)

        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (!isTransferHookPool) {
            throw new Error('Pool does not use a transfer hook, use swap2')
        }

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFeeMode: poolConfigState.poolFees.baseFee.baseFeeMode,
            firstFactor: poolConfigState.poolFees.baseFee.firstFactor,
            secondFactor: poolConfigState.poolFees.baseFee.secondFactor,
            thirdFactor: poolConfigState.poolFees.baseFee.thirdFactor,
            activationType: poolConfigState.activationType,
            activationPoint: virtualPool.poolState.activationPoint,
            swapBaseForQuote,
        })

        const { inputMint, outputMint, inputTokenProgram, outputTokenProgram } =
            this.prepareSwapParams(
                swapBaseForQuote,
                virtualPool.poolState,
                poolConfigState
            )

        const wrapAmount =
            swapMode === SwapMode.ExactIn || swapMode === SwapMode.PartialFill
                ? amount0
                : amount1
        const {
            inputTokenAccount,
            outputTokenAccount,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: payer ? payer : owner,
            inputOwner: owner,
            outputOwner: owner,
            unwrapAuthority: owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount,
            includeInstructionSysvar:
                rateLimited ||
                Boolean(poolConfigState.enableFirstSwapWithMinFee),
        })

        const baseVault = virtualPool.poolState.baseVault
        const transferHookTransfers: TransferHookTransfer[] = [
            swapBaseForQuote
                ? {
                      accountsType: AccountsType.TransferHookBase,
                      source: inputTokenAccount,
                      destination: baseVault,
                      authority: owner,
                  }
                : {
                      accountsType: AccountsType.TransferHookBase,
                      source: baseVault,
                      destination: outputTokenAccount,
                      authority: this.poolAuthority,
                  },
        ]
        if (
            referralTokenAccount != null &&
            getFeeMode(
                poolConfigState.collectFeeMode,
                swapBaseForQuote
                    ? TradeDirection.BaseToQuote
                    : TradeDirection.QuoteToBase,
                true
            ).feesOnBaseToken
        ) {
            transferHookTransfers.push({
                accountsType: AccountsType.TransferHookBaseReferral,
                source: baseVault,
                destination: referralTokenAccount,
                authority: this.poolAuthority,
            })
        }
        const {
            info: transferHookAccountsInfo,
            accounts: transferHookAccounts,
        } = await this.getRemainingAccountsForTransferHook(
            virtualPool.poolState.baseMint,
            transferHookTransfers
        )

        remainingAccounts.push(...transferHookAccounts)

        return this.program.methods
            .swap2WithTransferHook(
                {
                    amount0,
                    amount1,
                    swapMode,
                },
                transferHookAccountsInfo
            )
            .accountsPartial({
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount,
                inputTokenAccount,
                outputTokenAccount,
                payer: owner,
                tokenBaseProgram: swapBaseForQuote
                    ? inputTokenProgram
                    : outputTokenProgram,
                tokenQuoteProgram: swapBaseForQuote
                    ? outputTokenProgram
                    : inputTokenProgram,
            })
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Quote an exact-in swap for the original swap instruction.
     */
    swapQuote(params: SwapQuoteParams): SwapQuoteResult {
        const {
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
        } = params

        return swapQuote(
            virtualPool,
            config,
            swapBaseForQuote,
            amountIn,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            params
        )
    }

    /**
     * Quote a swap using `SwapMode.ExactIn`, `SwapMode.PartialFill`, or `SwapMode.ExactOut`.
     */
    swapQuote2(params: SwapQuote2Params): SwapQuote2Result {
        return quoteSwap2(params)
    }

    /**
     * quotes a swap from an input amount before any pool exists.
     */
    getQuoteFromInputAmount(
        params: SimulatedQuoteFromInputAmountParams
    ): SwapQuote2Result {
        return quoteSwap2(params)
    }

    /**
     * quotes a swap from an exact output amount (`SwapMode.ExactOut`)
     */
    getQuoteFromOutputAmount(
        params: SimulatedQuoteFromOutputAmountParams
    ): SwapQuote2Result {
        return quoteSwap2({
            ...params,
            swapMode: SwapMode.ExactOut,
        })
    }
}
