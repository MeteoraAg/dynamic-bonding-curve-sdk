import type { Program } from '@coral-xyz/anchor'
import { Commitment, Connection } from '@solana/web3.js'
import { createDbcProgram } from './helpers/createProgram'
import type { DynamicBondingCurve as DynamicBondingCurveIDL } from './idl/dynamic-bonding-curve/idl'
import {
    CreatorService,
    MigrationService,
    PartnerService,
    PoolService,
    StateService,
} from './services'

export interface DbcProvider {
    readonly connection: Connection
    readonly commitment: Commitment
    readonly program: Program<DynamicBondingCurveIDL>
}

export interface DbcClientContext extends DbcProvider {
    readonly state: StateService
}

/** One Anchor program shared by the pool, partner, creator, migration and state services. */
export class DynamicBondingCurveClient implements DbcClientContext {
    readonly program: Program<DynamicBondingCurveIDL>
    readonly pool: PoolService
    readonly partner: PartnerService
    readonly creator: CreatorService
    readonly migration: MigrationService
    readonly state: StateService
    readonly commitment: Commitment
    readonly connection: Connection

    constructor(connection: Connection, commitment: Commitment = 'confirmed') {
        this.connection = connection
        this.commitment = commitment
        this.program = createDbcProgram(connection, commitment)
        this.state = new StateService(this)
        this.pool = new PoolService(this)
        this.partner = new PartnerService(this)
        this.creator = new CreatorService(this)
        this.migration = new MigrationService(this)
    }
}
