import { PublicKey } from '@solana/web3.js'
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from './constants'
import { dynamicBondingCurveIdl } from './idl/dynamic-bonding-curve/camelCase'
import type { DynamicBondingCurve } from './idl/dynamic-bonding-curve/idl'

type IdlError = DynamicBondingCurve['errors'][number]

/** Error names of the program, in the camelCase form Anchor's Program client uses. */
export type DbcErrorName = IdlError['name']

/** Error codes of the program by name, for example `DbcErrorCode.exceededSlippage`. */
export const DbcErrorCode = Object.fromEntries(
    dynamicBondingCurveIdl.errors.map((error) => [error.name, error.code])
) as { readonly [Error in IdlError as Error['name']]: Error['code'] }

const errorsByCode = new Map<number, IdlError>(
    dynamicBondingCurveIdl.errors.map((error) => [error.code, error])
)

/** A custom error the program returned. */
export class DbcError extends Error {
    readonly code: number
    readonly errorName: DbcErrorName
    readonly logs?: string[]

    constructor(
        code: number,
        errorName: DbcErrorName,
        message: string,
        logs?: string[]
    ) {
        super(message)
        this.name = 'DbcError'
        this.code = code
        this.errorName = errorName
        this.logs = logs
    }
}

/** A parameter the SDK rejected before sending a transaction. */
export class DbcValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'DbcValidationError'
    }
}

const FAILED_LINE =
    /^Program (\S+) failed: custom program error: 0x([0-9a-fA-F]+)$/

function logsOf(error: unknown): string[] | undefined {
    if (typeof error !== 'object' || error === null || !('logs' in error)) {
        return undefined
    }
    const { logs } = error
    return Array.isArray(logs) ? logs : undefined
}

/**
 * The program error behind a failed transaction, or null when the failure did not
 * originate in the program.
 *
 * Reads the logs of the error it is given: a `SendTransactionError` from a preflight
 * failure, an Anchor `AnchorError` or `ProgramError`, or a `simulateTransaction` result.
 * Pass `logs` for an error that carries none, for example from
 * `connection.getTransaction(signature)`.
 */
export function getDbcError(
    error: unknown,
    logs: string[] | undefined = logsOf(error)
): DbcError | null {
    if (!logs) {
        return null
    }

    // The innermost program fails first, so the first failed line names the origin.
    const failed = logs.map((line) => FAILED_LINE.exec(line)).find(Boolean)
    if (
        !failed ||
        !new PublicKey(failed[1]).equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID)
    ) {
        return null
    }

    const entry = errorsByCode.get(parseInt(failed[2], 16))
    if (!entry) {
        return null
    }
    return new DbcError(entry.code, entry.name as DbcErrorName, entry.msg, logs)
}
