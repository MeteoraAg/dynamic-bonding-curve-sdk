import type {
    CreateConfigAndPoolParams,
    CreateConfigAndPoolWithFirstBuyParams,
    CreatePoolParams,
    CreatePoolWithFirstBuyParams,
    CreatePoolWithPartnerAndCreatorFirstBuyParams,
    CreatorFirstBuyParams,
    FirstBuyParams,
    PartnerFirstBuyParams,
    PreCreatePoolParams,
    Swap2Params,
    SwapParams,
} from '../types'
import type { PoolService } from '../services'
import {
    collectKitTransactionSigners,
    createKitTransactionPlan,
    toLegacyOptionalPublicKey,
    toLegacyPublicKey,
} from './helpers'
import type {
    CreateConfigAndPoolWithFirstBuyKitResult,
    KitCreateConfigAndPoolParams,
    KitCreateConfigAndPoolWithFirstBuyParams,
    KitCreatePoolParams,
    KitCreatePoolWithFirstBuyParams,
    KitCreatePoolWithPartnerAndCreatorFirstBuyParams,
    KitCreatorFirstBuyParams,
    KitFirstBuyParams,
    KitPartnerFirstBuyParams,
    KitPreCreatePoolParams,
    KitSwap2Params,
    KitSwapParams,
    KitTransactionPlan,
} from './types'

export class DynamicBondingCurveKitPoolService {
    constructor(private readonly poolService: PoolService) {}

    async createPool(params: KitCreatePoolParams): Promise<KitTransactionPlan> {
        const transaction = await this.poolService.createPool(
            toLegacyCreatePoolParams(params)
        )

        return createKitTransactionPlan(
            transaction,
            collectCreatePoolSigners(params)
        )
    }

    async createConfigAndPool(
        params: KitCreateConfigAndPoolParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.poolService.createConfigAndPool({
            ...params,
            config: toLegacyPublicKey(params.config),
            feeClaimer: toLegacyPublicKey(params.feeClaimer),
            leftoverReceiver: toLegacyPublicKey(params.leftoverReceiver),
            quoteMint: toLegacyPublicKey(params.quoteMint),
            payer: toLegacyPublicKey(params.payer),
            preCreatePoolParam: toLegacyPreCreatePoolParams(
                params.preCreatePoolParam
            ),
        } satisfies CreateConfigAndPoolParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(
                params.config,
                params.payer,
                collectPreCreatePoolSigners(params.preCreatePoolParam)
            )
        )
    }

    async createConfigAndPoolWithFirstBuy(
        params: KitCreateConfigAndPoolWithFirstBuyParams
    ): Promise<CreateConfigAndPoolWithFirstBuyKitResult> {
        const result = await this.poolService.createConfigAndPoolWithFirstBuy({
            ...params,
            config: toLegacyPublicKey(params.config),
            feeClaimer: toLegacyPublicKey(params.feeClaimer),
            leftoverReceiver: toLegacyPublicKey(params.leftoverReceiver),
            quoteMint: toLegacyPublicKey(params.quoteMint),
            payer: toLegacyPublicKey(params.payer),
            preCreatePoolParam: toLegacyPreCreatePoolParams(
                params.preCreatePoolParam
            ),
            firstBuyParam: toLegacyFirstBuyParams(params.firstBuyParam),
        } satisfies CreateConfigAndPoolWithFirstBuyParams)

        const signers = collectKitTransactionSigners(
            params.config,
            params.payer,
            collectPreCreatePoolSigners(params.preCreatePoolParam),
            collectFirstBuySigners(params.firstBuyParam)
        )

        return {
            createConfigPlan: createKitTransactionPlan(result.createConfigTx, signers),
            createPoolWithFirstBuyPlan: createKitTransactionPlan(
                result.createPoolWithFirstBuyTx,
                signers
            ),
        }
    }

    async createPoolWithFirstBuy(
        params: KitCreatePoolWithFirstBuyParams
    ): Promise<KitTransactionPlan> {
        const transaction = await this.poolService.createPoolWithFirstBuy({
            createPoolParam: toLegacyCreatePoolParams(params.createPoolParam),
            firstBuyParam: toLegacyFirstBuyParams(params.firstBuyParam),
        } satisfies CreatePoolWithFirstBuyParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(
                collectCreatePoolSigners(params.createPoolParam),
                collectFirstBuySigners(params.firstBuyParam)
            )
        )
    }

    async createPoolWithPartnerAndCreatorFirstBuy(
        params: KitCreatePoolWithPartnerAndCreatorFirstBuyParams
    ): Promise<KitTransactionPlan> {
        const transaction =
            await this.poolService.createPoolWithPartnerAndCreatorFirstBuy({
                createPoolParam: toLegacyCreatePoolParams(params.createPoolParam),
                partnerFirstBuyParam: toLegacyPartnerFirstBuyParams(
                    params.partnerFirstBuyParam
                ),
                creatorFirstBuyParam: toLegacyCreatorFirstBuyParams(
                    params.creatorFirstBuyParam
                ),
            } satisfies CreatePoolWithPartnerAndCreatorFirstBuyParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(
                collectCreatePoolSigners(params.createPoolParam),
                collectPartnerFirstBuySigners(params.partnerFirstBuyParam),
                collectCreatorFirstBuySigners(params.creatorFirstBuyParam)
            )
        )
    }

    async swap(params: KitSwapParams): Promise<KitTransactionPlan> {
        const transaction = await this.poolService.swap({
            ...params,
            owner: toLegacyPublicKey(params.owner),
            pool: toLegacyPublicKey(params.pool),
            referralTokenAccount: toLegacyOptionalPublicKey(
                params.referralTokenAccount
            ),
            payer: toLegacyOptionalPublicKey(params.payer),
        } satisfies SwapParams)

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.owner, params.payer)
        )
    }

    async swap2(params: KitSwap2Params): Promise<KitTransactionPlan> {
        const transaction = await this.poolService.swap2(
            toLegacySwap2Params(params)
        )

        return createKitTransactionPlan(
            transaction,
            collectKitTransactionSigners(params.owner, params.payer)
        )
    }
}

function toLegacyCreatePoolParams(params: KitCreatePoolParams): CreatePoolParams {
    return {
        ...params,
        payer: toLegacyPublicKey(params.payer),
        poolCreator: toLegacyPublicKey(params.poolCreator),
        config: toLegacyPublicKey(params.config),
        baseMint: toLegacyPublicKey(params.baseMint),
    }
}

function toLegacyPreCreatePoolParams(
    params: KitPreCreatePoolParams
): PreCreatePoolParams {
    return {
        ...params,
        poolCreator: toLegacyPublicKey(params.poolCreator),
        baseMint: toLegacyPublicKey(params.baseMint),
    }
}

function toLegacyFirstBuyParams(
    params?: KitFirstBuyParams
): FirstBuyParams | undefined {
    if (!params) {
        return undefined
    }

    return {
        ...params,
        buyer: toLegacyPublicKey(params.buyer),
        receiver: toLegacyOptionalPublicKey(params.receiver),
        referralTokenAccount: toLegacyOptionalPublicKey(
            params.referralTokenAccount
        ),
    }
}

function toLegacySwap2Params(params: KitSwap2Params): Swap2Params {
    const baseParams = {
        ...params,
        owner: toLegacyPublicKey(params.owner),
        pool: toLegacyPublicKey(params.pool),
        referralTokenAccount: toLegacyOptionalPublicKey(
            params.referralTokenAccount
        ),
        payer: toLegacyOptionalPublicKey(params.payer),
    }

    if ('amountOut' in params) {
        return {
            ...baseParams,
            swapMode: params.swapMode,
            amountOut: params.amountOut,
            maximumAmountIn: params.maximumAmountIn,
        }
    }

    return {
        ...baseParams,
        swapMode: params.swapMode,
        amountIn: params.amountIn,
        minimumAmountOut: params.minimumAmountOut,
    }
}

function toLegacyPartnerFirstBuyParams(
    params?: KitPartnerFirstBuyParams
): PartnerFirstBuyParams | undefined {
    if (!params) {
        return undefined
    }

    return {
        ...params,
        partner: toLegacyPublicKey(params.partner),
        receiver: toLegacyPublicKey(params.receiver),
        referralTokenAccount: toLegacyOptionalPublicKey(
            params.referralTokenAccount
        ),
    }
}

function toLegacyCreatorFirstBuyParams(
    params?: KitCreatorFirstBuyParams
): CreatorFirstBuyParams | undefined {
    if (!params) {
        return undefined
    }

    return {
        ...params,
        creator: toLegacyPublicKey(params.creator),
        receiver: toLegacyPublicKey(params.receiver),
        referralTokenAccount: toLegacyOptionalPublicKey(
            params.referralTokenAccount
        ),
    }
}

function collectCreatePoolSigners(
    params: KitCreatePoolParams
) {
    return collectKitTransactionSigners(
        params.baseMint,
        params.payer,
        params.poolCreator
    )
}

function collectPreCreatePoolSigners(params: KitPreCreatePoolParams) {
    return collectKitTransactionSigners(params.baseMint, params.poolCreator)
}

function collectFirstBuySigners(params?: KitFirstBuyParams) {
    return collectKitTransactionSigners(params?.buyer)
}

function collectPartnerFirstBuySigners(params?: KitPartnerFirstBuyParams) {
    return collectKitTransactionSigners(params?.partner)
}

function collectCreatorFirstBuySigners(params?: KitCreatorFirstBuyParams) {
    return collectKitTransactionSigners(params?.creator)
}
