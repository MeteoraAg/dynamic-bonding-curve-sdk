import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import {
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    ConfigParameters,
    createSqrtPrices,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    MigratedCollectFeeMode,
    MigratedPoolFeeConfig,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenAuthorityOption,
} from '../../src'
import { curveBaseParams } from './curve'

export const LOCALNET_RPC_URL = 'http://127.0.0.1:8899'

export async function fundSol(
    connection: Connection,
    pubkey: PublicKey,
    solAmount: number = 10
): Promise<void> {
    const sig = await connection.requestAirdrop(
        pubkey,
        solAmount * LAMPORTS_PER_SOL
    )
    const latestBlockhash = await connection.getLatestBlockhash()
    await connection.confirmTransaction(
        {
            signature: sig,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
    )
}

/** A three-segment curve with an exponential fee schedule, used by the validator-backed tests. */
export function buildTestCurveConfig(options?: {
    migratedPoolFee?: MigratedPoolFeeConfig
}): ConfigParameters {
    const customPrices = [0.000000001, 0.00000000105, 0.000000002, 0.000001]
    const tokenBaseDecimal = TokenDecimal.SIX
    const tokenQuoteDecimal = TokenDecimal.NINE
    const sqrtPrices = createSqrtPrices(
        customPrices,
        tokenBaseDecimal,
        tokenQuoteDecimal
    )
    const liquidityWeights = [2, 1, 1]

    return buildCurveWithCustomSqrtPrices({
        ...curveBaseParams({
            token: {
                tokenBaseDecimal,
                tokenQuoteDecimal,
                tokenAuthorityOption:
                    TokenAuthorityOption.PartnerUpdateAuthority,
                leftover: 1000,
            },
            fee: {
                baseFeeParams: {
                    baseFeeMode: BaseFeeMode.FeeSchedulerExponential,
                    feeSchedulerParam: {
                        startingFeeBps: 9000,
                        endingFeeBps: 120,
                        numberOfPeriod: 60,
                        totalDuration: 60,
                    },
                },
                dynamicFeeEnabled: true,
                poolCreationFee: 1,
            },
            migration: {
                migrationOption: MigrationOption.MET_DAMM_V2,
                migrationFeeOption: MigrationFeeOption.Customizable,
                migrationFee: {
                    feePercentage: 10,
                    creatorFeePercentage: 50,
                },
                migratedPoolFee: options?.migratedPoolFee ?? {
                    collectFeeMode: MigratedCollectFeeMode.QuoteToken,
                    dynamicFee: DammV2DynamicFeeMode.Enabled,
                    poolFeeBps: 120,
                    baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
                },
            },
        }),
        sqrtPrices,
        liquidityWeights,
    })
}
