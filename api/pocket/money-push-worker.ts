import { listCirclePocketActions } from '../circle-pocket-action-journal.js'
import { pocketRequestRepository } from './request-store.js'
import { listPocketPushOwners, pocketPushConfigured, sendPocketPush } from './push-devices.js'
import { readPocketLinkedWalletAddresses, readPocketWalletChainActivity } from './wallet-chain-activity.js'

const NETWORK_LABELS: Record<string, string> = { base: 'Base', arbitrum: 'Arbitrum', solana: 'Solana', arc: 'Arc' }
let inFlight: Promise<Awaited<ReturnType<typeof runPocketMoneyPushWorker>>> | null = null

type Dependencies = {
  configured: () => boolean
  listOwners: typeof listPocketPushOwners
  readActivity: typeof readPocketWalletChainActivity
  readWallets: typeof readPocketLinkedWalletAddresses
  listActions: typeof listCirclePocketActions
  listRequests: typeof pocketRequestRepository.listFor
  markRequestPaid: typeof pocketRequestRepository.markPaid
  sendPush: typeof sendPocketPush
  now: () => number
}

function actionHashes(records: Awaited<ReturnType<typeof listCirclePocketActions>>) {
  const hashes = new Set<string>()
  for (const record of records) {
    if (record.action !== 'wallet.bridge' && record.action !== 'bank-withdraw.route') continue
    const candidates = [record.resourceId, record.metadata?.txHash, record.metadata?.destinationTxHash]
    candidates.forEach(value => { if (value) hashes.add(String(value).toLowerCase()) })
  }
  return hashes
}

export async function runPocketMoneyPushWorker(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = {
    configured: pocketPushConfigured,
    listOwners: listPocketPushOwners,
    readActivity: readPocketWalletChainActivity,
    readWallets: readPocketLinkedWalletAddresses,
    listActions: listCirclePocketActions,
    listRequests: pocketRequestRepository.listFor,
    markRequestPaid: pocketRequestRepository.markPaid,
    sendPush: sendPocketPush,
    now: Date.now,
    ...overrides,
  }
  if (!dependencies.configured()) return { ok: true, owners: 0, notifications: 0, errors: 0 }
  const ownerLimit = Math.max(1, Math.min(Number(process.env.POCKET_MONEY_PUSH_OWNER_LIMIT ?? 50), 200))
  const lookbackMs = Math.max(60_000, Math.min(Number(process.env.POCKET_MONEY_PUSH_LOOKBACK_MS ?? 10 * 60_000), 24 * 60 * 60_000))
  const owners = (await dependencies.listOwners()).slice(0, ownerLimit)
  let notifications = 0
  let errors = 0
  for (const ownerId of owners) {
    try {
      const [rows, wallets, actions, requests] = await Promise.all([
        dependencies.readActivity(ownerId, { timeoutMs: 8_000, limit: 100 }),
        dependencies.readWallets(ownerId),
        dependencies.listActions(ownerId, 500),
        dependencies.listRequests(ownerId),
      ])
      const ownWallets = new Set(wallets.map(item => item.walletAddress.toLowerCase()))
      const ignoredHashes = actionHashes(actions)
      const cutoff = dependencies.now() - lookbackMs
      const isConfirmedMoney = (row: (typeof rows)[number]) => {
        const source = String(row.source ?? '').toLowerCase()
        return (source === 'wallet-deposit' || source === 'wallet-withdrawal')
          && String(row.paycrestStatus ?? '').toLowerCase() === 'confirmed'
          && Boolean(row.txHash)
          && row.ts >= cutoff
      }
      const matchingAcceptedRequest = (row: (typeof rows)[number]) => requests.find(request => {
        if (request.status !== 'accepted' || row.ts < request.updatedAt || Number(row.amount) !== Number(request.amount)) return false
        const senderAddress = request.senderAddress?.toLowerCase()
        if (!senderAddress) return false
        if (request.recipientId === ownerId && row.direction === 'out') return row.recipient?.toLowerCase() === senderAddress
        if (request.senderId === ownerId && row.direction === 'in') return row.recipient?.toLowerCase() === senderAddress
        return false
      })
      for (const row of rows.filter(isConfirmedMoney)) {
        const request = matchingAcceptedRequest(row)
        if (!request || request.recipientId !== ownerId || !row.txHash) continue
        const paid = await dependencies.markRequestPaid(ownerId, request.id, row.txHash)
        ignoredHashes.add(row.txHash.toLowerCase())
        await Promise.allSettled([
          dependencies.sendPush(paid.senderId, `request-paid-received:${paid.id}`, { title: 'Payment received', body: `${paid.amount} USDC received.`, path: '/activity', tag: `pocket-request:${paid.id}` }),
          dependencies.sendPush(paid.recipientId, `request-paid-sent:${paid.id}`, { title: 'Payment sent', body: `${paid.amount} USDC sent successfully.`, path: '/activity', tag: `pocket-request:${paid.id}` }),
        ])
        notifications += 2
      }
      requests.filter(item => item.status === 'paid' && item.transactionHash).forEach(item => ignoredHashes.add(item.transactionHash!.toLowerCase()))
      const confirmed = rows.filter(row => {
        if (!isConfirmedMoney(row) || !row.txHash) return false
        if (ignoredHashes.has(row.txHash.toLowerCase()) || matchingAcceptedRequest(row)) return false
        const counterparty = row.direction === 'in' ? row.payer : row.recipient
        return !counterparty || !ownWallets.has(counterparty.toLowerCase())
      })
      for (const row of confirmed) {
        const incoming = row.direction === 'in'
        const network = NETWORK_LABELS[String(row.chain).toLowerCase()] || String(row.chain || 'Pocket')
        await dependencies.sendPush(ownerId, `wallet-money:${incoming ? 'in' : 'out'}:${row.txHash.toLowerCase()}`, {
          title: incoming ? 'USDC received' : 'USDC sent',
          body: `${row.amount} USDC ${incoming ? 'received' : 'sent'} on ${network}.`,
          path: '/activity',
          tag: `pocket-money:${row.txHash.toLowerCase()}`,
        })
        notifications += 1
      }
    } catch (error) {
      errors += 1
      console.error('[pocket-money-push] owner scan failed:', error instanceof Error ? error.message : String(error))
    }
  }
  return { ok: errors === 0, owners: owners.length, notifications, errors }
}

export function drainPocketMoneyPushWorker() {
  if (!inFlight) inFlight = runPocketMoneyPushWorker().finally(() => { inFlight = null })
  return inFlight
}