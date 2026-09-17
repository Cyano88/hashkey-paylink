import assert from 'node:assert/strict'
import vm from 'node:vm'
import fs from 'node:fs'
import { runtimePublicConfig, runtimePublicConfigScript, readMainnetCheckpointFactory } from '../api/runtime-public-config.ts'
import handler from '../api/public-config.ts'
const address = '0x'+'1'.repeat(40)
const alternate = '0x'+'2'.repeat(40)
assert.equal(readMainnetCheckpointFactory({}), '')
assert.equal(readMainnetCheckpointFactory({CHECKPOINT_FACTORY_ADDRESS:address,VITE_CHECKPOINT_FACTORY_ADDRESS:address}), '')
for (const value of ['', 'invalid', '0x'+'0'.repeat(40)]) assert.equal(readMainnetCheckpointFactory({CHECKPOINT_FACTORY_ADDRESS_MAINNET:value}), '')
assert.equal(readMainnetCheckpointFactory({VITE_CHECKPOINT_FACTORY_ADDRESS_MAINNET:address}), address)
assert.equal(readMainnetCheckpointFactory({CHECKPOINT_FACTORY_ADDRESS_MAINNET:address,VITE_CHECKPOINT_FACTORY_ADDRESS_MAINNET:alternate}), address)
assert.equal(readMainnetCheckpointFactory({CHECKPOINT_FACTORY_ADDRESS_MAINNET:'',VITE_CHECKPOINT_FACTORY_ADDRESS_MAINNET:address}), '')
const env={VITE_PRIVY_APP_ID:'</script><script>bad()</script>',VITE_AUTH_BRIDGE:'privy',CHECKPOINT_FACTORY_ADDRESS_MAINNET:address}
const script=runtimePublicConfigScript(env)
assert.equal((script.match(/<\/script>/g)||[]).length,1)
const context={window:{}}
vm.runInNewContext(script.slice(8,-9),context)
assert.deepEqual(JSON.parse(JSON.stringify(context.window.__HASH_PAYLINK_CONFIG__)),runtimePublicConfig(env))
assert.equal(runtimePublicConfig({}).auth.privyEnabled,false)
const response={setHeader(name,value){assert.equal(name,'Cache-Control');assert.equal(value,'no-store')},json(body){this.body=body}}
handler({},response)
assert.deepEqual(response.body.auth,runtimePublicConfig().auth)
assert.deepEqual(response.body.streampay,runtimePublicConfig().streampay)
const server=fs.readFileSync('server.ts','utf8')
assert.ok(server.includes("import { runtimePublicConfigScript } from './api/runtime-public-config.js'"))
assert.ok(!server.includes('0x8eEc65a18f3b5deb0E9Fc5e1eCf8263587b02927'))
const gate=fs.readFileSync('modules/streampay/src/components/creator/StreamGate.tsx','utf8')
const start=gate.slice(gate.indexOf('async function startCheckpointEscrow()'),gate.indexOf('async function releaseCheckpoint'))
assert.ok(start.indexOf('await restoreCheckpointVaultForWallet')<start.indexOf('Checkpoint escrow is not configured yet.'))
assert.ok(start.indexOf('Checkpoint escrow is not configured yet.')<start.indexOf('await arcClient.readContract'))
console.log('Public runtime/API configuration, mainnet-only selection, script escaping, and recovery ordering checks passed.')
