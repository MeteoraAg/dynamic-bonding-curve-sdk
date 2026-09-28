// Fails the build when a declaration in the bundled d.ts files is reachable from the public API
// but not exported from an entry point, unless it is listed in `allowed` with a reason.
import { readdirSync, readFileSync } from 'node:fs'
import console from 'node:console'
import process from 'node:process'

const entries = ['index.d.ts', 'math.d.ts']

const allowed = {
    DynamicBondingCurveProgram:
        'base class of the services; only its protected members are inherited',
    TransferHookTransfer:
        'parameter of a protected DynamicBondingCurveProgram method',
    ClaimTradingFeeAccountParams:
        'parameter of a protected DynamicBondingCurveProgram method',
    ClaimTradingFeeSolAccountParams:
        'parameter of a protected DynamicBondingCurveProgram method',
    DbcInstruction:
        'helper used to derive the exported instruction account types',
    AccountsTypeValue: 'helper used to derive the exported AccountsType enum',
}

const files = Object.fromEntries(
    readdirSync('dist')
        .filter((name) => name.endsWith('.d.ts'))
        .map((name) => [name, readFileSync(`dist/${name}`, 'utf8')])
)

function parseSpecifiers(list) {
    return list
        .split(',')
        .map((entry) => entry.trim().replace(/^type /, ''))
        .filter(Boolean)
        .map((entry) => {
            const [from, to] = entry.split(/\s+as\s+/)
            return { from, to: to ?? from }
        })
}

// chunk export alias -> declared name, per chunk file
const chunkExports = {}
for (const [name, source] of Object.entries(files)) {
    if (entries.includes(name)) continue
    chunkExports[name] = {}
    for (const match of source.matchAll(/^export \{([^}]*)\};$/gm)) {
        for (const { from, to } of parseSpecifiers(match[1])) {
            chunkExports[name][to] = from
        }
    }
}

const declared = new Set()
for (const source of Object.values(files)) {
    for (const match of source.matchAll(
        /^(?:declare )?(?:type|interface|enum|class|function|const) ([A-Za-z0-9_$]+)/gm
    )) {
        declared.add(match[1])
    }
}

const reachable = new Set()
for (const entry of entries) {
    const source = files[entry]
    // local import name -> declared name in the chunk
    const imported = {}
    for (const match of source.matchAll(
        /^import \{([^}]*)\} from '\.\/([^']+)\.js';$/gm
    )) {
        const chunk = chunkExports[`${match[2]}.d.ts`] ?? {}
        for (const { from, to } of parseSpecifiers(match[1])) {
            imported[to] = chunk[from] ?? from
        }
    }
    // `export { a as B };` re-exports a local or imported name;
    // `export { a as B } from './chunk.js';` re-exports a chunk alias.
    for (const match of source.matchAll(
        /^export \{([^}]*)\}(?: from '\.\/([^']+)\.js')?;$/gm
    )) {
        const chunk = match[2] ? (chunkExports[`${match[2]}.d.ts`] ?? {}) : null
        for (const { from } of parseSpecifiers(match[1])) {
            reachable.add(
                chunk ? (chunk[from] ?? from) : (imported[from] ?? from)
            )
        }
    }
    for (const match of source.matchAll(
        /^export (?:declare )?(?:type|interface|enum|class|function|const) ([A-Za-z0-9_$]+)/gm
    )) {
        reachable.add(match[1])
    }
}

const leaked = [...declared].filter(
    (name) => !reachable.has(name) && !(name in allowed)
)
const stale = Object.keys(allowed).filter(
    (name) => !declared.has(name) || reachable.has(name)
)

if (leaked.length > 0) {
    console.error(
        `Declared in dist but not exported from an entry point: ${leaked.join(', ')}\n` +
            'Export each name, or add it to `allowed` in tools/check-dts.mjs with a reason.'
    )
}
if (stale.length > 0) {
    console.error(`Allow list entries no longer needed: ${stale.join(', ')}`)
}
process.exit(leaked.length > 0 || stale.length > 0 ? 1 : 0)
