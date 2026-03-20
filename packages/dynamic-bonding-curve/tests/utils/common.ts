import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import BN from 'bn.js'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    CollectFeeMode,
    ConfigParameters,
    createSqrtPrices,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    MigratedCollectFeeMode,
    MigratedPoolFeeConfig,
    MigrationFeeOption,
    MigrationOption,
    TokenDecimal,
    TokenType,
    TokenUpdateAuthorityOption,
} from '../../src'

export const LOCALNET_RPC_URL = 'http://127.0.0.1:8899'

// airdrop SOL to a given public key and confirms the transaction
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

// helper function to convert BN values to decimal strings
export function convertBNToDecimal<T>(obj: T): T {
    if (obj instanceof BN) {
        return obj.toString(10) as T
    }
    if (Array.isArray(obj)) {
        return obj.map((item) => convertBNToDecimal(item)) as T
    }
    if (obj && typeof obj === 'object') {
        const result = {} as T
        for (const key in obj) {
            result[key] = convertBNToDecimal(obj[key])
        }
        return result
    }
    return obj
}

// Q64.64 format helper
export const Q = (n: number) => {
    const bigIntValue = BigInt(Math.floor(n * 2 ** 64))
    return new BN(bigIntValue.toString())
}

// Reusable curve config builder for on-chain tests
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
        token: {
            tokenType: TokenType.SPL,
            tokenBaseDecimal,
            tokenQuoteDecimal,
            tokenUpdateAuthority:
                TokenUpdateAuthorityOption.PartnerUpdateAuthority,
            totalTokenSupply: 1_000_000_000,
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
            collectFeeMode: CollectFeeMode.QuoteToken,
            creatorTradingFeePercentage: 0,
            poolCreationFee: 1,
            enableFirstSwapWithMinFee: false,
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
        liquidityDistribution: {
            partnerLiquidityPercentage: 0,
            partnerPermanentLockedLiquidityPercentage: 100,
            creatorLiquidityPercentage: 0,
            creatorPermanentLockedLiquidityPercentage: 0,
        },
        lockedVesting: {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
        activationType: ActivationType.Timestamp,
        sqrtPrices,
        liquidityWeights,
    })
}
