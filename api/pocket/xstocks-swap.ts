import {quoteSponsoredSwap} from './xlayer-swap-sponsorship.js'
import {configuredXLayerReimbursement} from './xlayer-fee-estimator.js'
import {checkXLayerBillingCoverage} from './xlayer-billing-guard.js'
import {reimbursedSwapAsset} from '../../src/pocket/lib/pocketSponsoredSwap.js'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { getAddress, isAddress } from 'viem'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { okxConfigured, openStockQuote, quoteStockSwap, sealStockQuote } from './xstocks-swap-provider.js'

const loadUser = async (userId:string) => new PrivyClient((process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID)!, process.env.PRIVY_APP_SECRET!).getUserById(userId)
export function createStockSwapHandler(overrides: Partial<{identity:typeof verifiedPrivyUser; user:typeof loadUser}> = {}) {
 const d={identity:verifiedPrivyUser,user:loadUser,...overrides}
 return async function pocketStockSwapHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    const identity = await d.identity(req)
    if (req.method === 'GET') return res.json({ ok: true, chainId: 196, configured: okxConfigured() })
    const wallet = String(req.body?.wallet || '')
    if (!isAddress(wallet)) return res.status(400).json({ ok: false, error: 'Open your X Layer wallet first.' })
    const user = await d.user(identity.userId)
    const owns = user.linkedAccounts.some(a => a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType === 'privy' && a.address.toLowerCase() === wallet.toLowerCase())
    if (!owns) return res.status(403).json({ ok: false, error: 'This wallet is not your Pocket embedded wallet.' })
    if (req.body?.action === 'quote') {
      const quote = await quoteStockSwap({ owner: getAddress(wallet), tokenIn: String(req.body.tokenIn || ''), tokenOut: String(req.body.tokenOut || ''), amount: String(req.body.amount || '') })
      let sponsorship
      if(reimbursedSwapAsset(quote)){
        const config=configuredXLayerReimbursement(),embedded=user.linkedAccounts.find(a=>a.type==='wallet'&&a.walletClientType==='privy'&&a.chainType==='ethereum'&&a.address.toLowerCase()===wallet.toLowerCase()) as {id?:string}|undefined
        const allowed=process.env.POCKET_XLAYER_TRANSFER_PUBLIC_ENABLED==='true'||(process.env.POCKET_XLAYER_SPONSORSHIP_WALLETS||'').toLowerCase().split(',').map(s=>s.trim()).includes(wallet.toLowerCase())
        if(!config||!embedded?.id||process.env.POCKET_XLAYER_SPONSORSHIP_ENABLED!=='true'||!allowed)throw Object.assign(Error('Swap fee service is temporarily unavailable.'),{status:503})
        await checkXLayerBillingCoverage(wallet)
        sponsorship=await quoteSponsoredSwap(quote,identity.userId,embedded.id,(process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID)!,config.estimate,config.pricing)
      }
      return res.json({ ok: true, quote, quoteToken: sealStockQuote(quote, identity.userId),...(sponsorship?{sponsorship}:{}) })
    }
    if (req.body?.action === 'verify') {
      const quote = openStockQuote(String(req.body.quoteToken || ''), identity.userId)
      if (quote.owner.toLowerCase() !== wallet.toLowerCase()) return res.status(403).json({ ok: false, error: 'Your wallet changed. Request a new quote.' })
      return res.json({ ok: true, quote })
    }
    return res.status(400).json({ ok: false, error: 'Unsupported stock swap action.' })
  } catch (reason) {
    const error = reason as Error & { status?: number }
    return res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : 'Stock quotes are temporarily unavailable. Please try again.' })
  }
}

}
export default createStockSwapHandler()
