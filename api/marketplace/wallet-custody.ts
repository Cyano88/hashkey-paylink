import {createHash} from 'node:crypto'
import {formatUnits,getAddress,parseAbi,parseEventLogs,type PublicClient} from 'viem'
import {createCircleDeveloperTreasuryClient,type CircleTreasuryConfig,type CircleDeveloperTransaction} from '../circle-developer-treasury.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import {createMarketplaceExecutionAuthority} from './authorization.js'
import {createMarketplaceWalletExecution,walletTransferHash} from './wallet-execution.js'
import {createMarketplaceWalletReconciliation,type WalletOutcomeEvidence} from './wallet-reconciliation.js'
import type {MarketplaceStore} from './repository.js'

type Transfer=Parameters<typeof walletTransferHash>[0]
type Circle=Pick<ReturnType<typeof createCircleDeveloperTreasuryClient>,'verifyConfiguredWallet'|'createUsdcTransfer'|'getTransaction'|'findTransferByReference'>
type Dependencies={enabled?:boolean;config:CircleTreasuryConfig;holdingId:string;holdingRevision:string;billsAddress:string;projectIds:string[];
 read:()=>Promise<MarketplaceStore|undefined>;mutate:(fn:(s:MarketplaceStore)=>MarketplaceStore)=>Promise<MarketplaceStore>;now:()=>number;
 chain:Pick<PublicClient,'getChainId'|'getBlock'|'getTransactionReceipt'>;circle?:Circle;
 authorize?:(projectId:string,credentialId:string)=>Promise<boolean>;verifyBacking:()=>Promise<{backed:boolean}>;
 verifyFees:(transfer:Transfer)=>Promise<{feePolicyId:string;expiresAt:number;feesCoveredOutsideAllocation:boolean;additionalTokenDebitUnits:string}>}
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const hash=/^0x[a-fA-F0-9]{64}$/
/** Internal Base USDC adapter. No route or background scheduler starts it.
 * Fee coverage must be verified by the caller's provider adapter, never inferred
 * from a wallet's SCA type or an environment toggle.
 */
export function createMarketplaceWalletCustody(input:Dependencies){
 const d={...input,config:structuredClone(input.config),projectIds:[...input.projectIds]}
 const circle=d.circle??createCircleDeveloperTreasuryClient({config:d.config}),authorize=d.authorize??createMarketplaceExecutionAuthority()
 function locate(s:MarketplaceStore|undefined,projectId:string,paymentId:string,operationId:string){
  const book=s?.books.find(b=>b.plan.projectId===projectId&&b.plan.paymentId===paymentId),reservation=book?.walletReservations?.find(r=>r.operationId===operationId)
  if(!book||!reservation)throw Error('Marketplace wallet reservation not found.')
  return {book,reservation,attempt:book.walletExecutions?.filter(e=>e.operationId===operationId).at(-1)}
 }
 function gate(projectId:string){
  if(!d.enabled||!d.projectIds.includes(projectId))throw Error('Marketplace wallet custody is disabled for this project.')
  if(!d.config.verificationReady||d.config.blockchain!=='BASE'||d.config.accountType!=='SCA'||!d.holdingId||!d.holdingRevision||getAddress(d.config.treasuryAddress)===getAddress(d.billsAddress)||/^0x0{40}$/i.test(d.config.treasuryAddress))throw Error('Marketplace holding configuration is invalid.')
 }
 function holding(current:ReturnType<typeof locate>){
  const c=current.book.refundCollection,r=current.reservation
  if(!c||!current.book.collectionProof||current.book.collectionProof.evidenceId!==current.book.fundingEvidence||c.fundingEvidenceId!==current.book.fundingEvidence||c.projectId!==current.book.plan.projectId||c.paymentId!==current.book.plan.paymentId||c.asset!=='USDC'||c.network!=='base'||r.asset!=='USDC'||r.network!=='base'||c.holdingId!==d.holdingId||c.holdingRevision!==d.holdingRevision||getAddress(c.holdingAddress)!==getAddress(d.config.treasuryAddress)||getAddress(r.tokenAddress)!==getAddress(BASE_STABLECOINS.USDC.address))throw Error('Payout requires the verified Base USDC holding collection.')
 }
 const execution=createMarketplaceWalletExecution({...d,preflightWalletExecution:async transfer=>{
  gate(transfer.projectId)
  const current=locate(await d.read(),transfer.projectId,transfer.paymentId,transfer.operationId);holding(current)
  // Independent read-only checks share the same strict preflight deadline.
  const [,backing,fees,authorized]=await Promise.all([
   circle.verifyConfiguredWallet(),d.verifyBacking(),d.verifyFees(transfer),
   authorize(transfer.projectId,current.reservation.authorization.credentialId),
  ])
  if(!backing.backed)throw Error('Marketplace holding is not backed.')
  if(fees.feesCoveredOutsideAllocation!==true||fees.additionalTokenDebitUnits!=='0')throw Error('Marketplace payout gas coverage is not verified.')
  if(!authorized)throw Error('Marketplace payout authority was revoked.')
  return {...fees,feesCoveredOutsideAllocation:true,additionalTokenDebitUnits:'0',holdingId:d.holdingId,holdingRevision:d.holdingRevision,sender:d.config.treasuryAddress,transferHash:walletTransferHash(transfer),holdingApproved:true,authorizationActive:true}
 }})
 function validate(tx:CircleDeveloperTransaction,current:ReturnType<typeof locate>){
  const {reservation:r,attempt:a}=current,binding=a?.circleTransfer
  if(!binding||tx.walletId!==binding.walletId||tx.refId!==binding.refId||tx.blockchain!=='BASE'||tx.transactionType!=='OUTBOUND'||getAddress(tx.sourceAddress)!==getAddress(d.config.treasuryAddress)||getAddress(tx.destinationAddress)!==getAddress(r.recipient)||tx.amounts.length!==1||marketplaceAmountUnits(tx.amounts[0])!==r.amountUnits||binding.transactionId&&binding.transactionId!==tx.id)throw Error('Circle transfer does not match the reserved payout.')
  if(a?.transactionHash&&tx.txHash.toLowerCase()!==a.transactionHash)throw Error('Circle payout transaction hash changed.')
 }
 async function attach(projectId:string,paymentId:string,operationId:string,tx:CircleDeveloperTransaction){
  const before=locate(await d.read(),projectId,paymentId,operationId);validate(tx,before)
  await d.mutate(s=>{
   const current=locate(s,projectId,paymentId,operationId);validate(tx,current)
   if(current.attempt?.attemptId!==before.attempt?.attemptId)throw Error('Payout attempt changed.')
   if(s.books.some(b=>b.walletExecutions?.some(a=>a.attemptId!==current.attempt!.attemptId&&a.circleTransfer?.transactionId===tx.id)||b.refundExecutions?.some(e=>e.transactionId===tx.id)))throw Error('Circle transaction already used.')
   current.attempt!.circleTransfer!.transactionId=tx.id;return s
  })
  if(hash.test(tx.txHash))await execution.recordSubmission(projectId,paymentId,operationId,before.attempt!.claimToken,tx.txHash)
  return execution.get(projectId,paymentId,operationId)
 }
 async function recover(projectId:string,paymentId:string,operationId:string){
  gate(projectId)
  const current=locate(await d.read(),projectId,paymentId,operationId);holding(current)
  const binding=current.attempt?.circleTransfer
  if(!binding)return current.attempt??null
  if(['settled','failed'].includes(current.attempt!.state))return current.attempt!
  const tx=binding.transactionId?await circle.getTransaction(binding.transactionId):await circle.findTransferByReference(binding.refId)
  if(tx&&binding.transactionId&&tx.id!==binding.transactionId)throw Error('Circle payout transaction ID changed.')
  // An empty provider lookup cannot prove that an earlier send was never accepted.
  return tx?attach(projectId,paymentId,operationId,tx):current.attempt!
 }
 const reconciliation=createMarketplaceWalletReconciliation({...d,verifyWalletOutcome:async({projectId,paymentId,reservation,attempt}):Promise<WalletOutcomeEvidence|null>=>{
  gate(projectId)
  const current=locate(await d.read(),projectId,paymentId,reservation.operationId);holding(current)
  const prior=current.book.walletReconciliations?.find(r=>r.evidence.attemptId===attempt.attemptId)
  if(prior)return prior.evidence
  if(!attempt.circleTransfer?.transactionId||!attempt.transactionHash)return null
  const tx=await circle.getTransaction(attempt.circleTransfer.transactionId);if(tx.id!==attempt.circleTransfer.transactionId)throw Error('Circle payout transaction ID changed.');validate(tx,current)
  if(await d.chain.getChainId()!==8453)throw Error('Wallet payout verification requires Base.')
  const receipt=await d.chain.getTransactionReceipt({hash:attempt.transactionHash as `0x${string}`})
  const finalized=await d.chain.getBlock({blockTag:'finalized'}),canonical=await d.chain.getBlock({blockNumber:receipt.blockNumber})
  if(receipt.transactionHash.toLowerCase()!==attempt.transactionHash||!['success','reverted'].includes(receipt.status)||finalized.number===null||receipt.blockNumber>finalized.number||!canonical.hash||canonical.hash!==receipt.blockHash)return null
  const reverted=receipt.status==='reverted'
  if(reverted&&!['FAILED','CANCELLED','DENIED'].includes(tx.state))return null
  if(reverted&&receipt.logs.length)throw Error('Reverted payout receipt contains logs.')
  const outflows=parseEventLogs({abi,logs:receipt.logs}).filter(l=>getAddress(l.address)===getAddress(BASE_STABLECOINS.USDC.address)&&getAddress(l.args.from)===getAddress(d.config.treasuryAddress))
  const exact=outflows.filter(l=>getAddress(l.args.to)===getAddress(reservation.recipient)&&l.args.value===BigInt(reservation.amountUnits)&&!l.removed&&l.transactionHash.toLowerCase()===attempt.transactionHash&&l.blockHash===receipt.blockHash&&l.blockNumber===receipt.blockNumber)
  if(!reverted&&(outflows.length!==1||exact.length!==1||exact[0].logIndex===null))throw Error('Wallet payout requires one exact finalized USDC outflow.')
  const approved=attempt.executionAuthorization!
  return {projectId,paymentId,operationId:reservation.operationId,attemptId:attempt.attemptId,holdingId:approved.holdingId,holdingRevision:approved.holdingRevision,transferHash:approved.transferHash,chainId:8453,asset:'USDC',tokenAddress:reservation.tokenAddress,sender:approved.sender,recipient:reservation.recipient,requestedUnits:reservation.amountUnits,transferredUnits:reverted?'0':reservation.amountUnits,transactionHash:attempt.transactionHash,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString(),logIndex:reverted?null:exact[0].logIndex,outcome:reverted?'reverted':'transferred',finality:'finalized',finalizedAt:d.now()}
 }})
 return {recover,async submit(projectId:string,paymentId:string,operationId:string,workerId:string){
  gate(projectId)
  const before=locate(await d.read(),projectId,paymentId,operationId);holding(before)
  if(before.attempt&&before.attempt.state!=='claimed'&&before.attempt.state!=='expired')return recover(projectId,paymentId,operationId)
  const claim=await execution.claim(projectId,paymentId,operationId,workerId)
  const {attempt,transfer}=await execution.beginSubmission(projectId,paymentId,operationId,claim.claimToken)
  const refId='marketplace-wallet:'+createHash('sha256').update(attempt.attemptId).digest('hex')
  await d.mutate(s=>{
   const current=locate(s,projectId,paymentId,operationId)
   if(current.attempt?.attemptId!==attempt.attemptId||current.attempt.state!=='submitting'||current.attempt.circleTransfer)throw Error('Payout submission attempt changed.')
   current.attempt.circleTransfer={walletId:d.config.walletId,refId};return s
  })
  if(d.now()<(attempt.submissionStartedAt??Infinity)||d.now()>=(attempt.submitBefore??0))throw Error('Payout submission deadline expired; recovery required.')
  const result=await circle.createUsdcTransfer({idempotencyKey:attempt.attemptId,refId,destinationAddress:transfer.recipient,amount:formatUnits(BigInt(transfer.amountUnits),6),tokenAddress:transfer.to})
  const tx=await circle.getTransaction(result.id)
  if(tx.id!==result.id)throw Error('Circle payout transaction ID changed.')
  return attach(projectId,paymentId,operationId,tx)
 },async reconcile(projectId:string,paymentId:string,operationId:string){
  await recover(projectId,paymentId,operationId)
  return reconciliation.reconcile(projectId,paymentId,operationId)
 }}
}
