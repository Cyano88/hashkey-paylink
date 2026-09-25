import process from 'node:process'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })

const [{ readVtpassPhase0Config }, { createVtpassClient }, { readCircleTreasuryConfig, createCircleDeveloperTreasuryClient }] = await Promise.all([
  import('../api/vtpass-config.ts'),
  import('../api/vtpass-client.ts'),
  import('../api/circle-developer-treasury.ts'),
])

const bills = readVtpassPhase0Config()
const circle = readCircleTreasuryConfig()
const checks = []
const check = (name, passed, detail) => checks.push({ name, passed: Boolean(passed), detail })

check('VTpass environment', bills.environment === 'live', bills.environment)
check('Official live API host', bills.apiBase === 'https://vtpass.com', bills.apiBase)
check('Live VTpass credentials', bills.credentialsReady, bills.credentialsReady ? 'configured' : 'missing or invalid')
check('Bills product switch', bills.billsEnabled, bills.billsEnabled ? 'enabled' : 'disabled')
check('Sandbox vending disabled', !bills.sandboxVendingEnabled, bills.sandboxVendingEnabled ? 'must be false' : 'disabled')
check('Live vending remains off for preflight', !bills.liveVendingEnabled, bills.liveVendingEnabled ? 'disable before auditing' : 'disabled')
check('Approved live categories', ['airtime', 'data', 'tv', 'electricity'].every(category => bills.liveCategories.includes(category)), bills.liveCategories.join(', ') || 'none')
check('Refund controls', bills.refundsReady && bills.circleTreasuryReady, bills.refundsReady && bills.circleTreasuryReady ? 'ready' : 'not ready')
check('Live durable-store isolation', /(?:^|[:/_-])live(?:$|[:/_-])/i.test(bills.storeKey), bills.storeKey)
check('Circle treasury configuration', circle.verificationReady, circle.verificationReady ? 'configured' : circle.issues.join(' '))
check('Bills/Circle treasury match', bills.treasuryAddress.toLowerCase() === circle.treasuryAddress.toLowerCase(), bills.treasuryAddress || 'missing')

let providerBalance = null
let airtimeServices = []
if (bills.environment === 'live' && bills.credentialsReady) {
  try {
    const provider = createVtpassClient({ config: bills })
    providerBalance = await provider.getWalletBalance()
    airtimeServices = await provider.listAirtimeServices()
    check('VTpass wallet balance', providerBalance >= Number(bills.minimumProviderBalanceNgn), `NGN ${providerBalance}`)
    const ids = new Set(airtimeServices.map(service => service.serviceId))
    check('Live Airtime catalog', ['mtn', 'airtel', 'glo'].every(id => ids.has(id)) && (ids.has('etisalat') || ids.has('9mobile')), [...ids].join(', '))
    const dataServices = await provider.listDataServices()
    const requiredData = ['mtn-data', 'airtel-data', 'glo-data', 'etisalat-data']
    check('Approved data networks', requiredData.every(id => dataServices.some(service => service.serviceId === id)), requiredData.join(', '))
    for (const serviceId of requiredData) {
      const plans = await provider.listServiceVariations(serviceId)
      check(`Live data plans: ${serviceId}`, plans.length > 0 && plans.every(plan => plan.amount > 0), `${plans.length} plans`)
    }
    const tvServices = await provider.listTvServices()
    check('Live TV catalog', tvServices.length > 0, `${tvServices.length} providers`)
    for (const service of tvServices) {
      const plans = await provider.listServiceVariations(service.serviceId)
      check(`Live TV plans: ${service.serviceId}`, plans.length > 0, `${plans.length} plans`)
    }
    const electricityServices = await provider.listElectricityServices()
    check('Live electricity catalog', electricityServices.length > 0, `${electricityServices.length} providers`)
  } catch (error) {
    check('VTpass read-only connection', false, error instanceof Error ? error.message : 'failed')
  }
}

if (circle.verificationReady) {
  try {
    const wallet = await createCircleDeveloperTreasuryClient({ config: circle }).verifyConfiguredWallet()
    check('Circle treasury live verification', wallet.address.toLowerCase() === bills.treasuryAddress.toLowerCase(), `${wallet.blockchain} ${wallet.accountType} ${wallet.state}`)
  } catch (error) {
    check('Circle treasury live verification', false, error instanceof Error ? error.message : 'failed')
  }
}

const passed = checks.every(item => item.passed)
console.log(JSON.stringify({
  passed,
  mode: 'read-only',
  checks,
  providerBalance,
  airtimeServices: airtimeServices.map(service => ({ serviceId: service.serviceId, name: service.name })),
  requiredWebhook: 'https://hashpaylink.com/api/vtpass-webhook',
  next: passed ? 'Preflight passed. Keep live vending disabled until the controlled Pocket payment test.' : 'Resolve every failed check before enabling live vending.',
}, null, 2))
if (!passed) process.exitCode = 1
