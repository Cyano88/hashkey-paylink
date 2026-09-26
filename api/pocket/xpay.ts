import type { Request, Response } from 'express'
import { consumePocketPaymentApproval } from './payment-security.js'
import { randomUUID } from 'node:crypto'
import { decodeEventLog, formatUnits, parseUnits, type Hex } from 'viem'
import { verifiedPrivyUser, localCurrencyProfileRepository } from '../local-currency-profile.js'
import { mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import { verifyStockWalletOwner } from './xstocks-wallet-owner.js'
import { stockNoticeClient, stockNoticeAsset, mutateStockNotices, putStockNotice } from './xstocks-notifications-store.js'
import { stockAssets, stockTokenAbi } from '../../src/pocket/lib/pocketXStocksWallet.js'
import { parseAbiItem } from 'viem'
import { readStockMarketPrices } from './xstocks-prices.js'
import type { XPayMerchant, XPayPayment } from '../../src/pocket/lib/pocketXPay.js'
const KEY='hashpaylink:pocket-xpay:v1'
type Merchant=XPayMerchant&{owner:string}
type Payment=XPayPayment&{owner:string;merchantOwner:string;units:string;authorizedAt?:number;authorizedBlock?:string;scanBlock?:string;blockNumber?:string;blockHash?:string}
type Store={merchants:Record<string,Merchant>;payments:Record<string,Payment>;hashes:Record<string,string>}
const normalize=(s?:Store):Store=>({merchants:s?.merchants||{},payments:s?.payments||{},hashes:s?.hashes||{}})
const read=async()=>normalize(await readDurableJson<Store>(KEY))
const mutate=(fn:(s:Store)=>void)=>mutateDurableJson<Store>(KEY,current=>{const s=normalize(current);fn(s);return s})
const fail=(message:string,status=400)=>{throw Object.assign(Error(message),{status})}
const supported=new Set(stockAssets.map(a=>a.address.toLowerCase()))
const publicMerchant=({owner,...m}:Merchant)=>m
const publicPayment=({owner,merchantOwner,units,authorizedAt,authorizedBlock,scanBlock,blockHash,blockNumber,...p}:Payment)=>p
const event=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
export function xpayUnits(usd:string,price:number,decimals:number){
 if(!/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(usd)||Number(usd)<=0||Number(usd)>100000)fail('Enter a USD amount between 0.01 and 100,000.')
 if(!Number.isFinite(price)||price<=0)fail('Price unavailable.')
 const rate=parseUnits(price.toFixed(18),18);if(rate<=0n)fail('Price unavailable.')
 return (parseUnits(usd,18)*10n**BigInt(decimals)+rate-1n)/rate
}
export function verifyXPayTransfer(p:Pick<Payment,'payer'|'recipient'|'token'|'units'|'authorizedAt'>,receipt:{status:string;logs:readonly any[]},timestamp:number){
 if(receipt.status!=='success')return false
 if(!p.authorizedAt||timestamp<p.authorizedAt-5000)return false
 return receipt.logs.some(log=>{if(log.address.toLowerCase()!==p.token.toLowerCase())return false;try{const d=decodeEventLog({abi:[event],data:log.data,topics:log.topics});return d.args.from.toLowerCase()===p.payer.toLowerCase()&&d.args.to.toLowerCase()===p.recipient.toLowerCase()&&String(d.args.value)===p.units}catch{return false}})
}
async function observe(p:Payment){
 if(p.status==='paid'||p.status==='failed')return p
 if(!p.hash&&p.authorizedBlock){
  const head=await stockNoticeClient.getBlock(),start=BigInt(p.scanBlock||p.authorizedBlock)+1n
  if(Date.now()-Number(head.timestamp)*1000>60000||head.number<start+2n)return p
  const end=head.number-2n<start+499n?head.number-2n:start+499n
  const logs=await stockNoticeClient.getLogs({address:p.token as Hex,event,args:{from:p.payer as Hex,to:p.recipient as Hex},fromBlock:start,toBlock:end})
  const updated=await mutate(s=>{const current=s.payments[p.id];if(current.hash)return;const match=logs.find(log=>String(log.args.value)===p.units&&log.transactionHash&&!s.hashes[log.transactionHash.toLowerCase()]);if(match?.transactionHash){current.hash=match.transactionHash.toLowerCase();s.hashes[current.hash]=p.id}else current.scanBlock=String(end)})
  p=updated.payments[p.id]
 }
 if(!p.hash)return p
 if(await stockNoticeClient.getChainId()!==196)fail('X Layer unavailable.',503)
 const receipt=await stockNoticeClient.getTransactionReceipt({hash:p.hash as Hex}).catch(()=>null)
 if(!receipt)return p
 const [block,head]=await Promise.all([stockNoticeClient.getBlock({blockNumber:receipt.blockNumber}),stockNoticeClient.getBlock()])
 if(p.authorizedBlock&&receipt.blockNumber<=BigInt(p.authorizedBlock))fail('This transaction predates the payment.',409)
 if(block.hash!==receipt.blockHash||Date.now()-Number(head.timestamp)*1000>60000||head.number<receipt.blockNumber+2n)return p
 // A reverted transaction cannot pay; a successful but unrelated hash is never a receipt.
 const matches=verifyXPayTransfer(p,receipt,Number(block.timestamp)*1000)
 if(receipt.status==='success'&&!matches)fail('This transaction does not match the merchant payment.',409)
 const result=await mutate(s=>{const current=s.payments[p.id];if(!current||current.hash!==p.hash)return;current.status=matches?'paid':'failed';current.updatedAt=Date.now();current.blockNumber=String(receipt.blockNumber);current.blockHash=receipt.blockHash})
 const paid=result.payments[p.id]
 if(paid.status==='paid'){
  const log=receipt.logs.find(log=>verifyXPayTransfer(paid,{status:'success',logs:[log]},Number(block.timestamp)*1000))
  if(log?.logIndex!=null)await mutateStockNotices(s=>{for(const owner of [paid.owner,paid.merchantOwner])putStockNotice(s,{id:owner+':transfer:'+paid.hash+':'+log.logIndex+':'+(owner===paid.owner?'out':'in'),owner,title:owner===paid.owner?'XPay payment sent':'XPay payment received',body:paid.amount+' '+paid.symbol,at:paid.updatedAt,hash:paid.hash})})
 }
 return paid
}
export default async function handler(req:Request,res:Response){
 res.setHeader('Cache-Control','no-store')
 try{
  if(req.method==='GET'){
   const id=String(req.query?.id||'');if(!/^[0-9a-f-]{36}$/.test(id))fail('Invalid XPay link.',400)
   const merchant=(await read()).merchants[id];if(!merchant||merchant.deletedAt)fail('This XPay link is unavailable.',404)
   return res.json({ok:true,merchant:{id:merchant.id,name:merchant.name,pocketId:merchant.pocketId,tokens:merchant.tokens}})
  }
  if(req.method!=='POST')return res.sendStatus(405)
  const identity=await verifiedPrivyUser(req),owner=identity.userId,b=req.body||{},action=b.action
  if(action==='merchant-save'){
   const wallet=String(b.wallet||'');await verifyStockWalletOwner(owner,wallet)
   const tokens=Array.isArray(b.tokens)?[...new Set<string>(b.tokens.map((t:unknown)=>String(t).toLowerCase()))]:[]
   if(!tokens.length||tokens.length>100||tokens.some(t=>!supported.has(t)))fail('Select up to 100 supported stocks.')
   const name=String(b.name||'').trim();if(!name||name.length>60||/[\u0000-\u001f<>]/.test(name))fail('Enter a merchant name, up to 60 characters.')
   const profile=await localCurrencyProfileRepository.ensure(identity)
   let savedId=''
   const s=await mutate(s=>{const existing=b.id?s.merchants[String(b.id)]:b.create?undefined:Object.values(s.merchants).find(m=>m.owner===owner&&!m.deletedAt);if(b.id&&(!existing||existing.owner!==owner||existing.deletedAt))fail('Link not found.',404);if(!existing&&Object.values(s.merchants).filter(m=>m.owner===owner&&!m.deletedAt).length>=20)fail('You can have up to 20 active links.');const id=existing?.id||randomUUID();savedId=id;s.merchants[id]={id,owner,pocketId:profile.profile.pocketId,name,wallet,tokens,updatedAt:Date.now()}})
   return res.json({ok:true,merchant:publicMerchant(s.merchants[savedId])})
  }
  if(action==='merchant-delete'){
   const id=String(b.id||''),current=(await read()).merchants[id]
   if(!current||current.owner!==owner||current.deletedAt)fail('Link not found.',404)
   if(!await consumePocketPaymentApproval(String(req.headers?.['x-pocket-payment-approval']||''),owner))fail('Confirm with your Pocket PIN or fingerprint to delete this link.',403)
   await mutate(s=>{const m=s.merchants[id];if(!m||m.owner!==owner||m.deletedAt)fail('Link not found.',404);m.deletedAt=Date.now();m.updatedAt=m.deletedAt})
   return res.json({ok:true})
  }
  if(action==='merchant'||action==='mine'){
   const s=await read(),merchant=action==='mine'?Object.values(s.merchants).find(m=>m.owner===owner&&!m.deletedAt):s.merchants[String(b.id||'')]
   if((!merchant||merchant.deletedAt)&&action!=='mine')fail('This XPay merchant is unavailable.',404)
   return res.json({ok:true,merchant:merchant?publicMerchant(merchant):null,merchants:action==='mine'?Object.values(s.merchants).filter(m=>m.owner===owner&&!m.deletedAt).map(publicMerchant):undefined,payments:action==='mine'?Object.values(s.payments).filter(p=>p.owner===owner||p.merchantOwner===owner).sort((a,b)=>b.createdAt-a.createdAt).slice(0,50).map(publicPayment):undefined})
  }
  if(action==='prepare'){
   const payer=String(b.wallet||'');await verifyStockWalletOwner(owner,payer)
   const id=String(b.id||''),token=String(b.token||'').toLowerCase(),usd=String(b.usd||''),key=String(b.key||'')
   if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))fail('Invalid payment reference.')
   const s=await read(),m=s.merchants[id];if(!m||m.deletedAt||!m.tokens.includes(token))fail('Choose a stock accepted by this merchant.')
   if(m.owner===owner||m.wallet.toLowerCase()===payer.toLowerCase())fail('You cannot pay your own XPay QR.')
   await verifyStockWalletOwner(m.owner,m.wallet)
   const asset=await stockNoticeAsset(token),prices=await readStockMarketPrices([token]),price=prices[token]
   if(!price||Date.now()-price.fetchedAt>=60000)fail('A fresh stock price is unavailable. Try again.',503)
   const units=xpayUnits(usd,price.usd,asset.decimals),now=Date.now()
   let payment:Payment|undefined
   await mutate(s=>{
    const prior=Object.values(s.payments).find(p=>p.owner===owner&&p.key===key)
    if(prior){if(prior.merchantId!==id||prior.token!==token||prior.usd!==usd||prior.payer.toLowerCase()!==payer.toLowerCase())fail('Payment details changed.',409);payment=prior;return}
    if(Object.values(s.payments).some(p=>p.owner===owner&&p.status==='submitted'))fail('Your previous XPay payment needs confirmation. Open XPay to check it.',409)
    if(Object.values(s.payments).filter(p=>p.owner===owner&&p.createdAt>now-86400000).length>=100)fail('Daily payment limit reached.',429)
    const current=s.merchants[id];if(!current||current.deletedAt||current.updatedAt!==m.updatedAt)fail('Merchant settings changed. Review again.',409)
    payment={id:randomUUID(),key,owner,merchantOwner:m.owner,merchantId:id,merchantName:m.name,pocketId:m.pocketId,payer,recipient:m.wallet,token,symbol:asset.symbol,amount:formatUnits(units,asset.decimals),units:String(units),usd,status:'ready',createdAt:now,updatedAt:now,expiresAt:now+5*60_000}
    s.payments[payment.id]=payment
   })
   return res.json({ok:true,payment:publicPayment(payment!)})
  }
  const id=String(b.id||''),s=await read(),p=s.payments[id]
  if(!p||p.owner!==owner)fail('Payment not found.',404)
  if(action==='authorize'){
   await verifyStockWalletOwner(owner,p.payer)
   if(await stockNoticeClient.getChainId()!==196)fail('X Layer unavailable.',503)
   const head=await stockNoticeClient.getBlock();if(Date.now()-Number(head.timestamp)*1000>60000)fail('X Layer unavailable.',503)
   const updated=await mutate(s=>{const p=s.payments[id],m=s.merchants[p.merchantId];if(p.status!=='ready'||p.expiresAt<=Date.now())fail('This payment needs a new review or is already submitted.',409);if(!m||m.deletedAt||!m.tokens.includes(p.token)||m.wallet.toLowerCase()!==p.recipient.toLowerCase())fail('Merchant settings changed. Review again.',409);if(Object.values(s.payments).some(other=>other.id!==id&&other.owner===owner&&other.status==='submitted'))fail('An earlier payment needs confirmation.',409);p.status='submitted';p.authorizedBlock=String(head.number);p.authorizedAt=Date.now();p.updatedAt=Date.now()})
   return res.json({ok:true,payment:publicPayment(updated.payments[id])})
  }
  if(action==='confirm'){
   const hash=String(b.hash||'').toLowerCase();if(!/^0x[a-f0-9]{64}$/.test(hash))fail('Invalid payment reference.')
   if(!p.authorizedAt)fail('Payment has not been authorized.',409)
   await mutate(s=>{const p=s.payments[id];if((p.hash&&p.hash!==hash)||(s.hashes[hash]&&s.hashes[hash]!==id))fail('Transaction already belongs to another payment.',409);p.hash=hash;s.hashes[hash]=id})
  }else if(action!=='status')fail('Unsupported XPay action.')
  const payment=await observe((await read()).payments[id])
  return res.json({ok:true,payment:publicPayment(payment)})
 }catch(reason){const e=reason as Error&{status?:number};return res.status(e.status||503).json({ok:false,error:e.status?e.message:'XPay is temporarily unavailable. Your submitted payment will not be sent again.'})}
}

let draining=false,drainOffset=0
export async function drainXPayPayments(){if(draining)return;draining=true;try{const s=await read();const pending=Object.values(s.payments).filter(p=>p.status==='submitted');if(pending.length){drainOffset%=pending.length;const batch=[...pending.slice(drainOffset),...pending.slice(0,drainOffset)].slice(0,20);drainOffset+=batch.length;for(const p of batch)await observe(p).catch(()=>undefined)}}finally{draining=false}}
