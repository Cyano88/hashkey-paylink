import { randomUUID } from 'node:crypto'
import { createPublicClient, http } from 'viem'
import { arcTestnet } from 'viem/chains'
import { auditArcAgreementInvitePilot } from '../api/arc-agreement-activation-policy.ts'
import { resolveDeveloperProjectPolicy } from '../api/developer-projects.ts'
import { hasRenderDurableStore } from '../api/render-durable-store.ts'
import { runArcAgreementOperatorPreflight } from './lib/arc-agreement-operator-preflight.mjs'

function projectArgument(argv) {
  const inline = argv.find(value => value.startsWith('--project='))
  const index = argv.indexOf('--project')
  const value = inline?.slice('--project='.length) ?? (index >= 0 ? argv[index + 1] : '')
  if (!/^dev_[a-z0-9]{8,64}$/i.test(String(value ?? '').trim())) {
    throw new Error('Pass one developer project id with --project dev_....')
  }
  return String(value).trim()
}

async function main() {
  const projectId = projectArgument(process.argv.slice(2))
  if (!hasRenderDurableStore()) {
    throw new Error('A durable Render store is required before invite pilot activation.')
  }
  const policy = await resolveDeveloperProjectPolicy(projectId, 'test')
  if (!policy) {
    throw new Error('The selected project must be active, managed, and have an unrevoked test API key.')
  }
  const gate = auditArcAgreementInvitePilot({ policy, env: process.env })
  const operator = await runArcAgreementOperatorPreflight({
    env: process.env,
    requestId: randomUUID(),
  })

  const rpcUrl = String(process.env.PRIVATE_RPC_URL_ARC ?? '').trim()
  if (!rpcUrl) throw new Error('PRIVATE_RPC_URL_ARC is required for the invite pilot.')
  const client = createPublicClient({
    chain: { ...arcTestnet, id: 5_042_002, name: 'Arc Testnet' },
    transport: http(rpcUrl, { timeout: 15_000, retryCount: 2 }),
  })
  if (await client.getChainId() !== 5_042_002) throw new Error('PRIVATE_RPC_URL_ARC is not Arc Testnet.')
  const bytecode = await client.getBytecode({ address: gate.factory })
  if (!bytecode || bytecode === '0x') throw new Error('Reviewed Arc Agreement factory bytecode is unavailable.')

  console.log(JSON.stringify({
    ok: true,
    phase: 'invite_preflight',
    publicActivationEnabled: false,
    workersEnabled: false,
    project: {
      id: gate.projectId,
      name: policy.merchantName,
      checkoutMode: gate.checkoutMode,
      originCount: policy.allowedOrigins.length,
      webhookConfigured: policy.webhookConfigured,
      recipient: gate.recipient,
    },
    limits: {
      agreementUsdc: Number(gate.amountCeilingUsdcUnits) / 1_000_000,
      dailyUsdc: Number(gate.dailyVolumeCeilingUsdcUnits) / 1_000_000,
      activeAgreements: gate.activeAgreementLimit,
      durationSeconds: gate.durationCeilingSeconds,
    },
    chain: {
      network: 'ARC-TESTNET',
      chainId: 5_042_002,
      factory: gate.factory,
      confirmationBlocks: gate.confirmationBlocks,
      factoryCodeVerified: true,
    },
    operator,
    next: 'Request explicit authorization for one private payer activation; do not enable workers.',
  }, null, 2))
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Arc Agreement invite preflight failed.'
  console.error(`Arc Agreement invite preflight failed: ${message}`)
  process.exitCode = 1
})
