import { type Commitment, Connection } from '@solana/web3.js'
import { DynamicBondingCurveClient } from '../client'
import { DynamicBondingCurveKitCreatorService } from './creator'
import { DynamicBondingCurveKitMigrationService } from './migration'
import { DynamicBondingCurveKitPartnerService } from './partner'
import { DynamicBondingCurveKitPoolService } from './pool'
import type {
    DynamicBondingCurveKitCreatorClient,
    DynamicBondingCurveKitMigrationClient,
    DynamicBondingCurveKitPartnerClient,
    DynamicBondingCurveKitPoolClient,
} from './types'

type DynamicBondingCurveLegacyTransactionClient = Pick<
    DynamicBondingCurveClient,
    'pool' | 'partner' | 'creator' | 'migration'
>

export class DynamicBondingCurveKitClient {
    public readonly pool: DynamicBondingCurveKitPoolClient
    public readonly partner: DynamicBondingCurveKitPartnerClient
    public readonly creator: DynamicBondingCurveKitCreatorClient
    public readonly migration: DynamicBondingCurveKitMigrationClient

    private constructor(
        legacyClient: DynamicBondingCurveLegacyTransactionClient
    ) {
        this.pool = new DynamicBondingCurveKitPoolService(legacyClient.pool)
        this.partner = new DynamicBondingCurveKitPartnerService(
            legacyClient.partner
        )
        this.creator = new DynamicBondingCurveKitCreatorService(
            legacyClient.creator
        )
        this.migration = new DynamicBondingCurveKitMigrationService(
            legacyClient.migration
        )
    }

    static fromLegacyClient(
        legacyClient: DynamicBondingCurveLegacyTransactionClient
    ): DynamicBondingCurveKitClient {
        return new DynamicBondingCurveKitClient(legacyClient)
    }

    static fromRpcUrl(
        rpcUrl: string,
        commitment: Commitment = 'confirmed'
    ): DynamicBondingCurveKitClient {
        const legacyClient = DynamicBondingCurveClient.create(
            new Connection(rpcUrl, commitment),
            commitment
        )

        return DynamicBondingCurveKitClient.fromLegacyClient(legacyClient)
    }
}
