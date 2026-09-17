import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { createSessionStore } from '../src/session.mjs'

test('real OS credential storage roundtrips and clears; Windows uses DPAPI ciphertext', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hpl-cli-session-'))
  const store = createSessionStore({ directory })
  const session = { token: 'hpl_cli_' + 'a'.repeat(64), grant: { id: 'fixture', state: 'pending' } }
  try {
    assert.equal(await store.read(), null)
    await store.write(session)
    assert.deepEqual(await store.read(), session)
    const raw = await readFile(join(directory, 'cli-session.json'), 'utf8')
    if (process.platform === 'win32') {
      assert.ok(!raw.includes(session.token))
      assert.equal(JSON.parse(raw).protection, 'dpapi-user')
    }
    await store.clear()
    assert.equal(await store.read(), null)
  } finally {
    const target = resolve(directory)
    assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('hpl-cli-session-'))
    await rm(target, { recursive: true, force: true })
  }
})
