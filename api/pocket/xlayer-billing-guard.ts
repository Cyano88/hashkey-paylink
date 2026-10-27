import {bscPaymentCoverage} from './bsc-payment-coverage.js'
import type {BscPaymentOperationStore} from './bsc-payment-operations.js'
import {xLayerFeeAssets,xLayerFeeScale,type XLayerFeeAsset} from '../../src/pocket/lib/pocketXLayerFeeAssets.js'
import {bscCollectedCoverage,type BscCollectedCoverage} from './bsc-collected-coverage.js'
import {createBscRuntime} from './bsc-runtime.js'
import type {BscOperationStore} from './bsc-operations.js'
import {sumPrivyTransactionGas} from './privy-transaction-gas.js'
import {encodeEventTopics,parseAbi} from 'viem'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {readStockMarketPrices} from './xstocks-prices.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'

export type XLayerCoverage={walletId:string;asset:XLayerFeeAsset;feeUnits:string}
type Attempt={wallet:string;at:number;hash?:string;transactionId?:string;coverage?:XLayerCoverage;providerFailure?:{status:number;code?:string}}
type Halt={haltedAt:number;reason:'billed_cost_exceeds_coverage';billedUsdMicros:string;coverageUsdMicros:string}
const key='pocket:xlayer-billing-halt:v1'
const tokens=Object.fromEntries(Object.entries(xLayerFeeAssets).map(([asset,token])=>[asset,token.address])) as Record<XLayerFeeAsset,string>
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const unavailable=()=>{throw Error('X Layer sponsorship cost verification is temporarily unavailable.')}
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
export function xlayerBilledUsdMicros(b:any){
 if(typeof b?.currency!=='string'||b.currency.toLowerCase()!=='usd'||!['number','string'].includes(typeof b.value)||!/^\d+(?:\.\d+)?$/.test(String(b.value)))return unavailable()
 const [whole,fraction='']=String(b.value).split('.')
 const micros=BigInt(whole)*1000000n+BigInt((fraction+'000000').slice(0,6))+( /[1-9]/.test(fraction.slice(6))?1n:0n)
 if(micros>BigInt(Number.MAX_SAFE_INTEGER))return unavailable()
 return micros
}
export function createXLayerBillingGuard(d:{
 now():number;readHalt():Promise<Halt|undefined>;halt(value:Halt):Promise<unknown>;
 spend(walletId:string,start:number,end:number):Promise<bigint>;
 transactionSpend?(records:Attempt[]):Promise<bigint>;
 additionalCoverage?(wallet?:string):Promise<BscCollectedCoverage[]>;
 rpc(method:string,params:unknown[]):Promise<any>;
 prices:typeof readStockMarketPrices;
}){
 return async(attempts:Attempt[],wallet?:string)=>{
  if(await d.readHalt())throw Error('X Layer sponsorship is paused for a fee review.')
  const now=d.now(),recent=attempts.filter(r=>r.coverage&&r.at>=now-28*86400000&&(!wallet||same(r.wallet,wallet)))
  const extra=await d.additionalCoverage?.(wallet)||[]
  if(d.transactionSpend&&extra.length)return unavailable()
  if(extra.some(r=>!Number.isSafeInteger(r.at)||r.at<now-28*86400000||r.at>now||typeof r.coverageUsdMicros!=='bigint'||r.coverageUsdMicros<0n)||new Set(extra.map(r=>r.hash.toLowerCase())).size!==extra.length)return unavailable()
  const walletIds=[...new Set([...recent.map(r=>r.coverage!.walletId),...extra.map(r=>r.walletId)])]
  if(!walletIds.length)return
  if(await d.rpc('eth_chainId',[])!=='0xc4')return unavailable()
  if(recent.some(r=>!Object.hasOwn(xLayerFeeAssets,r.coverage!.asset)))return unavailable()
  const prices=await d.prices([...new Set(recent.map(r=>tokens[r.coverage!.asset]))])
  let failure:unknown
  for(const walletId of walletIds){
   try {
   const records=recent.filter(r=>r.coverage!.walletId===walletId)
   const hashes=records.filter(r=>r.hash).map(r=>r.hash!.toLowerCase())
   if(new Set(hashes).size!==hashes.length)return unavailable()
   const supplemental=extra.filter(r=>r.walletId===walletId)
   let coverage=supplemental.reduce((sum,r)=>sum+r.coverageUsdMicros,0n)
   // An unresolved broadcast cannot be treated as a collected reimbursement.
   // Block further spending until canonical receipts can be checked; recovery
   // remains available through the existing status and reconciliation paths.
   for(let offset=0;offset<records.length;offset+=10){
    const collected=await Promise.all(records.slice(offset,offset+10).map(async r=>{
    if(!r.hash){
     if(r.providerFailure?.status===400&&r.providerFailure.code==='transaction_broadcast_failure')return 0n
     return unavailable()
    }
    const receipt=await d.rpc('eth_getTransactionReceipt',[r.hash])
    if(!receipt||!same(receipt.transactionHash,r.hash))return unavailable()
    const block=await d.rpc('eth_getBlockByNumber',[receipt.blockNumber,false])
    if(!block||!same(block.hash,receipt.blockHash))return unavailable()
    if(receipt.status==='0x0')return 0n
    if(receipt.status!=='0x1')return unavailable()
    const c=r.coverage!,token=tokens[c.asset],price=prices[token]
    if(!price||!Number.isFinite(price.usd)||price.usd<=0||price.fetchedAt+30000<=now||price.fetchedAt>now+5000)return unavailable()
    const topics=encodeEventTopics({abi,eventName:'Transfer',args:{from:r.wallet as `0x${string}`,to:EVM_PLATFORM_TREASURY}})
    const paid=receipt.logs.filter((log:any)=>same(log.address,token)&&log.topics?.length===3&&topics.every((t,i)=>typeof t==='string'&&same(log.topics[i],t))&&/^0x[0-9a-f]{64}$/i.test(log.data))
    if(paid.length!==1||BigInt(paid[0].data)!==BigInt(c.feeUnits))return 0n
    // Discount current USD value by 5%; never assume a stablecoin dollar peg.
    const usd8=Math.floor(price.usd*1e8*0.95)
    if(!Number.isSafeInteger(usd8)||usd8<=0)return unavailable()
    return BigInt(c.feeUnits)*BigInt(usd8)/(100000000n*xLayerFeeScale(c.asset))
    }))
    coverage+=collected.reduce((sum,value)=>sum+value,0n)
   }
   const billed=d.transactionSpend?await d.transactionSpend(records):await d.spend(walletId,Math.max(0,Math.min(...records.map(r=>r.at),...supplemental.map(r=>r.at))-1000),now)
   if(billed<0n)return unavailable()
   if(billed>coverage){
    await d.halt({haltedAt:now,reason:'billed_cost_exceeds_coverage',billedUsdMicros:String(billed),coverageUsdMicros:String(coverage)})
    throw Error('X Layer sponsorship is paused for a fee review.')
   }
   }catch(error){failure=error}
  }
  if(failure)throw failure
 }
}

// Read-only billing is eventually consistent. This stops new spending after a
// detected shortfall; it is not a hard provider spend cap or zero-loss promise.
export async function checkXLayerBillingCoverage(wallet?:string){
 if(process.env.POCKET_XLAYER_FEE_POLICY!=='observed_cost')return
 const env=process.env,appId=env.PRIVY_APP_ID||env.VITE_PRIVY_APP_ID,secret=env.PRIVY_APP_SECRET,url=env.PRIVATE_RPC_URL_XLAYER
 if(!appId||!secret||!url)return unavailable()
 const read=await readDurableJson<{requests:{[id:string]:Attempt}}>('pocket:xlayer-sponsorship:v1')
 const guard=createXLayerBillingGuard({now:Date.now,readHalt:()=>readDurableJson<Halt>(key),halt:value=>mutateDurableJson<Halt>(key,old=>old||value),prices:readStockMarketPrices,
  rpc:async(method,params)=>{const r=await fetch(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});const b=await r.json();if(!r.ok||b.error||b.result===undefined)return unavailable();return b.result},
  ...(env.POCKET_PRIVY_COMBINED_BILLING_ENABLED==='true'?{additionalCoverage:async(wallet?:string)=>{
   const store=await readDurableJson<BscOperationStore>('pocket:bsc-operations:v1')
   const ops=Object.values(store?.operations||{})
   const payments=Object.values((await readDurableJson<BscPaymentOperationStore>('pocket:bsc-payment-operations:v1'))?.operations||{})
   if(!ops.length&&!payments.length)return []
   const runtime=createBscRuntime(),context={now:Date.now(),rpc:runtime.rpc,prices:runtime.readPrices}
   return [...await bscCollectedCoverage(ops,context,wallet),...await bscPaymentCoverage(payments,context,wallet)]
  }}:{}),
  ...(env.POCKET_PRIVY_COMBINED_BILLING_ENABLED!=='true'&&env.POCKET_PRIVY_TRANSACTION_BILLING_ENABLED==='true'?{transactionSpend:async(records:Attempt[])=>{
   const sent=records.filter(r=>r.hash||!(r.providerFailure?.status===400&&r.providerFailure.code==='transaction_broadcast_failure'))
   if(sent.some(r=>!r.hash||!r.transactionId||!r.coverage))return unavailable()
   return sumPrivyTransactionGas(sent.map(r=>({transactionId:r.transactionId!,walletId:r.coverage!.walletId,chainId:196,hash:r.hash! as `0x${string}`})),async id=>{
    const r=await fetch('https://api.privy.io/v1/transactions/'+encodeURIComponent(id),{redirect:'error',headers:{'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64')},signal:AbortSignal.timeout(15000)})
    if(!r.ok)return unavailable();return r.json()
   })
  }}:{}),
  spend:async(walletId,start,end)=>{
   const query=new URLSearchParams({wallet_ids:walletId,start_timestamp:String(start),end_timestamp:String(end)})
   const r=await fetch('https://api.privy.io/v1/apps/gas_spend?'+query,{redirect:'error',headers:{'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64')},signal:AbortSignal.timeout(15000)})
   if(!r.ok)return unavailable()
   return xlayerBilledUsdMicros(await r.json())
  },
 })
 await guard(Object.values(read?.requests||{}),wallet)
}
