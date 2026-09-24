// Synthetic reviewed release exists only in an in-memory test build. Production
// has no environment switch or dependency argument that can activate this fixture.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile, writeFile, unlink } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { requireArcMainnetAgreementRelease } from '../../api/arc-mainnet-boundary.ts'
export async function runReviewedMainnetFixture(fixture, originalUrl) {
  assert.throws(() => requireArcMainnetAgreementRelease(), /has not been reviewed/)
  const scripts = dirname(fileURLToPath(originalUrl))
  const source = (await readFile(fixture, 'utf8')).replaceAll('import.meta.url', JSON.stringify(originalUrl))
  const output = join(scripts, '.mainnet-fixture-' + randomUUID() + '.mjs')
  const result = await build({ stdin: { contents: source, resolveDir: scripts, sourcefile: fileURLToPath(fixture), loader: 'js' },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{name: 'synthetic-reviewed-release', setup(b) {
      b.onLoad({filter: /arc-mainnet-boundary\.ts$/}, async ({path}) => {
        const source = await readFile(path, 'utf8')
        assert.ok(source.includes('}> | null = null'))
        return {contents: source.replace('}> | null = null', "}> | null = Object.freeze({chainId: 5042, factory: '0x7777777777777777777777777777777777777777', operator: '0x8888888888888888888888888888888888888888'})"), loader:'ts', resolveDir:dirname(path)}
      })
    }}] })
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Reviewed-release fixtures must inject provider mocks; network access is disabled.') }
  try { await writeFile(output, result.outputFiles[0].text); await import(pathToFileURL(output).href) }
  finally { globalThis.fetch = originalFetch; await unlink(output).catch(() => {}); assert.throws(() => requireArcMainnetAgreementRelease(), /has not been reviewed/) }
}
