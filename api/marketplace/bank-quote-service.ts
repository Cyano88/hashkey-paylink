import {createHash,randomUUID} from 'node:crypto'
import {formatUnits,parseUnits} from 'viem'
import {createMarketplacePaycrestOrder} from '../paycrest-pos.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {assertMarketplaceWithdrawalMinimum} from '../../src/lib/marketplaceWithdrawalPolicy.js'
import {validateMarketplaceBankQuote,type MarketplaceBankQuote} from './bank-quotes.js'
import type {WithdrawalPlan} from './withdrawal-plan.js'
import type {BankDetails} from './bank-beneficiaries.js'
export type BankQuoteRequests={requests:Array<{id:string;projectId:string;operationId:string;fingerprint:string;state:'creating'|'ready'|'failed';providerOrderIds:string[];quote?:MarketplaceBankQuote}>}
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
  if(prior){if(prior.fingerprint!==fingerprint)throw Error('Bank quote operation was used for different terms.');if(prior.state==='ready'&&prior.quote)return d.verifyQuote(prior.quote);throw Error('Bank quote creation is unresolved or failed. Use a new operation reference; the old request cannot be funded.')}
  await d.mutate(s=>{if(s.requests.some(r=>r.projectId===i.projectId&&r.operationId===i.operationId))throw Error('Bank quote creation already started.');s.requests.push({id,projectId:i.projectId,operationId:i.operationId,fingerprint,state:'creating',providerOrderIds:[]});return s})
  try{
   let principal=BigInt(i.debitUnits)
   // Unfunded trial orders expire at the provider. Only the final validated quote
   // is accepted by the resolver; a lost POST response is never blindly retried.
   for(let attempt=0;attempt<3;attempt++){
    assertMarketplaceWithdrawalMinimum('bank',principal.toString())
    const raw=await (d.createOrder??createMarketplacePaycrestOrder)({reference:'marketplace-'+id+'-'+attempt,amount:formatUnits(principal,6),refundAddress:d.holding.address,...details}) as any
    if(typeof raw?.id!=='string')throw Error('Provider order ID missing.')
    await d.mutate(s=>{s.requests.find(r=>r.id===id)!.providerOrderIds.push(raw.id);return s})
    const net=decimal(raw.amount),providerFee=decimal(raw.transactionFee),senderFee=decimal(raw.senderFee),funding=net+providerFee,rate=decimal(raw.rate,18)
    if(net!==principal||senderFee!==0n||raw.providerAccount?.memo)throw Error('Provider quote changed the requested principal or fee policy.')
    const network=await d.networkFee(raw.providerAccount.receiveAddress,funding.toString()),debit=funding+network,budget=BigInt(i.debitUnits)
    if(debit>budget){principal=budget-providerFee-network;continue}
    // Debit exactly the accepted amount. A smaller provider fee requires a new
    // quote iteration rather than silently retaining surplus as a platform fee.
    if(debit<budget){principal+=budget-debit;continue}
    const ngn=((net*rate+5n*10n**21n)/10n**22n).toString()
    const q=await d.verifyQuote(validateMarketplaceBankQuote({withdrawal:i.plan,quoteId:id,projectId:i.projectId,paymentId:first.paymentId,allocationId:first.allocationId,operationId:i.operationId,beneficiaryId:bank.beneficiaryId,destinationDigest:bank.destinationDigest,provider:'paycrest',providerOrderId:raw.id,intentId:id,network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,currency:'NGN',debitUnits:i.debitUnits,fundingUnits:funding.toString(),netUnits:net.toString(),feeUnits:providerFee.toString(),maximumFeeUnits:(providerFee+network).toString(),networkFeeUnits:network.toString(),exchangeRate:raw.rate,feePolicy:'fixed_success_only',feePayer:'allocation',ngnMinor:ngn,requestedNgnMinor:ngn,holdingId:d.holding.id,holdingRevision:d.holding.revision,refundAddress:d.holding.address,fundingAddress:raw.providerAccount.receiveAddress,issuedAt:d.now(),expiresAt:Date.parse(raw.providerAccount.validUntil),status:'initiated',submitted:false},d.now()))
    await d.mutate(s=>{const r=s.requests.find(r=>r.id===id)!;if(r.state!=='creating')throw Error('Bank quote state changed.');r.quote=q;r.state='ready';return s});return q
   }
   throw Error('Provider fees changed repeatedly. Request a new quote.')
  }catch(error){await d.mutate(s=>{const r=s.requests.find(r=>r.id===id)!;r.state='failed';return s});throw error}
 },async resolve(projectId:string,paymentId:string,quoteId:string){const q=(await d.read())?.requests.find(r=>r.projectId===projectId&&r.id===quoteId&&r.state==='ready')?.quote;if(!q||q.paymentId!==paymentId)return null;await d.verifySeller(q.withdrawal!);return d.verifyQuote(q)}}
}
