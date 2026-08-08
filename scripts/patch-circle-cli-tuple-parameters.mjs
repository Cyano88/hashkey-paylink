import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const EXPECTED_VERSION = '0.0.6'
const ORIGINAL = '  const abiParameters = pos.slice(1);'
const PATCHED = `  const abiParameters = pos.slice(1).map((value2) => {
    if (!value2.startsWith("[")) return value2;
    try {
      const parsed = JSON.parse(value2);
      return Array.isArray(parsed) ? parsed : value2;
    } catch {
      return value2;
    }
  });`

export function patchCircleCliTupleParameters(source) {
  if (source.includes(PATCHED)) return { source, changed: false }
  const first = source.indexOf(ORIGINAL)
  if (first < 0 || source.indexOf(ORIGINAL, first + ORIGINAL.length) >= 0) {
    throw new Error('Circle CLI wallet execute patch target is missing or ambiguous.')
  }
  return { source: source.replace(ORIGINAL, PATCHED), changed: true }
}

async function main() {
  const entryPath = require.resolve('@circle-fin/cli')
  const packagePath = resolve(dirname(entryPath), '..', 'package.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'))
  if (packageJson.version !== EXPECTED_VERSION) {
    throw new Error(`Unsupported @circle-fin/cli version ${String(packageJson.version)}; expected ${EXPECTED_VERSION}.`)
  }
  const current = await readFile(entryPath, 'utf8')
  const result = patchCircleCliTupleParameters(current)
  if (result.changed) await writeFile(entryPath, result.source, 'utf8')
  process.stdout.write(result.changed ? 'Patched Circle CLI tuple parameters.\n' : 'Circle CLI tuple patch already applied.\n')
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main()
}
