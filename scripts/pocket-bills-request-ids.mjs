import process from 'node:process'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })

const [{ readVtpassPhase0Config }, { readDurableJson }] = await Promise.all([
  import('../api/vtpass-config.ts'),
  import('../api/render-durable-store.ts'),
])

const config = readVtpassPhase0Config()
const data = await readDurableJson(config.storeKey)
const intents = Object.values(data?.intents || {})

const successful = intents
  .filter(intent => intent
    && intent.providerEnvironment === 'sandbox'
    && intent.state === 'delivered'
    && intent.providerCode === '000'
    && intent.providerTransactionId
    && /^\d{12}[a-zA-Z0-9]{0,40}$/.test(String(intent.requestId || '')))
  .sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))

const latestByService = [...new Map(successful.map(intent => [
  `${intent.category}:${intent.serviceId}`,
  intent,
])).values()]

const categories = ['airtime', 'data', 'tv', 'electricity']
const results = latestByService.map(intent => ({
  category: intent.category,
  provider: intent.serviceName,
  serviceId: intent.serviceId,
  requestId: intent.requestId,
  completedAt: new Date(Number(intent.updatedAt)).toISOString(),
}))
const missingCategories = categories.filter(category => !results.some(result => result.category === category))

console.log(JSON.stringify({
  environment: config.environment,
  successfulSandboxRequests: results,
  missingCategories,
}, null, 2))

if (missingCategories.length) process.exitCode = 2
