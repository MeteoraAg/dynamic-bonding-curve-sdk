import type BN from 'bn.js'
import type { Address, Instruction, TransactionSigner } from '@solana/kit'
import { SwapMode } from '../types'
import type {
    ClaimCreatorTradingFee2Params,
    ClaimCreatorTradingFeeParams,
    ClaimPartnerPoolCreationFeeParams,
    ClaimTradingFee2Params,
    ClaimTradingFeeParams,
    CreateConfigAndPoolParams,
    CreateConfigAndPoolWithFirstBuyParams,
    CreateConfigParams,
    CreateDammV1MigrationMetadataParams,
    CreateLockerParams,
    CreatePartnerMetadataParams,
    CreatePoolParams,
    CreatePoolWithFirstBuyParams,
    CreatePoolWithPartnerAndCreatorFirstBuyParams,
    CreateVirtualPoolMetadataParams,
    CreatorFirstBuyParams,
    CreatorWithdrawSurplusParams,
    DammLpTokenParams,
    FirstBuyParams,
    MigrateToDammV1Params,
    MigrateToDammV2Params,
    PartnerFirstBuyParams,
    PartnerWithdrawSurplusParams,
    PreCreatePoolParams,
    SwapParams,
    TransferPoolCreatorParams,
    WithdrawLeftoverParams,
    WithdrawMigrationFeeParams,
} from '../types'

type ReplaceFields<
    T,
    TOverrides extends Partial<Record<keyof T, unknown>>,
> = Omit<T, keyof TOverrides> & TOverrides

export type KitAddressInput<TAddress extends string = string> =
    | Address<TAddress>
    | string

export type KitSignerInput<TAddress extends string = string> =
    TransactionSigner<TAddress>

export type KitAddressOrSignerInput<TAddress extends string = string> =
    | KitAddressInput<TAddress>
    | KitSignerInput<TAddress>

export type KitTransactionPlan = {
    instructions: Instruction[]
    signers: TransactionSigner[]
}

export type CreateConfigAndPoolWithFirstBuyKitResult = {
    createConfigPlan: KitTransactionPlan
    createPoolWithFirstBuyPlan: KitTransactionPlan
}

export type KitPreCreatePoolParams = ReplaceFields<
    PreCreatePoolParams,
    {
        poolCreator: KitAddressOrSignerInput
        baseMint: KitAddressOrSignerInput
    }
>

export type KitFirstBuyParams = ReplaceFields<
    FirstBuyParams,
    {
        buyer: KitAddressOrSignerInput
        receiver?: KitAddressInput
        referralTokenAccount: KitAddressInput | null
    }
>

export type KitPartnerFirstBuyParams = ReplaceFields<
    PartnerFirstBuyParams,
    {
        partner: KitAddressOrSignerInput
        receiver: KitAddressInput
        referralTokenAccount: KitAddressInput | null
    }
>

export type KitCreatorFirstBuyParams = ReplaceFields<
    CreatorFirstBuyParams,
    {
        creator: KitAddressOrSignerInput
        receiver: KitAddressInput
        referralTokenAccount: KitAddressInput | null
    }
>

export type KitCreateConfigParams = ReplaceFields<
    CreateConfigParams,
    {
        config: KitAddressOrSignerInput
        feeClaimer: KitAddressInput
        leftoverReceiver: KitAddressInput
        quoteMint: KitAddressInput
        payer: KitAddressOrSignerInput
    }
>

export type KitCreatePartnerMetadataParams = ReplaceFields<
    CreatePartnerMetadataParams,
    {
        feeClaimer: KitAddressOrSignerInput
        payer: KitAddressOrSignerInput
    }
>

export type KitClaimTradingFeeParams = ReplaceFields<
    ClaimTradingFeeParams,
    {
        feeClaimer: KitAddressOrSignerInput
        payer: KitAddressOrSignerInput
        pool: KitAddressInput
        receiver?: KitAddressInput
        tempWSolAcc?: KitAddressOrSignerInput
    }
>

export type KitClaimTradingFee2Params = ReplaceFields<
    ClaimTradingFee2Params,
    {
        feeClaimer: KitAddressOrSignerInput
        payer: KitAddressOrSignerInput
        pool: KitAddressInput
        receiver: KitAddressInput
    }
>

export type KitPartnerWithdrawSurplusParams = ReplaceFields<
    PartnerWithdrawSurplusParams,
    {
        feeClaimer: KitAddressOrSignerInput
        virtualPool: KitAddressInput
    }
>

export type KitWithdrawMigrationFeeParams = ReplaceFields<
    WithdrawMigrationFeeParams,
    {
        virtualPool: KitAddressInput
        sender: KitAddressOrSignerInput
    }
>

export type KitClaimPartnerPoolCreationFeeParams = ReplaceFields<
    ClaimPartnerPoolCreationFeeParams,
    {
        virtualPool: KitAddressInput
        feeReceiver: KitAddressInput
    }
>

export type KitCreatePoolParams = ReplaceFields<
    CreatePoolParams,
    {
        payer: KitAddressOrSignerInput
        poolCreator: KitAddressOrSignerInput
        config: KitAddressInput
        baseMint: KitAddressOrSignerInput
    }
>

export type KitCreateConfigAndPoolParams = ReplaceFields<
    CreateConfigAndPoolParams,
    {
        config: KitAddressOrSignerInput
        feeClaimer: KitAddressInput
        leftoverReceiver: KitAddressInput
        quoteMint: KitAddressInput
        payer: KitAddressOrSignerInput
        preCreatePoolParam: KitPreCreatePoolParams
    }
>

export type KitCreateConfigAndPoolWithFirstBuyParams = ReplaceFields<
    CreateConfigAndPoolWithFirstBuyParams,
    {
        config: KitAddressOrSignerInput
        feeClaimer: KitAddressInput
        leftoverReceiver: KitAddressInput
        quoteMint: KitAddressInput
        payer: KitAddressOrSignerInput
        preCreatePoolParam: KitPreCreatePoolParams
        firstBuyParam?: KitFirstBuyParams
    }
>

export type KitCreatePoolWithFirstBuyParams = ReplaceFields<
    CreatePoolWithFirstBuyParams,
    {
        createPoolParam: KitCreatePoolParams
        firstBuyParam?: KitFirstBuyParams
    }
>

export type KitCreatePoolWithPartnerAndCreatorFirstBuyParams = ReplaceFields<
    CreatePoolWithPartnerAndCreatorFirstBuyParams,
    {
        createPoolParam: KitCreatePoolParams
        partnerFirstBuyParam?: KitPartnerFirstBuyParams
        creatorFirstBuyParam?: KitCreatorFirstBuyParams
    }
>

export type KitSwapParams = ReplaceFields<
    SwapParams,
    {
        owner: KitAddressOrSignerInput
        pool: KitAddressInput
        referralTokenAccount: KitAddressInput | null
        payer?: KitAddressOrSignerInput
    }
>

type KitSwap2BaseParams = {
    owner: KitAddressOrSignerInput
    pool: KitAddressInput
    swapBaseForQuote: boolean
    referralTokenAccount: KitAddressInput | null
    payer?: KitAddressOrSignerInput
}

export type KitSwap2Params = KitSwap2BaseParams &
    (
        | {
              swapMode: SwapMode.ExactIn
              amountIn: BN
              minimumAmountOut: BN
          }
        | {
              swapMode: SwapMode.PartialFill
              amountIn: BN
              minimumAmountOut: BN
          }
        | {
              swapMode: SwapMode.ExactOut
              amountOut: BN
              maximumAmountIn: BN
          }
    )

export type KitCreatePoolMetadataParams = ReplaceFields<
    CreateVirtualPoolMetadataParams,
    {
        virtualPool: KitAddressInput
        creator: KitAddressOrSignerInput
        payer: KitAddressOrSignerInput
    }
>

export type KitClaimCreatorTradingFeeParams = ReplaceFields<
    ClaimCreatorTradingFeeParams,
    {
        creator: KitAddressOrSignerInput
        payer: KitAddressOrSignerInput
        pool: KitAddressInput
        receiver?: KitAddressInput
        tempWSolAcc?: KitAddressOrSignerInput
    }
>

export type KitClaimCreatorTradingFee2Params = ReplaceFields<
    ClaimCreatorTradingFee2Params,
    {
        creator: KitAddressOrSignerInput
        payer: KitAddressOrSignerInput
        pool: KitAddressInput
        receiver: KitAddressInput
    }
>

export type KitCreatorWithdrawSurplusParams = ReplaceFields<
    CreatorWithdrawSurplusParams,
    {
        creator: KitAddressOrSignerInput
        virtualPool: KitAddressInput
    }
>

export type KitTransferPoolCreatorParams = ReplaceFields<
    TransferPoolCreatorParams,
    {
        virtualPool: KitAddressInput
        creator: KitAddressOrSignerInput
        newCreator: KitAddressInput
    }
>

export type KitCreateLockerParams = ReplaceFields<
    CreateLockerParams,
    {
        payer: KitAddressOrSignerInput
        virtualPool: KitAddressInput
    }
>

export type KitWithdrawLeftoverParams = ReplaceFields<
    WithdrawLeftoverParams,
    {
        payer: KitAddressOrSignerInput
        virtualPool: KitAddressInput
    }
>

export type KitCreateDammV1MigrationMetadataParams = ReplaceFields<
    CreateDammV1MigrationMetadataParams,
    {
        payer: KitAddressOrSignerInput
        virtualPool: KitAddressInput
        config: KitAddressInput
    }
>

export type KitMigrateToDammV1Params = ReplaceFields<
    MigrateToDammV1Params,
    {
        payer: KitAddressOrSignerInput
        virtualPool: KitAddressInput
        dammConfig: KitAddressInput
    }
>

export type KitMigrateToDammV2Params = ReplaceFields<
    MigrateToDammV2Params,
    {
        payer: KitAddressOrSignerInput
        virtualPool: KitAddressInput
        dammConfig: KitAddressInput
    }
>

export type KitDammLpTokenParams = ReplaceFields<
    DammLpTokenParams,
    {
        payer: KitAddressOrSignerInput
        virtualPool: KitAddressInput
        dammConfig: KitAddressInput
    }
>

export interface DynamicBondingCurveKitPartnerClient {
    createConfig(params: KitCreateConfigParams): Promise<KitTransactionPlan>
    createPartnerMetadata(
        params: KitCreatePartnerMetadataParams
    ): Promise<KitTransactionPlan>
    claimPartnerTradingFee(
        params: KitClaimTradingFeeParams
    ): Promise<KitTransactionPlan>
    claimPartnerTradingFee2(
        params: KitClaimTradingFee2Params
    ): Promise<KitTransactionPlan>
    partnerWithdrawSurplus(
        params: KitPartnerWithdrawSurplusParams
    ): Promise<KitTransactionPlan>
    partnerWithdrawMigrationFee(
        params: KitWithdrawMigrationFeeParams
    ): Promise<KitTransactionPlan>
    claimPartnerPoolCreationFee(
        params: KitClaimPartnerPoolCreationFeeParams
    ): Promise<KitTransactionPlan>
}

export interface DynamicBondingCurveKitPoolClient {
    createPool(params: KitCreatePoolParams): Promise<KitTransactionPlan>
    createConfigAndPool(
        params: KitCreateConfigAndPoolParams
    ): Promise<KitTransactionPlan>
    createConfigAndPoolWithFirstBuy(
        params: KitCreateConfigAndPoolWithFirstBuyParams
    ): Promise<CreateConfigAndPoolWithFirstBuyKitResult>
    createPoolWithFirstBuy(
        params: KitCreatePoolWithFirstBuyParams
    ): Promise<KitTransactionPlan>
    createPoolWithPartnerAndCreatorFirstBuy(
        params: KitCreatePoolWithPartnerAndCreatorFirstBuyParams
    ): Promise<KitTransactionPlan>
    swap(params: KitSwapParams): Promise<KitTransactionPlan>
    swap2(params: KitSwap2Params): Promise<KitTransactionPlan>
}

export interface DynamicBondingCurveKitCreatorClient {
    createPoolMetadata(
        params: KitCreatePoolMetadataParams
    ): Promise<KitTransactionPlan>
    claimCreatorTradingFee(
        params: KitClaimCreatorTradingFeeParams
    ): Promise<KitTransactionPlan>
    claimCreatorTradingFee2(
        params: KitClaimCreatorTradingFee2Params
    ): Promise<KitTransactionPlan>
    creatorWithdrawSurplus(
        params: KitCreatorWithdrawSurplusParams
    ): Promise<KitTransactionPlan>
    transferPoolCreator(
        params: KitTransferPoolCreatorParams
    ): Promise<KitTransactionPlan>
    creatorWithdrawMigrationFee(
        params: KitWithdrawMigrationFeeParams
    ): Promise<KitTransactionPlan>
}

export interface DynamicBondingCurveKitMigrationClient {
    createLocker(params: KitCreateLockerParams): Promise<KitTransactionPlan>
    withdrawLeftover(
        params: KitWithdrawLeftoverParams
    ): Promise<KitTransactionPlan>
    createDammV1MigrationMetadata(
        params: KitCreateDammV1MigrationMetadataParams
    ): Promise<KitTransactionPlan>
    migrateToDammV1(
        params: KitMigrateToDammV1Params
    ): Promise<KitTransactionPlan>
    lockDammV1LpToken(params: KitDammLpTokenParams): Promise<KitTransactionPlan>
    claimDammV1LpToken(
        params: KitDammLpTokenParams
    ): Promise<KitTransactionPlan>
    migrateToDammV2(
        params: KitMigrateToDammV2Params
    ): Promise<KitTransactionPlan>
}
