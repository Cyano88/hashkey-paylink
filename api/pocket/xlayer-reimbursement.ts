import {createHmac,timingSafeEqual} from 'node:crypto'
import {encodeFunctionData,getAddress,isAddress,parseAbi,type Hex} from 'viem'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import {priceXLayerReimbursement} from './xlayer-sponsored-cost.js'

export type XLayerCall={to:Hex;data:Hex;value:'0x0'}
export type XLayerFeeBinding={ownerId:string;walletId:string;walletAddress:Hex;asset:'USDC'|'USDT';amountUnits:string;intentId:string}
export type XLayerReimbursementPolicy={marginBps:number;minimumFeeUnits:string}
export type XLayerFeeQuote=XLayerFeeBinding&{version:2;chainId:196;calls:XLayerCall[];networkFeeUnits:string;totalUnits:string;issuedAt:number;expiresAt:number;estimateId:string;pricing:XLayerReimbursementPolicy}
// An adapter must quote the entire sponsored operation, including managed-service
// charges and the reimbursement call. eth_estimateGas alone is not this estimate.
export type XLayerSponsorshipEstimate={feeUnits:string;expiresAt:number;estimateId:string}
export type XLayerFeeEstimator=(input:XLayerFeeBinding&{calls:XLayerCall[]})=>Promise<XLayerSponsorshipEstimate>
const tokens={USDC:'0xb6ceceab302e2e4948951ee7843fc24e92933061',USDT:'0x779ded0c9e1022225f8e0630b35a9b54be713736'} as const
const transfer=parseAbi(['function transfer(address,uint256) returns(bool)'])
const invalid=()=>{throw Error('X Layer fee quote changed or expired. Review the transfer again.')}
const units=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,19}$/.test(v)&&BigInt(v)<2n**64n
function pricedFee(cost:string,policy:XLayerReimbursementPolicy){
 if(!units(cost)||!policy||!(policy.minimumFeeUnits==='0'||units(policy.minimumFeeUnits)))return invalid()
 const fee=priceXLayerReimbursement(BigInt(cost),policy.marginBps,BigInt(policy.minimumFeeUnits)).toString()
 if(!units(fee))return invalid()
 return fee
}
function validateBinding(b:XLayerFeeBinding){
 if(!b.ownerId||!b.walletId||!b.intentId||!isAddress(b.walletAddress)||/^0x0{40}$/i.test(b.walletAddress)||b.walletAddress.toLowerCase()===EVM_PLATFORM_TREASURY.toLowerCase()||!['USDC','USDT'].includes(b.asset)||!units(b.amountUnits))invalid()
}
function validateCalls(calls:XLayerCall[]){
 if(!Array.isArray(calls)||!calls.length||calls.length>12||calls.some(c=>!c||!isAddress(c.to)||/^0x0{40}$/i.test(c.to)||c.value!=='0x0'||!/^0x(?:[0-9a-f]{2})+$/i.test(c.data)))invalid()
}
function withReimbursement(calls:XLayerCall[],asset:'USDC'|'USDT',fee:string):XLayerCall[]{
 return [...calls,{to:getAddress(tokens[asset]),value:'0x0',data:encodeFunctionData({abi:transfer,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,BigInt(fee)]})}]
}
/** Only pass calls built and validated by the server's send/bridge adapter. */
export async function quoteXLayerReimbursement(binding:XLayerFeeBinding,validatedCalls:XLayerCall[],providerExpiresAt:number,estimate:XLayerFeeEstimator,pricing:XLayerReimbursementPolicy,now:()=>number=Date.now):Promise<XLayerFeeQuote>{
 validateBinding(binding);validateCalls(validatedCalls)
 const policy=structuredClone(pricing)
 pricedFee('1',policy)
 const issuedAt=now()
 if(!Number.isSafeInteger(providerExpiresAt)||providerExpiresAt<=issuedAt)invalid()
 const source=structuredClone(validatedCalls)
 let fee='1'
 for(let pass=0;pass<4;pass++){
  const calls=withReimbursement(source,binding.asset,fee)
  const result=await estimate({...binding,calls:structuredClone(calls)})
  const expiresAt=Math.min(providerExpiresAt,result.expiresAt,issuedAt+30000)
  if(!units(result.feeUnits)||!result.estimateId||result.estimateId.length>256||!Number.isSafeInteger(expiresAt)||expiresAt<=now())invalid()
  const requiredFee=pricedFee(result.feeUnits,policy)
  if(BigInt(requiredFee)<=BigInt(fee)){
   const totalUnits=(BigInt(binding.amountUnits)+BigInt(fee)).toString()
   if(!units(totalUnits))invalid()
   return {...binding,version:2,chainId:196,calls,networkFeeUnits:fee,totalUnits,issuedAt,expiresAt,estimateId:result.estimateId,pricing:policy}
  }
  fee=requiredFee
 }
 throw Error('X Layer sponsorship estimate changed. Please request a new quote.')
}
function mac(payload:string){
 const secret=process.env.POCKET_SWAP_QUOTE_SECRET||''
 if(secret.length<32)throw Error('X Layer fee signing is unavailable.')
 return createHmac('sha256',secret).update('pocket:xlayer:reimbursement:v2:'+payload).digest()
}
export function sealXLayerReimbursement(q:XLayerFeeQuote){
 const payload=Buffer.from(JSON.stringify(q)).toString('base64url')
 return payload+'.'+mac(payload).toString('base64url')
}
export function openXLayerReimbursement(token:string,binding:XLayerFeeBinding,validatedCalls:XLayerCall[],now=Date.now()):XLayerFeeQuote{
 validateBinding(binding);validateCalls(validatedCalls)
 if(typeof token!=='string'||token.length>60000)invalid()
 const [payload,sig,extra]=token.split('.'),expected=mac(payload),actual=Buffer.from(sig||'','base64url')
 if(extra||actual.length!==expected.length||!timingSafeEqual(actual,expected))invalid()
 const q=JSON.parse(Buffer.from(payload,'base64url').toString()) as XLayerFeeQuote
 for(const field of Object.keys(binding) as (keyof XLayerFeeBinding)[])if(q[field]!==binding[field])invalid()
 if(q.version!==2||q.chainId!==196||!units(q.networkFeeUnits)||!units(q.totalUnits)||BigInt(q.totalUnits)!==BigInt(q.amountUnits)+BigInt(q.networkFeeUnits)||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt<=now||q.expiresAt<=q.issuedAt||q.expiresAt-q.issuedAt>30000||!q.estimateId)invalid()
 if(BigInt(q.networkFeeUnits)<BigInt(pricedFee('1',q.pricing)))invalid()
 if(JSON.stringify(q.calls)!==JSON.stringify(withReimbursement(validatedCalls,q.asset,q.networkFeeUnits)))invalid()
 return q
}

export async function refreshXLayerReimbursement(approved:XLayerFeeQuote,validatedCalls:XLayerCall[],estimate:XLayerFeeEstimator,now:()=>number=Date.now){
 const {ownerId,walletId,walletAddress,asset,amountUnits,intentId}=approved
 const binding={ownerId,walletId,walletAddress,asset,amountUnits,intentId}
 // Validate approved batch before refreshing. This is server-internal, not a
 // substitute for verifying an incoming quote token at the API boundary.
 openXLayerReimbursement(sealXLayerReimbursement(approved),binding,validatedCalls,now())
 // Estimate the exact approved batch: rebuilding with a lower reimbursement
 // changes signed calldata and violates the retained-quote pricing policy.
 const result=await estimate({...binding,calls:structuredClone(approved.calls)})
 if(!result.estimateId||result.estimateId.length>256||!Number.isSafeInteger(result.expiresAt)||Math.min(result.expiresAt,approved.expiresAt)<=now())invalid()
 if(BigInt(pricedFee(result.feeUnits,approved.pricing))>BigInt(approved.networkFeeUnits))throw Error('Network fee increased. Review the updated transfer.')
 return structuredClone(approved)
}
