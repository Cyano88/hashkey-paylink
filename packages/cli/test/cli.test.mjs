import test from 'node:test'
import assert from 'node:assert/strict'
import { run } from '../src/cli.mjs'

const key = 'hpl_live_fixture_not_a_real_key'
const create = ['checkout', 'create', '--amount', '2.000001', '--idempotency-key', 'order_20260917_001']
async function invoke(args, responder, env = { HASHPAYLINK_API_KEY: key }) {
  let output = '', errors = ''
  const calls = []
  const code = await run([...args, '--json', '--no-interactive'], {
    sessionStore: { read: async () => null }, env, stdout: { write(value) { output += value } }, stderr: { write(value) { errors += value } },
    fetcher: async (url, init) => {
      calls.push({ url, init })
      return responder ? responder(url, init) : Response.json({ ok: true, checkoutId: 'chk_12345678', checkoutUrl: 'https://app.hashpaylink.com/c/fixture' })
    },
  })
  return { code, output, errors, data: JSON.parse(output), calls }
}
test('dry run validates without authentication or any network call', async () => {
  const result = await invoke([...create, '--dry-run'], undefined, {})
  assert.equal(result.code, 0)
  assert.equal(result.data.validation, 'local_only')
  assert.equal(result.calls.length, 0)
  assert.deepEqual(result.data.body, { kind: 'usdc_request', checkoutMode: 'human', amount: '2.000001' })
})
test('creation sends exact decimals and caller idempotency; fixed origin and no redirects', async () => {
  const result = await invoke(create)
  assert.equal(result.code, 0)
  assert.equal(result.calls.length, 1)
  const { url, init } = result.calls[0]
  assert.equal(url, 'https://developer.hashpaylink.com/api/v2/checkouts')
  assert.equal(init.redirect, 'error')
  assert.equal(init.headers['Idempotency-Key'], 'order_20260917_001')
  assert.equal(init.headers['X-API-Key'], key)
  assert.equal(JSON.parse(init.body).amount, '2.000001')
  assert.ok(!result.output.includes(key))
})
for (const amount of ['0', '-1', '1e2', 'NaN', '1.0000001', '0.000000']) {
  test('invalid amount fails locally: ' + amount, async () => {
    const result = await invoke(['checkout', 'create', '--amount', amount, '--idempotency-key', 'order_20260917_001'])
    assert.equal(result.code, 1)
    assert.equal(result.calls.length, 0)
  })
}
test('missing idempotency key prevents creation', async () => {
  const result = await invoke(['checkout', 'create', '--amount', '2'])
  assert.equal(result.data.error.code, 'INVALID_ARGUMENT')
  assert.equal(result.calls.length, 0)
})
test('missing or test credentials never reach network', async () => {
  for (const env of [{}, { HASHPAYLINK_API_KEY: 'hpl_test_fixture' }]) {
    const result = await invoke(create, undefined, env)
    assert.equal(result.data.error.code, 'AUTH_REQUIRED')
    assert.equal(result.calls.length, 0)
  }
})
test('status uses authenticated purpose=status and preserves pending', async () => {
  const result = await invoke(['checkout', 'status', '--id', 'chk_12345678'], () => Response.json({ ok: true, checkoutId: 'chk_12345678', status: 'pending' }))
  assert.equal(result.code, 0)
  assert.equal(result.data.status, 'pending')
  assert.ok(result.calls[0].url.endsWith('id=chk_12345678&purpose=status'))
  assert.equal(result.calls.length, 1)
})
test('doctor authenticates project without enumerating accounts', async () => {
  const result = await invoke(['doctor'], () => Response.json({ ok: true, project: { id: 'project_fixture', networks: ['arc'] } }))
  assert.equal(result.data.authenticated, true)
  assert.equal(result.calls[0].url, 'https://developer.hashpaylink.com/api/v2/project')
})
for (const [status, expected] of [[401, 'ACCESS_DENIED'], [403, 'ACCESS_DENIED'], [409, 'CONFLICT'], [429, 'RATE_LIMITED'], [503, 'API_ERROR']]) {
  test('HTTP ' + status + ' produces a stable safe error without retry', async () => {
    const result = await invoke(create, () => Response.json({ ok: false, error: key }, { status }))
    assert.equal(result.code, 1)
    assert.equal(result.data.error.code, expected)
    assert.equal(result.calls.length, 1)
    assert.ok(!result.output.includes(key))
    assert.equal(result.errors, '')
  })
}
test('transport failure cannot leak credentials and never retries writes', async () => {
  const result = await invoke(create, () => { throw new Error(key) })
  assert.equal(result.data.error.code, 'REQUEST_FAILED')
  assert.equal(result.calls.length, 1)
  assert.ok(!result.output.includes(key))
})
test('oversized response is rejected', async () => {
  const result = await invoke(create, () => new Response('x'.repeat(262145)))
  assert.equal(result.data.error.code, 'REQUEST_FAILED')
})
test('key arguments, routing overrides, unexpected options and duplicate options are rejected', async () => {
  for (const args of [
    [...create, '--api-key', key], [...create, '--recipient', '0x123'],
    [...create, '--base-url', 'https://attacker.example'], [...create, '--amount', '3'],
    ['checkout', 'status', '--id', 'chk_12345678', '--dry-run'],
    ['wallet', 'send'],
  ]) {
    const result = await invoke(args)
    assert.equal(result.data.error.code, 'INVALID_ARGUMENT')
    assert.equal(result.calls.length, 0)
    assert.ok(!result.output.includes(key))
  }
})
test('embedded return URL credentials and invalid expiry are rejected', async () => {
  for (const options of [['--return-url', 'https://user:password@example.com'], ['--expires-in-minutes', '4']]) {
    const result = await invoke([...create, ...options])
    assert.equal(result.code, 1)
    assert.equal(result.calls.length, 0)
  }
})
test('incomplete success is not presented as a valid result', async () => {
  const result = await invoke(create, () => Response.json({ ok: true }))
  assert.equal(result.data.error.code, 'INVALID_RESPONSE')
})
test('agent guidance makes no requests', async () => {
  const result = await invoke(['agent-prompt'], undefined, {})
  assert.equal(result.code, 0)
  assert.equal(result.calls.length, 0)
})

test('an expired local session never falls back to a broader environment key', async () => {
  let calls = 0, output = ''
  const code = await run(['doctor', '--json'], {
    env: { HASHPAYLINK_API_KEY: key },
    sessionStore: { read: async () => ({ token: 'hpl_cli_' + 'a'.repeat(64), grant: { state: 'approved', expiresAt: '2000-01-01T00:00:00Z' } }) },
    fetcher: async () => { calls++; throw Error('unexpected') },
    stdout: { write(value) { output += value } }, stderr: { write() {} },
  })
  assert.equal(code, 1)
  assert.equal(JSON.parse(output).error.code, 'AUTH_REQUIRED')
  assert.equal(calls, 0)
})
test('an approved local session takes precedence over a broader environment key', async () => {
  let usedKey
  const token = 'hpl_cli_' + 'b'.repeat(64)
  const code = await run(['doctor', '--json'], {
    env: { HASHPAYLINK_API_KEY: key },
    sessionStore: { read: async () => ({ token, grant: { state: 'approved', expiresAt: new Date(Date.now() + 60000).toISOString() } }) },
    fetcher: async (_url, init) => { usedKey = init.headers['X-API-Key']; return Response.json({ ok: true, project: { id: 'fixture' } }) },
    stdout: { write() {} }, stderr: { write() {} },
  })
  assert.equal(code, 0)
  assert.equal(usedKey, token)
})
