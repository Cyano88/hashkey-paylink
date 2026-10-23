import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { getAddress, isAddress } from 'viem'
import { verifiedPrivyUser, localCurrencyProfileRepository } from '../local-currency-profile.js'
import { stockAmountUnits } from '../../src/pocket/lib/pocketXStocksWallet.js'
import { hydrateStockActivity, readStockNotices, mutateStockNotices, stockNoticeAsset, stockNoticeClient, addStockRequest, decideStockRequest, type StockRequest } from './xstocks-notifications-store.js'
const publicRequest=(r:StockRequest,owner:string)=>({id:r.id,direction:r.payer===owner?'incoming':'outgoing',senderPocketId:r.senderPocketId,payerPocketId:r.payerPocketId,address:r.address,token:r.token,symbol:r.symbol,amount:r.amount,status:r.status,at:r.at,updatedAt:r.updatedAt,txHash:r.hash?.split(':')[0]||''})
export default async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store')
 try{
  if(req.method!=='GET'&&req.method!=='POST')return res.sendStatus(405)
  const identity=await verifiedPrivyUser(req),owner=identity.userId
  if(req.method==='GET'){
   if(req.query?.activity==='1')await hydrateStockActivity(owner).catch(()=>undefined)
   const s=await readStockNotices(),notices=Object.values(s.notices).filter(n=>n.owner===owner).sort((a,b)=>b.at-a.at).slice(0,100)
   return res.json({ok:true,notices:notices.map(({owner,delivered,...n})=>n),unread:notices.filter(n=>n.at>(s.reads[owner]||0)).length,requests:Object.values(s.requests).filter(r=>r.sender===owner||r.payer===owner).sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100).map(r=>publicRequest(r,owner))})
  }
  const action=req.body?.action
  if(action==='register'){
   const wallet=String(req.body.wallet||'');if(!isAddress(wallet))return res.status(400).json({ok:false,error:'Invalid stock wallet.'})
   const privy=new PrivyClient((process.env.PRIVY_APP_ID||process.env.VITE_PRIVY_APP_ID)!,process.env.PRIVY_APP_SECRET!),user=await privy.getUserById(owner)
   if(!user.linkedAccounts.some(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy'&&a.address.toLowerCase()===wallet.toLowerCase()))return res.status(403).json({ok:false,error:'This is not your embedded stock wallet.'})
   const head=await stockNoticeClient.getBlock();if(Date.now()-Number(head.timestamp)*1000>60000)throw Error('X Layer unavailable')
   await mutateStockNotices(s=>{if(s.wallets[owner]?.address.toLowerCase()!==wallet.toLowerCase())s.wallets[owner]={address:getAddress(wallet),since:Date.now()}})
  }else if(action==='mark-read'){await mutateStockNotices(s=>{s.reads[owner]=Date.now()})}
  else if(action==='accept'||action==='decline'){await mutateStockNotices(s=>decideStockRequest(s,owner,String(req.body.id||''),action))}
  else if(action==='create-request'){
   const pocketId=String(req.body.pocketId||''),eventId=String(req.body.eventId||'')
   if(!/^\d{6,12}$/.test(pocketId)||!/^[\w-]{16,80}$/.test(eventId))return res.status(400).json({ok:false,error:'Enter a valid Pocket ID.'})
   const [sender,recipient,asset]=await Promise.all([localCurrencyProfileRepository.ensure(identity),localCurrencyProfileRepository.getByPocketId(pocketId),stockNoticeAsset(String(req.body.token||''))])
   if(!recipient)return res.status(404).json({ok:false,error:'Pocket user not found.'})
   const amount=String(req.body.amount||'').trim(),units=stockAmountUnits(amount,asset.decimals)
   await mutateStockNotices(s=>{const from=s.wallets[owner],payer=s.wallets[recipient.privyUserId];if(!from||!payer)throw Object.assign(Error('Both users must open their XStocks wallet first.'),{status:409});addStockRequest(s,{eventId,sender:owner,payer:recipient.privyUserId,senderPocketId:sender.profile.pocketId,payerPocketId:pocketId,address:from.address,payerAddress:payer.address,token:asset.address.toLowerCase(),symbol:asset.symbol,amount,units:String(units),decimals:asset.decimals})})
  }else return res.status(400).json({ok:false,error:'Unsupported action.'})
  return res.json({ok:true})
 }catch(e){const error=e as Error&{status?:number};return res.status(error.status||503).json({ok:false,error:error.status?error.message:'Stock notifications are temporarily unavailable.'})}
}
