import {withBankQuoteRecovery} from './bank-quote-recovery.js'
import {approveBankGas,bankRequoteRequired} from './bank-gas-policy.js'
import {createMarketplacePayoutCancellation} from './payout-cancellation.js'
import {marketplaceBankReadiness,MarketplaceBankQuoteError} from './bank-readiness.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {readPaycrestOrderSnapshot} from '../paycrest-pos.js'
import {readMarketplaceRuntimeConfig} from './runtime.js'
import {marketplaceBankVerifier} from './seller-runtime.js'
import {createMarketplaceBankQuoteService,type BankQuoteRequests} from './bank-quote-service.js'
import {createMarketplacePaycrestQuoteVerifier} from './paycrest-quotes.js'
import {createMarketplaceGasQuotes,MarketplaceGasLimitError} from './gas-quotes.js'
import {createMarketplaceBackingCheck} from './backing.js'
import {requireMarketplaceGasCoverage} from './gas-coverage.js'
import {createMarketplaceExecutionAuthority} from './authorization.js'
import {createMarketplaceBankCustody} from './bank-custody.js'
import type {MarketplaceStore} from './repository.js'
import type {WithdrawalPlan} from './withdrawal-plan.js'
import type {MarketplaceBankQuote} from './bank-quotes.js'
const key='hashpaylink:marketplace-bank-quotes:v1'
const storage={read:()=>readDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1'),mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>mutateDurableJson<MarketplaceStore>('hashpaylink:marketplace-accounting-foundation:v1',s=>fn(s??{books:[],drafts:[]})),now:Date.now}
export function createMarketplaceBankRuntime(env:NodeJS.ProcessEnv,chain:Parameters<typeof createMarketplaceBackingCheck>[0]['chain'] & Parameters<typeof createMarketplaceBankCustody>[0]['chain']){
 const readiness=marketplaceBankReadiness(env)
 if(readiness.blockers.includes('gas_policy_not_configured'))throw new MarketplaceBankQuoteError({code:'MARKETPLACE_BANK_CONFIGURATION_REQUIRED',httpStatus:503,message:'Bank withdrawal gas limits are not configured. Your balance is retained.',details:{configurationChangeRequired:true}})
 const settings=readMarketplaceRuntimeConfig(env)
 if(env.MARKETPLACE_BANK_PAYOUTS_ENABLED!=='true'||settings.blockers.some(b=>b!=='worker_disabled'))throw Error('Marketplace bank withdrawal provider is not enabled.')
 const verifier=marketplaceBankVerifier(env),holding={id:settings.holdingId,revision:settings.holdingRevision,address:settings.config.treasuryAddress,billsAddress:settings.billsAddress},gas=createMarketplaceGasQuotes({config:settings.config,maximumFeeUnits:env.MARKETPLACE_MAX_NETWORK_FEE_UNITS||'',providerSurchargeBps:Number(env.MARKETPLACE_PROVIDER_SURCHARGE_BPS??'NaN')})
 const readBank=async(projectId:string,beneficiaryId:string)=>(await storage.read())?.bankBeneficiaries?.find(b=>b.projectId===projectId&&b.beneficiaryId===beneficiaryId)??null
 async function verifySeller(plan:WithdrawalPlan){const b=await readBank(plan.beneficiary.projectId,plan.beneficiary.beneficiaryId);if(!b||b.status!=='active'||plan.beneficiary.kind!=='bank'||b.sellerId!==plan.sellerId||b.destinationDigest!==plan.beneficiary.destinationDigest)throw Error('Seller bank binding changed.');const details=verifier.decrypt(b),fresh=await verifier.verify({projectId:b.projectId,sellerId:b.sellerId,beneficiaryId:b.beneficiaryId,bankCode:details.bankCode,accountNumber:details.accountNumber});if(fresh.destinationDigest!==b.destinationDigest||fresh.ownershipEvidenceId!==b.ownershipEvidenceId)throw Error('Seller bank verification changed.');return details}
 const verifyQuote=createMarketplacePaycrestQuoteVerifier({now:Date.now,holding,readBank,decrypt:verifier.decrypt})
 const quotes=createMarketplaceBankQuoteService({read:()=>readDurableJson<BankQuoteRequests>(key),mutate:fn=>mutateDurableJson<BankQuoteRequests>(key,s=>fn(s??{requests:[]})),now:Date.now,holding,verifySeller,networkFee:gas.networkFee,verifyQuote})
 const custody=createMarketplaceBankCustody({...storage,enabled:env.MARKETPLACE_BANK_WORKER_ENABLED==='true',config:settings.config,holdingId:settings.holdingId,holdingRevision:settings.holdingRevision,billsAddress:settings.billsAddress,projectIds:settings.projectIds,chain,authorize:createMarketplaceExecutionAuthority({env:()=>env}),verifyQuote,verifyBacking:createMarketplaceBackingCheck({read:storage.read,chain,holding}),verifySeller:async q=>{if(!q.withdrawal)throw Error('Bank withdrawal plan required.');await verifySeller(q.withdrawal)},verifyFees:async q=>{if(readiness.blockers.includes('commission_policy_not_verified'))throw new MarketplaceBankQuoteError({code:'MARKETPLACE_BANK_CONFIGURATION_REQUIRED',httpStatus:503,message:readiness.message,details:{configurationChangeRequired:true}});let fee:bigint;try{fee=await gas.networkFee(q.fundingAddress,q.fundingUnits)}catch(error){if(error instanceof MarketplaceGasLimitError)throw bankRequoteRequired();throw error}return approveBankGas(q,fee,units=>requireMarketplaceGasCoverage(settings,q.projectId,units,chain))},readOrder:readPaycrestOrderSnapshot,bankDetails:async q=>{const b=await readBank(q.projectId,q.beneficiaryId);if(!b||b.destinationDigest!==q.destinationDigest)throw Error('Bank record changed.');return verifier.decrypt(b)}})
 const submit=withBankQuoteRecovery(custody.submit,createMarketplacePayoutCancellation(storage),storage.read)
 return {quotes,...custody,submit,async drain(projectId:string,limit=5){if(!settings.projectIds.includes(projectId))throw Error('Bank worker project is not enabled.');const s=await storage.read(),items=(s?.books??[]).filter(b=>b.plan.projectId===projectId).flatMap(b=>(b.bankReservations??[]).filter(r=>b.operations.some(o=>o.id===r.quote.operationId&&['reserved','unknown'].includes(o.status))).map(r=>({book:b,q:r.quote}))).sort((a,b)=>(a.q.paymentId+':'+a.q.operationId).localeCompare(b.q.paymentId+':'+b.q.operationId));const cursor=s?.bankWorkerCursors?.[projectId]??'',rotated=[...items.filter(i=>i.q.paymentId+':'+i.q.operationId>cursor),...items.filter(i=>i.q.paymentId+':'+i.q.operationId<=cursor)].slice(0,limit);let deferred=0;for(const {book,q} of rotated){try{const a=book.bankExecutions?.filter(a=>a.operationId===q.operationId).at(-1);if(!a||a.state==='claimed'&&a.leaseUntil<=Date.now())await submit(projectId,q.paymentId,q.operationId,'marketplace-bank-worker');else await custody.reconcile(projectId,q.paymentId,q.operationId)}catch{deferred++}await storage.mutate(s=>{s.bankWorkerCursors={...s.bankWorkerCursors,[projectId]:q.paymentId+':'+q.operationId};return s})}return {checked:rotated.length,deferred}}}
}
