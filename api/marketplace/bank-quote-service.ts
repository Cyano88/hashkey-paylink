import {MARKETPLACE_BANK_COMMISSION_BPS,marketplaceBankCommission,assertMarketplaceBankCommission} from './bank-commission.js'
import {MarketplaceBankQuoteError,type BankQuoteFailure} from './bank-readiness.js'
import {createHash,randomUUID} from 'node:crypto'
import {formatUnits,parseUnits} from 'viem'
import {createMarketplacePaycrestOrder} from '../paycrest-pos.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {assertMarketplaceWithdrawalMinimum} from '../../src/lib/marketplaceWithdrawalPolicy.js'
import {validateMarketplaceBankQuote,type MarketplaceBankQuote} from './bank-quotes.js'
import type {WithdrawalPlan} from './withdrawal-plan.js'
import type {BankDetails} from './bank-beneficiaries.js'
export type BankQuoteRequests={requests:Array<{id:string;projectId:string;operationId:string;fingerprint:string;state:'creating'|'ready'|'failed';providerOrderIds:string[];sellerId?:string;failedAt?:number;failure?:BankQuoteFailure;quote?:MarketplaceBankQuote}>}
export type BankQuoteInput={projectId:string;operationId:string;debitUnits:string;plan:WithdrawalPlan}
type Dependencies={read:()=>Promise<BankQuoteRequests|undefined>;mutate:(fn:(s:BankQuoteRequests)=>BankQuoteRequests)=>Promise<BankQuoteRequests>;now:()=>number;holding:{id:string;revision:string;address:string};verifySeller:(plan:WithdrawalPlan)=>Promise<BankDetails>;networkFee:(address:string,units:string)=>Promise<bigint>;verifyQuote:(q:MarketplaceBankQuote)=>Promise<MarketplaceBankQuote>;createOrder?:typeof createMarketplacePaycrestOrder}
const decimal=(v:unknown,d=6)=>{if(typeof v!=='string'||!new RegExp('^(0|[1-9]\\d*)(?:\\.\\d{1,'+d+'})?$').test(v))throw Error('Invalid provider decimal.');return parseUnits(v,d)}
export function createMarketplaceBankQuoteService(d:Dependencies){
 return {async quote(input:BankQuoteInput){
  const i=structuredClone(input),bank=i.plan.beneficiary,first=i.plan.sources[0]
  if(bank.kind!=='bank'||!first)throw Error('Verified bank withdrawal required.')
  assertMarketplaceWithdrawalMinimum('bank',i.debitUnits)
  const details=await d.verifySeller(i.plan),fingerprint=createHash('sha256').update(JSON.stringify(i)).digest('hex'),id=randomUUID()
  const prior=(await d.read())?.requests.find(r=>r.projectId===i.projectId&&r.operationId===i.operationId)
  if(prior){if(prior.fingerprint!==fingerprint)throw Error('Bank quote operation was used for different terms.');if(prior.failure)throw new MarketplaceBankQuoteError(prior.failure);if(prior.state==='ready'&&prior.quote)return d.verifyQuote(prior.quote);throw Error('Bank quote creation is unresolved or failed. Use a new operation reference; the old request cannot be funded.')}
  await d.mutate(s=>{if(s.requests.some(r=>r.projectId===i.projectId&&r.operationId===i.operationId))throw Error('Bank quote creation already started.');s.requests.push({sellerId:i.plan.sellerId,id,projectId:i.projectId,operationId:i.operationId,fingerprint,state:'creating',providerOrderIds:[]});return s})
  try{
   let principal=BigInt(i.debitUnits),network=0n
   // Unfunded trial orders expire at the provider. Only the final validated quote
   // is accepted by the resolver; a lost POST response is never blindly retried.
   for(let attempt=0;attempt<3;attempt++){
    assertMarketplaceWithdrawalMinimum('bank',principal.toString())
    const raw=await (d.createOrder??createMarketplacePaycrestOrder)({reference:'marketplace-'+id+'-'+attempt,amount:formatUnits(principal,6),refundAddress:d.holding.address,...details}) as any
    if(typeof raw?.id!=='string')throw Error('Provider order ID missing.')
    await d.mutate(s=>{s.requests.find(r=>r.id===id)!.providerOrderIds.push(raw.id);return s})
    const net=decimal(raw.amount),providerFee=decimal(raw.transactionFee),senderFee=decimal(raw.senderFee),funding=net+senderFee+providerFee,rate=decimal(raw.rate,18)
    try{assertMarketplaceBankCommission(net,senderFee,raw.senderFeePercent,'fixed_units')}catch{throw new MarketplaceBankQuoteError({code:'MARKETPLACE_BANK_COMMISSION_MISMATCH',httpStatus:503,message:'Bank withdrawal commission does not match the approved 0.3% policy. Request corrected provider terms before payout.',details:{asset:'USDC',route:'bank',commissionUnits:senderFee.toString(),commissionRateBps:String(MARKETPLACE_BANK_COMMISSION_BPS),providerFeeUnits:providerFee.toString(),requestedDebitUnits:i.debitUnits,configurationChangeRequired:true}})}
    if(net!==principal||raw.providerAccount?.memo)throw Error('Provider quote changed the requested principal or fee policy.')
    // Like wallet quotes, retain the largest bounded network estimate during
    // this quote. A falling estimate must not restart the budget calculation.
    const estimatedNetwork=await d.networkFee(raw.providerAccount.receiveAddress,funding.toString())
    if(estimatedNetwork>network)network=estimatedNetwork
    const debit=funding+network,budget=BigInt(i.debitUnits)
    if(debit>budget){const minimumCommission=marketplaceBankCommission(1000000n),required=1000000n+minimumCommission+providerFee+network;if(budget<required)throw new MarketplaceBankQuoteError({code:'MARKETPLACE_BANK_FEE_SHORTFALL',httpStatus:400,message:'Available withdrawal amount does not cover the bank minimum, 0.3% commission and estimated fees. Accumulate more funds and request a fresh quote.',details:{asset:'USDC',route:'bank',requestedDebitUnits:i.debitUnits,minimumNetUnits:'1000000',commissionUnits:senderFee.toString(),minimumCommissionUnits:minimumCommission.toString(),commissionRateBps:String(MARKETPLACE_BANK_COMMISSION_BPS),providerFeeUnits:providerFee.toString(),networkFeeUnits:network.toString(),estimatedRequiredDebitUnits:required.toString(),estimatedShortfallUnits:(required-budget).toString(),estimateOnly:true,quoteRequired:true}});principal=(budget-providerFee-network)*10000n/(10000n+BigInt(MARKETPLACE_BANK_COMMISSION_BPS));
     // Correct the integer inverse before creating another provider order.
     // A floor division alone can leave a one-micro-USDC shortfall.
     while(principal+1n+marketplaceBankCommission(principal+1n)<=budget-providerFee-network)principal++
     while(principal+marketplaceBankCommission(principal)>budget-providerFee-network)principal--
     continue}
    // Debit exactly the accepted amount. A smaller provider fee requires a new
    // quote iteration rather than silently retaining surplus as a platform fee.
    if(debit<budget){principal+=budget-debit;continue}
    const ngn=((net*rate+5n*10n**21n)/10n**22n).toString()
    const q=await d.verifyQuote(validateMarketplaceBankQuote({withdrawal:i.plan,quoteId:id,projectId:i.projectId,paymentId:first.paymentId,allocationId:first.allocationId,operationId:i.operationId,beneficiaryId:bank.beneficiaryId,destinationDigest:bank.destinationDigest,provider:'paycrest',providerOrderId:raw.id,intentId:id,network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,currency:'NGN',debitUnits:i.debitUnits,fundingUnits:funding.toString(),netUnits:net.toString(),commissionUnits:senderFee.toString(),commissionRateBps:MARKETPLACE_BANK_COMMISSION_BPS,commissionMode:'fixed_units',feeUnits:(senderFee+providerFee).toString(),maximumFeeUnits:(senderFee+providerFee+network).toString(),networkFeeUnits:network.toString(),exchangeRate:raw.rate,feePolicy:'fixed_success_only',feePayer:'allocation',ngnMinor:ngn,requestedNgnMinor:ngn,holdingId:d.holding.id,holdingRevision:d.holding.revision,refundAddress:d.holding.address,fundingAddress:raw.providerAccount.receiveAddress,issuedAt:d.now(),expiresAt:Date.parse(raw.providerAccount.validUntil),status:'initiated',submitted:false},d.now()))
    await d.mutate(s=>{const r=s.requests.find(r=>r.id===id)!;if(r.state!=='creating')throw Error('Bank quote state changed.');r.quote=q;r.state='ready';return s});return q
   }
   throw Error('Provider fees changed repeatedly. Request a new quote.')
  }catch(error){await d.mutate(s=>{const r=s.requests.find(r=>r.id===id)!;r.state='failed';r.failedAt=d.now();if(error instanceof MarketplaceBankQuoteError)r.failure=error.failure;return s});throw error}
 },async resolve(projectId:string,paymentId:string,quoteId:string){const q=(await d.read())?.requests.find(r=>r.projectId===projectId&&r.id===quoteId&&r.state==='ready')?.quote;if(!q||q.paymentId!==paymentId)return null;await d.verifySeller(q.withdrawal!);return d.verifyQuote(q)}}
}
