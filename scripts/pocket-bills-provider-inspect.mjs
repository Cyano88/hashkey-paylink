import process from 'node:process'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })

const requestId = String(process.argv.find(value => value.startsWith('--request=')) || '').slice(10).trim()
const REQUEST_ID_PATTERN = /^\d{12}[a-zA-Z0-9]{0,40}$/

if (!REQUEST_ID_PATTERN.test(requestId)) {
  console.error('Provide the exact VTpass support reference with --request=2026...')
  process.exitCode = 1
} else {
  const [{ readVtpassPhase0Config }, { readDurableJson }, { createVtpassClient }] = await Promise.all([
    import('../api/vtpass-config.ts'),
    import('../api/render-durable-store.ts'),
    import('../api/vtpass-client.ts'),
  ])
  const config = readVtpassPhase0Config()
  const data = await readDurableJson(config.storeKey)
  const matches = Object.values(data?.intents || {}).filter(intent => intent?.requestId === requestId)
  if (matches.length !== 1) {
    console.error(matches.length ? 'Support reference is connected to multiple Bills records.' : 'Support reference was not found in the durable Bills store.')
    process.exitCode = 1
  } else {
    const intent = matches[0]
    let provider
    try {
      provider = { ok: true, result: await createVtpassClient({ config }).requeryTransaction(requestId) }
    } catch (error) {
      provider = {
        ok: false,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          code: error && typeof error === 'object' && 'code' in error ? String(error.code) : '',
          providerCode: error && typeof error === 'object' && 'providerCode' in error ? String(error.providerCode) : '',
          message: error instanceof Error ? error.message : 'VTpass requery failed.',
        },
      }
    }
    console.log(JSON.stringify({
      stored: {
        intentId: intent.id,
        state: intent.state,
        category: intent.category,
        serviceId: intent.serviceId,
        requestId: intent.requestId,
        providerCode: intent.providerCode,
        providerStatus: intent.providerStatus,
        providerTransactionId: intent.providerTransactionId,
        providerDescription: intent.providerDescription,
        purchasedCode: intent.purchasedCode,
        requeryAttempts: intent.requeryAttempts,
        failureReason: intent.failureReason,
        paymentTxHash: intent.txHash,
        paymentAmountUsdc: intent.paymentAmountUsdc,
        createdAt: new Date(intent.createdAt).toISOString(),
        updatedAt: new Date(intent.updatedAt).toISOString(),
      },
      provider,
    }, null, 2))
  }
}
