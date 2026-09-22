import { randomUUID } from 'node:crypto'
import { createPublicClient, http, parseAbiItem, formatUnits, type Address } from 'viem'
import { xLayer } from 'viem/chains'
import { mutateDurableJson, readDurableJson, hasRenderDurableStore } from '../render-durable-store.js'
import { stockAssets, stockUsdc, stockTokenAbi } from '../../src/pocket/lib/pocketXStocksWallet.js'
import { formatStockQuantity } from '../../src/pocket/lib/pocketStockDisplay.js'
import { sendPocketPush, pocketPushConfigured, listPocketPushOwners } from './push-devices.js'
export type StockNotice = { id: string; owner: string; title: string; body: string; at: number; hash?: string; requestId?: string; delivered?: boolean }
export type StockRequest = { id: string; eventId: string; sender: string; payer: string; senderPocketId: string; payerPocketId: string; address: string; payerAddress: string; token: string; symbol: string; amount: string; units: string; decimals: number; status: 'pending' | 'accepted' | 'declined' | 'paid'; at: number; updatedAt: number; hash?: string }
export type StockNoticeStore = { wallets: Record<string, { address: string; since: number }>; notices: Record<string, StockNotice>; requests: Record<string, StockRequest>; reads: Record<string, number>; cursor?: string; cursorHash?: string }
export const STOCK_NOTICE_KEY = 'hashpaylink:pocket-xstocks-notifications:v1'
export const normalizeStockNotices = (s?: StockNoticeStore): StockNoticeStore => ({wallets:s?.wallets||{},notices:s?.notices||{},requests:s?.requests||{},reads:s?.reads||{},cursor:s?.cursor,cursorHash:s?.cursorHash})
export const readStockNotices = async () => normalizeStockNotices(await readDurableJson<StockNoticeStore>(STOCK_NOTICE_KEY))
export const mutateStockNotices = (fn: (s: StockNoticeStore) => void) => mutateDurableJson<StockNoticeStore>(STOCK_NOTICE_KEY, current => {const s=normalizeStockNotices(current);fn(s);return s})
export const stockNoticeClient = createPublicClient({chain:xLayer,transport:http(process.env.XLAYER_RPC_URL || 'https://rpc.xlayer.tech',{timeout:10000,retryCount:0})})
const allowed = new Map([stockUsdc,...stockAssets].map(a=>[a.address.toLowerCase(),a]))
const decimals = new Map<string,number>([[stockUsdc.address.toLowerCase(),6],['native',18]])
export async function stockNoticeAsset(token: string) {
  const key=token.toLowerCase(), asset=key==='native'?{address:'native',symbol:'OKB'}:allowed.get(key)
  if(!asset)throw Object.assign(Error('Choose a supported XStocks asset.'),{status:400})
  if(!decimals.has(key))decimals.set(key,Number(await stockNoticeClient.readContract({address:key as Address,abi:stockTokenAbi,functionName:'decimals'})))
  return {...asset,decimals:decimals.get(key)!}
}
export function putStockNotice(s: StockNoticeStore, notice: StockNotice) { if(!s.notices[notice.id])s.notices[notice.id]=notice }
export type ConfirmedStockTransfer = { id: string; hash: string; from: string; to: string; token: string; symbol: string; units: string; decimals: number; at: number }
export function recordStockTransfer(s: StockNoticeStore,t: ConfirmedStockTransfer) {
  if(BigInt(t.units)<=0n || t.from.toLowerCase()===t.to.toLowerCase())return
  const display=formatStockQuantity(formatUnits(BigInt(t.units),t.decimals))
  for(const [owner,wallet] of Object.entries(s.wallets)) {
    if(t.at<wallet.since)continue
    const incoming=wallet.address.toLowerCase()===t.to.toLowerCase(),outgoing=wallet.address.toLowerCase()===t.from.toLowerCase()
    if(!incoming&&!outgoing)continue
    putStockNotice(s,{id:owner+':transfer:'+t.id+':'+(incoming?'in':'out'),owner,title:t.symbol+(incoming?' received':' sent'),body:display+' '+t.symbol+(incoming?' received':' sent')+' on X Layer.',at:t.at,hash:t.hash})
  }
  // One confirmed transfer can fulfill at most one accepted request.
  const already=Object.values(s.requests).some(r=>r.hash===t.id)
  if(already)return
  const request=Object.values(s.requests).find(r=>r.status==='accepted'&&r.updatedAt<=t.at&&r.address.toLowerCase()===t.to.toLowerCase()&&r.payerAddress.toLowerCase()===t.from.toLowerCase()&&r.token.toLowerCase()===t.token.toLowerCase()&&r.units===t.units)
  if(request){request.status='paid';request.updatedAt=t.at;request.hash=t.id;for(const owner of [request.sender,request.payer])putStockNotice(s,{id:owner+':request-paid:'+request.id,owner,title:'XStocks request paid',body:display+' '+t.symbol+' paid.',at:t.at,hash:t.hash,requestId:request.id})}
}
export function decideStockRequest(s: StockNoticeStore,owner: string,id: string,action: 'accept'|'decline',now=Date.now()) {
  const r=s.requests[id]
  if(!r||r.payer!==owner)throw Object.assign(Error('Request not found.'),{status:404})
  if(r.status==='paid'||r.status==='declined')throw Object.assign(Error('This request is closed.'),{status:409})
  if(r.status==='accepted'&&action==='accept')return
  r.status=action==='accept'?'accepted':'declined';r.updatedAt=now
  putStockNotice(s,{id:r.sender+':request-'+r.status+':'+r.id,owner:r.sender,title:'XStocks request '+r.status,body:'Open XStocks to view the request.',at:now,requestId:r.id})
}
export function addStockRequest(s: StockNoticeStore,input: Omit<StockRequest,'id'|'at'|'updatedAt'|'status'>,now=Date.now()) {
  const existing=Object.values(s.requests).find(r=>r.sender===input.sender&&r.eventId===input.eventId)
  if(existing){if(existing.payer!==input.payer||existing.token!==input.token||existing.units!==input.units)throw Object.assign(Error('Request details changed. Try again.'),{status:409});return existing}
  if(input.sender===input.payer)throw Object.assign(Error('Choose another Pocket ID.'),{status:400})
  if(Object.values(s.requests).filter(r=>r.sender===input.sender&&r.at>now-86400000).length>=50)throw Object.assign(Error('Daily request limit reached.'),{status:429})
  const r: StockRequest={...input,id:randomUUID(),at:now,updatedAt:now,status:'pending'};s.requests[r.id]=r
  putStockNotice(s,{id:r.payer+':request:'+r.id,owner:r.payer,title:'XStocks payment request',body:'ID:'+r.senderPocketId+' requested '+formatStockQuantity(r.amount)+' '+r.symbol+'.',at:now,requestId:r.id});return r
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
   const endBlock=await stockNoticeClient.getBlock({blockNumber:end});if(endBlock.hash!==blocks.get(end)?.hash)throw Error('Stock notification chain changed')
   await mutateStockNotices(s=>{if(s.cursor!==snapshot.cursor||s.cursorHash!==snapshot.cursorHash)return;transfers.forEach(t=>recordStockTransfer(s,t));s.cursor=String(end);s.cursorHash=endBlock.hash;const cutoff=Date.now()-45*86400000;Object.entries(s.notices).forEach(([id,n])=>{if(n.at<cutoff)delete s.notices[id]});Object.entries(s.requests).forEach(([id,r])=>{if(r.updatedAt<cutoff&&(r.status==='paid'||r.status==='declined'))delete s.requests[id]})})
  }
 }
}
export async function deliverStockNotices(){
 if(!pocketPushConfigured())return
 const pushOwners=new Set(await listPocketPushOwners())
 const pending=Object.values((await readStockNotices()).notices).filter(n=>!n.delivered&&pushOwners.has(n.owner)).sort((a,b)=>b.at-a.at).slice(0,100)
 for(const n of pending){const delivered=await sendPocketPush(n.owner,'xstocks:'+n.id,{title:n.title,body:n.body,path:'/xstocks/notifications',tag:'pocket-xstocks:'+n.id});if(delivered)await mutateStockNotices(s=>{if(s.notices[n.id])s.notices[n.id].delivered=true})}
}
