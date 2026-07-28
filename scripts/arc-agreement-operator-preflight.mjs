import { randomUUID } from 'node:crypto'
import { runArcAgreementOperatorPreflight } from './lib/arc-agreement-operator-preflight.mjs'

try {
  const result = await runArcAgreementOperatorPreflight({
    env: process.env,
    requestId: randomUUID(),
  })
  console.log(JSON.stringify(result, null, 2))
} catch (error) {
  const message = error instanceof Error ? error.message : 'Arc Agreement operator preflight failed.'
  console.error(`Arc Agreement operator preflight failed: ${message}`)
  process.exitCode = 1
}
