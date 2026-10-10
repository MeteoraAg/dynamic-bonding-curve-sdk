import { PublicKey, Transaction } from '@solana/web3.js'
import {
    DynamicBondingCurveProgram,
    type TransferHookTransfer,
} from './program'
import {
    AccountsType,
    SwapMode,
    TradeDirection,
    type SimulatedQuoteFromInputAmountParams,
    type SimulatedQuoteFromOutputAmountParams,
    type Swap2Params,
    type SwapParams,
    type SwapQuote2Params,
    type SwapQuote2Result,
    type SwapQuoteParams,
    type SwapQuoteResult,
} from '../types'
import { validateSwapAmount } from '../helpers/validation'
import {
    getQuoteFromInputAmount,
    getQuoteFromOutputAmount,
} from '../helpers/quoteSwap'
import { getFeeMode } from '../math/feeMath'
import {
    swapQuote,
    swapQuoteExactIn,
    swapQuoteExactOut,
    swapQuotePartialFill,
} from '../math/swapQuote'
import { prepareSwapAccounts, rateLimiterApplied } from '../helpers/swap'
import BN from 'bn.js'

export class PoolService extends DynamicBondingCurveProgram {
    /**
     * Pool state, token accounts and the instruction accounts shared by the
     * swap builders. Wraps SOL on the input side and unwraps it after the swap
     * when either side is SOL.
     */
    private async prepareSwap(params: {
        pool: PublicKey
        owner: PublicKey
        payer?: PublicKey
        referralTokenAccount: PublicKey | null
        swapBaseForQuote: boolean
        amountIn: BN
        wrapAmount: BN
        transferHook: boolean
    }) {
        const { pool, owner, swapBaseForQuote, referralTokenAccount } = params
        validateSwapAmount(params.amountIn)

        const { virtualPool, poolConfigState, isTransferHookPool } =
            await this.getPoolWithConfig(pool)
        if (isTransferHookPool !== params.transferHook) {
            throw new Error(
                isTransferHookPool
                    ? 'Pool uses a transfer hook, use swap2WithTransferHook'
                    : 'Pool does not use a transfer hook, use swap2'
            )
        }

        const rateLimited = await rateLimiterApplied({
            connection: this.connection,
            baseFee: poolConfigState.poolFees.baseFee,
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
        const swapAccounts = await prepareSwapAccounts({
            connection: this.connection,
            commitment: this.commitment,
            payer: params.payer ?? owner,
            inputOwner: owner,
            outputOwner: owner,
            unwrapAuthority: owner,
            inputMint,
            outputMint,
            inputTokenProgram,
            outputTokenProgram,
            wrapAmount: params.wrapAmount,
            includeInstructionSysvar:
                rateLimited ||
                Boolean(poolConfigState.enableFirstSwapWithMinFee),
        })

        return {
            virtualPool,
            poolConfigState,
            ...swapAccounts,
            accounts: {
                baseMint: virtualPool.poolState.baseMint,
                quoteMint: poolConfigState.quoteMint,
                pool,
                baseVault: virtualPool.poolState.baseVault,
                quoteVault: virtualPool.poolState.quoteVault,
                config: virtualPool.poolState.config,
                poolAuthority: this.poolAuthority,
                referralTokenAccount,
                inputTokenAccount: swapAccounts.inputTokenAccount,
                outputTokenAccount: swapAccounts.outputTokenAccount,
                payer: owner,
                tokenBaseProgram: swapBaseForQuote
                    ? inputTokenProgram
                    : outputTokenProgram,
                tokenQuoteProgram: swapBaseForQuote
                    ? outputTokenProgram
                    : inputTokenProgram,
            },
        }
    }

    private swap2Amounts(params: Swap2Params): {
        amount0: BN
        amount1: BN
        wrapAmount: BN
    } {
        if (params.swapMode === SwapMode.ExactOut) {
            return {
                amount0: params.amountOut,
                amount1: params.maximumAmountIn,
                wrapAmount: params.maximumAmountIn,
            }
        }
        return {
            amount0: params.amountIn,
            amount1: params.minimumAmountOut,
            wrapAmount: params.amountIn,
        }
    }

    /** Build an exact-in swap transaction for an existing pool. */
    async swap(params: SwapParams): Promise<Transaction> {
        const { amountIn, minimumAmountOut } = params
        const {
            accounts,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await this.prepareSwap({
            ...params,
            amountIn,
            wrapAmount: amountIn,
            transferHook: false,
        })

        return this.program.methods
            .swap({ amountIn, minimumAmountOut })
            .accountsPartial(accounts)
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /**
     * Build a swap transaction in SwapMode.ExactIn, SwapMode.PartialFill or
     * SwapMode.ExactOut. Exact-out takes amountOut and maximumAmountIn; the
     * other modes take amountIn and minimumAmountOut.
     */
    async swap2(params: Swap2Params): Promise<Transaction> {
        const { amount0, amount1, wrapAmount } = this.swap2Amounts(params)
        const {
            accounts,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await this.prepareSwap({
            ...params,
            amountIn: amount0,
            wrapAmount,
            transferHook: false,
        })

        return this.program.methods
            .swap2({ amount0, amount1, swapMode: params.swapMode })
            .accountsPartial(accounts)
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /** swap2 for a pool whose base mint has a transfer hook. */
    async swap2WithTransferHook(params: Swap2Params): Promise<Transaction> {
        const { swapBaseForQuote, owner, referralTokenAccount } = params
        const { amount0, amount1, wrapAmount } = this.swap2Amounts(params)
        const {
            virtualPool,
            poolConfigState,
            accounts,
            preInstructions,
            postInstructions,
            remainingAccounts,
        } = await this.prepareSwap({
            ...params,
            amountIn: amount0,
            wrapAmount,
            transferHook: true,
        })

        const baseVault = virtualPool.poolState.baseVault
        const transferHookTransfers: TransferHookTransfer[] = [
            swapBaseForQuote
                ? {
                      accountsType: AccountsType.TransferHookBase,
                      source: accounts.inputTokenAccount,
                      destination: baseVault,
                      authority: owner,
                  }
                : {
                      accountsType: AccountsType.TransferHookBase,
                      source: baseVault,
                      destination: accounts.outputTokenAccount,
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
        const transferHookAccounts =
            await this.getRemainingAccountsForTransferHook(
                virtualPool.poolState.baseMint,
                transferHookTransfers
            )
        remainingAccounts.push(...transferHookAccounts.accounts)

        return this.program.methods
            .swap2WithTransferHook(
                { amount0, amount1, swapMode: params.swapMode },
                transferHookAccounts.info
            )
            .accountsPartial(accounts)
            .remainingAccounts(remainingAccounts)
            .preInstructions(preInstructions)
            .postInstructions(postInstructions)
            .transaction()
    }

    /** Quote an exact-in swap for the original swap instruction. */
    swapQuote(params: SwapQuoteParams): SwapQuoteResult {
        return swapQuote(
            params.virtualPool,
            params.config,
            params.swapBaseForQuote,
            params.amountIn,
            params.slippageBps,
            params.hasReferral,
            params.currentPoint,
            params.eligibleForFirstSwapWithMinFee,
            params
        )
    }

    /**
     * Quote an existing pool in SwapMode.ExactIn, SwapMode.PartialFill or
     * SwapMode.ExactOut. currentPoint is the current chain slot or time.
     */
    swapQuote2(params: SwapQuote2Params): SwapQuote2Result {
        const {
            virtualPool,
            config,
            swapBaseForQuote,
            hasReferral,
            eligibleForFirstSwapWithMinFee,
            currentPoint,
        } = params
        const slippageBps = params.slippageBps ?? 0

        if (params.swapMode === SwapMode.ExactOut) {
            return swapQuoteExactOut(
                virtualPool,
                config,
                swapBaseForQuote,
                params.amountOut,
                slippageBps,
                hasReferral,
                currentPoint,
                eligibleForFirstSwapWithMinFee,
                params
            )
        }

        const quote =
            params.swapMode === SwapMode.PartialFill
                ? swapQuotePartialFill
                : swapQuoteExactIn
        return quote(
            virtualPool,
            config,
            swapBaseForQuote,
            params.amountIn,
            slippageBps,
            hasReferral,
            currentPoint,
            eligibleForFirstSwapWithMinFee,
            params
        )
    }

    /** Quote a buildCurve result as its pool would be right after initialize_pool at currentPoint. */
    getQuoteFromInputAmount(
        params: SimulatedQuoteFromInputAmountParams
    ): SwapQuote2Result {
        return getQuoteFromInputAmount(params)
    }

    /** Exact-out counterpart of getQuoteFromInputAmount. */
    getQuoteFromOutputAmount(
        params: SimulatedQuoteFromOutputAmountParams
    ): SwapQuote2Result {
        return getQuoteFromOutputAmount(params)
    }
}
