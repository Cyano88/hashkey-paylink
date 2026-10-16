import {createHash} from 'node:crypto'
import {encodeFunctionData,parseAbi,toHex,type Hex} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {estimateXLayerSponsoredBatchGas,priceXLayerReimbursement,XLAYER_ENTRY_POINT,type XLayerCostRpc} from './xlayer-sponsored-cost.js'
import type {XLayerFeeEstimator,XLayerReimbursementPolicy} from './xlayer-reimbursement.js'
import {readStockMarketPrices} from './xstocks-prices.js'

const native='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const tokens={USDC:'0xb6ceceab302e2e4948951ee7843fc24e92933061',USDT:'0x779ded0c9e1022225f8e0630b35a9b54be713736'} as const
const oracle='0x420000000000000000000000000000000000000F'
const oracleAbi=parseAbi(['function getL1FeeUpperBound(uint256) view returns(uint256)'])
type MarketPrice={usd:number;fetchedAt:number}
type Policy={providerBps:number;providerFixedUsdMicros:bigint;maxFeeUnits:bigint;pricing:XLayerReimbursementPolicy}
const unavailable=():never=>{throw Error('X Layer fee estimation is unavailable. Review the transfer again.')}
const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b
function hex(v:unknown){if(typeof v!=='string'||!/^0x[0-9a-f]{1,64}$/i.test(v))return unavailable();return BigInt(v)}
function validatePolicy(p:Policy){
 if(!Number.isSafeInteger(p.providerBps)||p.providerBps<0||p.providerBps>10000||p.providerFixedUsdMicros<0n||p.maxFeeUnits<=0n||p.maxFeeUnits>=2n**64n)unavailable()
 if(!/^(0|[1-9]\d{0,19})$/.test(p.pricing.minimumFeeUnits))unavailable()
 if(priceXLayerReimbursement(1n,p.pricing.marginBps,BigInt(p.pricing.minimumFeeUnits))>p.maxFeeUnits)unavailable()
}
/** Conservative estimate for the verified Privy Kernel, single-operation,
 * zero-fee BSO path. Not a Privy invoice or an enforced maximum gas spend.
 * First-time wallets/other delegates remain rejected by batch simulation. */
export function createXLayerFeeEstimator(d:{rpc:XLayerCostRpc;prices(addresses:string[]):Promise<Record<string,MarketPrice>>;policy:Policy;now?:()=>number}):XLayerFeeEstimator{
 const policy=structuredClone(d.policy);validatePolicy(policy)
 const now=d.now||Date.now
 return async input=>{
  const started=now(),token=tokens[input.asset]
  if(!token)unavailable()
  const [gas,suggestion,gasPrice,prices]=await Promise.all([
   estimateXLayerSponsoredBatchGas(d.rpc,input.walletAddress,input.calls),
   d.rpc('rundler_getUserOperationGasPrice',[]),d.rpc('eth_gasPrice',[]),d.prices([native,token]),
  ])
  const suggested=hex(suggestion?.suggested?.maxFeePerGas),spot=hex(gasPrice)
  if(suggested<=0n||spot<=0n)unavailable()
  const price=suggested>spot?suggested:spot
  const blockNumber=hex(suggestion?.blockNumber)
  const block=await d.rpc('eth_getBlockByNumber',[toHex(blockNumber),false])
  if(hex(block?.number)!==blockNumber||!/^0x[0-9a-f]{64}$/i.test(block?.hash))unavailable()
  const blockTime=Number(hex(block.timestamp))*1000
  const okb=prices[native],stable=prices[token]
  for(const p of [okb,stable])if(!p||!Number.isFinite(p.usd)||p.usd<=0||!Number.isSafeInteger(p.fetchedAt)||p.fetchedAt>now()+5000||p.fetchedAt+30000<=now())unavailable()
  if(!Number.isSafeInteger(blockTime)||blockTime>now()+5000||blockTime+30000<=now())unavailable()
  // A repeated 7702 authorization costs up to 25,000 gas, separate from
  // the unsigned op estimate. ERC-4337 requires accounting for this overhead.
  const totalGas=gas.totalGas+25000n
  const op={sender:input.walletAddress,nonce:0n,initCode:'0x' as Hex,callData:gas.callData,accountGasLimits:toHex((gas.verificationGas<<128n)|gas.callGas,{size:32}),preVerificationGas:gas.preVerificationGas,gasFees:toHex(0n,{size:32}),paymasterAndData:'0x' as Hex,signature:('0x'+'ff'.repeat(65)) as Hex}
  const data=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[op],input.walletAddress]})
  // Fixed-size nonce/gas fields do not change ABI length. 1 KiB additionally
  // allows the outer type-4 envelope, one authorization and outer signature.
  const unsignedBytes=BigInt((data.length-2)/2+1024)
  const l1=hex(await d.rpc('eth_call',[{to:oracle,data:encodeFunctionData({abi:oracleAbi,functionName:'getL1FeeUpperBound',args:[unsignedBytes]})},'latest']))
  const okb8=Math.ceil(okb.usd*1e8),stable8=Math.floor(stable.usd*1e8)
  if(!Number.isSafeInteger(okb8)||!Number.isSafeInteger(stable8)||stable8<=0)unavailable()
  const networkWei=totalGas*price+l1
  const networkUsdMicros=ceil(networkWei*BigInt(okb8),10n**20n)
  const fullUsdMicros=ceil(networkUsdMicros*BigInt(10000+policy.providerBps),10000n)+policy.providerFixedUsdMicros
  const feeUnits=ceil(fullUsdMicros*100000000n,BigInt(stable8))
  if(priceXLayerReimbursement(feeUnits,policy.pricing.marginBps,BigInt(policy.pricing.minimumFeeUnits))>policy.maxFeeUnits)unavailable()
  const expiresAt=Math.min(started+30000,okb.fetchedAt+30000,stable.fetchedAt+30000,blockTime+30000)
  if(expiresAt<=now())unavailable()
  const estimateId=createHash('sha256').update(JSON.stringify({input,blockHash:block.hash,gas:String(totalGas),gasPrice:String(price),l1:String(l1),okb8,stable8,providerBps:policy.providerBps,providerFixedUsdMicros:String(policy.providerFixedUsdMicros),expiresAt})).digest('hex')
  return {feeUnits:feeUnits.toString(),expiresAt,estimateId}
 }
}

/** Blank settings are unavailable, NOT zero service fees. No balance RPC changes. */
export function configuredXLayerReimbursement(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 if(env.POCKET_XLAYER_REIMBURSEMENT_ENABLED!=='true')return undefined
 try{
  const integer=(name:string)=>{const v=env[name];if(!v||!/^(0|[1-9]\d{0,19})$/.test(v))return unavailable();return BigInt(v)}
  const pricing={marginBps:Number(integer('POCKET_XLAYER_FEE_MARGIN_BPS')),minimumFeeUnits:integer('POCKET_XLAYER_MIN_FEE_UNITS').toString()}
  const policy={pricing,providerBps:Number(integer('POCKET_XLAYER_PROVIDER_FEE_BPS')),providerFixedUsdMicros:integer('POCKET_XLAYER_PROVIDER_FIXED_USD_MICROS'),maxFeeUnits:integer('POCKET_XLAYER_MAX_FEE_UNITS')}
  validatePolicy(policy)
  const url=new URL(env.PRIVATE_RPC_URL_XLAYER||'')
  if(url.protocol!=='https:'||url.username||url.password)unavailable()
  let id=0
  const rpc:XLayerCostRpc=async(method,params)=>{
   const requestId=++id
   try{
    const r=await fetcher(url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId,method,params}),signal:AbortSignal.timeout(15000)})
    const body=await r.json()
    if(!r.ok||body.id!==requestId||body.error||body.result===undefined)unavailable()
    return body.result
   }catch{return unavailable()}
  }
  return {pricing,estimate:createXLayerFeeEstimator({rpc,policy,prices:addresses=>readStockMarketPrices(addresses,fetcher)})}
 }catch{return undefined}
}
