// Read-only provider check. Never print credentials, response bodies or prices.
import { createEsimCatalogProvider } from '../api/pocket/esim-provider.ts'
const accessCode = process.env.ESIM_ACCESS_CODE?.trim()
if (!accessCode) {
  console.error('Set ESIM_ACCESS_CODE in the server environment before verifying.')
  process.exitCode = 1
} else {
  try {
    const destinations = await createEsimCatalogProvider({ accessCode }).catalog()
    console.log(JSON.stringify({ provider: 'eSIM Access', destinations: destinations.length,
      plans: destinations.reduce((sum, item) => sum + item.plans.length, 0),
      countries: ['NG', 'UG', 'KE'].map(code => ({ code, plans: destinations.find(item => item.countryCode === code)?.plans.length || 0 })),
      purchaseEnabled: false,
    }, null, 2))
  } catch {
    console.error('Catalogue verification failed. Check the server credential and provider availability.')
    process.exitCode = 1
  }
}
