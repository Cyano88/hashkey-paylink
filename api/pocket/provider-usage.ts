import {AsyncLocalStorage} from 'node:async_hooks'

const features=new Set(['rpc-read','wallet-activity','balance-display','balance-read','billing-audit','xlayer-discovery','circle-wallet','okx-history','other'])
const networks=new Set(['base','arbitrum','arc','ethereum','polygon','solana','bsc','xlayer','multi','unknown'])
const operations=new Set(['eth_chainId','eth_blockNumber','eth_getLogs','eth_getBalance','eth_getCode','eth_getTransactionCount','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getBlockByNumber','eth_getBlockByHash','eth_call','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory','debug_traceTransaction','getAccountInfo','getTokenAccountBalance','getSignaturesForAddress','getTransaction','getGenesisHash','batch','history-page','wallet-read','wallet-balances','wallet-list','transaction-read','transaction-create','challenge-read','challenge-create','authentication','price','other'])
const outcomes=new Set(['success','http-ok','http-error','rate-limited','network-error','timeout','aborted','rpc-error','invalid-response','configuration','scope','error','cache-hit','shared'])
const providers=new Set(['alchemy','circle','okx','public-rpc','other','none'])
const publicHosts=new Set(['mainnet.base.org','arb1.arbitrum.io','ethereum-rpc.publicnode.com','polygon-bor-rpc.publicnode.com','rpc.mainnet.arc.io','api.mainnet-beta.solana.com','rpc.xlayer.tech'])
const context=new AsyncLocalStorage<string>()
export function withProviderFeature<T>(feature:string,work:()=>T):T{return context.run(features.has(feature)?feature:'other',work)}
export function providerFromEndpoint(endpoint:string|URL):string{
 try{const host=new URL(String(endpoint)).hostname.toLowerCase();if(host==='alchemy.com'||host.endsWith('.alchemy.com'))return 'alchemy';if(host==='api.circle.com')return 'circle';if(host==='web3.okx.com')return 'okx';return publicHosts.has(host)?'public-rpc':'other'}catch{return 'other'}
}
export function providerErrorOutcome(error:unknown):string{
 const e=error as {name?:string;reason?:string;status?:number;code?:number}
 if(e?.name==='TimeoutError')return 'timeout'
 if(e?.name==='AbortError')return 'aborted'
 if(e?.name==='SyntaxError')return 'invalid-response'
 if(e?.status===429||e?.reason==='quota')return 'rate-limited'
 if(e?.reason==='network')return 'network-error'
 if(e?.reason==='rpc')return 'rpc-error'
 if(e?.reason==='response')return 'invalid-response'
 if(e?.reason==='configuration')return 'configuration'
 if(e?.reason==='scope')return 'scope'
 if(typeof e?.status==='number')return 'http-error'
 return 'error'
}
export type ProviderUsageMeta={feature?:string;network?:string;operation?:string;provider?:string;endpoint?:string|URL;count?:number}
type Row={feature:string;network:string;operation:string;provider:string;outcome:string;count:number;requests:number;durationMs:number}
/** Closed labels only. URLs, paths, wallets, keys, parameters and exception text
 * never enter reports. Telemetry failure must never affect a payment result. */
export function createProviderUsage(now=Date.now,emit:(report:unknown)=>void=value=>console.info('[provider-usage]',JSON.stringify(value))){
 let startedAt=now(),overflow=0
 const rows=new Map<string,Row>()
 const record=(meta:ProviderUsageMeta,outcome:string,durationMs=0)=>{
  try{
   const feature=meta.feature??context.getStore()??'rpc-read'
   const provider=meta.endpoint?providerFromEndpoint(meta.endpoint):meta.provider??'none'
   const labels={feature:features.has(feature)?feature:'other',network:networks.has(meta.network||'')?meta.network!:'unknown',operation:operations.has(meta.operation||'')?meta.operation!:'other',provider:providers.has(provider)?provider:'other',outcome:outcomes.has(outcome)?outcome:'error'}
   const suppliedCount=meta.count??1
   const count=Number.isSafeInteger(suppliedCount)&&suppliedCount>0&&suppliedCount<=100?suppliedCount:1
   const key=Object.values(labels).join(':');let row=rows.get(key)
   if(!row){if(rows.size>=256){overflow+=count;return}row={...labels,count:0,requests:0,durationMs:0};rows.set(key,row)}
   row.count+=count;if(provider!=='none' && outcome!=='cache-hit' && outcome!=='shared')row.requests++;row.durationMs+=Number.isFinite(durationMs)?Math.max(0,Math.min(durationMs,3600000)):0
  }catch{/* Observability is never a dependency of money movement. */}
 }
 const begin=(meta:ProviderUsageMeta)=>{
  const captured={...meta,feature:meta.feature??context.getStore()??'rpc-read'},at=now();let finished=false
  return (outcome:string)=>{if(finished)return;finished=true;record(captured,outcome,now()-at)}
 }
 const observe=async<T>(meta:ProviderUsageMeta,work:()=>Promise<T>):Promise<T>=>{
  const finish=begin(meta)
  try{const result=await work();finish('success');return result}catch(error){finish(providerErrorOutcome(error));throw error}
 }
 const flush=()=>{
  const end=now(),report={startedAt:new Date(startedAt).toISOString(),endedAt:new Date(end).toISOString(),windowMs:Math.max(0,end-startedAt),rows:[...rows.values()],overflow}
  rows.clear();overflow=0;startedAt=end
  if(report.rows.length||report.overflow)try{emit(report)}catch{/* A failing logger must not break callers. */}
  return report
 }
 return {record,begin,observe,flush}
}
export const providerUsage=createProviderUsage()
export const observeProvider=providerUsage.observe
export const recordProviderUsage=providerUsage.record
/** HTTP instrumentation for shared Circle clients: preserves the original
 * response/body/abort/error behavior and explicitly reports HTTP success only. */
export function providerUsageFetch(meta:ProviderUsageMeta,fetcher:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  const finish=providerUsage.begin({...meta,endpoint:meta.endpoint??(input instanceof Request?input.url:String(input))})
  try{const response=await fetcher(input,init);finish(response.ok?'http-ok':response.status===429?'rate-limited':'http-error');return response}catch(error){finish((error as Error)?.name==='TimeoutError'?'timeout':(error as Error)?.name==='AbortError'?'aborted':'network-error');throw error}
 }
}
export function circleUsageOperation(path:string,method='GET'){
 const p=path.split('?')[0]
 if(/\/balances$/.test(p))return 'wallet-balances'
 if(/\/wallets$/.test(p))return 'wallet-list'
 if(/\/wallets\/[^/]+$/.test(p))return 'wallet-read'
 if(p.includes('/transactions'))return method==='GET'?'transaction-read':'transaction-create'
 if(p.includes('/challenges'))return method==='GET'?'challenge-read':'challenge-create'
 if(/\/users|\/users\/token|\/user\/token/.test(p))return 'authentication'
 return 'other'
}

/** Transparent HTTP-only JSON-RPC instrumentation for viem transports. */
export function providerRpcFetch(feature:string,network:string,fetcher:typeof fetch=fetch):typeof fetch{
 return (input,init)=>{
  let operation='other',count=1
  try{if(typeof init?.body==='string'&&init.body.length<=2097152){const body=JSON.parse(init.body),items=Array.isArray(body)?body:[body];count=items.length;operation=items.length===1?items[0]?.method:'batch'}}catch{/* Telemetry cannot reject an RPC request. */}
  return providerUsageFetch({feature,network,operation,count},fetcher)(input,init)
 }
}

// One process-local reporter; emits after idle periods without keeping a CLI
// alive. This reports attempts, not billing units, and performs no network I/O.
const firstReport=setTimeout(()=>{
 providerUsage.flush()
 const reportTimer=setInterval(()=>providerUsage.flush(),300_000)
 reportTimer.unref()
},60_000)
firstReport.unref()
