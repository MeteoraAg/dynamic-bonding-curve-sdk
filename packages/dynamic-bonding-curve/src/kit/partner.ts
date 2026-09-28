import type {
    ClaimTradingFee2Params,
    ClaimTradingFeeParams,
    CreateConfigParams,
    CreatePartnerMetadataParams,
    PartnerWithdrawSurplusParams,
    WithdrawMigrationFeeParams,
} from '../types'
import type { PartnerService } from '../services'
import {
    collectKitTransactionSigners,
    createKitTransactionPlan,
    toLegacyOptionalPublicKey,
    toLegacyPublicKey,
} from './helpers'
import type {
    KitClaimPartnerPoolCreationFeeParams,
    KitClaimTradingFee2Params,
    KitClaimTradingFeeParams,
    KitCreateConfigParams,
    KitCreatePartnerMetadataParams,
    KitPartnerWithdrawSurplusParams,
    KitTransactionPlan,
    KitWithdrawMigrationFeeParams,
} from './types'

export class DynamicBondingCurveKitPartnerService {
    constructor(private readonly partnerService: PartnerService) {}

    async createConfig(
        params: KitCreateConfigParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.partnerService.createConfig({
            ...params,
            config: toLegacyPublicKey(params.config),
            feeClaimer: toLegacyPublicKey(params.feeClaimer),
            leftoverReceiver: toLegacyPublicKey(params.leftoverReceiver),
            quoteMint: toLegacyPublicKey(params.quoteMint),
            payer: toLegacyPublicKey(params.payer),
        } satisfies CreateConfigParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.config, params.payer)
        )
    }

    async createPartnerMetadata(
        params: KitCreatePartnerMetadataParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.partnerService.createPartnerMetadata({
            ...params,
            feeClaimer: toLegacyPublicKey(params.feeClaimer),
            payer: toLegacyPublicKey(params.payer),
        } satisfies CreatePartnerMetadataParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.feeClaimer, params.payer)
        )
    }

    async claimPartnerTradingFee(
        params: KitClaimTradingFeeParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.partnerService.claimPartnerTradingFee({
            ...params,
            feeClaimer: toLegacyPublicKey(params.feeClaimer),
            payer: toLegacyPublicKey(params.payer),
            pool: toLegacyPublicKey(params.pool),
            receiver: toLegacyOptionalPublicKey(params.receiver),
            tempWSolAcc: toLegacyOptionalPublicKey(params.tempWSolAcc),
        } satisfies ClaimTradingFeeParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(
                params.feeClaimer,
                params.payer,
                params.tempWSolAcc
            )
        )
    }

    async claimPartnerTradingFee2(
        params: KitClaimTradingFee2Params
    ): Promise<KitTransactionPlan> {
        const transaction = await this.partnerService.claimPartnerTradingFee2({
            ...params,
            feeClaimer: toLegacyPublicKey(params.feeClaimer),
            payer: toLegacyPublicKey(params.payer),
            pool: toLegacyPublicKey(params.pool),
            receiver: toLegacyPublicKey(params.receiver),
        } satisfies ClaimTradingFee2Params)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.feeClaimer, params.payer)
        )
    }

    async partnerWithdrawSurplus(
        params: KitPartnerWithdrawSurplusParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.partnerService.partnerWithdrawSurplus({
            ...params,
            feeClaimer: toLegacyPublicKey(params.feeClaimer),
            virtualPool: toLegacyPublicKey(params.virtualPool),
        } satisfies PartnerWithdrawSurplusParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.feeClaimer)
        )
    }

    async partnerWithdrawMigrationFee(
        params: KitWithdrawMigrationFeeParams
    ): Promise<KitTransactionPlan> {
        const transaction =
            await this.partnerService.partnerWithdrawMigrationFee({
                ...params,
                virtualPool: toLegacyPublicKey(params.virtualPool),
                sender: toLegacyPublicKey(params.sender),
            } satisfies WithdrawMigrationFeeParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.sender)
        )
    }

    async claimPartnerPoolCreationFee(
        params: KitClaimPartnerPoolCreationFeeParams
    ): Promise<KitTransactionPlan> {
        const transaction =
            await this.partnerService.claimPartnerPoolCreationFee({
                ...params,
                virtualPool: toLegacyPublicKey(params.virtualPool),
                feeReceiver: toLegacyPublicKey(params.feeReceiver),
            })

        return createKitTransactionPlan(transaction)
    }
}
