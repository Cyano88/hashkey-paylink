import {createHmac} from 'node:crypto'
import {createPublicClient,getAddress,http,parseUnits,type Address} from 'viem'
import {okxCredentials} from './xstocks-swap-provider.js'
import {stockAssets,stockUsdc,stockTokenAbi,pocketXLayer,readStockHoldings,type StockBalanceSnapshot} from '../../src/pocket/lib/pocketXStocksWallet.js'
const cashKey=stockUsdc.address.toLowerCase(),catalog=new Map(stockAssets.map(a=>[a.address.toLowerCase(),a]))
const precision=new Map<string,number>([['',18],[cashKey,6]])
export function parseOkxBalanceRows(data:unknown,owner:string,allowEmpty=false){
 if(allowEmpty&&Array.isArray(data)&&data.length===0)return new Map<string,{balance:string;rawBalance?:string}>()
 if(!Array.isArray(data)||data.length!==1||!Array.isArray(data[0]?.tokenAssets)||data[0].tokenAssets.length>10000)throw Error('Incomplete OKX balances.')
 const rows=new Map<string,{balance:string;rawBalance?:string}>()
 for(const row of data[0].tokenAssets){
  if(!row||String(row.chainIndex)!=='196'||typeof row.tokenContractAddress!=='string'||(row.address&&String(row.address).toLowerCase()!==owner.toLowerCase()))throw Error('OKX balance scope mismatch.')
  const key=row.tokenContractAddress.toLowerCase()
  if(key!==''&&!/^0x[0-9a-f]{40}$/.test(key)||rows.has(key)||typeof row.balance!=='string'||!/^\d{1,78}(?:\.\d{1,36})?$/.test(row.balance))throw Error('Invalid OKX balance.')
  rows.set(key,{balance:row.balance,rawBalance:row.rawBalance})
 }
 return rows
}
export function exactBalanceUnits(value:unknown,decimals:number){
 if(typeof value!=='string'||!/^\d{1,78}(?:\.\d{1,36})?$/.test(value)||!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('Invalid balance precision.')
 const normalized=value.includes('.')?value.replace(/0+$/,'').replace(/\.$/,''):value
 if((normalized.split('.')[1]?.length||0)>decimals)throw Error('Provider balance exceeds token precision.')
 const units=parseUnits(normalized,decimals);if(units>=2n**256n)throw Error('Balance overflow.');return units
}
// Indexed display estimates only. Sending, swapping and XPay must revalidate on chain.
export async function fetchOkxDisplayBalances(owner:Address,previous?:StockBalanceSnapshot,signal?:AbortSignal,fetcher=fetch):Promise<StockBalanceSnapshot>{
 const started=Date.now(),c=okxCredentials();if(!c.key||!c.secret||!c.passphrase)throw Error('OKX balance configuration unavailable.')
 const request=async(method:'GET'|'POST',path:string,input?:unknown)=>{const body=input?JSON.stringify(input):'',timestamp=new Date().toISOString();const r=await fetcher('https://web3.okx.com'+path,{method,headers:{'Content-Type':'application/json','OK-ACCESS-KEY':c.key!,'OK-ACCESS-PASSPHRASE':c.passphrase!,'OK-ACCESS-TIMESTAMP':timestamp,'OK-ACCESS-SIGN':createHmac('sha256',c.secret!).update(timestamp+method+path+body).digest('base64')},...(body?{body}:{}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000),redirect:'error'});if(!r.ok)throw Error('OKX balances unavailable.');const j=await r.json();if(j.code!=='0')throw Error('OKX balances unavailable.');return parseOkxBalanceRows(j.data,owner,method==='GET')}
 const rows=await request('GET','/api/v6/dex/balance/all-token-balances-by-address?'+new URLSearchParams({address:owner,chains:'196',excludeRiskToken:'1'}))
 // Missing native/cash or previously held stocks need an explicit response, never an assumed zero.
 const required=[...new Set(['',cashKey,...(previous?.holdings||[]).map(h=>h.asset.address.toLowerCase())])],missing=required.filter(k=>!rows.has(k))
 for(let i=0;i<missing.length;i+=20){const batch=missing.slice(i,i+20),explicit=await request('POST','/api/v6/dex/balance/token-balances-by-address',{address:owner,tokenContractAddresses:batch.map(tokenContractAddress=>({chainIndex:'196',tokenContractAddress})),excludeRiskToken:'1'});for(const key of batch){const row=explicit.get(key);if(!row)throw Error('OKX omitted a requested balance.');rows.set(key,row)}}
 const held=[...rows].filter(([k,r])=>catalog.has(k)&&/[1-9]/.test(r.balance)),unknown=held.map(([k])=>k).filter(k=>!precision.has(k))
 // Token decimals are contract metadata, cached per server process, not a recurring balance read.
 if(unknown.length){const client=createPublicClient({chain:pocketXLayer,transport:http(process.env.XLAYER_RPC_URL||pocketXLayer.rpcUrls.default.http[0],{retryCount:0,timeout:5000,fetchOptions:{signal}})});const results=await client.multicall({contracts:unknown.map(address=>({address:getAddress(address),abi:stockTokenAbi,functionName:'decimals' as const}))});results.forEach((r,i)=>{if(r.status!=='success'||!Number.isInteger(r.result)||r.result<0||r.result>36)throw Error('Token precision unavailable.');precision.set(unknown[i],Number(r.result))})}
 const units=(key:string)=>{const r=rows.get(key)!;const value=exactBalanceUnits(r.balance,precision.get(key)!);if(r.rawBalance!==undefined&&r.rawBalance!==''&&(typeof r.rawBalance!=='string'||!/^\d+$/.test(r.rawBalance)||BigInt(r.rawBalance)!==value))throw Error('Conflicting OKX balance units.');return value}
 return {source:'okx',holdings:held.map(([k])=>({asset:catalog.get(k)!,units:units(k),decimals:precision.get(k)!})),cash:units(cashKey),gas:units(''),complete:true,blockNumber:null,blockHash:null,fullScanAt:started,observedAt:started}
}
export function createStockDisplayReader(provider=fetchOkxDisplayBalances,rpc=readStockHoldings,now=Date.now){
 // A provider failure belongs to this wallet, not every Pocket user.
 const wallets=new Map<string,{retryAt:number;baseline?:StockBalanceSnapshot}>()
 return async(owner:Address,previous?:StockBalanceSnapshot,signal?:AbortSignal,options?:{force?:boolean})=>{
  const key=owner.toLowerCase()
  let state=wallets.get(key)
  if(!state){state={retryAt:0};wallets.set(key,state);if(wallets.size>128)wallets.delete(wallets.keys().next().value!)}
  if(signal?.aborted)throw Error('Balance request cancelled.')
  if(!options?.force&&now()>=state.retryAt){
   try{const result=await provider(owner,previous,signal);if(signal?.aborted)throw Error('Balance request cancelled.');state.retryAt=0;return result}
   catch{if(signal?.aborted)throw Error('Balance request cancelled.');state.retryAt=now()+60000}
  }
  // Retain a canonical RPC baseline across healthy OKX reads. The RPC reader
  // checks its block hash, scans intervening transfers, and periodically rescans all stocks.
  const baseline=options?.force?undefined:previous&&previous.source!=='okx'?previous:state.baseline
  const result=await rpc(owner,baseline,signal,{rpcUrl:process.env.XLAYER_RPC_URL})
  if(signal?.aborted)throw Error('Balance request cancelled.')
  if(result.source==='okx'||!result.complete)throw Error('RPC balance verification unavailable.')
  if(!state.baseline||result.observedAt>=state.baseline.observedAt)state.baseline=result
  return result
 }
}