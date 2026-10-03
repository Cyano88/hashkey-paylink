import { createHash, randomUUID } from 'node:crypto'
import { getAddress, type Hex } from 'viem'
import { mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import { TRADE_ACTION_LABELS, type TradeXLayerAction } from '../../src/lib/xstocksAgreement/protocol.js'
import { wrapArcTradeCall, verifyArcTradeExecution, type ArcTradeExecutionCall, type ArcTradeExecutionPolicy, type ArcTradeExecutionReader, type ArcTradeExecutionResult } from './arc-execution.js'

// Server-side journal, not an HTTP authorization boundary. The hosted adapter
// must authenticate the participant, verify Circle wallet ownership and obtain
// a fresh trusted planner result before reserving. Provider IDs/hashes must come
// from authenticated Circle reads, never a browser's claimed success response.
type Reservation = {
  agreementId:string; projectId:string; participantId:string; walletId:string;
  requestId:string; termsHash:Hex; action:TradeXLayerAction; call:ArcTradeExecutionCall;
  preparedAfterBlock:string;
}
export type ArcTradeExecutionEntry = Reservation & {
  fingerprint:string; idempotencyKey:string; wrappedCall:Hex; createdAt:string;
  status:'reserved'|'challenge_issued'|'submitted'|'confirmed'|'reverted';
  challengeId?:string; transactionId?:string; transactionHash?:Hex;
  result?:ArcTradeExecutionResult;
}
export type ArcTradeExecutionJournal = {agreementId:string;projectId:string;entries:ArcTradeExecutionEntry[]}
type Deps = {
  read:(key:string)=>Promise<ArcTradeExecutionJournal|undefined>;
  mutate:(key:string,update:(value:ArcTradeExecutionJournal|undefined)=>ArcTradeExecutionJournal)=>Promise<ArcTradeExecutionJournal>;
  uuid:()=>string; now:()=>Date;
}
const defaults:Deps = {read:readDurableJson,mutate:mutateDurableJson,uuid:randomUUID,now:()=>new Date()}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const providerUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const bytes32 = /^0x[a-f0-9]{64}$/i
const actions = new Set(Object.keys(TRADE_ACTION_LABELS))
function fail(message:string):never {throw Object.assign(Error(message),{status:409})}
function storeKey(agreementId:string) {
  if (!/^tag_[a-f0-9]{64}$/.test(agreementId)) fail('Invalid Arc Trade agreement.')
  return `hashpaylink:arc-trade-execution:v1:${agreementId}`
}
const terminal = (entry:ArcTradeExecutionEntry)=>entry.status==='confirmed'||entry.status==='reverted'
function canonical(input:Reservation):Reservation {
  storeKey(input.agreementId)
  if (!/^dev_[a-z0-9]{8,64}$/i.test(input.projectId) || !/^did:privy:[a-z0-9_-]{1,150}$/i.test(input.participantId)
    || !providerUuid.test(input.walletId) || !uuid.test(input.requestId) || !bytes32.test(input.termsHash) || /^0x0{64}$/i.test(input.termsHash)
    || !actions.has(input.action) || !/^(0|[1-9][0-9]{0,19})$/.test(input.preparedAfterBlock)) fail('Invalid Arc Trade execution reservation.')
  wrapArcTradeCall(input.call)
  return {
    agreementId:input.agreementId,projectId:input.projectId,participantId:input.participantId,walletId:input.walletId.toLowerCase(),
    requestId:input.requestId.toLowerCase(),termsHash:input.termsHash.toLowerCase() as Hex,action:input.action,
    call:{chainId:5042,account:getAddress(input.call.account),to:getAddress(input.call.to),data:input.call.data.toLowerCase() as Hex,value:'0'},
    preparedAfterBlock:input.preparedAfterBlock,
  }
}
export function createArcTradeExecutionStore(overrides:Partial<Deps>={}) {
  const d={...defaults,...overrides}
  async function read(agreementId:string,projectId:string,requestId:string) {
    const journal=await d.read(storeKey(agreementId))
    const entry=journal?.entries.find(item=>item.requestId===requestId.toLowerCase())
    if (!journal || journal.projectId!==projectId || !entry) fail('Arc Trade action was not found.')
    return entry
  }
  async function update(input:{agreementId:string;projectId:string;requestId:string},change:(entry:ArcTradeExecutionEntry,journal:ArcTradeExecutionJournal)=>ArcTradeExecutionEntry) {
    const result=await d.mutate(storeKey(input.agreementId),journal=>{
      if (!journal || journal.projectId!==input.projectId) fail('Arc Trade action was not found.')
      const index=journal.entries.findIndex(item=>item.requestId===input.requestId.toLowerCase())
      if(index<0)fail('Arc Trade action was not found.')
      return {...journal,entries:journal.entries.map((entry,i)=>i===index?change(entry,journal):entry)}
    })
    return result.entries.find(item=>item.requestId===input.requestId.toLowerCase())!
  }
  return {
    read,
    async find(agreementId:string,projectId:string,requestId:string) {
      const journal=await d.read(storeKey(agreementId))
      if(journal && journal.projectId!==projectId)fail('Arc Trade action was not found.')
      return journal?.entries.find(entry=>entry.requestId===requestId.toLowerCase())
    },
    async latest(agreementId:string,projectId:string) {
      const journal=await d.read(storeKey(agreementId))
      if(journal && journal.projectId!==projectId)fail('Arc Trade action was not found.')
      return journal?.entries.at(-1)
    },
    async reserve(input:Reservation) {
      const normalized=canonical(input)
      // The block bound is committed on the first reservation. A retry may have
      // observed a later head; it must retain the original bound and challenge.
      const {preparedAfterBlock,...identity}=normalized
      const fingerprint=createHash('sha256').update(JSON.stringify(identity)).digest('hex')
      const idempotencyKey=d.uuid(),createdAt=d.now().toISOString()
      if(!uuid.test(idempotencyKey))fail('Invalid Arc Trade provider idempotency key.')
      const result=await d.mutate(storeKey(input.agreementId),journal=>{
        if (journal && journal.projectId!==normalized.projectId) fail('Arc Trade project changed.')
        const previous=journal?.entries.find(item=>item.requestId===normalized.requestId)
        if(previous){if(previous.fingerprint!==fingerprint)fail('Arc Trade retry changed the prepared action.');return journal!}
        if(journal?.entries.some(entry=>!terminal(entry)))fail('Recover the pending Arc Trade action before starting another.')
        if(journal?.entries.some(entry=>entry.result && BigInt(entry.result.blockNumber)>BigInt(preparedAfterBlock)))fail('Refresh the Arc Trade chain head before preparing another action.')
        // Retain all idempotency tombstones. Never evict an old request and allow
        // it to become a new payment after the history limit is reached.
        if((journal?.entries.length??0)>=256)fail('Arc Trade action history requires review.')
        const entry:ArcTradeExecutionEntry={...normalized,fingerprint,idempotencyKey,wrappedCall:wrapArcTradeCall(normalized.call),createdAt,status:'reserved'}
        return {agreementId:input.agreementId,projectId:input.projectId,entries:[...(journal?.entries??[]),entry]}
      })
      return result.entries.find(item=>item.requestId===normalized.requestId)!
    },
    async recordChallenge(input:{agreementId:string;projectId:string;requestId:string;challengeId:string}) {
      if(!providerUuid.test(input.challengeId))fail('Invalid Arc Trade Circle challenge.')
      return update(input,(entry,journal)=>{
        if(journal.entries.some(other=>other.requestId!==entry.requestId && other.challengeId===input.challengeId.toLowerCase()))fail('Arc Trade challenge already belongs to another action.')
        if(entry.challengeId && entry.challengeId!==input.challengeId.toLowerCase())fail('Arc Trade Circle challenge changed. Review required.')
        if(terminal(entry))return entry
        return {...entry,challengeId:input.challengeId.toLowerCase(),status:entry.status==='reserved'?'challenge_issued':entry.status}
      })
    },
    async recordSubmission(input:{agreementId:string;projectId:string;requestId:string;transactionId:string;transactionHash:Hex}) {
      if(!providerUuid.test(input.transactionId)||!bytes32.test(input.transactionHash)||/^0x0{64}$/i.test(input.transactionHash))fail('Invalid Arc Trade provider transaction.')
      return update(input,(entry,journal)=>{
        if(journal.entries.some(other=>other.requestId!==entry.requestId && (other.transactionId===input.transactionId.toLowerCase() || other.transactionHash===input.transactionHash.toLowerCase())))fail('Arc Trade transaction already belongs to another action.')
        if(!entry.challengeId)fail('Recover the Arc Trade challenge before recording its transaction.')
        if((entry.transactionId && entry.transactionId!==input.transactionId.toLowerCase())
          ||(entry.transactionHash && entry.transactionHash!==input.transactionHash.toLowerCase()))fail('Arc Trade provider transaction changed. Review required.')
        if(terminal(entry))return entry
        return {...entry,transactionId:input.transactionId.toLowerCase(),transactionHash:input.transactionHash.toLowerCase() as Hex,status:'submitted'}
      })
    },
    async recordProviderTransaction(input:{agreementId:string;projectId:string;requestId:string;transactionId:string}) {
      if(!providerUuid.test(input.transactionId))fail('Invalid Arc Trade provider transaction.')
      return update(input,(entry,journal)=>{
        if(!entry.challengeId)fail('Recover the Arc Trade challenge before recording its transaction.')
        if(entry.transactionId && entry.transactionId!==input.transactionId.toLowerCase())fail('Arc Trade provider transaction changed. Review required.')
        if(journal.entries.some(other=>other.requestId!==entry.requestId&&other.transactionId===input.transactionId.toLowerCase()))fail('Arc Trade transaction already belongs to another action.')
        return {...entry,transactionId:input.transactionId.toLowerCase()}
      })
    },
    async reconcile(input:{agreementId:string;projectId:string;requestId:string;policy:ArcTradeExecutionPolicy;client:ArcTradeExecutionReader}) {
      const entry=await read(input.agreementId,input.projectId,input.requestId)
      if(!entry.transactionHash)fail('Arc Trade provider transaction is not available yet.')
      const result=await verifyArcTradeExecution({call:entry.call,transactionHash:entry.transactionHash,policy:input.policy,preparedAfterBlock:BigInt(entry.preparedAfterBlock)},input.client)
      return update(input,current=>{
        if(current.fingerprint!==entry.fingerprint||current.transactionHash!==entry.transactionHash)fail('Arc Trade action changed during reconciliation.')
        if(current.result && JSON.stringify(current.result)!==JSON.stringify(result))fail('Confirmed Arc Trade execution changed. Review required.')
        return {...current,status:result.status,result}
      })
    },
  }
}
