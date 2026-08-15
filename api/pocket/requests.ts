import type { Request, Response } from 'express'
import { Connection } from '@solana/web3.js'
import { localCurrencyProfileRepository, verifiedPrivyUser, type ProfileRepository } from '../local-currency-profile.js'
import { circleLinkKey, readCircleLink, type CircleLinkRecord } from '../privy-circle-link.js'
import { normalizeEvmUsdcChain, verifyEvmUsdcTransfer } from '../usdc-transfer-verify.js'
import { solanaUsdcTransferParties } from './wallet-chain-activity.js'
import { pocketRequestRepository, type PocketRequestRepository } from './request-store.js'

type Dependencies = { verifyUser(req: Request): ReturnType<typeof verifiedPrivyUser>; profiles: ProfileRepository; repository: PocketRequestRepository; readWallet?: (key: string) => Promise<CircleLinkRecord | null>; verifyEvm?: typeof verifyEvmUsdcTransfer; solanaConnection?: () => Connection }
const fail = (res: Response, status: number, message: string) => res.status(status).json({ ok: false, error: { message } })
const maskedEmail = (email: string) => {
  const [local, domain] = email.toLowerCase().split('@')
  if (!local || !domain) return 'Pocket user'
  return `${local.slice(0, 2)}...${local.slice(-2)}@${domain}`
}
const profileName = (profile: Awaited<ReturnType<ProfileRepository['getByPocketId']>>) => profile?.nameStatus === 'bank_resolved' && profile.resolvedName ? profile.resolvedName : maskedEmail(profile?.email || '')
const publicRequest = (item: Awaited<ReturnType<PocketRequestRepository['listFor']>>[number], userId: string) => ({ id: item.id, eventId: item.eventId, direction: item.recipientId === userId ? 'incoming' : 'outgoing', senderPocketId: item.senderPocketId, senderName: item.senderName, recipientPocketId: item.recipientPocketId, recipientName: item.recipientName || `Pocket ${item.recipientPocketId}`, title: item.title, amount: item.amount, flexibleAmount: item.flexibleAmount, network: item.network, paymentPath: item.paymentPath || '', status: item.status, transactionHash: item.transactionHash || '', createdAt: item.createdAt, updatedAt: item.updatedAt })

export function createPocketRequestsHandler(deps: Dependencies) {
  return async function handler(req: Request, res: Response) {
    if (req.method !== 'GET' && req.method !== 'POST') return fail(res, 405, 'Method not allowed.')
    try {
      const identity = await deps.verifyUser(req)
      const sender = await deps.profiles.ensure(identity)
      if (req.method === 'POST' && req.body?.action === 'resolve-request-user') {
        const pocketId = String(req.body?.pocketId ?? '').trim()
        if (!/^\d{6,12}$/.test(pocketId)) return fail(res, 400, 'Enter a valid Pocket ID.')
        if (pocketId === sender.profile.pocketId) return fail(res, 400, 'You cannot request money from yourself.')
        const recipient = await deps.profiles.getByPocketId(pocketId)
        if (!recipient) return fail(res, 404, 'Pocket user was not found.')
        return res.json({ ok: true, user: { pocketId: recipient.pocketId, displayName: profileName(recipient), verified: recipient.nameStatus === 'bank_resolved' } })
      }
      if (req.method === 'POST' && req.body?.action === 'resolve-recipient') {
        const pocketId = String(req.body?.pocketId ?? '').trim()
        const network = ['base', 'arbitrum', 'solana'].includes(req.body?.network) ? req.body.network as 'base' | 'arbitrum' | 'solana' : null
        if (!/^\d{6,12}$/.test(pocketId) || !network) return fail(res, 400, 'Enter a valid Pocket ID and network.')
        if (pocketId === sender.profile.pocketId) return fail(res, 400, 'You cannot send to your own Pocket ID.')
        const recipient = await deps.profiles.getByPocketId(pocketId)
        if (!recipient) return fail(res, 404, 'Pocket user was not found.')
        if (!deps.readWallet) return fail(res, 503, 'Pocket recipient lookup is unavailable.')
        const wallet = await deps.readWallet(circleLinkKey(recipient.privyUserId, network))
        if (!wallet?.circleWalletAddress) return fail(res, 409, `This Pocket user has not opened a ${network === 'solana' ? 'Solana' : network === 'arbitrum' ? 'Arbitrum' : 'Base'} wallet yet.`)
        return res.json({ ok: true, recipient: { pocketId: recipient.pocketId, name: profileName(recipient), network, address: wallet.circleWalletAddress } })
      }
      if (req.method === 'POST' && req.body?.action === 'create') {
        const recipient = await deps.profiles.getByPocketId(String(req.body?.recipientPocketId ?? ''))
        if (!recipient) return fail(res, 404, 'Pocket user was not found.')
        const network = ['base', 'arbitrum', 'solana'].includes(req.body?.network) ? req.body.network as 'base' | 'arbitrum' | 'solana' : 'base'
        if (!deps.readWallet) return fail(res, 503, 'Pocket wallet lookup is unavailable.')
        const wallet = await deps.readWallet(circleLinkKey(identity.userId, network))
        if (!wallet?.circleWalletAddress) return fail(res, 409, `Open your ${network === 'solana' ? 'Solana' : network === 'arbitrum' ? 'Arbitrum' : 'Base'} Pocket wallet before requesting payment.`)
        const saved = await deps.repository.create({ eventId: req.body?.eventId, senderId: identity.userId, senderPocketId: sender.profile.pocketId, senderName: profileName(sender.profile), senderAddress: wallet.circleWalletAddress, recipientId: recipient.privyUserId, recipientPocketId: recipient.pocketId, recipientName: profileName(recipient), title: String(req.body?.title ?? '').trim().slice(0, 100) || 'USDC request', amount: String(req.body?.amount ?? '').trim(), flexibleAmount: false, network })
        return res.status(saved.replayed ? 200 : 201).json({ ok: true, request: publicRequest(saved.request, identity.userId) })
      }
      if (req.method === 'POST' && req.body?.action === 'mark-read') {
        await deps.repository.markRead(identity.userId)
        return res.json({ ok: true })
      }
      if (req.method === 'POST' && (req.body?.action === 'accept' || req.body?.action === 'decline')) {
        const decided = await deps.repository.decide(identity.userId, req.body?.id, req.body.action)
        return res.json({ ok: true, request: publicRequest(decided, identity.userId) })
      }
      if (req.method === 'POST' && req.body?.action === 'complete') {
        const request = await deps.repository.getFor(identity.userId, String(req.body?.id ?? ''))
        if (request.recipientId !== identity.userId) return fail(res, 403, 'Only the requested Pocket user can pay this request.')
        if (request.status === 'paid') return res.json({ ok: true, request: publicRequest(request, identity.userId) })
        if (request.status !== 'accepted') return fail(res, 409, 'Accept this request before paying.')
        const txHash = String(req.body?.transactionHash ?? '').trim()
        if (!deps.readWallet) return fail(res, 503, 'Pocket wallet lookup is unavailable.')
        const payerWallet = await deps.readWallet(circleLinkKey(identity.userId, request.network === 'multi' ? 'base' : request.network))
        if (!payerWallet?.circleWalletAddress || !request.senderAddress) return fail(res, 409, 'Pocket wallet details are incomplete for this request.')
        if (request.network === 'solana') {
          if (!/^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(txHash)) return fail(res, 400, 'A valid Solana transaction is required.')
          const transaction = await (deps.solanaConnection?.() ?? new Connection(String(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'), 'confirmed')).getParsedTransaction(txHash, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
          if (!transaction || transaction.meta?.err) return fail(res, 409, 'Payment is still confirming. Try again shortly.')
          const transfer = solanaUsdcTransferParties(request.senderAddress, transaction.meta?.preTokenBalances, transaction.meta?.postTokenBalances)
          if (transfer.ownerDelta + 0.000001 < Number(request.amount) || transfer.counterparty !== payerWallet.circleWalletAddress) return fail(res, 409, 'The confirmed USDC transfer does not match this request.')
        } else {
          const chain = normalizeEvmUsdcChain(request.network)
          if (!chain || !deps.verifyEvm) return fail(res, 503, 'Pocket payment verification is unavailable.')
          if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) return fail(res, 400, 'A valid transaction is required.')
          try {
            await deps.verifyEvm({ chain, txHash, payer: payerWallet.circleWalletAddress, recipient: request.senderAddress, minAmount: request.amount, notBefore: new Date(request.createdAt).toISOString() })
          } catch (reason) {
            const message = reason instanceof Error ? reason.message : ''
            if (/receipt was not found yet|confirmation block was not available/i.test(message)) return fail(res, 409, 'Payment is still confirming. Pocket will keep checking.')
            if (/RPC|PRIVATE_RPC_URL|temporarily unavailable/i.test(message)) return fail(res, 503, 'Payment confirmation is temporarily unavailable. Pocket will keep your transfer pending.')
            return fail(res, 409, 'The confirmed USDC transfer does not match this request.')
          }
        }
        const paid = await deps.repository.markPaid(identity.userId, request.id, txHash)
        return res.json({ ok: true, request: publicRequest(paid, identity.userId) })
      }
      if (req.method === 'POST') return fail(res, 400, 'Choose a valid request action.')
      const requests = await deps.repository.listFor(identity.userId)
      const notifications = requests.map(item => publicRequest(item, identity.userId))
      const lastRead = await deps.repository.lastRead(identity.userId)
      return res.json({ ok: true, unreadCount: notifications.filter(item => item.updatedAt > lastRead).length, requests: notifications })
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return fail(res, error.status && error.status < 500 ? error.status : 503, error.message || 'Pocket requests are temporarily unavailable.')
    }
  }
}
export default createPocketRequestsHandler({ verifyUser: verifiedPrivyUser, profiles: localCurrencyProfileRepository, repository: pocketRequestRepository, readWallet: readCircleLink, verifyEvm: verifyEvmUsdcTransfer })
