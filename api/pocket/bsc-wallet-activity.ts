import {createHash,createHmac} from 'node:crypto'
import {decodeEventLog,formatUnits,parseAbiItem} from 'viem'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {okxCredentials} from './xstocks-swap-provider.js'
import {createBscRuntime} from './bsc-runtime.js'
import {readBscWallet} from './bsc-wallet.js'
import {persistObservedWalletActivity} from './activity-feed.js'
import {POCKET_BSC} from '../../src/pocket/lib/pocketBsc.js'
import type {PocketActivityRow} from '../../src/pocket/lib/pocketSchemas.js'

const transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const hashPattern=/^0x[0-9a-f]{64}$/i
type Rpc=(method:string,params:unknown[])=>Promise<any>
/** Indexers discover hashes only. Successful canonical receipts own amounts,
 * token identity, parties, timestamps and finality. Never infer a deposit from a
 * balance delta or count approval/fee logs as a separate swap. */
export async function bscTransferRows(wallet:string,hash:string,rpc:Rpc,internalNative=false):Promise<PocketActivityRow[]>{
 if(!hashPattern.test(hash))throw Error('Invalid BNB transaction.')
 if(BigInt(await rpc('eth_chainId',[]))!==56n)throw Error('Wrong BNB chain.')
 const [tx,receipt,head]=await Promise.all([rpc('eth_getTransactionByHash',[hash]),rpc('eth_getTransactionReceipt',[hash]),rpc('eth_blockNumber',[])])
 if(!tx||!receipt||!same(tx.hash,hash)||!same(receipt.transactionHash,hash)||!same(tx.blockHash,receipt.blockHash)||BigInt(tx.chainId)!==56n||BigInt(tx.blockNumber)!==BigInt(receipt.blockNumber))throw Error('BNB transaction unavailable.')
 if(BigInt(receipt.blockNumber)+14n>BigInt(head))throw Error('BNB confirmation pending.')
 const block=await rpc('eth_getBlockByNumber',[receipt.blockNumber,false])
 if(!block||!same(block.hash,receipt.blockHash)||BigInt(block.number)!==BigInt(receipt.blockNumber))throw Error('BNB block changed.')
 if(BigInt(receipt.status)!==1n)return []
 const ts=Number(BigInt(block.timestamp))*1000
 if(!Number.isSafeInteger(ts)||ts<=0||ts>Date.now()+5000)throw Error('Invalid BNB block time.')
 const rows:PocketActivityRow[]=[]
 const add=(symbol:string,from:string,to:string,units:bigint,id:string)=>{
  if(units<=0n||same(from,to)||(!same(from,wallet)&&!same(to,wallet)))return
  const incoming=same(to,wallet)
  rows.push({eventId:'bsc-transfer:'+hash.toLowerCase()+':'+id,txHash:hash.toLowerCase(),chain:'bsc',payer:from,recipient:to,amount:formatUnits(units,18),assetSymbol:symbol,memo:symbol+(incoming?' received':' sent'),ts,source:incoming?'wallet-deposit':'wallet-withdrawal',settlementType:'wallet_transfer',direction:incoming?'in':'out',paycrestStatus:'confirmed'})
 }
 if(typeof tx.from==='string'&&typeof tx.to==='string')add('BNB',tx.from,tx.to,BigInt(tx.value||'0'),'native')
 if(internalNative){
  const trace=await rpc('debug_traceTransaction',[hash,{tracer:'callTracer',timeout:'5s'}])
  if(!trace||!same(trace.from,tx.from)||!same(trace.to,tx.to)||BigInt(trace.value||'0')!==BigInt(tx.value||'0'))throw Error('BNB internal transfer proof unavailable.')
  let count=0
  const visit=(call:any,path:string,depth:number)=>{
   if(++count>2000||depth>64)throw Error('BNB trace limit reached.')
   if(call.error)return
   if(path&&['CALL','CREATE','CREATE2','SELFDESTRUCT'].includes(String(call.type).toUpperCase())&&typeof call.from==='string'&&typeof call.to==='string')add('BNB',call.from,call.to,BigInt(call.value||'0'),'trace:'+path)
   for(let i=0;i<(call.calls||[]).length;i++)visit(call.calls[i],path?path+'.'+i:String(i),depth+1)
  }
  visit(trace,'',0)
 }
 for(const log of receipt.logs||[]){
  const asset=Object.values(POCKET_BSC.assets).find(a=>!a.native&&same(log.address,a.address))
  if(!asset||log.removed)continue
  if(!same(log.transactionHash,hash)||!same(log.blockHash,receipt.blockHash))throw Error('BNB log mismatch.')
  let args:{from:`0x${string}`;to:`0x${string}`;value:bigint}
  try{args=decodeEventLog({abi:[transfer],topics:log.topics,data:log.data}).args}catch{continue}
  add(asset.symbol,args.from,args.to,args.value,String(BigInt(log.logIndex)))
 }
 return rows
}

type ScanState={end:number;begin?:number;cursor:string;pending:string[];seen:string[];complete:boolean;rows?:PocketActivityRow[];internal?:string[]}
export async function readBscHistoryPage(wallet:string,state:Pick<ScanState,'end'|'begin'|'cursor'>){
 const c=okxCredentials();if(!c.key||!c.secret||!c.passphrase)throw Error('BNB history unavailable.')
 const path='/api/v6/dex/post-transaction/transactions-by-address?'+new URLSearchParams({address:wallet,chains:'56',end:String(state.end),limit:'20',...(state.begin?{begin:String(state.begin)}:{}),...(state.cursor?{cursor:state.cursor}:{})})
 const timestamp=new Date().toISOString()
 const response=await fetch('https://web3.okx.com'+path,{headers:{'OK-ACCESS-KEY':c.key,'OK-ACCESS-PASSPHRASE':c.passphrase,'OK-ACCESS-TIMESTAMP':timestamp,'OK-ACCESS-SIGN':createHmac('sha256',c.secret).update(timestamp+'GET'+path).digest('base64')},redirect:'error',signal:AbortSignal.timeout(10000)})
 const data=await response.json(),page=data.data?.[0]
 if(!response.ok||String(data.code)!=='0'||!Array.isArray(page?.transactions)||page.transactions.length>20)throw Error('BNB history unavailable.')
 const hashes:string[]=[],internal:string[]=[]
 for(const row of page.transactions){
  if(String(row.chainIndex)!=='56')throw Error('BNB history chain mismatch.')
  if(row.txStatus==='success'&&hashPattern.test(row.txHash)){const hash=row.txHash.toLowerCase();if(!hashes.includes(hash))hashes.push(hash);if(String(row.itype)==='1'&&!row.tokenContractAddress&&!internal.includes(hash))internal.push(hash)}
 }
 const cursor=String(page.cursor||'');if(cursor&&cursor===state.cursor)throw Error('BNB history cursor repeated.')
 return {hashes,cursor,internal}
}
const work=new Map<string,Promise<PocketActivityRow[]>>()
const recent=new Map<string,{at:number;rows:PocketActivityRow[]}>()
export async function readBscWalletActivity(owner:string):Promise<PocketActivityRow[]>{
 const hit=recent.get(owner);if(hit&&Date.now()-hit.at<30000)return hit.rows
 const active=work.get(owner);if(active)return active
 const task=(async()=>{
  const wallet=await readBscWallet(owner);if(!wallet)return []
  const key='pocket:bsc-history:v1:'+createHash('sha256').update(owner+':'+wallet.address.toLowerCase()).digest('hex')
  let state=await readDurableJson<ScanState>(key)||{end:Date.now(),cursor:'',pending:[],seen:[],complete:false}
  if(state.complete)state={...state,begin:Math.max(0,state.end-3600000),end:Date.now(),cursor:'',complete:false}
  if(state.pending.length<80&&!state.complete){
   const page=await readBscHistoryPage(wallet.address,state)
   state.internal=[...new Set([...(state.internal||[]).filter(h=>state.pending.includes(h)),...page.internal])];state.pending=[...new Set([...state.pending,...page.hashes.filter(hash=>!state.seen.includes(hash))])];state.cursor=page.cursor;state.complete=!page.cursor
   await mutateDurableJson(key,()=>state)
  }
  const rpc=createBscRuntime().rpc,rows:PocketActivityRow[]=[]
  for(const hash of state.pending.slice(0,4)){
   let verified:PocketActivityRow[]
   try{verified=await bscTransferRows(wallet.address,hash,rpc,state.internal?.includes(hash))}catch{state.pending=[...state.pending.filter(h=>h!==hash),hash];await mutateDurableJson(key,()=>state);continue}
   await persistObservedWalletActivity(owner,verified)
   rows.push(...verified);state.rows=[...(state.rows||[]).filter(r=>!verified.some(v=>v.eventId===r.eventId)),...verified].sort((a,b)=>b.ts-a.ts).slice(0,100);state.pending=state.pending.filter(h=>h!==hash);state.seen=[...state.seen,hash].slice(-2000)
   await mutateDurableJson(key,()=>state)
  }
  if(recent.size>=256)recent.delete(recent.keys().next().value!)
  const saved=state.rows||rows;recent.set(owner,{at:Date.now(),rows:saved});return saved
 })().finally(()=>work.delete(owner))
 work.set(owner,task);return task
}
