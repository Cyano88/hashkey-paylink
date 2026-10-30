import {enrichWebPaymentNotices} from './web-payment-notices.js'
import {pocketStockNoticeActivity} from '../../src/pocket/lib/pocketStockNoticeActivity.js'
import {listCirclePocketActions} from '../circle-pocket-action-journal.js'
import {exchangeTransferDisposition} from './exchange-transfer-notifications.js'
import {archiveStockInvestments} from './stock-investment-ledger.js'
import {stockTradeProof,nativeTradeLegs,recordStockTradeNotices,type StockTradeProof} from './stock-trade-notifications.js'
import {classifyEarnTransfer} from './earn-notifications.js'
import {pocketEarnCompletion,type PocketEarnMovement} from '../../src/pocket/lib/pocketEarnNotice.js'
import { randomUUID } from 'node:crypto'
import { createPublicClient, http, parseAbiItem, decodeEventLog, formatUnits, type Address } from 'viem'
import { xLayer } from 'viem/chains'
import { mutateDurableJson, readDurableJson, hasRenderDurableStore } from '../render-durable-store.js'
import { stockAssets, stockUsdc, stockUsdt,stockUsde,stockUsdg, stockTokenAbi } from '../../src/pocket/lib/pocketXStocksWallet.js'
import { formatStockQuantity } from '../../src/pocket/lib/pocketStockDisplay.js'
import { sendPocketPush, pocketPushConfigured, listPocketPushOwners } from './push-devices.js'
export type StockNotice = {webPayment?:{merchantId:string;merchantName:string;receiptId:string}; pushSuppressed?:boolean; tradeChecked?:boolean; trade?:{serviceFeeAmount?:string;feeAmount?:string;action:'buy'|'sell'|'swap';input:{symbol:string;amount:string};output:{symbol:string;amount:string}}; id: string; owner: string; title: string; body: string; at: number; hash?: string; requestId?: string; delivered?: boolean; earn?: PocketEarnMovement; earnChecked?: boolean; transfer?: {token:string;symbol:string;amount:string;from:string;to:string;direction:'in'|'out'} }
export type StockRequest = { id: string; eventId: string; sender: string; payer: string; senderPocketId: string; payerPocketId: string; address: string; payerAddress: string; token: string; symbol: string; amount: string; units: string; decimals: number; status: 'pending' | 'accepted' | 'declined' | 'paid'; at: number; updatedAt: number; hash?: string }
export type StockNoticeStore = { investments?: Record<string,Record<string,StockNotice>>; wallets: Record<string, { address: string; since: number }>; notices: Record<string, StockNotice>; requests: Record<string, StockRequest>; reads: Record<string, number>; cursor?: string; cursorHash?: string }
export const STOCK_NOTICE_KEY = 'hashpaylink:pocket-xstocks-notifications:v1'
export const normalizeStockNotices = (s?: StockNoticeStore): StockNoticeStore => ({investments:s?.investments||{},wallets:s?.wallets||{},notices:s?.notices||{},requests:s?.requests||{},reads:s?.reads||{},cursor:s?.cursor,cursorHash:s?.cursorHash})
export const readStockNotices = async () => normalizeStockNotices(await readDurableJson<StockNoticeStore>(STOCK_NOTICE_KEY))
export const mutateStockNotices = (fn: (s: StockNoticeStore) => void) => mutateDurableJson<StockNoticeStore>(STOCK_NOTICE_KEY, current => {const s=normalizeStockNotices(current);archiveStockInvestments(s);fn(s);archiveStockInvestments(s);return s})
export const stockNoticeClient = createPublicClient({chain:xLayer,transport:http(process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech',{timeout:10000,retryCount:0})})
const allowed = new Map([stockUsdc,stockUsdt,stockUsde,stockUsdg,...stockAssets].map(a=>[a.address.toLowerCase(),a]))
const decimals = new Map<string,number>([[stockUsdc.address.toLowerCase(),6],[stockUsdt.address.toLowerCase(),6],['native',18]])
export async function stockNoticeAsset(token: string) {
  const key=token.toLowerCase(), asset=key==='native'?{address:'native',symbol:'OKB'}:allowed.get(key)
  if(!asset)throw Object.assign(Error('Choose a supported XStocks asset.'),{status:400})
  if(!decimals.has(key))decimals.set(key,Number(await stockNoticeClient.readContract({address:key as Address,abi:stockTokenAbi,functionName:'decimals'})))
  return {...asset,decimals:decimals.get(key)!}
}
export function putStockNotice(s: StockNoticeStore, notice: StockNotice) { if(!s.notices[notice.id])s.notices[notice.id]=notice;else if(notice.transfer){s.notices[notice.id].transfer=notice.transfer;if(notice.earn)Object.assign(s.notices[notice.id],{earn:notice.earn,title:notice.title,body:notice.body});if(notice.earnChecked)s.notices[notice.id].earnChecked=true} }
export type ConfirmedStockTransfer = { id: string; hash: string; from: string; to: string; token: string; symbol: string; units: string; decimals: number; at: number; earn?: PocketEarnMovement; earnChecked?: boolean }
export function recordStockTransfer(s: StockNoticeStore,t: ConfirmedStockTransfer) {
  if(BigInt(t.units)<=0n || t.from.toLowerCase()===t.to.toLowerCase())return
  const display=formatStockQuantity(formatUnits(BigInt(t.units),t.decimals))
  for(const [owner,wallet] of Object.entries(s.wallets)) {
    if(t.at<wallet.since)continue
    const incoming=wallet.address.toLowerCase()===t.to.toLowerCase(),outgoing=wallet.address.toLowerCase()===t.from.toLowerCase()
    if(!incoming&&!outgoing)continue
    const earn=t.earn&&((t.earn.action==='deposit'&&outgoing)||(t.earn.action==='withdraw'&&incoming))?t.earn:undefined
    putStockNotice(s,{id:owner+':transfer:'+t.id+':'+(incoming?'in':'out'),owner,title:t.symbol+(incoming?' received':' sent'),body:display+' '+t.symbol+(incoming?' received':' sent')+' on X Layer.',...(earn?{...pocketEarnCompletion(earn.action,formatUnits(BigInt(t.units),t.decimals),earn.symbol),earn}:{}),earnChecked:t.earnChecked,at:t.at,hash:t.hash,transfer:{token:t.token,symbol:earn?.symbol||t.symbol,amount:formatUnits(BigInt(t.units),t.decimals),from:t.from,to:t.to,direction:incoming?'in':'out'}})
  }
  if(t.earn)return
  // One confirmed transfer can fulfill at most one accepted request.
  const already=Object.values(s.requests).some(r=>r.hash===t.id)
  if(already)return
  const request=Object.values(s.requests).find(r=>r.status==='accepted'&&r.updatedAt<=t.at&&r.address.toLowerCase()===t.to.toLowerCase()&&r.payerAddress.toLowerCase()===t.from.toLowerCase()&&r.token.toLowerCase()===t.token.toLowerCase()&&r.units===t.units)
  if(request){request.status='paid';request.updatedAt=t.at;request.hash=t.id;for(const owner of [request.sender,request.payer]){putStockNotice(s,{id:owner+':request-paid:'+request.id,owner,title:'Payment request paid',body:display+' '+t.symbol+' paid.',at:t.at,hash:t.hash,requestId:request.id});Object.values(s.notices).filter(n=>n.owner===owner&&n.hash===t.hash&&n.transfer?.token.toLowerCase()===t.token.toLowerCase()).forEach(n=>{n.pushSuppressed=true})}}
}
export function decideStockRequest(s: StockNoticeStore,owner: string,id: string,action: 'accept'|'decline',now=Date.now()) {
  const r=s.requests[id]
  if(!r||r.payer!==owner)throw Object.assign(Error('Request not found.'),{status:404})
  if(r.status==='paid'||r.status==='declined')throw Object.assign(Error('This request is closed.'),{status:409})
  if(r.status==='accepted'&&action==='accept')return
  r.status=action==='accept'?'accepted':'declined';r.updatedAt=now
  putStockNotice(s,{id:r.sender+':request-'+r.status+':'+r.id,owner:r.sender,title:'Payment request '+r.status,body:'Open Pocket to view the request.',at:now,requestId:r.id})
}
export function addStockRequest(s: StockNoticeStore,input: Omit<StockRequest,'id'|'at'|'updatedAt'|'status'>,now=Date.now()) {
  const existing=Object.values(s.requests).find(r=>r.sender===input.sender&&r.eventId===input.eventId)
  if(existing){if(existing.payer!==input.payer||existing.token!==input.token||existing.units!==input.units)throw Object.assign(Error('Request details changed. Try again.'),{status:409});return existing}
  if(input.sender===input.payer)throw Object.assign(Error('Choose another Pocket ID.'),{status:400})
  if(Object.values(s.requests).filter(r=>r.sender===input.sender&&r.at>now-86400000).length>=50)throw Object.assign(Error('Daily request limit reached.'),{status:429})
  const r: StockRequest={...input,id:randomUUID(),at:now,updatedAt:now,status:'pending'};s.requests[r.id]=r
  putStockNotice(s,{id:r.payer+':request:'+r.id,owner:r.payer,title:'Payment request',body:'ID:'+r.senderPocketId+' requested '+formatStockQuantity(r.amount)+' '+r.symbol+'.',at:now,requestId:r.id});return r
}
let running: Promise<unknown>|null=null
export function drainStockNotifications(){if(!running)running=(async()=>{try{await runStockNotifications()}finally{await deliverStockNotices()}})().finally(()=>{running=null});return running}
async function runStockNotifications(){
 if(!hasRenderDurableStore())return
 const snapshot=await readStockNotices(),owners=Object.entries(snapshot.wallets)
 if(!owners.length)return
 if(await stockNoticeClient.getChainId()!==196)throw Error('Wrong stock notification chain')
 const head=await stockNoticeClient.getBlock();if(Date.now()-Number(head.timestamp)*1000>60000)throw Error('Stock notification node is behind')
 const safe=head.number>12n?head.number-12n:0n
 if(!snapshot.cursor){const block=await stockNoticeClient.getBlock({blockNumber:safe});await mutateStockNotices(s=>{if(!s.cursor){s.cursor=String(safe);s.cursorHash=block.hash}})}else{
  let cursor=BigInt(snapshot.cursor)
  const previous=await stockNoticeClient.getBlock({blockNumber:cursor})
  if(previous.hash!==snapshot.cursorHash)cursor=cursor>24n?cursor-24n:0n
  const end=safe<cursor+60n?safe:cursor+60n
  if(end>cursor){
   const addresses=[...new Set(owners.map(([,w])=>w.address as Address))],event=parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
   const logs=(await Promise.all([stockNoticeClient.getLogs({event,args:{from:addresses},fromBlock:cursor+1n,toBlock:end}),stockNoticeClient.getLogs({event,args:{to:addresses},fromBlock:cursor+1n,toBlock:end})])).flat()
   const transfers: ConfirmedStockTransfer[]=[],blocks=new Map<bigint,Awaited<ReturnType<typeof stockNoticeClient.getBlock>>>()
   // One bounded block scan is shared across all registered wallets, including native OKB transfers.
   for(let n=cursor+1n;n<=end;n++){
    const b=await stockNoticeClient.getBlock({blockNumber:n,includeTransactions:true});blocks.set(n,b as never)
    for(const tx of b.transactions){if(!tx.to||tx.value===0n||!addresses.some(a=>a.toLowerCase()===tx.from.toLowerCase()||a.toLowerCase()===tx.to?.toLowerCase()))continue
      const receipt=await stockNoticeClient.getTransactionReceipt({hash:tx.hash});if(receipt.status!=='success')continue
      transfers.push({id:tx.hash+':native',hash:tx.hash,from:tx.from,to:tx.to,token:'native',symbol:'OKB',units:String(tx.value),decimals:18,at:Number(b.timestamp)*1000})
    }
   }
   for(const log of logs){if(!log.transactionHash||log.logIndex===null||!log.args.from||!log.args.to||log.args.value===undefined||!allowed.has(log.address.toLowerCase()))continue
    const asset=await stockNoticeAsset(log.address),b=blocks.get(log.blockNumber!)!
    if(log.blockHash!==b.hash)throw Error('Stock notification block changed')
    transfers.push({id:log.transactionHash+':'+log.logIndex,hash:log.transactionHash,from:log.args.from,to:log.args.to,token:log.address.toLowerCase(),symbol:asset.symbol,units:String(log.args.value),decimals:asset.decimals,at:Number(b.timestamp)*1000})
   }
   await enrichEarnTransfers(transfers)
   const tradeProofs=await confirmedTradeProofs(transfers)
   const endBlock=await stockNoticeClient.getBlock({blockNumber:end});if(endBlock.hash!==blocks.get(end)?.hash)throw Error('Stock notification chain changed')
   await mutateStockNotices(s=>{if(s.cursor!==snapshot.cursor||s.cursorHash!==snapshot.cursorHash)return;transfers.forEach(t=>recordStockTransfer(s,t));recordStockTradeNotices(s,transfers,tradeProofs);archiveStockInvestments(s);s.cursor=String(end);s.cursorHash=endBlock.hash;const cutoff=Date.now()-45*86400000;Object.entries(s.notices).forEach(([id,n])=>{if(n.at<cutoff)delete s.notices[id]});Object.entries(s.requests).forEach(([id,r])=>{if(r.updatedAt<cutoff&&(r.status==='paid'||r.status==='declined'))delete s.requests[id]})})
  }
 }
}
export async function deliverStockNotices(overrides:Partial<{configured:typeof pocketPushConfigured;listOwners:typeof listPocketPushOwners;read:typeof readStockNotices;send:typeof sendPocketPush;mutate:typeof mutateStockNotices;listActions:typeof listCirclePocketActions}>={}){
 const d={configured:pocketPushConfigured,listOwners:listPocketPushOwners,read:readStockNotices,send:sendPocketPush,mutate:mutateStockNotices,listActions:listCirclePocketActions,...overrides}
 if(!d.configured())return
 const pushOwners=new Set(await d.listOwners())
 const snapshot=await d.read()
 const pending=Object.values(snapshot.notices).filter(n=>!n.delivered&&!n.pushSuppressed&&pushOwners.has(n.owner)).sort((a,b)=>b.at-a.at).slice(0,100)
 const actions=new Map<string,Awaited<ReturnType<typeof listCirclePocketActions>>>()
 for(const n of pending){
  if(n.transfer&&!n.trade&&!n.earn){
   if(!actions.has(n.owner))actions.set(n.owner,await d.listActions(n.owner,500))
   const disposition=exchangeTransferDisposition({txHash:n.hash,chain:'xlayer',assetSymbol:n.transfer.symbol,direction:n.transfer.direction,ts:n.at},actions.get(n.owner)!)
   if(disposition==='suppress'){await d.mutate(s=>{if(s.notices[n.id])s.notices[n.id].pushSuppressed=true});continue}
   if(disposition==='defer'||Date.now()-n.at<30_000)continue
  }
  const delivered=await d.send(n.owner,'xstocks:'+n.id,{title:n.title,body:n.body,path:n.hash?'/activity?receipt='+encodeURIComponent(n.hash):n.requestId&&snapshot.requests[n.requestId]?.payer!==n.owner?'/xstocks/request':'/xstocks/notifications',tag:'pocket-xstocks:'+n.id});if(delivered)await d.mutate(s=>{if(s.notices[n.id])s.notices[n.id].delivered=true})}
}

const activityAttempts=new Map<string,number>()
const activityHydrations=new Map<string,Promise<void>>()
export function hydrateStockActivity(owner:string){
 if(!activityHydrations.has(owner))activityHydrations.set(owner,(async()=>{
  const snapshot=await readStockNotices(),hashes=[...new Set(Object.values(snapshot.notices).filter(n=>n.owner===owner&&(!n.tradeChecked||!n.transfer||(!n.earnChecked&&[stockUsdc.address.toLowerCase(),stockUsdt.address.toLowerCase()].includes(n.transfer.token.toLowerCase())))&&n.id.includes(':transfer:')&&n.hash&&(activityAttempts.get(owner+':'+n.hash)||0)<Date.now()).sort((a,b)=>b.at-a.at).map(n=>n.hash!))].slice(0,3)
  if(hashes.length&&await stockNoticeClient.getChainId()!==196)throw Error('Wrong stock activity chain')
  for(const hash of hashes){if(activityAttempts.size>512)activityAttempts.delete(activityAttempts.keys().next().value!);activityAttempts.set(owner+':'+hash,Date.now()+60000);try{
   const receipt=await stockNoticeClient.getTransactionReceipt({hash:hash as Address});if(receipt.status!=='success')continue
   const block=await stockNoticeClient.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash)continue
   const transfers:ConfirmedStockTransfer[]=[]
   for(const log of receipt.logs){if(!allowed.has(log.address.toLowerCase()))continue;try{const decoded=decodeEventLog({abi:[parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')],topics:log.topics,data:log.data});const asset=await stockNoticeAsset(log.address);transfers.push({id:hash+':'+log.logIndex,hash,from:decoded.args.from,to:decoded.args.to,token:log.address.toLowerCase(),symbol:asset.symbol,units:String(decoded.args.value),decimals:asset.decimals,at:Number(block.timestamp)*1000})}catch{}}
   if(Object.values(snapshot.notices).some(n=>n.owner===owner&&n.hash===hash&&n.id.includes(':native:'))){const tx=await stockNoticeClient.getTransaction({hash:hash as Address});if(tx.to&&tx.value>0n)transfers.push({id:hash+':native',hash,from:tx.from,to:tx.to,token:'native',symbol:'OKB',units:String(tx.value),decimals:18,at:Number(block.timestamp)*1000})}
   transfers.forEach(t=>{t.earn=classifyEarnTransfer(t,receipt);t.earnChecked=true})
   const proofs=await confirmedTradeProofs(transfers)
   await mutateStockNotices(s=>{transfers.forEach(t=>recordStockTransfer(s,t));recordStockTradeNotices(s,transfers,proofs)})
  }catch{/* Retry historical metadata on a later activity read. */}}
 })().finally(()=>activityHydrations.delete(owner)))
 return activityHydrations.get(owner)!
}

async function enrichEarnTransfers(transfers:ConfirmedStockTransfer[]){
 const receipts=new Map<string,Awaited<ReturnType<typeof stockNoticeClient.getTransactionReceipt>>>()
 for(const t of transfers){
  if(![stockUsdc.address.toLowerCase(),stockUsdt.address.toLowerCase()].includes(t.token.toLowerCase()))continue
  let receipt=receipts.get(t.hash);if(!receipt){receipt=await stockNoticeClient.getTransactionReceipt({hash:t.hash as Address});receipts.set(t.hash,receipt)}
  if(receipt.status!=='success')throw Error('Unconfirmed stablecoin transfer')
  t.earn=classifyEarnTransfer(t,receipt);t.earnChecked=true
 }
}
export async function readPocketEarnNoticeActivity(owner:string){
 if(!hasRenderDurableStore())return {payments:[],merchants:[],collections:[]}
 void hydrateStockActivity(owner).catch(()=>undefined)
 const s=await readStockNotices(),payments=pocketStockNoticeActivity(await enrichWebPaymentNotices(Object.values(s.notices).filter(n=>n.owner===owner),owner),s.wallets[owner]?.address||'',Object.values(s.requests).filter(r=>r.sender===owner||r.payer===owner).map(r=>({id:r.id,direction:r.payer===owner?'incoming':'outgoing',senderPocketId:r.senderPocketId,payerPocketId:r.payerPocketId,address:r.address,token:r.token,symbol:r.symbol,amount:r.amount,status:r.status,at:r.at,updatedAt:r.updatedAt,txHash:r.hash?.split(':')[0]})))
 return {payments,merchants:[],collections:[]}
}

async function confirmedTradeProofs(transfers:ConfirmedStockTransfer[]){
 const proofs:StockTradeProof[]=[]
 for(const hash of new Set(transfers.filter(t=>!t.earn).map(t=>t.hash))){
  const [tx,receipt]=await Promise.all([stockNoticeClient.getTransaction({hash:hash as Address}),stockNoticeClient.getTransactionReceipt({hash:hash as Address})])
  const proof=stockTradeProof(tx,receipt);if(proof){const legs=nativeTradeLegs(proof,receipt.logs,transfers.find(t=>t.hash===hash)!.at);for(const leg of legs){const i=transfers.findIndex(t=>t.hash===hash&&t.token==='native');if(i>=0)transfers[i]=leg;else transfers.push(leg)}proofs.push(proof)}
 }
 return proofs
}

// Authenticated recovery by exact hash avoids waiting for the bounded history scanner.
const tradeRecoveryDeps={read:readStockNotices,mutate:mutateStockNotices,client:stockNoticeClient,asset:stockNoticeAsset}
export async function reconcileStockTradeActivity(owner:string,hash:string,overrides:Partial<typeof tradeRecoveryDeps>={}){
 const d={...tradeRecoveryDeps,...overrides}
 if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Object.assign(Error('Invalid transaction reference.'),{status:400})
 const snapshot=await d.read(),wallet=snapshot.wallets[owner]
 if(!wallet)throw Object.assign(Error('Wallet registration is required.'),{status:409})
 const id=owner+':trade:'+hash.toLowerCase();if(snapshot.notices[id])return
 if(await d.client.getChainId()!==196)throw Error('Wrong activity chain')
 const [tx,receipt]=await Promise.all([d.client.getTransaction({hash:hash as Address}),d.client.getTransactionReceipt({hash:hash as Address})])
 const proof=stockTradeProof(tx,receipt);if(proof&&proof.owner!==wallet.address.toLowerCase())throw Object.assign(Error('Transaction does not belong to this wallet.'),{status:403});if(!proof)throw Object.assign(Error('Confirmed swap is not available.'),{status:409})
 const block=await d.client.getBlock({blockNumber:receipt.blockNumber});if(block.hash!==receipt.blockHash||tx.blockHash!==receipt.blockHash)throw Error('Transaction block changed')
 const at=Number(block.timestamp)*1000;if(at<wallet.since)throw Object.assign(Error('Transaction predates wallet registration.'),{status:409})
 const transfers:ConfirmedStockTransfer[]=nativeTradeLegs(proof,receipt.logs,at)
 for(const log of receipt.logs){if(!allowed.has(log.address.toLowerCase()))continue;try{const {args}=decodeEventLog({abi:[parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')],topics:log.topics,data:log.data});const asset=await d.asset(log.address);transfers.push({id:hash+':'+log.logIndex,hash:hash.toLowerCase(),from:args.from,to:args.to,token:log.address.toLowerCase(),symbol:asset.symbol,units:String(args.value),decimals:asset.decimals,at})}catch{}}
 await d.mutate(s=>{if(s.wallets[owner]?.address.toLowerCase()!==wallet.address.toLowerCase())throw Error('Wallet changed');recordStockTradeNotices(s,transfers,[proof]);if(!s.notices[id])throw Error('Swap amounts could not be verified')})
}
