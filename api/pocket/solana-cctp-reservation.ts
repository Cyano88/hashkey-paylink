import {createHash} from 'node:crypto'
import {PublicKey,Transaction} from '@solana/web3.js'
import bs58 from 'bs58'
import {claimCirclePocketAction,claimSolanaCctpBroadcast,findCirclePocketAction,recordCirclePocketAction,listCirclePocketActions,type CirclePocketActionRecord} from '../circle-pocket-action-journal.js'
import {hasRenderDurableStore} from '../render-durable-store.js'
import {assertSolanaBridgeMessage,type SolanaBridgeApproval} from './solana-bridge-approval.js'
import {readSolanaCctpSource} from './solana-cctp-source-proof.js'

export const SOLANA_CCTP_ACTION='reservation.solana-cctp'
export type SolanaCctpBinding={ownerId:string;walletId:string;walletAddress:string;id:string}
type Binding=SolanaCctpBinding
const key=(b:Binding)=>'pocket:solana-cctp:'+b.id
const terminal=(status:string)=>['completed','failed','cancelled','not_submitted'].includes(status)
const fail=(message:string,status=409):never=>{throw Object.assign(Error(message),{status})}
const defaults={durable:hasRenderDurableStore,now:Date.now,claim:claimCirclePocketAction,broadcastClaim:claimSolanaCctpBroadcast,find:findCirclePocketAction,record:recordCirclePocketAction,prove:readSolanaCctpSource}
/** Internal, unmounted lifecycle. Caller must authenticate the owned binding,
 * open the sealed approval and validate current policy before prepare/submit.
 * dispatch must reuse the existing validated relay, never a new signing path. */
export function createSolanaCctpReservations(options:Partial<typeof defaults>&{dispatch:(transaction:string,lastValidBlockHeight:number)=>Promise<void>}){
 const d={...defaults,...options}
 const check=(b:Binding)=>{if(!d.durable())fail('Bridge recovery storage is unavailable.',503);if(!b.ownerId||!b.walletId||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.id))fail('Invalid owned bridge reference.');if(new PublicKey(b.walletAddress).toBase58()!==b.walletAddress)fail('Invalid source wallet.')}
 const saved=async(b:Binding)=>{
  check(b);const row=await d.find(b.ownerId,key(b),SOLANA_CCTP_ACTION)
  if(!row?.metadata?.approved||row.metadata.walletId!==b.walletId||row.metadata.walletAddress!==b.walletAddress)fail('Saved bridge binding is unavailable.')
  const q=JSON.parse(row!.metadata!.approved) as SolanaBridgeApproval
  if(q.walletAddress!==b.walletAddress)fail('Saved bridge wallet changed.')
  return {row:row!,q}
 }
 async function prepare(b:Binding,q:SolanaBridgeApproval){
  check(b)
  if(q.purpose!==undefined&&(q.purpose!=='cash'||q.destination!=='base'))fail('Invalid Cash funding reference.')
  if(q.walletAddress!==b.walletAddress||!['base','arbitrum','arc','ethereum','polygon'].includes(q.destination)||!/^0x[0-9a-f]{40}$/i.test(q.destinationAddress)||!Number.isSafeInteger(q.lastValidBlockHeight)||q.lastValidBlockHeight<0)fail('Bridge approval binding changed.')
  const approved=JSON.stringify(q),fingerprint=createHash('sha256').update(approved).digest('hex')
  const prior=await d.find(b.ownerId,key(b),SOLANA_CCTP_ACTION)
  if(prior){await saved(b);if(prior.metadata?.fingerprint!==fingerprint)fail('Bridge approval changed.');return prior}
  if(!Number.isSafeInteger(q.expiresAt)||q.expiresAt<=d.now())fail('Bridge approval expired.')
  const unsigned=Transaction.from(Buffer.from(q.transaction,'base64'));assertSolanaBridgeMessage(unsigned,q,false)
  if(!unsigned.signatures.some(s=>s.publicKey.toBase58()===b.walletAddress))fail('Owned wallet is not a bridge signer.')
  const scope='solana:'+b.walletAddress
  const claim=await d.claim({ownerId:b.ownerId,idempotencyKey:key(b),action:SOLANA_CCTP_ACTION,metadata:{approved,fingerprint,source:'solana',walletId:b.walletId,walletAddress:b.walletAddress,intentFingerprint:scope},dedupe:{metadataKey:'intentFingerprint',metadataValue:scope,statuses:['started','submitted']}})
  if(claim.record.idempotencyKey!==key(b)||claim.record.metadata?.fingerprint!==fingerprint||claim.record.metadata.walletId!==b.walletId||claim.record.metadata.walletAddress!==b.walletAddress)fail('Another bridge from this wallet is pending.')
  return claim.record
 }
 async function submit(b:Binding,raw:string){
  const {row,q}=await saved(b)
  if(typeof raw!=='string'||raw.length>24000)fail('Invalid signed bridge transaction.')
  const tx=Transaction.from(Buffer.from(raw,'base64'));assertSolanaBridgeMessage(tx,q,true)
  if(!tx.signature||!tx.signatures.some(s=>s.publicKey.toBase58()===b.walletAddress&&s.signature))fail('Missing owned bridge signature.')
  const txHash=bs58.encode(tx.signature!)
  const claimed=await d.broadcastClaim({ownerId:b.ownerId,idempotencyKey:key(b),fingerprint:row.metadata!.fingerprint,signedTransaction:raw,txHash})
  if(!claimed.claimed)return claimed.record
  // Persisted signed bytes/reference win even if dispatch throws or the process dies.
  try{await d.dispatch(raw,q.lastValidBlockHeight)}catch{}
  return claimed.record
 }
 async function resume(b:Binding){
  const {row,q}=await saved(b)
  if(terminal(row.status)||!row.metadata?.signedTransaction)return row
  const proof=await d.prove(q,row.metadata.signedTransaction)
  if(!proof)return row
  if(proof.txHash!==row.metadata.txHash)fail('Bridge source reference changed.')
  return d.record({...row,status:proof.outcome==='source_confirmed'?'completed':'failed',metadata:{...row.metadata,sourceOutcome:proof.outcome,sourceSlot:proof.slot,sourceBlockHash:proof.blockHash}})
 }
 return {prepare,submit,resume,cancel:resume,inspect:async(b:Binding)=>(await saved(b)).row,exists:async(b:Binding)=>{check(b);return !!await d.find(b.ownerId,key(b),SOLANA_CCTP_ACTION)}}
}

export function solanaCctpState(row:CirclePocketActionRecord){
 return {managed:true as const,status:row.status,txHash:row.metadata?.txHash,sourceOutcome:row.metadata?.sourceOutcome,reservationReleased:terminal(row.status)}
}
export async function listSolanaCctpPending(ownerId:string){
 if(!hasRenderDurableStore())return []
 const unresolved=await listCirclePocketActions(ownerId,500,SOLANA_CCTP_ACTION,true)
 if(unresolved.length===500)throw Error('Bridge recovery inventory needs reconciliation.')
 const recent=await listCirclePocketActions(ownerId,500,SOLANA_CCTP_ACTION)
 return [...unresolved,...recent.filter(r=>r.status==='completed'&&r.metadata?.deliveryRecorded!=='true')].map(row=>{
  const q=JSON.parse(row.metadata!.approved) as SolanaBridgeApproval
  if(row.ownerId!==ownerId||q.walletAddress!==row.metadata?.walletAddress)throw Error('Bridge recovery binding mismatch.')
  return {id:row.idempotencyKey.split(':').at(-1)!,...(q.purpose==='cash'?{purpose:'cash' as const}:{}),source:'solana',destination:q.destination,amount:q.amount,walletAddress:q.walletAddress,txHash:row.metadata?.txHash,createdAt:row.createdAt,progress:row.metadata?.txHash?'submitted':'needs_attention',managedReservation:true,reservationReleased:terminal(row.status)}
 })
}
/** Only call after the authenticated destination delivery proof succeeds. */
export async function acknowledgeSolanaCctpDelivery(ownerId:string,source:string,txHash:string){
 if(source!=='solana'||!hasRenderDurableStore())return
 const rows=await listCirclePocketActions(ownerId,500,SOLANA_CCTP_ACTION)
 for(const row of rows)if(row.status==='completed'&&row.metadata?.txHash===txHash&&row.metadata.deliveryRecorded!=='true')await recordCirclePocketAction({...row,metadata:{...row.metadata,deliveryRecorded:'true'}})
}
