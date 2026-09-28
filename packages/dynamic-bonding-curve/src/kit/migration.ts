import type {
    CreateDammV1MigrationMetadataParams,
    CreateLockerParams,
    DammLpTokenParams,
    MigrateToDammV1Params,
    MigrateToDammV2Params,
    WithdrawLeftoverParams,
} from '../types'
import type { MigrationService } from '../services'
import {
    collectKitTransactionSigners,
    createKitSignerFromLegacyKeypair,
    createKitTransactionPlan,
    toLegacyPublicKey,
} from './helpers'
import type {
    KitCreateDammV1MigrationMetadataParams,
    KitCreateLockerParams,
    KitDammLpTokenParams,
    KitMigrateToDammV1Params,
    KitMigrateToDammV2Params,
    KitTransactionPlan,
    KitWithdrawLeftoverParams,
} from './types'

export class DynamicBondingCurveKitMigrationService {
    constructor(private readonly migrationService: MigrationService) {}

    async createLocker(
        params: KitCreateLockerParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.migrationService.createLocker({
            ...params,
            payer: toLegacyPublicKey(params.payer),
            virtualPool: toLegacyPublicKey(params.virtualPool),
        } satisfies CreateLockerParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.payer)
        )
    }

    async withdrawLeftover(
        params: KitWithdrawLeftoverParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.migrationService.withdrawLeftover({
            ...params,
            payer: toLegacyPublicKey(params.payer),
            virtualPool: toLegacyPublicKey(params.virtualPool),
        } satisfies WithdrawLeftoverParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.payer)
        )
    }

    async createDammV1MigrationMetadata(
        params: KitCreateDammV1MigrationMetadataParams
    ): Promise<KitTransactionPlan> {
        const transaction =
            await this.migrationService.createDammV1MigrationMetadata({
                ...params,
                payer: toLegacyPublicKey(params.payer),
                virtualPool: toLegacyPublicKey(params.virtualPool),
                config: toLegacyPublicKey(params.config),
            } satisfies CreateDammV1MigrationMetadataParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.payer)
        )
    }

    async migrateToDammV1(
        params: KitMigrateToDammV1Params
    ): Promise<KitTransactionPlan> {
        const transaction = await this.migrationService.migrateToDammV1({
            ...params,
            payer: toLegacyPublicKey(params.payer),
            virtualPool: toLegacyPublicKey(params.virtualPool),
            dammConfig: toLegacyPublicKey(params.dammConfig),
        } satisfies MigrateToDammV1Params)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.payer)
        )
    }

    async lockDammV1LpToken(
        params: KitDammLpTokenParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.migrationService.lockDammV1LpToken({
            ...params,
            payer: toLegacyPublicKey(params.payer),
            virtualPool: toLegacyPublicKey(params.virtualPool),
            dammConfig: toLegacyPublicKey(params.dammConfig),
        } satisfies DammLpTokenParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.payer)
        )
    }

    async claimDammV1LpToken(
        params: KitDammLpTokenParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.migrationService.claimDammV1LpToken({
            ...params,
            payer: toLegacyPublicKey(params.payer),
            virtualPool: toLegacyPublicKey(params.virtualPool),
            dammConfig: toLegacyPublicKey(params.dammConfig),
        } satisfies DammLpTokenParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.payer)
        )
    }

    async migrateToDammV2(
        params: KitMigrateToDammV2Params
    ): Promise<KitTransactionPlan> {
        const result = await this.migrationService.migrateToDammV2({
            ...params,
            payer: toLegacyPublicKey(params.payer),
            virtualPool: toLegacyPublicKey(params.virtualPool),
            dammConfig: toLegacyPublicKey(params.dammConfig),
        } satisfies MigrateToDammV2Params)

        const generatedSigners = await Promise.all([
            createKitSignerFromLegacyKeypair(result.firstPositionNftKeypair),
            createKitSignerFromLegacyKeypair(result.secondPositionNftKeypair),
        ])

        return createKitTransactionPlan(
            result.transaction,
            collectKitTransactionSigners(params.payer, generatedSigners)
        )
    }
}
