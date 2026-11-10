import {createMarketplaceFeeReserve,type FeeAccount} from './fee-reserve.js'
import {createMarketplaceCollections} from './collections.js'
import {createHash} from 'node:crypto'
import {assertMarketplaceWithdrawalMinimum} from '../../src/lib/marketplaceWithdrawalPolicy.js'
import {createMarketplacePayoutCancellation} from './payout-cancellation.js'
import {createMarketplaceRefundWorker} from './refund-worker.js'
import {createMarketplaceRefundExecution} from './refund-execution.js'
import {createMarketplaceRefunds} from './refunds.js'
import {createMarketplaceWalletReconciliation} from './wallet-reconciliation.js'
import {createMarketplaceWalletExecution} from './wallet-execution.js'
import {createMarketplaceWalletPayouts} from './wallet-payouts.js'
import {createMarketplaceWebhooks} from './webhooks.js'
import {createMarketplaceBankExecution} from './bank-execution.js'
import {createMarketplaceBankReconciliation} from './bank-reconciliation.js'
import {validateMarketplaceBankQuote,type MarketplaceBankQuote,type BankQuoteAuthorization} from './bank-quotes.js'
import type {BankBeneficiary,BankRequest} from './bank-beneficiaries.js'
import {marketplaceReference, walletChallenge, walletChallengeMessage, verifyWalletChallenge, type WalletChallenge, type WalletBeneficiary, type WalletBeneficiaryRequest} from './beneficiaries.js'
import {mutateDurableJson,readDurableJson} from '../render-durable-store.js'
import {applyMarketplaceCommand,createMarketplaceBook,createMarketplacePlan,marketplaceSellerBalances,type MarketplaceBook,type MarketplaceCommand} from './accounting.js'

// No server route imports this foundation. Live funding/signing is deliberately absent.
const KEY='hashpaylink:marketplace-accounting-foundation:v1'
export type MarketplaceStore={feeAccounts?:FeeAccount[];walletWorkerCursors?:Record<string,string>;refundWorkerCursors?:Record<string,string>;books:MarketplaceBook[];drafts:Array<{projectId:string;key:string;paymentId:string;hash:string}>;walletChallenges?:WalletChallenge[];walletBeneficiaries?:WalletBeneficiary[];bankBeneficiaries?:BankBeneficiary[]}
const empty=():MarketplaceStore=>({books:[],drafts:[]})
type Dependencies={resolveWalletQuote?:Parameters<typeof createMarketplaceWalletPayouts>[0]['resolveWalletQuote'];collectionVerification?:Omit<Parameters<typeof createMarketplaceCollections>[0],'read'|'mutate'|'now'>;walletVerificationClient?:Parameters<typeof verifyWalletChallenge>[3];refundExecution?:Omit<Parameters<typeof createMarketplaceRefundExecution>[0],'read'|'mutate'|'now'>;read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(store:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;verifyBank?:(input:BankRequest)=>Promise<BankBeneficiary>;resolveBankQuote?:(input:{projectId:string;paymentId:string;quoteId:string})=>Promise<MarketplaceBankQuote|null>;preflightBankExecution?:Parameters<typeof createMarketplaceBankExecution>[0]['preflightBankExecution'];verifyBankOutcome?:Parameters<typeof createMarketplaceBankReconciliation>[0]['verifyBankOutcome'];notifyMarketplace?:Parameters<typeof createMarketplaceWebhooks>[0]['notifyMarketplace'];preflightWalletExecution?:Parameters<typeof createMarketplaceWalletExecution>[0]['preflightWalletExecution'];verifyWalletOutcome?:Parameters<typeof createMarketplaceWalletReconciliation>[0]['verifyWalletOutcome'];resolveRefundCollection?:Parameters<typeof createMarketplaceRefunds>[0]['resolveRefundCollection']}
const defaults:Dependencies={read:()=>readDurableJson<MarketplaceStore>(KEY),mutate:fn=>mutateDurableJson<MarketplaceStore>(KEY,current=>fn(current||empty())),now:Date.now}
export function createMarketplaceRepository(dependencies:Partial<Dependencies>={}){
 const d={...defaults,...dependencies}
 const collections=d.collectionVerification?createMarketplaceCollections({...d.collectionVerification,read:d.read,mutate:d.mutate,now:d.now}):undefined
 const refundExecution=d.refundExecution?createMarketplaceRefundExecution({...d.refundExecution,read:d.read,mutate:d.mutate,now:d.now}):undefined
 const webhooks=createMarketplaceWebhooks(d)
 async function create(input:Parameters<typeof createMarketplacePlan>[0],key:string,bindWallets:boolean|'all'){
   if(!/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/.test(key))throw Error('Invalid idempotency key.')
   const plan=createMarketplacePlan(input),hash=createHash('sha256').update(JSON.stringify(bindWallets?{plan,bindWallets}:plan)).digest('hex')
   const store=await d.mutate(s=>{
    const replay=s.drafts.find(x=>x.projectId===plan.projectId&&x.key===key)
    if(replay){if(replay.hash!==hash)throw Error('Idempotency key was used for a different draft.');return s}
    if(s.books.some(b=>b.plan.projectId===plan.projectId&&b.plan.paymentId===plan.paymentId))throw Error('Payment reference already exists.')
    const book=createMarketplaceBook(plan)
    if(bindWallets){
     book.beneficiarySnapshots=plan.allocations.map(a=>{
      if(a.settlement==='cash_balance'&&bindWallets!=='all')throw Error('Verified bank beneficiary binding requires createWithVerifiedBeneficiaries.')
      const directory=a.settlement==='cash_balance'?s.bankBeneficiaries:s.walletBeneficiaries
      const beneficiary=directory?.find(b=>b.projectId===plan.projectId&&b.beneficiaryId===a.beneficiaryId)
      if(!beneficiary||beneficiary.status!=='active'||beneficiary.sellerId!==a.sellerId||beneficiary.asset!==plan.asset||beneficiary.network!==plan.network)throw Error('Allocation requires an active, matching verified wallet beneficiary.')
      return structuredClone(beneficiary)
     })
    }
    s.books.push(book);s.drafts.push({projectId:plan.projectId,key,paymentId:plan.paymentId,hash});return s
   })
   return structuredClone(store.books.find(b=>b.plan.projectId===plan.projectId&&b.plan.paymentId===plan.paymentId)!)
  }
 return {
  feeReserve:createMarketplaceFeeReserve(d),
  collections,
  refunds:createMarketplaceRefunds({...d,resolveRefundCollection:d.resolveRefundCollection??collections?.resolveRefundCollection}),
  cancelPayout:createMarketplacePayoutCancellation(d),
  refundExecution,
  refundWorker:createMarketplaceRefundWorker({...d,execution:refundExecution,webhooks}),
  walletReconciliation:createMarketplaceWalletReconciliation(d),
  walletExecution:createMarketplaceWalletExecution(d),
  walletPayouts:createMarketplaceWalletPayouts(d),
  webhooks,
  bankExecution:createMarketplaceBankExecution(d),
  bankReconciliation:createMarketplaceBankReconciliation(d),
  // Legacy unbound creation remains internal fixture infrastructure, not activation-ready.
  create:(input:Parameters<typeof createMarketplacePlan>[0],key:string)=>create(input,key,false),
  createWithVerifiedWallets:(input:Parameters<typeof createMarketplacePlan>[0],key:string)=>create(input,key,true),
  createWithVerifiedBeneficiaries:(input:Parameters<typeof createMarketplacePlan>[0],key:string)=>create(input,key,'all'),
  async registerBank(input:BankRequest){
   if(!d.verifyBank)throw Error('Seller bank verification is not configured.')
   const request=structuredClone(input),record=await d.verifyBank(request)
   if(record.projectId!==request.projectId||record.sellerId!==request.sellerId||record.beneficiaryId!==request.beneficiaryId||record.kind!=='bank'||record.asset!=='USDC'||record.network!=='base'||record.currency!=='NGN'||record.status!=='active')throw Error('Bank verification binding mismatch.')
   await d.mutate(s=>{
    if([...(s.bankBeneficiaries||[]),...(s.walletBeneficiaries||[])].some(b=>b.projectId===record.projectId&&b.beneficiaryId===record.beneficiaryId)||s.walletChallenges?.some(c=>c.projectId===record.projectId&&c.beneficiaryId===record.beneficiaryId))throw Error('Beneficiary version already exists; use a new reference.')
    s.bankBeneficiaries=[...(s.bankBeneficiaries||[]),structuredClone(record)];return s
   })
   return {beneficiaryId:record.beneficiaryId,sellerId:record.sellerId,kind:record.kind,currency:record.currency,last4:record.last4,status:record.status}
  },
  async revokeBank(projectId:string,beneficiaryId:string){
   marketplaceReference(projectId);marketplaceReference(beneficiaryId)
   await d.mutate(s=>{const record=s.bankBeneficiaries?.find(b=>b.projectId===projectId&&b.beneficiaryId===beneficiaryId);if(!record)throw Error('Beneficiary not found.');record.status='revoked';return s})
  },
  /** Trusted caller must establish project/seller authority before requesting a challenge. */
  async beginWalletVerification(input:WalletBeneficiaryRequest){
   const challenge=walletChallenge(input,d.now())
   await d.mutate(s=>{
    if([...(s.walletBeneficiaries||[]),...(s.bankBeneficiaries||[])].some(b=>b.projectId===challenge.projectId&&b.beneficiaryId===challenge.beneficiaryId))throw Error('Beneficiary version already exists; use a new reference.')
    s.walletChallenges=(s.walletChallenges||[]).filter(c=>c.expiresAt>d.now()&&!(c.projectId===challenge.projectId&&c.beneficiaryId===challenge.beneficiaryId))
    s.walletChallenges.push(challenge);return s
   })
   return {nonce:challenge.nonce,message:walletChallengeMessage(challenge),expiresAt:challenge.expiresAt}
  },
  async verifyWallet(projectId:string,beneficiaryId:string,nonce:string,signature:string){
   marketplaceReference(projectId);marketplaceReference(beneficiaryId)
   const challenge=(await d.read())?.walletChallenges?.find(c=>c.projectId===projectId&&c.beneficiaryId===beneficiaryId&&c.nonce===nonce)
   if(!challenge)throw Error('Wallet verification challenge not found.')
   await verifyWalletChallenge(challenge,signature,d.now(),d.walletVerificationClient)
   const store=await d.mutate(s=>{
    if(!s.walletChallenges?.some(c=>c.projectId===projectId&&c.beneficiaryId===beneficiaryId&&c.nonce===nonce))throw Error('Wallet verification challenge was replaced or consumed.')
    const now=d.now()
    if(now<challenge.issuedAt||now>=challenge.expiresAt)throw Error('Wallet verification challenge expired.')
    if(s.walletBeneficiaries?.some(b=>b.projectId===projectId&&b.beneficiaryId===beneficiaryId))throw Error('Beneficiary version already exists.')
    const {nonce:_nonce,issuedAt:_issued,expiresAt:_expires,...binding}=challenge
    s.walletBeneficiaries=[...(s.walletBeneficiaries||[]),{...binding,kind:'wallet',verifiedAt:now,status:'active'}]
    s.walletChallenges=s.walletChallenges.filter(c=>!(c.projectId===projectId&&c.beneficiaryId===beneficiaryId));return s
   })
   return structuredClone(store.walletBeneficiaries!.find(b=>b.projectId===projectId&&b.beneficiaryId===beneficiaryId)!)
  },
  async revokeWallet(projectId:string,beneficiaryId:string){
   marketplaceReference(projectId);marketplaceReference(beneficiaryId)
   await d.mutate(s=>{
    const beneficiary=s.walletBeneficiaries?.find(b=>b.projectId===projectId&&b.beneficiaryId===beneficiaryId)
    if(!beneficiary)throw Error('Beneficiary not found.')
    beneficiary.status='revoked';return s
   })
  },
  /** Internal only. Caller must establish marketplace payout authority before this method. */
  async reserveBankPayout(projectId:string,paymentId:string,quoteId:string,key:string,authorization:BankQuoteAuthorization){
   for(const ref of [projectId,paymentId,quoteId,key])marketplaceReference(ref)
   const actor={credentialId:marketplaceReference(authorization.credentialId),businessReference:marketplaceReference(authorization.businessReference)}
   const requestHash=createHash('sha256').update(JSON.stringify({quoteId,authorization:actor})).digest('hex')
   const replay=(book:MarketplaceBook|undefined)=>{
    const existing=book?.bankReservations?.find(r=>r.key===key)
    if(existing){if(existing.requestHash!==requestHash)throw Error('Idempotency key was used for a different bank payout.');return existing}
    if(book?.journal.some(entry=>entry.key===key))throw Error('Idempotency key was used for a different request.')
    return undefined
   }
   const prior=(await d.read())?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
   const existing=replay(prior)
   if(existing)return structuredClone({reservation:existing,operation:prior!.operations.find(o=>o.id===existing.quote.operationId)!})
   if(!prior)throw Error('Marketplace payment not found.')
   if(!d.resolveBankQuote)throw Error('Marketplace bank quote verification is not configured.')
   const resolved=await d.resolveBankQuote({projectId,paymentId,quoteId})
   if(!resolved)throw Error('Marketplace bank quote not found.')
   const quote=validateMarketplaceBankQuote(structuredClone(resolved),d.now())
   if(quote.projectId!==projectId||quote.paymentId!==paymentId||quote.quoteId!==quoteId)throw Error('Bank quote project or payment binding mismatch.')
   const store=await d.mutate(s=>{
    const index=s.books.findIndex(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
    if(index<0)throw Error('Marketplace payment not found.')
    const book=s.books[index]
    if(replay(book))return s
    assertMarketplaceWithdrawalMinimum('bank',quote.netUnits)
    validateMarketplaceBankQuote(quote,d.now())
    if(s.books.some(b=>b.bankReservations?.some(r=>r.quote.providerOrderId===quote.providerOrderId||r.quote.intentId===quote.intentId||r.quote.quoteId===quote.quoteId)))throw Error('Bank quote or provider order was already reserved.')
    const allocation=book.plan.allocations.find(a=>a.id===quote.allocationId)
    const snapshot=book.beneficiarySnapshots?.find(b=>b.beneficiaryId===quote.beneficiaryId)
    const current=s.bankBeneficiaries?.find(b=>b.projectId===projectId&&b.beneficiaryId===quote.beneficiaryId)
    if(book.plan.asset!=='USDC'||book.plan.network!=='base'||!allocation||allocation.settlement!=='cash_balance'||allocation.beneficiaryId!==quote.beneficiaryId||snapshot?.kind!=='bank'||!current||current.status!=='active'||snapshot.destinationDigest!==quote.destinationDigest||current.destinationDigest!==quote.destinationDigest||current.sellerId!==allocation.sellerId||snapshot.sellerId!==allocation.sellerId)throw Error('Bank quote beneficiary is no longer eligible.')
    const next=applyMarketplaceCommand(book,projectId,key,{type:'reserve',operationId:quote.operationId,allocationId:quote.allocationId,kind:'payout',amountUnits:quote.debitUnits})
    next.bankReservations=[...(book.bankReservations||[]),{key,requestHash,quote:structuredClone(quote),authorization:actor}]
    s.books[index]=next;return s
   })
   const book=store.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)!
   const reservation=book.bankReservations!.find(r=>r.key===key)!
   return structuredClone({reservation,operation:book.operations.find(o=>o.id===reservation.quote.operationId)!})
  },
  async execute(projectId:string,paymentId:string,key:string,command:MarketplaceCommand){
   if(command.type==='fund_fees')throw Error('Use the authorized fee reserve funding instruction.')
   command=structuredClone(command)
   const store=await d.mutate(s=>{
    const index=s.books.findIndex(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)
    if(index<0)throw Error('Marketplace payment not found.')
    const book=s.books[index]
    if(command.type==='fund'&&(d.collectionVerification||book.collectionProof||book.collectionObservation||book.collectionCheckout))throw Error('Funding requires the collection verifier.')
    if(command.type==='reserve'&&command.kind==='payout'&&book.beneficiarySnapshots&&!book.journal.some(entry=>entry.key===key)){
     const allocation=book.plan.allocations.find(a=>a.id===command.allocationId)
     const snapshot=book.beneficiarySnapshots.find(b=>b.beneficiaryId===allocation?.beneficiaryId)
     const current=[...(s.walletBeneficiaries||[]),...(s.bankBeneficiaries||[])].find(b=>b.projectId===projectId&&b.beneficiaryId===allocation?.beneficiaryId)
     const sameDestination=snapshot?.kind==='wallet'&&current?.kind==='wallet'?snapshot.address===current.address:snapshot?.kind==='bank'&&current?.kind==='bank'?snapshot.destinationDigest===current.destinationDigest:false
     if(!snapshot||!current||current.status!=='active'||!sameDestination||snapshot.sellerId!==current.sellerId||snapshot.asset!==current.asset)throw Error('Payout beneficiary is no longer eligible.')
     if(snapshot.kind==='bank')throw Error('Bank payouts require an accepted quote through reserveBankPayout.')
     throw Error('Wallet payouts require a bound reservation through walletPayouts.reserve.')
    }
    if(command.type==='result'&&command.status!=='unknown'&&book.bankReservations?.some(r=>r.quote.operationId===command.operationId))throw Error('Bank payouts require verified outcome reconciliation.')
    if(command.type==='result'&&command.status!=='unknown'&&book.walletReservations?.some(r=>r.operationId===command.operationId))throw Error('Wallet payouts require verified outcome reconciliation.')
    if(command.type==='reserve'&&command.kind==='refund'&&(book.beneficiarySnapshots||book.refundCollection))throw Error('Refunds require verified original-payer binding through refunds.reserve.')
    if(command.type==='result'&&command.status!=='unknown'&&book.refundReservations?.some(r=>r.allocations.some(a=>a.operationId===command.operationId)))throw Error('Refunds require dedicated verified outcome reconciliation.')
    // Proof references must be canonical chain/log or provider settlement identities.
    if(command.type==='fund'&&s.books.some((b,i)=>i!==index&&b.fundingEvidence===command.evidenceId))throw Error('Funding evidence was already used.')
    if(command.type==='result'&&command.status!=='unknown'&&s.books.some((b,i)=>i!==index&&b.operations.some(o=>o.evidenceId===command.evidenceId)))throw Error('Execution evidence was already used.')
    s.books[index]=applyMarketplaceCommand(s.books[index],projectId,key,command);return s
   })
   return structuredClone(store.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)!)
  },
  async get(projectId:string,paymentId:string){return structuredClone((await d.read())?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId)||null)},
  async sellerBalances(projectId:string,sellerId:string){return marketplaceSellerBalances((await d.read())?.books||[],projectId,sellerId)},
 }
}
