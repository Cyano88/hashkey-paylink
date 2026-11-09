import {feeReserveObligations} from './fee-reserve.js'
import {createHash} from 'node:crypto'
import {getAddress,parseAbi,type PublicClient} from 'viem'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import type {MarketplaceStore} from './repository.js'

const abi=parseAbi(['function balanceOf(address account) view returns (uint256)'])
const integer=/^(0|[1-9]\d{0,30})$/
type Dependencies={read:()=>Promise<MarketplaceStore|undefined>;chain:Pick<PublicClient,'getChainId'|'getBlock'|'readContract'>;holding:{id:string;revision:string;address:string;billsAddress:string}}
/** A conservative point-in-time solvency check, not a reservation or permission
 * to spend. Unknown/submitted operations must reconcile before this can pass. */
export function createMarketplaceBackingCheck(input:Dependencies){
 const d={...input,holding:structuredClone(input.holding)}
 return async()=>{
  const address=getAddress(d.holding.address),bills=getAddress(d.holding.billsAddress)
  if(address===bills||/^0x0{40}$/i.test(address)||/^0x0{40}$/i.test(bills))throw Error('Backing check requires isolated holding and Bills identities.')
  if(await d.chain.getChainId()!==8453)throw Error('Backing check requires Base.')
  const before=await d.read(),fingerprint=(s:MarketplaceStore|undefined)=>createHash('sha256').update(JSON.stringify({books:s?.books??[],feeAccounts:s?.feeAccounts??[]})).digest('hex')
  if(!before)throw Error('Marketplace ledger is unavailable.')
  const finalized=await d.chain.getBlock({blockTag:'finalized'})
  if(finalized.number===null||!finalized.hash)throw Error('Finalized Base snapshot is unavailable.')
  let obligations=feeReserveObligations(before),books=0
  const blockers=new Set<string>()
  for(const book of before?.books??[]){
   if(!book.fundingEvidence){if(book.balances.some(b=>[b.pending,b.available,b.reserved,b.paid,b.refunded,b.feesAccrued??'0',b.feesFunded??'0'].some(v=>v!=='0'))||book.operations.length)blockers.add('unfunded_book_has_balances');continue}
   const origin=book.refundCollection,proof=book.collectionProof
   if(!origin||!proof||origin.fundingEvidenceId!==book.fundingEvidence||proof.evidenceId!==book.fundingEvidence){blockers.add('unverified_ledger_origin');continue}
   if(origin.holdingId!==d.holding.id||origin.holdingRevision!==d.holding.revision||getAddress(origin.holdingAddress)!==address){blockers.add('other_holding_requires_separate_reconciliation');continue}
   if(origin.asset!=='USDC'||book.plan.asset!=='USDC'||book.plan.network!=='base'||getAddress(origin.tokenAddress)!==getAddress(BASE_STABLECOINS.USDC.address)||origin.amountUnits!==book.plan.amountUnits){blockers.add('invalid_holding_asset');continue}
   if(!integer.test(proof.blockNumber)||BigInt(proof.blockNumber)>finalized.number)blockers.add('ledger_ahead_of_finalized_snapshot')
   if(book.operations.some(o=>o.status==='unknown')||[...(book.walletExecutions??[]),...(book.bankExecutions??[]),...(book.refundExecutions??[])].some(e=>['unknown','submitted'].includes(e.state)))blockers.add('unresolved_submission')
   if(new Set(book.plan.allocations.map(a=>a.id)).size!==book.plan.allocations.length||book.balances.length!==book.plan.allocations.length||new Set(book.balances.map(b=>b.allocationId)).size!==book.balances.length)throw Error('Invalid marketplace balance allocation set.')
   let total=0n
   for(const balance of book.balances){
    const allocation=book.plan.allocations.find(a=>a.id===balance.allocationId),values=[balance.pending,balance.available,balance.reserved,balance.paid,balance.refunded,balance.feesAccrued??'0',balance.feesFunded??'0']
    if(!allocation||!integer.test(allocation.amountUnits)||values.some(v=>typeof v!=='string'||!integer.test(v)))throw Error('Invalid marketplace balance units.')
    const numbers=values.map(BigInt)
    if(numbers.reduce((a,b)=>a+b,0n)!==BigInt(allocation.amountUnits))throw Error('Marketplace balance conservation failed.')
    total+=BigInt(allocation.amountUnits);obligations+=numbers[0]+numbers[1]+numbers[2]+numbers[5]
   }
   if(!integer.test(book.plan.amountUnits)||total!==BigInt(book.plan.amountUnits))throw Error('Marketplace allocation total mismatch.')
   books++
  }
  const balance=await d.chain.readContract({address:BASE_STABLECOINS.USDC.address,abi,functionName:'balanceOf',args:[address],blockNumber:finalized.number})
  const [canonical,after]=await Promise.all([d.chain.getBlock({blockNumber:finalized.number}),d.read()])
  if(!after)throw Error('Marketplace ledger became unavailable.')
  if(canonical.hash!==finalized.hash||canonical.number!==finalized.number)blockers.add('chain_snapshot_changed')
  if(fingerprint(before)!==fingerprint(after))blockers.add('ledger_changed_during_check')
  if(balance<obligations)blockers.add('insufficient_usdc_backing')
  return {backed:blockers.size===0,network:'base',asset:'USDC',holdingId:d.holding.id,holdingRevision:d.holding.revision,blockNumber:finalized.number.toString(),blockHash:finalized.hash,bookCount:books,obligationUnits:obligations.toString(),balanceUnits:balance.toString(),shortfallUnits:(balance<obligations?obligations-balance:0n).toString(),blockers:[...blockers]}
 }
}
