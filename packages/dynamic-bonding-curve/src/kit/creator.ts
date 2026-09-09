import type {
    ClaimCreatorTradingFee2Params,
    ClaimCreatorTradingFeeParams,
    CreateVirtualPoolMetadataParams,
    CreatorWithdrawSurplusParams,
    TransferPoolCreatorParams,
    WithdrawMigrationFeeParams,
} from '../types'
import type { CreatorService } from '../services'
import {
    collectKitTransactionSigners,
    createKitTransactionPlan,
    toLegacyOptionalPublicKey,
    toLegacyPublicKey,
} from './helpers'
import type {
    KitClaimCreatorTradingFee2Params,
    KitClaimCreatorTradingFeeParams,
    KitCreatePoolMetadataParams,
    KitCreatorWithdrawSurplusParams,
    KitTransactionPlan,
    KitTransferPoolCreatorParams,
    KitWithdrawMigrationFeeParams,
} from './types'

export class DynamicBondingCurveKitCreatorService {
    constructor(private readonly creatorService: CreatorService) {}

    async createPoolMetadata(
        params: KitCreatePoolMetadataParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.creatorService.createPoolMetadata({
            ...params,
            virtualPool: toLegacyPublicKey(params.virtualPool),
            creator: toLegacyPublicKey(params.creator),
            payer: toLegacyPublicKey(params.payer),
        } satisfies CreateVirtualPoolMetadataParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.creator, params.payer)
        )
    }

    async claimCreatorTradingFee(
        params: KitClaimCreatorTradingFeeParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.creatorService.claimCreatorTradingFee({
            ...params,
            creator: toLegacyPublicKey(params.creator),
            payer: toLegacyPublicKey(params.payer),
            pool: toLegacyPublicKey(params.pool),
            receiver: toLegacyOptionalPublicKey(params.receiver),
            tempWSolAcc: toLegacyOptionalPublicKey(params.tempWSolAcc),
        } satisfies ClaimCreatorTradingFeeParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(
                params.creator,
                params.payer,
                params.tempWSolAcc
            )
        )
    }

    async claimCreatorTradingFee2(
        params: KitClaimCreatorTradingFee2Params
    ): Promise<KitTransactionPlan> {
        const transaction = await this.creatorService.claimCreatorTradingFee2({
            ...params,
            creator: toLegacyPublicKey(params.creator),
            payer: toLegacyPublicKey(params.payer),
            pool: toLegacyPublicKey(params.pool),
            receiver: toLegacyPublicKey(params.receiver),
        } satisfies ClaimCreatorTradingFee2Params)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.creator, params.payer)
        )
    }

    async creatorWithdrawSurplus(
        params: KitCreatorWithdrawSurplusParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.creatorService.creatorWithdrawSurplus({
            ...params,
            creator: toLegacyPublicKey(params.creator),
            virtualPool: toLegacyPublicKey(params.virtualPool),
        } satisfies CreatorWithdrawSurplusParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.creator)
        )
    }

    async transferPoolCreator(
        params: KitTransferPoolCreatorParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.creatorService.transferPoolCreator({
            ...params,
            virtualPool: toLegacyPublicKey(params.virtualPool),
            creator: toLegacyPublicKey(params.creator),
            newCreator: toLegacyPublicKey(params.newCreator),
        } satisfies TransferPoolCreatorParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.creator)
        )
    }

    async creatorWithdrawMigrationFee(
        params: KitWithdrawMigrationFeeParams
    ): Promise<KitTransactionPlan> {
        const transaction =
            await this.creatorService.creatorWithdrawMigrationFee({
                ...params,
                virtualPool: toLegacyPublicKey(params.virtualPool),
                sender: toLegacyPublicKey(params.sender),
            } satisfies WithdrawMigrationFeeParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.sender)
        )
    }
}
