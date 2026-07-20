import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import {
  createCircleDeveloperTreasuryClient,
  readCircleTreasuryConfig,
} from '../api/circle-developer-treasury.ts'

const mode = String(process.argv[2] || 'audit').trim().toLowerCase()
const localEnvPath = '.env.local'

dotenv.config({ path: localEnvPath, quiet: true })
dotenv.config({ quiet: true })

if (mode === 'setup' && existsSync(localEnvPath)) {
  const current = readFileSync(localEnvPath, 'utf8')
  const additions = []
  if (!process.env.POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY) {
    process.env.POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY = randomUUID()
    additions.push(`POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY=${process.env.POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY}`)
  }
  if (!process.env.POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY) {
    process.env.POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY = randomUUID()
    additions.push(`POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY=${process.env.POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY}`)
  }
  if (additions.length) {
    const separator = current.endsWith('\n') || current.endsWith('\r') ? '' : '\n'
    appendFileSync(localEnvPath, `${separator}${additions.join('\n')}\n`, 'utf8')
  }
}

const config = readCircleTreasuryConfig()

function readiness() {
  return {
    apiBaseOfficial: config.apiBase === 'https://api.circle.com',
    apiKeyConfigured: Boolean(config.apiKey),
    entitySecretConfigured: config.credentialsReady,
    setupIdempotencyConfigured: config.setupReady,
    walletSetConfigured: Boolean(config.walletSetId),
    walletConfigured: Boolean(config.walletId),
    treasuryAddressConfigured: Boolean(config.treasuryAddress),
    verificationReady: config.verificationReady,
    blockchain: config.blockchain,
    accountType: config.accountType,
  }
}

function persistLocalWalletIdentifiers(walletSetId, wallet) {
  if (!existsSync(localEnvPath)) return
  const current = readFileSync(localEnvPath, 'utf8')
  const additions = []
  if (!/^POCKET_BILLS_TREASURY_WALLET_SET_ID=/m.test(current)) {
    additions.push(`POCKET_BILLS_TREASURY_WALLET_SET_ID=${walletSetId}`)
  }
  if (!/^POCKET_BILLS_TREASURY_WALLET_ID=/m.test(current)) {
    additions.push(`POCKET_BILLS_TREASURY_WALLET_ID=${wallet.id}`)
  }
  if (!/^POCKET_BILLS_PENDING_CIRCLE_TREASURY_ADDRESS=/m.test(current)) {
    additions.push(`POCKET_BILLS_PENDING_CIRCLE_TREASURY_ADDRESS=${wallet.address}`)
  }
  if (!additions.length) return
  const separator = current.endsWith('\n') || current.endsWith('\r') ? '' : '\n'
  appendFileSync(localEnvPath, `${separator}${additions.join('\n')}\n`, 'utf8')
}

async function main() {
  console.log(JSON.stringify(readiness(), null, 2))

  if (mode === 'audit') {
    if (!config.verificationReady) {
      console.log('Circle treasury is not ready for live verification. No external request was made.')
      process.exitCode = 2
      return
    }
    const wallet = await createCircleDeveloperTreasuryClient({ config }).verifyConfiguredWallet()
    console.log(JSON.stringify({
      verified: true,
      walletId: wallet.id,
      walletSetId: wallet.walletSetId,
      address: wallet.address,
      blockchain: wallet.blockchain,
      accountType: wallet.accountType,
      state: wallet.state,
    }, null, 2))
    return
  }

  if (mode !== 'setup') {
    throw new Error('Usage: npm run circle:treasury:audit or npm run circle:treasury:setup')
  }
  if (!config.setupReady) {
    throw new Error('Circle treasury setup is incomplete. Configure the entity secret and both UUID v4 idempotency keys first.')
  }
  if (config.walletId) {
    throw new Error('Treasury wallet details already exist. Run audit instead of creating another wallet.')
  }

  const client = createCircleDeveloperTreasuryClient({ config })
  const walletSet = config.walletSetId
    ? { id: config.walletSetId }
    : await client.createWalletSet()
  const wallet = await client.createWallet(walletSet.id)
  persistLocalWalletIdentifiers(walletSet.id, wallet)
  console.log(JSON.stringify({
    created: true,
    walletSetId: walletSet.id,
    walletId: wallet.id,
    treasuryAddress: wallet.address,
    blockchain: wallet.blockchain,
    accountType: wallet.accountType,
    state: wallet.state,
    next: 'Save the three identifiers as Render environment variables, redeploy, then run the read-only audit.',
  }, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Circle treasury command failed.')
  process.exitCode = 1
})
