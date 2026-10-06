import type {Request,Response} from 'express'
import {getAddress} from 'viem'
import {readStockCheckout,assertStockCheckoutPayable} from './hosted-stock-checkouts.js'
import {verifiedPrivyUser} from './privy-circle-link.js'
import {verifyStockWalletOwner} from './pocket/xstocks-wallet-owner.js'
import {quoteStockSwap,sealStockQuote,openStockQuote} from './pocket/xstocks-swap-provider.js'
import {assertLiveDeveloperRequest} from './developer-environment.js'

export default async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store')
 try{
  assertLiveDeveloperRequest(req)
  if(req.method!=='POST')return res.sendStatus(405)
  const r=await readStockCheckout(String(req.query.id||''))
  if(!r)throw Object.assign(Error('Checkout unavailable.'),{status:404})
  await assertStockCheckoutPayable(r,true)
  const identity=await verifiedPrivyUser(req),wallet=getAddress(String(req.body?.wallet||''))
  await verifyStockWalletOwner(identity.userId,wallet)
  const scope=identity.userId+':checkout:'+r.id
  if(req.body.action==='quote'){
   if(String(req.body.tokenOut).toLowerCase()!==r.token.address.toLowerCase())throw Object.assign(Error('Convert into the asset accepted by this checkout.'),{status:400})
   const quote=await quoteStockSwap({owner:wallet,tokenIn:String(req.body.tokenIn||''),tokenOut:r.token.address,amount:String(req.body.amount||'')})
   return res.json({ok:true,quote,quoteToken:sealStockQuote(quote,scope)})
  }
  if(req.body.action==='verify'){
   const quote=openStockQuote(String(req.body.quoteToken||''),scope)
   if(quote.owner.toLowerCase()!==wallet.toLowerCase()||quote.tokenOut.address.toLowerCase()!==r.token.address.toLowerCase())throw Object.assign(Error('Quote does not match checkout.'),{status:409})
   return res.json({ok:true,quote})
  }
  return res.status(400).json({ok:false,error:'Unsupported swap action.'})
 }catch(error){const e=error as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'Conversion is temporarily unavailable. No merchant payment was recorded.'})}
}
