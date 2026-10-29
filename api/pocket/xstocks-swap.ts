import {xLayerFeeAssets,xLayerFeeScale,type XLayerFeeAsset} from '../../src/pocket/lib/pocketXLayerFeeAssets.js'
import {quoteStockMaximum} from './xstocks-max.js'
import {stockClient,stockTokenAbi,stockUsdc,stockUsdt} from '../../src/pocket/lib/pocketXStocksWallet.js'
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
  let stage = 'identity'
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
    const identity = await d.identity(req)
    if (req.method === 'GET') return res.json({ ok: true, chainId: 196, configured: okxConfigured() })
    const wallet = String(req.body?.wallet || '')
    if (!isAddress(wallet)) return res.status(400).json({ ok: false, error: 'Open your X Layer wallet first.' })
    stage = 'wallet_ownership'
    const user = await d.user(identity.userId)
    const owns = user.linkedAccounts.some(a => a.type === 'wallet' && a.chainType === 'ethereum' && a.walletClientType === 'privy' && a.address.toLowerCase() === wallet.toLowerCase())
    if (!owns) return res.status(403).json({ ok: false, error: 'This wallet is not your Pocket embedded wallet.' })
    if (req.body?.action === 'quote') {
      const input={owner:getAddress(wallet),tokenIn:String(req.body.tokenIn||''),tokenOut:String(req.body.tokenOut||'')}
      const prepare=async(amount:string)=>{
      stage = 'provider_quote'
      const quote = await quoteStockSwap({...input,amount})
      let sponsorship
      if(reimbursedSwapAsset(quote)&&(['USDC','USDT'].includes(quote.tokenIn.symbol)||req.body.extendedReimbursement==='true')){
        const config=configuredXLayerReimbursement(),embedded=user.linkedAccounts.find(a=>a.type==='wallet'&&a.walletClientType==='privy'&&a.chainType==='ethereum'&&a.address.toLowerCase()===wallet.toLowerCase()) as {id?:string}|undefined
        const allowed=process.env.POCKET_XLAYER_TRANSFER_PUBLIC_ENABLED==='true'||(process.env.POCKET_XLAYER_SPONSORSHIP_WALLETS||'').toLowerCase().split(',').map(s=>s.trim()).includes(wallet.toLowerCase())
        if(!config||!embedded?.id||process.env.POCKET_XLAYER_SPONSORSHIP_ENABLED!=='true'||!allowed)throw Object.assign(Error('Swap fee service is temporarily unavailable.'),{status:503})
        stage = 'billing_coverage'
        await checkXLayerBillingCoverage(wallet)
        stage = 'sponsorship_quote'
        sponsorship=await quoteSponsoredSwap(quote,identity.userId,embedded.id,(process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID)!,config.estimate,config.pricing)
      }
      return {quote,sponsorship}
      }
      let review
      if(req.body.max==='true'&&(input.tokenIn==='native'||Object.values(xLayerFeeAssets).some(a=>a.address===input.tokenIn.toLowerCase()))){
        if(await stockClient.getChainId()!==196)throw Error('X Layer connection unavailable.')
        const native=input.tokenIn==='native'
        const balance=native?await stockClient.getBalance({address:input.owner}):await stockClient.readContract({address:getAddress(input.tokenIn),abi:stockTokenAbi,functionName:'balanceOf',args:[input.owner]})
        const feeAsset=Object.entries(xLayerFeeAssets).find(([,a])=>a.address===input.tokenIn.toLowerCase())?.[0] as XLayerFeeAsset|undefined
        const decimals=native?18:xLayerFeeAssets[feeAsset!].decimals
        const reserve=native?0n:BigInt(configuredXLayerReimbursement()?.pricing.minimumFeeUnits||'0')*xLayerFeeScale(feeAsset!)
        review=await quoteStockMaximum(balance,decimals,reserve,prepare)
      }else review=await prepare(String(req.body.amount||''))
      const {quote,sponsorship}=review
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
    const safeMessage = /^(X Layer (?:fee estimation is unavailable|sponsorship is paused|billing coverage is unavailable)|Swap fee service is temporarily unavailable)/.test(error.message || '') ? error.message : error.name || 'Error'
    console.warn('[pocket-stock-swap]', {stage, status:error.status || 503, reason:safeMessage})
    return res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : 'Stock quotes are temporarily unavailable. Please try again.' })
  }
}

}
export default createStockSwapHandler()
