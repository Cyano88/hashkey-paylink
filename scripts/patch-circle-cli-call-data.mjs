import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const EXPECTED_VERSION = '0.0.6'
const PATCHES = [
  [
    '  });\n  const estimate = args2.includes("--estimate");\n  const resolved = await resolveOrReport(signer, address, blockchain, args2);',
    '  });\n  const callData = readFlagValue(args2, "--call-data") ?? "";\n  const estimate = args2.includes("--estimate");\n  const resolved = await resolveOrReport(signer, address, blockchain, args2);',
  ],
  [
    '    abiParameters,\n    value,\n    estimate,\n    args2\n  );\n}\nasync function handleAgentExecute(wallet, env, blockchain, contractAddress, abiFunctionSignature, abiParameters, value, estimate, args2) {',
    '    abiParameters,\n    callData,\n    value,\n    estimate,\n    args2\n  );\n}\nasync function handleAgentExecute(wallet, env, blockchain, contractAddress, abiFunctionSignature, abiParameters, callData, value, estimate, args2) {',
  ],
  [
    '        contractAddress,\n        abiFunctionSignature,\n        abiParameters: abiParameters.length > 0 ? abiParameters : void 0,\n        amount: value !== "0" ? value : void 0\n      }\n    );',
    '        contractAddress,\n        ...callData ? { callData } : {\n          abiFunctionSignature,\n          abiParameters: abiParameters.length > 0 ? abiParameters : void 0\n        },\n        amount: value !== "0" ? value : void 0\n      }\n    );',
  ],
  [
    '    idempotencyKey,\n    contractAddress,\n    abiFunctionSignature,\n    abiParameters: abiParameters.length > 0 ? abiParameters : void 0,\n    amount: value !== "0" ? value : void 0\n  });',
    '    idempotencyKey,\n    contractAddress,\n    ...callData ? { callData } : {\n      abiFunctionSignature,\n      abiParameters: abiParameters.length > 0 ? abiParameters : void 0\n    },\n    amount: value !== "0" ? value : void 0\n  });',
  ],
]

export function patchCircleCliCallData(source) {
  let next = source
  let changed = false
  for (const [original, patched] of PATCHES) {
    if (next.includes(patched)) continue
    const first = next.indexOf(original)
    if (first < 0 || next.indexOf(original, first + original.length) >= 0) {
      throw new Error('Circle CLI callData patch target is missing or ambiguous.')
    }
    next = next.replace(original, patched)
    changed = true
  }
  return { source: next, changed }
}

async function main() {
  const entryPath = require.resolve('@circle-fin/cli')
  const packagePath = resolve(dirname(entryPath), '..', 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  if (packageJson.version !== EXPECTED_VERSION) {
    throw new Error('Unsupported @circle-fin/cli version ' + String(packageJson.version) + '; expected ' + EXPECTED_VERSION + '.')
  }
  const current = await readFile(entryPath, 'utf8')
  const result = patchCircleCliCallData(current)
  if (result.changed) await writeFile(entryPath, result.source, 'utf8')
  process.stdout.write(result.changed ? 'Patched Circle CLI raw callData execution.\n' : 'Circle CLI callData patch already applied.\n')
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) await main()
