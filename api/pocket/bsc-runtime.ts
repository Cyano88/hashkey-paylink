import {createHmac} from 'node:crypto'
import {encodeFunctionData, parseAbi} from 'viem'
import {okxCredentials, okxGet} from './xstocks-swap-provider.js'
import {createBscFeeEstimator, type BscFeePrice, type BscFeePolicy} from './bsc-fee-estimator.js'
import {POCKET_BSC, pocketBscAsset, type PocketBscAsset} from '../../src/pocket/lib/pocketBsc.js'
import {type BscSwapQuote} from '../../src/pocket/lib/pocketBscSwap.js'
const abi=parseAbi(['function balanceOf(address) view returns(uint256)','function decimals() view returns(uint8)'])
const unavailable=():never=>{throw Error('BSC connection is temporarily unavailable.')}
const uint=(v:unknown):bigint=>{if(typeof v!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(v))return unavailable();return BigInt(v)}
/** Shared app pricing policy; token units are rescaled, never copied as six
 * decimals. The observed-cost allowance is conservative, not a provider bill. */
export function bscConfiguredFeePolicy(env:NodeJS.ProcessEnv=process.env):BscFeePolicy{
 const integer=(name:string)=>{const v=env[name];if(typeof v!=='string'||!/^(0|[1-9]\d{0,19})$/.test(v))return unavailable();return BigInt(v)}
 const mode=env.POCKET_XLAYER_FEE_POLICY||'provider_terms'
 if(!['observed_cost','provider_terms'].includes(mode))return unavailable()
 return {providerBps:mode==='observed_cost'?0:Number(integer('POCKET_XLAYER_PROVIDER_FEE_BPS')),
  providerAllowanceUsdMicros:integer(mode==='observed_cost'?'POCKET_XLAYER_OBSERVED_COST_USD_MICROS':'POCKET_XLAYER_PROVIDER_FIXED_USD_MICROS'),
  marginBps:Number(integer('POCKET_XLAYER_FEE_MARGIN_BPS')),minimumFeeUnits:integer('POCKET_XLAYER_MIN_FEE_UNITS')*10n**12n,maximumFeeUnits:integer('POCKET_XLAYER_MAX_FEE_UNITS')*10n**12n}
}
function scaledPrice(value:unknown,up:boolean){
 if(typeof value!=='string'||!/^(0|[1-9]\d{0,12})(?:\.\d{1,80})?$/.test(value))return unavailable()
 const [whole,fraction='']=value.split('.')
 const result=BigInt(whole)*100000000n+BigInt((fraction+'00000000').slice(0,8))+(up&&/[1-9]/.test(fraction.slice(8))?1n:0n)
 if(result<=0n)return unavailable();return result
}
export function parseBscMarketPrices(rows:unknown,now=Date.now()):Record<string,BscFeePrice>{
 if(!Array.isArray(rows))return unavailable()
   const values:Record<string,BscFeePrice>={}
   for(const asset of Object.values(POCKET_BSC.assets)){
    const matched=rows.filter((x:any)=>String(x.chainIndex)==='56'&&typeof x.tokenContractAddress==='string'&&x.tokenContractAddress.toLowerCase()===asset.address.toLowerCase())
    if(matched.length!==1)return unavailable()
    const observedAt=Number(matched[0].time)
    if(!Number.isSafeInteger(observedAt)||observedAt>now+5000||observedAt+30000<=now)return unavailable()
    values[asset.symbol]={scaled8:scaledPrice(matched[0].price,asset.native),observedAt}
   }
 return values
}
export function createBscRuntime(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 const endpoint=new URL(env.PRIVATE_RPC_URL_BSC||'')
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)unavailable()
 let requestId=0
 const rpc=async(method:string,params:unknown[])=>{
  const id=++requestId
  try{
   const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({jsonrpc:'2.0',id,method,params})})
   const body=await response.json()
   if(!response.ok||body.id!==id||body.error||body.result===undefined)return unavailable()
   return body.result
  }catch{return unavailable()}
 }
 let priceCache:{at:number;values:Record<string,BscFeePrice>}|undefined,priceWork:Promise<Record<string,BscFeePrice>>|undefined
 const readPrices=async()=>{
  if(priceCache&&Date.now()-priceCache.at<10000)return priceCache.values
  if(priceWork)return priceWork
  priceWork=(async()=>{
   const c=okxCredentials();if(!c.key||!c.secret||!c.passphrase)return unavailable()
   const path='/api/v6/dex/market/price',body=JSON.stringify(Object.values(POCKET_BSC.assets).map(a=>({chainIndex:'56',tokenContractAddress:a.address}))),timestamp=new Date().toISOString()
   const signature=createHmac('sha256',c.secret).update(timestamp+'POST'+path+body).digest('base64')
   const r=await fetcher('https://web3.okx.com'+path,{method:'POST',headers:{'Content-Type':'application/json','OK-ACCESS-KEY':c.key,'OK-ACCESS-SIGN':signature,'OK-ACCESS-PASSPHRASE':c.passphrase,'OK-ACCESS-TIMESTAMP':timestamp},body,redirect:'error',signal:AbortSignal.timeout(10000)})
   const data=await r.json();if(!r.ok||data.code!=='0'||!Array.isArray(data.data))return unavailable()
   const values=parseBscMarketPrices(data.data)
   priceCache={at:Date.now(),values};return values
  })().finally(()=>{priceWork=undefined})
  return priceWork
 }
 const estimateSponsored=createBscFeeEstimator({rpc,policy:bscConfiguredFeePolicy(env),prices:async asset=>{const p=await readPrices();return {bnb:p.BNB,stable:p[asset]}}})
 const chainId=async()=>Number(uint(await rpc('eth_chainId',[])))
 const balance=async(asset:PocketBscAsset,wallet:`0x${string}`)=>{
  if(await chainId()!==56)return unavailable()
  const token=pocketBscAsset(asset)
  if(token.native)return uint(await rpc('eth_getBalance',[wallet,'pending']))
  if(uint(await rpc('eth_call',[{to:token.address,data:encodeFunctionData({abi,functionName:'decimals'})},'latest']))!==18n)return unavailable()
  return uint(await rpc('eth_call',[{to:token.address,data:encodeFunctionData({abi,functionName:'balanceOf',args:[wallet]})},'pending']))
 }
 const estimateNative=async(q:BscSwapQuote)=>{
  if(q.from!=='BNB'||await chainId()!==56)return unavailable()
  const [gas,price]=await Promise.all([rpc('eth_estimateGas',[{from:q.walletAddress,to:q.tx.to,data:q.tx.data,value:'0x'+BigInt(q.tx.value).toString(16)}]),rpc('eth_gasPrice',[])])
  const limit=(uint(gas)*120n+99n)/100n,max=(uint(price)*150n+99n)/100n
  if(limit<21000n||limit>10000000n||max<=0n)return unavailable()
  return {gasLimit:String(limit),maxFeePerGas:String(max),maxPriorityFeePerGas:String(max)}
 }
 return {rpc,chainId,balance,estimateNative,estimateSponsored,read:(path:string,query:Record<string,string>)=>okxGet(path,query,fetcher),readPrices}
}
