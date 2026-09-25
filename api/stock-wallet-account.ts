import { createHash } from 'node:crypto'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { getAddress, isAddress, zeroAddress } from 'viem'
import { agreementPrivyAuthority } from './xstocks-agreement/authority.js'
import { resolveDeveloperApiKeyPolicy } from './developer-projects.js'
import { assertLiveDeveloperRequest } from './developer-environment.js'
import { hasRenderDurableStore, readDurableJson, mutateDurableJson } from './render-durable-store.js'
import { verifiedPrivyUser } from './privy-circle-link.js'

function fail(status: number, message: string): never { throw Object.assign(Error(message), { status }) }
// Same builder-asserted linked identity boundary as hosted Swap. Only a server
// holding the scoped project key may supply this ID, never the builder's browser.
// Resolving an address or opening a view grants no signing authority.
export async function resolveStockWalletAccount(userId: unknown, walletAppId: unknown, env = process.env,
  load = async (id: string) => { const a = agreementPrivyAuthority(env); return new PrivyClient(a.appId, a.env.PRIVY_APP_SECRET!).getUserById(id) }) {
  const authority = agreementPrivyAuthority(env)
  if (typeof userId !== 'string' || !/^did:privy:[a-zA-Z0-9_-]+$/.test(userId)) fail(400, 'A connected wallet account is required.')
  if (walletAppId !== authority.appId) fail(409, 'Wallet configuration changed. Reconnect your account.')
  const user = await load(userId)
  if (user.id !== userId) fail(403, 'Wallet account mismatch.')
  const wallets = user.linkedAccounts.filter(a => a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType === 'privy' && a.connectorType === 'embedded')
  const wallet = wallets[0]
  if (wallets.length !== 1 || wallet?.type !== 'wallet' || !isAddress(wallet.address) || getAddress(wallet.address) === zeroAddress) fail(409, 'Open your connected stock wallet before continuing.')
  return { userId, walletAppId: authority.appId, wallet: getAddress(wallet.address) }
}
type StockWalletSession = { id: string; projectId: string; projectName: string; userId: string; walletAppId: string; wallet: string }
const key = (id: string) => 'hashpaylink:stock-wallet-view:v1:' + id
const view = (s: StockWalletSession) => ({ id: s.id, projectName: s.projectName, userId: s.userId, walletAppId: s.walletAppId, wallet: s.wallet, chainId: 196, checkoutPath: '/wallet/stocks/' + s.id })
const defaults = { policy: resolveDeveloperApiKeyPolicy, account: resolveStockWalletAccount, identity: verifiedPrivyUser, hasStore: hasRenderDurableStore,
  read: readDurableJson<StockWalletSession>, mutate: mutateDurableJson<StockWalletSession> }
export function createStockWalletSessionHandlers(overrides: Partial<typeof defaults> = {}) {
  const d = { ...defaults, ...overrides }
  const wrap = (run: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    try { if (req.method !== 'POST') fail(405, 'Use POST.'); assertLiveDeveloperRequest(req); if (!d.hasStore()) fail(503, 'Wallet storage is unavailable.'); return await run(req, res) }
    catch (e) { const status = Number((e as {status?:number}).status) || 503; return res.status(status).json({ok:false,error:status >= 500 ? 'Stock wallet is temporarily unavailable.' : (e as Error).message}) }
  }
  return {
    developer: wrap(async (req, res) => {
      const p = await d.policy(req)
      if (!p || p.environment !== 'live' || p.checkoutMode !== 'human') fail(403, 'A live stock wallet read key is required.')
      if (req.body?.wallet !== undefined) fail(400, 'Use the connected account, not a supplied address.')
      const account = await d.account(req.body?.userId, req.body?.walletAppId)
      const id = 'wst_' + createHash('sha256').update(JSON.stringify([p.partnerId, account.walletAppId, account.userId, account.wallet.toLowerCase()])).digest('hex')
      const session = await d.mutate(key(id), current => {
        if (current) { if (current.projectId !== p.partnerId || current.userId !== account.userId || current.walletAppId !== account.walletAppId || current.wallet !== account.wallet) fail(409, 'Wallet session mismatch.'); return current }
        return {id, projectId:p.partnerId, projectName:p.merchantName, ...account}
      })
      return res.json({ok:true,session:view(session)})
    }),
    participant: wrap(async (req, res) => {
      if (req.headers['x-api-key']) fail(401, 'Sign in with your wallet account.')
      if (req.body?.action !== 'read') fail(400, 'Only wallet view access is supported.')
      const id = req.body.sessionId
      if (typeof id !== 'string' || !/^wst_[a-f0-9]{64}$/.test(id)) fail(400, 'Invalid wallet link.')
      const owner = await d.identity(req), session = await d.read(key(id))
      if (!session || session.userId !== owner.userId) fail(404, 'Wallet link not found for this account.')
      const account = await d.account(owner.userId, session.walletAppId)
      if (account.wallet.toLowerCase() !== session.wallet.toLowerCase()) fail(409, 'Your wallet changed. Reopen it from your app.')
      return res.json({ok:true,session:view(session)})
    }),
  }
}
