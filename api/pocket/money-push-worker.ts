import { readPocketNotificationActivity } from './activity.js'
import { pocketMoneyNotification } from '../../src/pocket/lib/pocketMoneyNotification.js'
import { mergePocketActivityRows } from '../../src/pocket/lib/pocketActivitySnapshot.js'
import { listCirclePocketActions } from '../circle-pocket-action-journal.js'
import { findEvmUsdcTransfer, normalizeEvmUsdcChain } from '../usdc-transfer-verify.js'
import { pocketRequestRepository } from './request-store.js'
import { listPocketPushOwners, pocketPushConfigured, sendPocketPush } from './push-devices.js'
import { findSolanaUsdcTransfer, readPocketLinkedWalletAddresses, readPocketWalletChainActivity } from './wallet-chain-activity.js'

const NETWORK_LABELS: Record<string, string> = { base: 'Base', arbitrum: 'Arbitrum', solana: 'Solana', arc: 'Arc' }
let inFlight: Promise<Awaited<ReturnType<typeof runPocketMoneyPushWorker>>> | null = null
const acceptedRecoveryAttemptAt = new Map<string, number>()
const ACCEPTED_RECOVERY_BACKOFF_MS = 10 * 60_000

type Dependencies = {
  configured: () => boolean
  listOwners: typeof listPocketPushOwners
  readActivity: typeof readPocketWalletChainActivity
  readWallets: typeof readPocketLinkedWalletAddresses
  listActions: typeof listCirclePocketActions
  listRequests: typeof pocketRequestRepository.listFor
  markRequestPaid: typeof pocketRequestRepository.markPaid
  findEvm: typeof findEvmUsdcTransfer
  findSolana: typeof findSolanaUsdcTransfer
  sendPush: typeof sendPocketPush
  readContext: typeof readPocketNotificationActivity
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
    findEvm: findEvmUsdcTransfer,
    findSolana: findSolanaUsdcTransfer,
    sendPush: sendPocketPush,
    readContext: readPocketNotificationActivity,
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
      const [rawRows, wallets, actions, requests, context] = await Promise.all([
        dependencies.readActivity(ownerId, { timeoutMs: 8_000, limit: 100 }),
        dependencies.readWallets(ownerId),
        dependencies.listActions(ownerId, 500),
        dependencies.listRequests(ownerId),
        dependencies.readContext(ownerId),
      ])
      const rows = mergePocketActivityRows([],rawRows)
      const ownWallets = new Set(wallets.map(item => item.walletAddress.toLowerCase()))
      const ignoredHashes = actionHashes(actions)
      const cutoff = dependencies.now() - lookbackMs
      // Provider records own payment wording. Suppress the debit, fee logs,
      // refund deposit and every attached funding leg even before delivery.
      for (const row of context) {
        for (const hash of [row.txHash,row.refundTxHash,row.destinationTxHash,...(row.paymentFunding||[]).flatMap(f=>[f.txHash,f.destinationTxHash])]) if(hash) ignoredHashes.add(hash.toLowerCase())
        const notice=pocketMoneyNotification(row)
        if(notice && notice.occurredAt>=cutoff){await dependencies.sendPush(ownerId,notice.eventId,notice);notifications++}
      }
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
      const reconciledRequestIds = new Set<string>()
      for (const row of rows.filter(isConfirmedMoney)) {
        const request = matchingAcceptedRequest(row)
        if (!request || request.recipientId !== ownerId || !row.txHash) continue
        const paid = await dependencies.markRequestPaid(ownerId, request.id, row.txHash)
        reconciledRequestIds.add(request.id)
        ignoredHashes.add(row.txHash.toLowerCase())
        await Promise.allSettled([
          dependencies.sendPush(paid.senderId, `request-paid-received:${paid.id}`, { title: 'Request paid', body: `${paid.amount} USDC received for ${paid.title||'your request'}.`, path: '/activity?receipt='+encodeURIComponent(paid.eventId), tag: `pocket-request:${paid.id}` }),
          dependencies.sendPush(paid.recipientId, `request-paid-sent:${paid.id}`, { title: 'Request paid', body: `Your ${paid.amount} USDC request payment was successful.`, path: '/activity?receipt='+encodeURIComponent(paid.eventId), tag: `pocket-request:${paid.id}` }),
        ])
        notifications += 2
      }
      for (const request of requests.filter(item => item.status === 'accepted' && item.recipientId === ownerId).slice(0, 4)) {
        if (reconciledRequestIds.has(request.id) || !request.senderAddress) continue
        const recoveryKey = `${ownerId}:${request.id}`
        const lastAttempt = acceptedRecoveryAttemptAt.get(recoveryKey) ?? 0
        if (dependencies.now() - lastAttempt < ACCEPTED_RECOVERY_BACKOFF_MS) continue
        acceptedRecoveryAttemptAt.set(recoveryKey, dependencies.now())
        try {
          const network = request.network === 'multi' ? 'base' : request.network
          const payerWallet = wallets.find(wallet => wallet.network === network)?.walletAddress
          if (!payerWallet) continue
          const match = network === 'solana'
            ? await dependencies.findSolana({ payer: payerWallet, recipient: request.senderAddress, amount: request.amount, notBefore: request.updatedAt })
            : await dependencies.findEvm({
                chain: normalizeEvmUsdcChain(network)!,
                payer: payerWallet,
                recipient: request.senderAddress,
                minAmount: request.amount,
                exactAmount: true,
                notBefore: new Date(request.updatedAt).toISOString(),
                notAfter: new Date(dependencies.now() + 120_000).toISOString(),
                lookbackBlocks: 43_200n,
                chunkSize: 3_600n,
              })
          if (!match?.txHash) continue
          const paid = await dependencies.markRequestPaid(ownerId, request.id, match.txHash)
          ignoredHashes.add(match.txHash.toLowerCase())
          reconciledRequestIds.add(request.id)
          acceptedRecoveryAttemptAt.delete(recoveryKey)
          await Promise.allSettled([
            dependencies.sendPush(paid.senderId, `request-paid-received:${paid.id}`, { title: 'Request paid', body: `${paid.amount} USDC received for ${paid.title||'your request'}.`, path: '/activity?receipt='+encodeURIComponent(paid.eventId), tag: `pocket-request:${paid.id}` }),
            dependencies.sendPush(paid.recipientId, `request-paid-sent:${paid.id}`, { title: 'Request paid', body: `Your ${paid.amount} USDC request payment was successful.`, path: '/activity?receipt='+encodeURIComponent(paid.eventId), tag: `pocket-request:${paid.id}` }),
          ])
          notifications += 2
        } catch (error) {
          console.warn('[pocket-money-push] accepted request recovery deferred:', error instanceof Error ? error.message : String(error))
        }
      }
      requests.filter(item => item.status === 'paid' && item.transactionHash).forEach(item => ignoredHashes.add(item.transactionHash!.toLowerCase()))
      const confirmed = rows.filter(row => {
        if (!isConfirmedMoney(row) || !row.txHash) return false
        // Allow durable purchase registration to catch up with chain indexing.
        if(row.direction==='out' && dependencies.now()-row.ts<30_000)return false
        if (ignoredHashes.has(row.txHash.toLowerCase()) || matchingAcceptedRequest(row)) return false
        const counterparty = row.direction === 'in' ? row.payer : row.recipient
        return !counterparty || !ownWallets.has(counterparty.toLowerCase())
      })
      for (const row of confirmed) {
        const notice=pocketMoneyNotification(row)
        if(!notice)continue
        await dependencies.sendPush(ownerId,notice.eventId,notice)
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
