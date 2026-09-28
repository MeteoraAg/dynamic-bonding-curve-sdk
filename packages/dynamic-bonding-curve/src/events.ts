import {
    BorshCoder,
    EventParser,
    utils,
    type IdlEvents,
} from '@coral-xyz/anchor'
// Not re-exported from the package root. Program applies it to its IDL, so events decoded
// here carry the same camelCase names and fields as Program's coder.
import { convertIdlToCamelCase } from '@coral-xyz/anchor/dist/cjs/idl.js'
import type {
    ParsedTransactionWithMeta,
    PublicKey,
    VersionedTransactionResponse,
} from '@solana/web3.js'
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from './constants'
import type { DynamicBondingCurve } from './idl/dynamic-bonding-curve/idl'
import DynamicBondingCurveIDL from './idl/dynamic-bonding-curve/idl.json'

// Event and field names are the camelCase form of the IDL names, as in Anchor's Program client.
export type DbcEvents = IdlEvents<DynamicBondingCurve>
export type DbcEventName = keyof DbcEvents & string
export type DbcEvent = {
    [Name in DbcEventName]: { name: Name; data: DbcEvents[Name] }
}[DbcEventName]

// emit_cpi! writes an event as the data of a self-CPI, behind this 8-byte tag.
const EVENT_IX_TAG = Buffer.from('e445a52e51cb9a1d', 'hex')

const coder = new BorshCoder(
    convertIdlToCamelCase(DynamicBondingCurveIDL as DynamicBondingCurve)
)
const logParser = new EventParser(DYNAMIC_BONDING_CURVE_PROGRAM_ID, coder)

/**
 * Decode the event carried by an event CPI instruction.
 * Returns null when the instruction data is not an event.
 */
export function decodeDbcEventInstruction(data: Uint8Array): DbcEvent | null {
    const bytes = Buffer.from(data)
    const tag = bytes.subarray(0, EVENT_IX_TAG.length)
    if (bytes.length <= EVENT_IX_TAG.length || !tag.equals(EVENT_IX_TAG)) {
        return null
    }

    const event = coder.events.decode(
        utils.bytes.base64.encode(bytes.subarray(EVENT_IX_TAG.length))
    )
    return event as DbcEvent | null
}

function programIdResolver(
    transaction: VersionedTransactionResponse | ParsedTransactionWithMeta
): (index: number) => PublicKey | undefined {
    const message = transaction.transaction.message
    if (!('getAccountKeys' in message)) {
        return () => undefined
    }
    const keys =
        message.version === 0
            ? message.getAccountKeys({
                  accountKeysFromLookups:
                      transaction.meta?.loadedAddresses ?? undefined,
              })
            : message.getAccountKeys()
    return (index) => keys.get(index)
}

/**
 * The program's events in a confirmed transaction.
 * Accepts the result of `getTransaction` or `getParsedTransaction`.
 * Events emitted through an event CPI come first, in execution order, followed by
 * events emitted through the logs. Only `evtClaimProtocolFee2` uses the logs.
 */
export function parseDbcEvents(
    transaction: VersionedTransactionResponse | ParsedTransactionWithMeta
): DbcEvent[] {
    const meta = transaction.meta
    if (!meta) {
        return []
    }

    const programIdAt = programIdResolver(transaction)
    const events: DbcEvent[] = []
    for (const inner of meta.innerInstructions ?? []) {
        for (const instruction of inner.instructions) {
            const programId =
                'programIdIndex' in instruction
                    ? programIdAt(instruction.programIdIndex)
                    : instruction.programId
            if (
                !programId?.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID) ||
                !('data' in instruction)
            ) {
                continue
            }
            const event = decodeDbcEventInstruction(
                utils.bytes.bs58.decode(instruction.data)
            )
            if (event) {
                events.push(event)
            }
        }
    }

    for (const event of logParser.parseLogs(meta.logMessages ?? [])) {
        events.push(event as DbcEvent)
    }
    return events
}
