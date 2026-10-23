import { randomUUID, createPublicKey } from 'node:crypto'
import { readDurableJson, mutateDurableJson } from '../api/render-durable-store.ts'
import { bridgeSandboxRequest } from '../api/pocket/bridge-sandbox-service.ts'

const url = 'https://pocket.hashpaylink.com/api/pocket/bridge-sandbox/webhook'
const storeKey = 'pocket:bridge-xyz:sandbox:webhook'
try {
  let config = await mutateDurableJson(storeKey, previous => previous || { key: randomUUID(), url })
  if (config.url !== url) throw Error('Unexpected sandbox webhook destination.')
  if (!config.id) {
    const created = await bridgeSandboxRequest('/webhooks', 'POST', {
      url, event_epoch: 'webhook_creation', event_categories: ['customer', 'virtual_account.activity', 'liquidation_address.drain'],
    }, config.key)
    if (typeof created.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(created.id)) throw Error('Missing webhook ID.')
    config = await mutateDurableJson(storeKey, previous => ({ ...previous, id: created.id }))
  }
  const active = await bridgeSandboxRequest('/webhooks/' + config.id, 'PUT', {
    url, status: 'active', event_categories: ['customer', 'virtual_account.activity', 'liquidation_address.drain'],
  }, config.key + '-activate')
  if (active.status !== 'active' || active.url !== url || createPublicKey(active.public_key).asymmetricKeyType !== 'rsa') throw Error('Webhook activation could not be verified.')
  await mutateDurableJson(storeKey, previous => ({ ...previous, publicKey: active.public_key, status: active.status }))
  console.log(JSON.stringify({ environment: 'sandbox', webhookId: config.id, url, status: 'active', publicKeySaved: true }))
  process.exit(0)
} catch (error) { console.error(error.message); process.exit(1) }
