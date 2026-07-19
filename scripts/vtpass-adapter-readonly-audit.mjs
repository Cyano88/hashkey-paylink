import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createVtpassClient } from '../api/vtpass-client.ts'
import { readVtpassPhase0Config } from '../api/vtpass-config.ts'

for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file)
  if (existsSync(path)) loadEnv({ path, override: false, quiet: true })
}

const config = readVtpassPhase0Config()
if (!config.canReadProvider) {
  console.error('VTpass adapter audit stopped: provider credentials are not ready.')
  process.exitCode = 1
} else if (config.environment === 'live' && !process.argv.includes('--allow-live-read')) {
  console.error('Live read audit blocked. Re-run with --allow-live-read after confirming the VTpass account.')
  process.exitCode = 1
} else {
  try {
    const client = createVtpassClient({ config })
    const balance = await client.getWalletBalance()
    const categories = await client.listServiceCategories()
    const airtime = await client.listAirtimeServices()
    console.log(JSON.stringify({
      environment: config.environment,
      providerAuthenticated: true,
      providerBalanceReadable: Number.isFinite(balance),
      providerReserveReady: config.minimumProviderBalanceNgn !== null && balance >= config.minimumProviderBalanceNgn,
      serviceCategoryCount: categories.length,
      airtimeServiceIds: airtime.map(service => service.serviceId),
      sandboxVendingEnabled: config.sandboxVendingEnabled,
      liveVendingEnabled: config.liveVendingEnabled,
      vendingAttempted: false,
    }, null, 2))
    if (!categories.length || !airtime.length) process.exitCode = 1
  } catch (error) {
    console.error(`VTpass adapter read audit failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    process.exitCode = 1
  }
}
