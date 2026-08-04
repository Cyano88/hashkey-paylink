import { createHmac } from 'node:crypto'
import {
  hasRenderDurableStore,
  mutateDurableJson,
  readDurableJson,
} from '../api/render-durable-store.ts'

const CONFIRM = '--confirm-hashpaystream-owner-import'
const DEFAULT_STORE_KEY = 'hashpaystream:standalone-agreement-owners:v1'
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function safeStore(current) {
  return {
    schema: 1,
    agreements: current?.schema === 1 && current.agreements ? { ...current.agreements } : {},
    idempotency: current?.schema === 1 && current.idempotency ? { ...current.idempotency } : {},
  }
}

const apiKey = required('HASHPAYSTREAM_ARC_API_KEY')
const ownershipSecret = required('HASHPAYSTREAM_APP_OWNERSHIP_SECRET')
const ownerId = required('HASHPAYSTREAM_MIGRATION_OWNER_PRIVY_USER_ID')
const storeKey = String(process.env.HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY ?? DEFAULT_STORE_KEY).trim()
const baseUrl = new URL(String(process.env.HASHPAYSTREAM_HASH_PAYLINK_BASE_URL ?? 'https://app.hashpaylink.com').trim())

if (!apiKey.startsWith('hpl_test_') || apiKey.length < 32) throw new Error('HASHPAYSTREAM_ARC_API_KEY is invalid.')
if (ownershipSecret.length < 32) throw new Error('HASHPAYSTREAM_APP_OWNERSHIP_SECRET must contain at least 32 characters.')
if (ownerId.length < 8 || ownerId.length > 180) throw new Error('HASHPAYSTREAM_MIGRATION_OWNER_PRIVY_USER_ID is invalid.')
if (!storeKey || storeKey.length > 160) throw new Error('HASHPAYSTREAM_APP_OWNERSHIP_STORE_KEY is invalid.')
if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
  throw new Error('HASHPAYSTREAM_HASH_PAYLINK_BASE_URL must be a clean HTTPS origin.')
}
if (!hasRenderDurableStore()) throw new Error('Render durable storage is unavailable.')

const response = await fetch(`${baseUrl.origin}/api/v2/agreements?limit=250`, {
  cache: 'no-store',
  headers: { 'x-api-key': apiKey, accept: 'application/json' },
})
const payload = await response.json().catch(() => ({}))
if (!response.ok || payload?.ok !== true || !Array.isArray(payload.agreements)) {
  throw new Error(`Hash PayLink agreement import failed with HTTP ${response.status}.`)
}

const agreementIds = [...new Set(payload.agreements.map(item => String(item?.id ?? '').trim()))]
if (agreementIds.some(id => !AGREEMENT_ID.test(id))) throw new Error('Hash PayLink returned an invalid agreement id.')
if (agreementIds.length >= 250) throw new Error('The project reached the 250-record migration ceiling; add pagination before importing.')

const ownerHash = createHmac('sha256', ownershipSecret)
  .update(`hashpaystream.owner\0${ownerId}`)
  .digest('hex')
const current = safeStore(await readDurableJson(storeKey))
const conflicts = agreementIds.filter(id => current.agreements[id] && current.agreements[id].ownerHash !== ownerHash)
if (conflicts.length) throw new Error(`${conflicts.length} agreement ownership conflict(s) require manual review.`)

const missing = agreementIds.filter(id => !current.agreements[id])
console.log(JSON.stringify({
  ok: true,
  mode: process.argv.includes(CONFIRM) ? 'confirmed' : 'dry_run',
  agreementsReturned: agreementIds.length,
  alreadyOwned: agreementIds.length - missing.length,
  agreementsToImport: missing.length,
  ownerHashPrefix: ownerHash.slice(0, 12),
}, null, 2))

if (!process.argv.includes(CONFIRM)) {
  console.log(`Dry run only. Re-run with ${CONFIRM} after reviewing the counts.`)
  process.exit(0)
}

const now = new Date().toISOString()
await mutateDurableJson(storeKey, value => {
  const next = safeStore(value)
  for (const agreementId of agreementIds) {
    const existing = next.agreements[agreementId]
    if (existing && existing.ownerHash !== ownerHash) throw new Error(`Ownership conflict for ${agreementId}.`)
    next.agreements[agreementId] = {
      agreementId,
      ownerHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
  }
  return next
})

console.log('HashPayStream standalone ownership import completed.')
