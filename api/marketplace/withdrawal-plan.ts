import {createHash} from 'node:crypto'
import {getAddress} from 'viem'
import {marketplaceReference} from './beneficiaries.js'
import type {WalletBeneficiary} from './beneficiaries.js'
import type {BankBeneficiary} from './bank-beneficiaries.js'
import type {MarketplaceStore} from './repository.js'
export type WithdrawalPlan={sellerId:string;role:'seller'|'platform';beneficiary:WalletBeneficiary|BankBeneficiary;sources:Array<{paymentId:string;allocationId:string;units:string}>}
export function validateWithdrawalPlan(plan:WithdrawalPlan,projectId:string,paymentId:string,allocationId:string,beneficiaryId:string,debitUnits:string){
 const p=structuredClone(plan);marketplaceReference(p.sellerId)
 if(!['seller','platform'].includes(p.role)||!Array.isArray(p.sources)||!p.sources.length||p.sources.length>100)throw Error('Invalid withdrawal source plan.')
 const b=p.beneficiary
 if(!b||b.projectId!==projectId||b.sellerId!==p.sellerId||b.beneficiaryId!==beneficiaryId||b.status!=='active'||b.asset!=='USDC'||b.network!=='base'||!['wallet','bank'].includes(b.kind))throw Error('Invalid withdrawal recipient binding.')
 const seen=new Set<string>();let total=0n
 for(const s of p.sources){marketplaceReference(s.paymentId);marketplaceReference(s.allocationId);const key=JSON.stringify([s.paymentId,s.allocationId]);if(seen.has(key)||typeof s.units!=='string'||!/^[1-9]\d{0,23}$/.test(s.units))throw Error('Invalid or duplicate withdrawal source.');seen.add(key);total+=BigInt(s.units)}
 if(total.toString()!==debitUnits||p.sources[0].paymentId!==paymentId||p.sources[0].allocationId!==allocationId)throw Error('Withdrawal source total or anchor changed.')
 return p
}
export function withdrawalSourceOperation(parent:string,index:number){return index===0?parent:'withdrawal-source:'+createHash('sha256').update(parent+':'+index).digest('hex')}
export function selectWithdrawalSources(store:MarketplaceStore|undefined,projectId:string,sellerId:string,role:'seller'|'platform',beneficiaryId:string,debitUnits:string):WithdrawalPlan{
 for(const id of [projectId,sellerId,beneficiaryId])marketplaceReference(id)
 if(!['seller','platform'].includes(role)||!/^[1-9]\d{0,23}$/.test(debitUnits))throw Error('Invalid withdrawal role or amount.')
 const beneficiary=[...(store?.walletBeneficiaries??[]),...(store?.bankBeneficiaries??[])].find(b=>b.projectId===projectId&&b.beneficiaryId===beneficiaryId)
 if(!beneficiary||beneficiary.sellerId!==sellerId||beneficiary.status!=='active'||beneficiary.asset!=='USDC'||beneficiary.network!=='base')throw Error('Withdrawal beneficiary is no longer eligible.')
 let remaining=BigInt(debitUnits);const sources:WithdrawalPlan['sources']=[]
 const books=[...(store?.books??[])].filter(b=>b.plan.projectId===projectId&&b.plan.asset==='USDC'&&b.plan.network==='base'&&b.fundingEvidence&&(!b.collectionStatus||b.collectionStatus==='finalized')).sort((a,b)=>a.plan.paymentId.localeCompare(b.plan.paymentId))
 for(const book of books)for(const a of book.plan.allocations){if(!remaining)break;if(a.sellerId!==sellerId||a.role!==role)continue;const available=BigInt(book.balances.find(b=>b.allocationId===a.id)?.available??'0');const units=available<remaining?available:remaining;if(units>0n){sources.push({paymentId:book.plan.paymentId,allocationId:a.id,units:units.toString()});remaining-=units}}
 if(remaining>0n)throw Error('Insufficient released funds for withdrawal.')
 if(sources.length>100)throw Error('Withdrawal exceeds 100 source allocations; request a smaller amount.')
 return validateWithdrawalPlan({sellerId,role,beneficiary:structuredClone(beneficiary),sources},projectId,sources[0].paymentId,sources[0].allocationId,beneficiaryId,debitUnits)
}
export function currentWithdrawalBeneficiary(store:MarketplaceStore,projectId:string,plan:WithdrawalPlan){
 const b=plan.beneficiary,c=[...(store.walletBeneficiaries??[]),...(store.bankBeneficiaries??[])].find(x=>x.projectId===projectId&&x.beneficiaryId===b.beneficiaryId)
 if(!c||c.status!=='active'||c.sellerId!==plan.sellerId||c.kind!==b.kind||c.asset!==b.asset||c.network!==b.network||(c.kind==='wallet'&&b.kind==='wallet'?getAddress(c.address)!==getAddress(b.address):c.kind==='bank'&&b.kind==='bank'?c.destinationDigest!==b.destinationDigest||!c.ownershipEvidenceId:true))throw Error('Withdrawal beneficiary is no longer eligible.')
 return b
}
