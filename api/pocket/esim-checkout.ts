import type { Request, Response } from 'express'
import { createEsimOrderService, publicEsimIntent, type EsimIntent } from './esim-orders.js'
import { createEsimCatalogProvider } from './esim-provider.js'
import { createEsimOrderProvider } from './esim-orders-provider.js'
import { createCircleDeveloperTreasuryClient, readCircleTreasuryConfig } from '../circle-developer-treasury.js'
import { circleLinkKey, readCircleLink, verifiedPrivyUser } from '../privy-circle-link.js'
import { readCircleEvmChallenge } from '../circle-solana-email.js'
import { verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'
import { hasRenderDurableStore } from '../render-durable-store.js'
import { BASE_STABLECOINS } from '../../src/lib/baseStablecoins.js'
import { esimActivityRow } from './esim-activity.js'
import { verifyEsimFee } from './esim-fees.js'

export function esimTreasuryConfig(env = process.env) {
  return readCircleTreasuryConfig({ ...env,
    POCKET_BILLS_TREASURY_WALLET_SET_ID: env.POCKET_ESIM_TREASURY_WALLET_SET_ID,
    POCKET_BILLS_TREASURY_WALLET_ID: env.POCKET_ESIM_TREASURY_WALLET_ID,
    POCKET_BILLS_TREASURY_ADDRESS: env.POCKET_ESIM_TREASURY_ADDRESS,
  })
}
export function esimPurchaseConfigured(env = process.env) {
  const config = esimTreasuryConfig(env)
  return env.POCKET_ESIM_PURCHASE_ENABLED === 'true' && Boolean(env.ESIM_ACCESS_CODE?.trim())
    && (env.POCKET_SWAP_QUOTE_SECRET || '').length >= 32
    && config.verificationReady && /^[a-f0-9]{64}$/i.test(env.POCKET_ESIM_ENCRYPTION_KEY || '') && hasRenderDurableStore()
    && config.treasuryAddress.toLowerCase() !== (env.POCKET_BILLS_TREASURY_ADDRESS || '').toLowerCase()
}

export function createEsimRefundAdapter(config: ReturnType<typeof esimTreasuryConfig>, circle = createCircleDeveloperTreasuryClient({ config }), verify = verifyEvmUsdcTransfer) {
  return async (item: EsimIntent) => {
    if (item.network !== 'base' || item.treasury.toLowerCase() !== config.treasuryAddress.toLowerCase() || !item.refundKey) throw Error('ESIM_REFUND_UNAVAILABLE')
    await circle.verifyConfiguredWallet()
    const transactionId = item.refundTransactionId || (await circle.createUsdcTransfer({ idempotencyKey: item.refundKey, destinationAddress: item.payer, amount: item.price.total, refId: item.id, tokenAddress: BASE_STABLECOINS[item.asset].address })).id
    const transaction = await circle.getTransaction(transactionId)
    if (transaction.walletId && transaction.walletId !== config.walletId) throw Error('ESIM_REFUND_MISMATCH')
    if (!transaction.txHash) return { transactionId, txHash: '', confirmed: false }
    await verify({ chain: 'base', token: item.asset, confirmation: 'base-included', txHash: transaction.txHash, payer: item.treasury, recipient: item.payer, minAmount: item.price.total, exactAmount: true, notBefore: new Date(item.createdAt).toISOString() })
    return { transactionId, txHash: transaction.txHash, confirmed: true }
  }
}

let runtime: ReturnType<typeof buildRuntime> | undefined
function buildRuntime() {
  const catalog = createEsimCatalogProvider({ accessCode: process.env.ESIM_ACCESS_CODE?.trim() || '' })
  const config = esimTreasuryConfig(), circle = createCircleDeveloperTreasuryClient({ config })
  const service = createEsimOrderService({ catalog, supplier: createEsimOrderProvider({ accessCode: process.env.ESIM_ACCESS_CODE?.trim() || '' }), treasury: config.treasuryAddress, encryptionKey: process.env.POCKET_ESIM_ENCRYPTION_KEY || '', purchaseEnabled: () => esimPurchaseConfigured(), verifyTransfer: verifyEvmUsdcTransfer,
    readPayer: async ownerId => (await readCircleLink(circleLinkKey(ownerId, 'base')))?.circleWalletAddress || '',
    refund: createEsimRefundAdapter(config, circle), requireNetworkFee: true,
  })
  return { service, circle, catalog }
}
function current() { return runtime ??= buildRuntime() }
export async function readPocketEsimActivity(owner: string) {
  if (!hasRenderDurableStore()) return { payments: [], merchants: [], collections: [] }
  const payments = (await current().service.list(owner)).flatMap(item => { const row = esimActivityRow(item); return row ? [row] : [] })
  return { payments, merchants: [], collections: [] }
}
const messages: Record<string, string> = {
  ESIM_PURCHASE_DISABLED: 'eSIM purchases are not available yet.', ESIM_STOCK_UNAVAILABLE: 'This plan is temporarily unavailable.',
  ESIM_QUOTE_EXPIRED: 'The price has changed. Please try again.', ESIM_PAYMENT_IN_PROGRESS: 'Open your existing eSIM order to continue.',
  ESIM_WALLET_UNAVAILABLE: 'Open your Base wallet to continue.', ESIM_LIMIT_EXCEEDED: 'Choose a smaller plan or shorter duration.',
  ESIM_REFUND_NOT_ELIGIBLE: 'This order is not eligible for a refund.', ESIM_NOT_READY: 'Your eSIM is being prepared.',
}
export async function pocketEsimOrdersHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'private, no-store')
  let user
  try { user = await verifiedPrivyUser(req) } catch { return res.status(401).json({ error: 'Sign in to view your eSIMs.' }) }
  try {
    const { service, circle } = current(), owner = user.userId
    if (req.method === 'GET') return res.json({ orders: (await service.list(owner)).map(publicEsimIntent), purchaseEnabled: esimPurchaseConfigured() })
    const body = req.body || {}
    if (body.action === 'quote') {
      if (!esimPurchaseConfigured()) throw Error('ESIM_PURCHASE_DISABLED')
      await circle.verifyConfiguredWallet()
      const item = await service.quote({ ownerId: owner, requestKey: body.requestKey, packageCode: body.packageCode, days: body.days, asset: body.asset })
      return res.json({ intent: publicEsimIntent(item), recipient: item.treasury })
    }
    if (typeof body.id !== 'string' || !/^esim_[a-zA-Z0-9-]{1,64}$/.test(body.id)) return res.status(400).json({ error: 'Choose an eSIM order.' })
    let item = await service.get(owner, body.id)
    if (body.action === 'fees') {
      const link = await readCircleLink(circleLinkKey(owner, 'base'))
      if (!link || link.circleWalletAddress.toLowerCase() !== item.payer.toLowerCase()) throw Error('ESIM_WALLET_UNAVAILABLE')
      item = await service.bindFee(owner, item.id, verifyEsimFee(item, link.circleWalletId, body.feeQuoteToken))
      return res.json({ intent: publicEsimIntent(item) })
    }
    if (body.action === 'prepare') {
      await circle.verifyConfiguredWallet()
      item = await service.prepare(owner, body.id)
      return res.json({ intent: publicEsimIntent(item), payment: { payer: item.payer, recipient: item.treasury, amount: item.price.total, totalDebit: item.totalDebit, feeQuoteToken: item.feeQuoteToken, asset: item.asset, network: 'base', idempotencyKey: item.paymentKey } })
    }
    if (body.action === 'track') item = await service.track(owner, body.id, { challengeId: body.challengeId, transactionId: body.transactionId, txHash: body.txHash })
    else if (body.action === 'installation') return res.json({ installation: await service.installation(owner, body.id) })
    else if (body.action === 'refund') item = await service.refund(owner, body.id)
    else if (body.action !== 'status' && body.action !== 'confirm') return res.status(400).json({ error: 'Unsupported eSIM action.' })
    if (body.txHash && item.state === 'awaiting_payment') item = await service.track(owner, item.id, { txHash: body.txHash })
    if (!item.txHash && item.challengeId && typeof body.circleUserToken === 'string') {
      const link = await readCircleLink(circleLinkKey(owner, 'base'))
      if (link && link.circleWalletAddress.toLowerCase() === item.payer.toLowerCase()) {
        const result = await readCircleEvmChallenge({ chain: 'base', userToken: body.circleUserToken, walletId: link.circleWalletId, walletAddress: item.payer, challengeId: item.challengeId })
        if (result.txHash) item = await service.track(owner, item.id, { txHash: result.txHash })
        else if (result.status === 'failed' && 'notSubmitted' in result && result.notSubmitted) item = await service.retireUnsubmitted(owner, item.id)
      }
    }
    if (item.state === 'awaiting_payment' && item.txHash) item = await service.confirm(owner, item.id, item.txHash)
    item = await service.reconcile(owner, item.id)
    return res.json({ intent: publicEsimIntent(item) })
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    return res.status(code === 'ESIM_NOT_FOUND' ? 404 : code === 'ESIM_PURCHASE_DISABLED' ? 503 : 409).json({ code: code.startsWith('ESIM_') ? code : 'ESIM_PENDING', error: messages[code] || 'Could not update this eSIM order. Please try again.' })
  }
}
let draining = false
export async function drainPocketEsimOrders() {
  if (draining || !hasRenderDurableStore() || !process.env.ESIM_ACCESS_CODE) return
  draining = true
  try {
    const { service } = current()
    for (let item of await service.pending()) {
      try {
        if (item.state === 'awaiting_payment' && item.txHash) item = await service.confirm(item.ownerId, item.id, item.txHash)
        item = await service.reconcile(item.ownerId, item.id)
        if (['refund_eligible', 'refunding'].includes(item.state)) await service.refund(item.ownerId, item.id)
      } catch { /* Preserve unresolved records for the next reconciliation pass. */ }
    }
  } finally { draining = false }
}
