import { createArcDisplayBalanceReader } from './arc-display-balances.js'
import type { Request, Response } from 'express'
import { createPublicClient, formatUnits, getAddress, http, parseAbi, type Hex } from 'viem'
import { arcChain } from '../../src/lib/chains.js'
import { circleLinkKey, readCircleLink, verifiedPrivyUser } from '../privy-circle-link.js'
import { createCircleGasStationEvmChallenge, readCircleArcSwapChallenge } from '../circle-solana-email.js'
import { claimCirclePocketAction, listCirclePocketActions, findCirclePocketAction, recordCirclePocketAction } from '../circle-pocket-action-journal.js'
import { type ArcSwapQuote, confirmedArcSwapAmount, openArcSwapQuote, quoteArcSwap, readArcSwapToken, readArcSwapTokens, sealArcSwapQuote } from './arc-swap-provider.js'

const TOKEN_ABI = parseAbi(['function balanceOf(address owner) view returns (uint256)'])
const client = createPublicClient({ chain: arcChain, transport: http(process.env.PRIVATE_RPC_URL_ARC_MAINNET || 'https://rpc.mainnet.arc.io', { timeout: 15_000 }) })
const readDisplayBalance = createArcDisplayBalanceReader({
  read: (wallet, token) => client.readContract({ address: getAddress(token), abi: TOKEN_ABI, functionName: 'balanceOf', args: [getAddress(wallet)] }),
})
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export async function arcSwapQuotePreview(quote: ArcSwapQuote, readBalance: () => Promise<bigint> = () => client.readContract({ address: quote.tokenIn.address, abi: TOKEN_ABI, functionName: 'balanceOf', args: [quote.walletAddress] })) {
  let balance: bigint | null = null
  try { balance = await readBalance() } catch { /* Prices remain available during balance RPC outages. */ }
  const { callData, ownerId, ...publicQuote } = quote
  return { ok: true, quote: publicQuote, quoteToken: sealArcSwapQuote(quote), balance: balance === null ? null : formatUnits(balance, quote.tokenIn.decimals), balanceStatus: balance === null ? 'unavailable' : 'ok', sufficientBalance: balance === null ? null : balance >= BigInt(quote.amountUnits) }
}

export default async function arcSwapHandler(req: Request, res: Response) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    const identity = await verifiedPrivyUser(req)
    const link = await readCircleLink(circleLinkKey(identity.userId, 'arc'))
    if (req.method === 'GET') {
      const requested = typeof req.query.token === 'string' ? req.query.token.trim() : ''
      const tokens = requested ? [await readArcSwapToken(requested)] : (await readArcSwapTokens()).sort((a, b) => Number(same(b.address, '0x3600000000000000000000000000000000000000')) - Number(same(a.address, '0x3600000000000000000000000000000000000000')))
      const balances = link?.circleBlockchain === 'ARC'
        ? await Promise.all(tokens.map(async (token, index) => {
          if (index >= 50) return { ...token, balance: null, balanceStatus: 'unavailable' }
          try {
            const balance = await readDisplayBalance(identity.userId, link.circleWalletAddress, token.address)
            return { ...token, balance: formatUnits(balance, token.decimals), balanceStatus: 'ok' }
          } catch { return { ...token, balance: null, balanceStatus: 'unavailable' } }
        })) : tokens.map(token => ({ ...token, balance: null, balanceStatus: 'wallet_required' }))
      if (requested) return res.json({ ok: true, token: balances[0] })
      const actions = await listCirclePocketActions(identity.userId, 500)
      const unresolved = actions.find(action => action.action === 'wallet.swap' && ['started', 'submitted'].includes(action.status) && action.metadata?.quoteToken && action.metadata.walletAddress.toLowerCase() === link?.circleWalletAddress.toLowerCase())
      let pending = null
      if (unresolved?.metadata?.quoteToken) {
        const recovered = openArcSwapQuote(unresolved.metadata.quoteToken, identity.userId, true)
        const { callData, ownerId, ...quote } = recovered
        pending = { quoteToken: unresolved.metadata.quoteToken, quote, walletAddress: recovered.walletAddress, challengeId: unresolved.metadata.challengeId, txHash: unresolved.metadata.txHash }
      }
      return res.json({ ok: true, chainId: 5042, tokens: balances, pending })
    }
    if (!link || link.circleBlockchain !== 'ARC') return res.status(409).json({ ok: false, error: 'Open your Arc mainnet wallet before swapping.' })
    if (await client.getChainId() !== 5042) throw new Error('Arc mainnet RPC configuration is invalid.')
    const action = req.body?.action
    if (action === 'quote') {
      const quote = await quoteArcSwap({ ownerId: identity.userId, walletId: link.circleWalletId, walletAddress: getAddress(link.circleWalletAddress), tokenIn: String(req.body.tokenIn ?? ''), tokenOut: String(req.body.tokenOut ?? ''), amount: String(req.body.amount ?? '') })
      return res.json(await arcSwapQuotePreview(quote))
    }
    if (action !== 'execute' && action !== 'status') return res.status(400).json({ ok: false, error: 'Unsupported swap action.' })
    const quote = openArcSwapQuote(String(req.body.quoteToken ?? ''), identity.userId, action === 'status')
    if (link.circleWalletId !== quote.walletId || !same(link.circleWalletAddress, quote.walletAddress)) return res.status(409).json({ ok: false, error: 'Your Arc wallet changed. Request a new quote.' })
    const journalKey = 'pocket:arc-swap:' + quote.id
    const existing = await findCirclePocketAction(identity.userId, journalKey, 'wallet.swap')
    const metadata = { ...(existing?.metadata ?? {}), quoteToken: String(req.body.quoteToken), network: 'arc', amount: quote.amount, tokenIn: quote.tokenIn.symbol, tokenOut: quote.tokenOut.symbol, walletAddress: quote.walletAddress }
    if (action === 'execute') {
      if (existing?.metadata?.challengeId) return res.json({ ok: true, challengeId: existing.metadata.challengeId, swapId: quote.id })
      // Own-wallet swaps use Circle authorization; no additional Pocket payment PIN.
      const userToken = String(req.body.circleUserToken ?? '')
      if (!userToken || userToken.length > 8_000) return res.status(400).json({ ok: false, error: 'Reconnect your Circle wallet.' })
      const balance = await client.readContract({ address: quote.tokenIn.address, abi: TOKEN_ABI, functionName: 'balanceOf', args: [quote.walletAddress] })
      if (balance < BigInt(quote.amountUnits)) return res.status(409).json({ ok: false, error: 'Your Arc token balance is too low for this swap.' })
      // Simulate the exact atomic approval/swap/revoke batch before requesting signature.
      await client.call({ account: quote.walletAddress, to: quote.walletAddress, data: quote.callData })
      if (quote.expiresAt <= Date.now()) return res.status(409).json({ ok: false, error: 'Quote expired. Review a new quote.' })
      const claim = await claimCirclePocketAction({ ownerId: identity.userId, idempotencyKey: journalKey, action: 'wallet.swap', metadata, dedupe: { metadataKey: 'walletAddress', metadataValue: quote.walletAddress, statuses: ['started', 'submitted'] } })
      if (!claim.claimed) return res.status(409).json({ ok: false, error: 'A swap is already awaiting confirmation. Check its status before submitting again.' })
      const challenge = await createCircleGasStationEvmChallenge({ userToken, walletId: quote.walletId, walletAddress: quote.walletAddress, chain: 'arc', callData: quote.callData, idempotencyKey: quote.id, refId: `pocket:arc-swap:${quote.id}` })
      if (!challenge.challengeId) throw new Error('Circle returned no challenge.')
      await recordCirclePocketAction({ ownerId: identity.userId, idempotencyKey: journalKey, action: 'wallet.swap', status: 'submitted', resourceId: quote.id, metadata: { ...metadata, challengeId: challenge.challengeId } })
      return res.json({ ok: true, ...challenge, swapId: quote.id })
    }
    let providerHash: string | undefined
    if (existing?.metadata?.challengeId && req.body.circleUserToken) {
      const providerState = await readCircleArcSwapChallenge({ userToken: String(req.body.circleUserToken), walletId: quote.walletId, walletAddress: quote.walletAddress, challengeId: existing.metadata.challengeId })
      if (providerState.status === 'failed') {
        await recordCirclePocketAction({ ownerId: identity.userId, idempotencyKey: journalKey, action: 'wallet.swap', status: 'failed', resourceId: quote.id, metadata })
        return res.json({ ok: true, status: 'failed', error: 'Circle confirmed this swap did not complete. Request a new quote to retry.' })
      }
      providerHash = providerState.txHash
    }
    const hash = providerHash || String(req.body.txHash ?? '')
    if (!hash) return res.json({ ok: true, status: !existing && quote.expiresAt <= Date.now() ? 'not_submitted' : 'pending', challengeId: existing?.metadata?.challengeId })
    if (!/^0x[0-9a-f]{64}$/i.test(hash)) return res.status(400).json({ ok: false, error: 'Invalid swap transaction hash.' })
    let receipt
    try { receipt = await client.getTransactionReceipt({ hash: hash as Hex }) }
    catch (error) {
      if ((error as Error).name === 'TransactionReceiptNotFoundError') return res.status(202).json({ ok: true, status: 'pending' })
      throw error
    }
    if (receipt.status !== 'success') {
      // An unrelated reverted transaction cannot clear another pending swap.
      return res.json({ ok: true, status: 'needs_review', error: 'This transaction reverted. Check the wallet challenge before retrying.' })
    }
    const amountOut = confirmedArcSwapAmount(quote, receipt)
    if (amountOut !== null && existing) {
      await recordCirclePocketAction({ ownerId: identity.userId, idempotencyKey: journalKey, action: 'wallet.swap', status: 'completed', resourceId: quote.id, metadata: { ...metadata, txHash: hash, amountOut } })
      return res.json({ ok: true, status: 'completed', txHash: hash, amountOut })
    }
    return res.status(409).json({ ok: false, error: 'This receipt does not confirm the quoted swap.' })
  } catch (reason) {
    const error = reason as Error & { status?: number }
    return res.status(error.status ?? 503).json({ ok: false, error: error.status ? error.message : 'Arc swap is temporarily unavailable. Refresh and try again.' })
  }
}
