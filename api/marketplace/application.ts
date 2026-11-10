import {createPublicClient,http,getAddress} from 'viem'
import {base} from 'viem/chains'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {createMarketplaceRepository,type MarketplaceStore} from './repository.js'
import {createMarketplaceInstructions} from './instructions.js'
import {createMarketplacePrincipalResolver} from './authorization.js'
import {createMarketplaceCollectionRuntime,readMarketplaceRuntimeConfig} from './runtime.js'
import {createMarketplaceGasQuotes} from './gas-quotes.js'
import {marketplaceReference} from './beneficiaries.js'
import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import type {MarketplaceWalletQuote} from './wallet-quotes.js'
import type {AllocationInput} from './accounting.js'

export const marketplaceStorage={read:()=>readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1'),mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>mutateDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1',s=>fn(s??{books:[],drafts:[]})),now:Date.now}
export function marketplaceFields(value:unknown,names:string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==names.length||names.some(k=>!Object.hasOwn(value,k)))throw Error('Unexpected or missing marketplace instruction fields.')
 return structuredClone(value) as Record<string,unknown>
}
export function createMarketplaceApplication(env:NodeJS.ProcessEnv=process.env){
 if(env.MARKETPLACE_INSTRUCTIONS_ENABLED!=='true')throw Error('Marketplace instructions are not enabled.')
 const settings=readMarketplaceRuntimeConfig(env),chain=createPublicClient({transport:http(env.PRIVATE_RPC_URL||base.rpcUrls.default.http[0],{timeout:10000,retryCount:0})})
 const collections=createMarketplaceCollectionRuntime({env,chain}),gas=createMarketplaceGasQuotes({config:settings.config,maximumFeeUnits:env.MARKETPLACE_MAX_NETWORK_FEE_UNITS||'',providerSurchargeBps:Number(env.MARKETPLACE_PROVIDER_SURCHARGE_BPS??'NaN')})
 const quoteKey='hashpaylink:marketplace-wallet-quotes:v1'
 type Quotes={quotes:MarketplaceWalletQuote[]}
 const resolveQuote=async({projectId,paymentId,quoteId}:{projectId:string;paymentId:string;quoteId:string})=>(await readDurableJson<Quotes>(quoteKey))?.quotes.find(q=>q.projectId===projectId&&q.paymentId===paymentId&&q.quoteId===quoteId)||null
 const repository=createMarketplaceRepository({...marketplaceStorage,walletVerificationClient:chain,resolveWalletQuote:resolveQuote,resolveRefundCollection:collections.resolveRefundCollection})
 const resolvePrincipal=createMarketplacePrincipalResolver({env:()=>env})
 return createMarketplaceService({repository,resolvePrincipal,createCheckout:collections.createCheckout,quoteWallet:gas.wallet,saveQuote:q=>mutateDurableJson<Quotes>(quoteKey,s=>({quotes:[...(s?.quotes||[]).filter(x=>x.expiresAt>Date.now()),q]}))})
}
export function createMarketplaceService({repository,resolvePrincipal,createCheckout,quoteWallet,saveQuote}:{repository:ReturnType<typeof createMarketplaceRepository>;resolvePrincipal:ReturnType<typeof createMarketplacePrincipalResolver>;createCheckout:ReturnType<typeof createMarketplaceCollectionRuntime>['createCheckout'];quoteWallet:ReturnType<typeof createMarketplaceGasQuotes>['wallet'];saveQuote:(q:MarketplaceWalletQuote)=>Promise<unknown>}){
 const instructions=createMarketplaceInstructions({repository,resolvePrincipal,enabled:true,createCheckout})
 async function authorize(token:string,scope:string){const p=await resolvePrincipal(token);if(!p||p.active!==true||!p.capabilities.includes('marketplace_payments')||!p.scopes.includes(scope))throw Error('Marketplace authorization denied.');return p}
 return {...instructions,
  async createWithdrawalQuote(token:string,body:unknown){
   const v=marketplaceFields(body,['sellerId','role','beneficiaryId','operationId','amount'])
   const p=await authorize(token,'marketplace:payout')
   if(v.role!=='seller'&&v.role!=='platform')throw Error('Invalid withdrawal role.')
   const plan=await repository.planWithdrawal(p.projectId,marketplaceReference(v.sellerId),v.role,marketplaceReference(v.beneficiaryId),marketplaceAmountUnits(v.amount as string))
   if(plan.beneficiary.kind!=='wallet')throw Error('Marketplace bank withdrawal provider is not enabled.')
   const first=plan.sources[0]
   const q=await quoteWallet({projectId:p.projectId,paymentId:first.paymentId,allocationId:first.allocationId,operationId:marketplaceReference(v.operationId),beneficiaryId:plan.beneficiary.beneficiaryId,recipient:getAddress(plan.beneficiary.address),debitUnits:marketplaceAmountUnits(v.amount as string)})
   q.withdrawal=plan
   await saveQuote(q)
   const disclosure=await instructions.walletPayoutQuote(token,{paymentId:q.paymentId,quoteId:q.quoteId})
   return {...disclosure,sellerId:plan.sellerId,role:plan.role,sourceCount:plan.sources.length}
  },
  async beginWallet(token:string,body:unknown){
   const p=await authorize(token,'marketplace:create'),v=marketplaceFields(body,['sellerId','beneficiaryId','address'])
   if(typeof v.address!=='string')throw Error('Invalid wallet address.')
   return repository.beginWalletVerification({projectId:p.projectId,sellerId:marketplaceReference(v.sellerId),beneficiaryId:marketplaceReference(v.beneficiaryId),address:v.address,asset:'USDC'})
  },
  async verifyWallet(token:string,beneficiaryId:string,body:unknown){
   const p=await authorize(token,'marketplace:create'),v=marketplaceFields(body,['nonce','signature'])
   if(typeof v.nonce!=='string'||typeof v.signature!=='string')throw Error('Invalid verification signature.')
   const b=await repository.verifyWallet(p.projectId,marketplaceReference(beneficiaryId),v.nonce,v.signature)
   return {beneficiaryId:b.beneficiaryId,sellerId:b.sellerId,address:b.address,asset:b.asset,network:b.network,status:b.status}
  },
  async revokeWallet(token:string,beneficiaryId:string){const p=await authorize(token,'marketplace:create');await repository.revokeWallet(p.projectId,marketplaceReference(beneficiaryId));return {beneficiaryId,status:'revoked'}},
  async createPayment(token:string,key:string,body:unknown){
   const p=await authorize(token,'marketplace:create'),v=marketplaceFields(body,['paymentId','amount','allocations'])
   if(typeof v.amount!=='string'||!Array.isArray(v.allocations)||v.allocations.length<1||v.allocations.length>100)throw Error('Invalid marketplace allocations.')
   const allocations=v.allocations.map(a=>{
    const x=marketplaceFields(a,['id','sellerId','role','amount','beneficiaryId'])
    if(!['seller','platform'].includes(String(x.role))||typeof x.amount!=='string')throw Error('Invalid allocation role or amount.')
    return {id:marketplaceReference(x.id),sellerId:marketplaceReference(x.sellerId),role:x.role,amount:x.amount,beneficiaryId:marketplaceReference(x.beneficiaryId),settlement:'wallet_usdc'} as AllocationInput
   })
   const b=await repository.createWithVerifiedWallets({projectId:p.projectId,paymentId:marketplaceReference(v.paymentId),asset:'USDC',network:'base',amount:v.amount,allocations},marketplaceReference(key))
   return {plan:b.plan,balances:b.balances,funded:!!b.fundingEvidence}
  },
  async createWalletQuote(token:string,paymentId:string,body:unknown){
   const p=await authorize(token,'marketplace:payout'),v=marketplaceFields(body,['operationId','allocationId','amount'])
   const b=await repository.get(p.projectId,marketplaceReference(paymentId)),allocationId=marketplaceReference(v.allocationId),operationId=marketplaceReference(v.operationId)
   if(!b||b.plan.asset!=='USDC'||!b.fundingEvidence)throw Error('Funded Base USDC payment not found.')
   const a=b.plan.allocations.find(a=>a.id===allocationId),beneficiary=b.beneficiarySnapshots?.find(x=>x.beneficiaryId===a?.beneficiaryId)
   if(!a||a.settlement!=='wallet_usdc'||beneficiary?.kind!=='wallet')throw Error('Verified wallet beneficiary not found.')
   const debitUnits=marketplaceAmountUnits(v.amount as string)
   if(BigInt(b.balances.find(x=>x.allocationId===allocationId)?.available||'0')<BigInt(debitUnits))throw Error('Insufficient released funds.')
   const q=await quoteWallet({projectId:p.projectId,paymentId,operationId,allocationId,beneficiaryId:a.beneficiaryId,recipient:getAddress(beneficiary.address),debitUnits})
   await saveQuote(q)
   // Re-check current beneficiary status and released funds after the provider estimate.
   return instructions.walletPayoutQuote(token,{paymentId,quoteId:q.quoteId})
  },
 }
}
