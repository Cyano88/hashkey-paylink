import assert from 'node:assert/strict'
import { resolveAppSurface } from '../src/lib/appSurface.ts'
for (const [host, expected] of [
  ['app.hashpaylink.com', 'checkout'],
  ['developer.hashpaylink.com', 'developer'],
  ['docs.hashpaylink.com', 'docs'],
  ['pocket.hashpaylink.com', 'pocket'],
  ['hashpaylink.com', 'website'],
  ['app.hashpaylink.com.attacker.example', 'website'],
  ['localhost', 'website'],
]) {
  assert.equal(resolveAppSurface(host, false), expected)
  assert.equal(resolveAppSurface(host, true), 'pocket', `Native routing regressed for ${host}`)
}
console.log('Domain routing and native Pocket precedence passed (14 cases).')
