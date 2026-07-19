import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { publicVtpassPhase0Status, readVtpassPhase0Config } from '../api/vtpass-config.ts'

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) loadEnv({ path, override: false, quiet: true })
}

const allowLiveRead = process.argv.includes('--allow-live-read')
const config = readVtpassPhase0Config()
const status = publicVtpassPhase0Status(config)

console.log('VTpass Phase 0 readiness')
console.log(JSON.stringify(status, null, 2))

if (!config.canReadProvider) {
  console.error('Readiness probe stopped: configure the three server-only VTpass keys first.')
  process.exitCode = 1
} else if (config.environment === 'live' && !allowLiveRead) {
  console.error('Live read probe blocked. Re-run with --allow-live-read after confirming the selected VTpass account.')
  process.exitCode = 1
} else {
  const headers = {
    'api-key': config.apiKey,
    'public-key': config.publicKey,
    accept: 'application/json',
  }

  async function getJson(path, label) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12_000)
    try {
      const response = await fetch(`${config.apiBase}${path}`, { headers, signal: controller.signal })
      const body = await response.json().catch(() => null)
      if (!response.ok) {
        const providerCode = String(body?.code ?? body?.response_description ?? '').trim().slice(0, 40)
        const providerMessage = String(body?.message ?? body?.response_description ?? body?.error ?? '').trim().slice(0, 160)
        const providerDetail = [providerCode, providerMessage].filter(Boolean).join(' - ')
        throw new Error(`${label} returned HTTP ${response.status}${providerDetail ? `: ${providerDetail}` : ''}`)
      }
      return body
    } catch (error) {
      const cause = error instanceof Error && error.cause && typeof error.cause === 'object'
        ? String(error.cause.code ?? '')
        : ''
      const detail = error instanceof Error ? error.message : 'unknown error'
      throw new Error(`${label} failed: ${detail}${cause ? ` (${cause})` : ''}`)
    } finally {
      clearTimeout(timeout)
    }
  }

  try {
    // Keep provider readiness reads sequential. This avoids a fresh sandbox
    // account treating the audit itself as a short request burst.
    const balanceBody = await getJson('/api/balance', 'wallet balance')
    const categoriesBody = await getJson('/api/service-categories', 'service categories')
    const airtimeBody = await getJson('/api/services?identifier=airtime', 'airtime catalog')
    const providerBalance = Number(balanceBody?.contents?.balance)
    const categories = Array.isArray(categoriesBody?.content) ? categoriesBody.content : []
    const airtimeServices = Array.isArray(airtimeBody?.content) ? airtimeBody.content : []
    const reserveReady = Number.isFinite(providerBalance)
      && config.minimumProviderBalanceNgn !== null
      && providerBalance >= config.minimumProviderBalanceNgn

    console.log(JSON.stringify({
      providerAuthenticated: true,
      providerBalanceReadable: Number.isFinite(providerBalance),
      providerReserveReady: reserveReady,
      serviceCategoriesReadable: categories.length > 0,
      airtimeCatalogReadable: airtimeServices.length > 0,
      vendingAttempted: false,
    }, null, 2))

    if (!Number.isFinite(providerBalance) || categories.length === 0 || airtimeServices.length === 0) process.exitCode = 1
  } catch (error) {
    console.error(`VTpass read-only probe failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  }
}
