import {randomUUID} from 'node:crypto'
import bs58 from 'bs58'
import {Transaction} from '@solana/web3.js'
import {mutateDurableJson,readDurableJson} from '../render-durable-store.js'
import type {prepareSolanaUsdtRelayTransaction} from './solana-usdt-relay-transaction.js'

type Prepared=Awaited<ReturnType<typeof prepareSolanaUsdtRelayTransaction>>
export type SolanaUsdtBridgeRecord={
 purpose?:'cash';id:string;ownerId:string;walletId:string;walletAddress:string;destinationAddress:string;
 quote:Prepared;phase:'quoted'|'authorizing'|'awaiting_approval'|'signed'|'submitted'|'source_confirmed'|'source_failed'|'completed'|'refunded';
 settlement?:{network:'solana'|'base'|'arbitrum'|'bsc'|'xlayer';asset?:'USDC'|'USDT';transactionHash:string;amountUnits:string;verifiedAt:number};
 challengeId?:string;signedTransaction?:string;signature?:string;createdAt:number;updatedAt:number;
}
export type SolanaUsdtBridgeStore={
 read(id:string):Promise<SolanaUsdtBridgeRecord|undefined>;
 update(id:string,fn:(r:SolanaUsdtBridgeRecord|undefined)=>SolanaUsdtBridgeRecord):Promise<SolanaUsdtBridgeRecord>;
}
const key=(id:string)=>{if(!/^[0-9a-f-]{36}$/.test(id))throw Error('Invalid bridge reference.');return 'hashpaylink:solana-usdt-bridge:v1:'+id}
export const durableSolanaUsdtBridgeStore:SolanaUsdtBridgeStore={
 read:id=>readDurableJson(key(id)),update:(id,fn)=>mutateDurableJson(key(id),fn),
}
function owned(r:SolanaUsdtBridgeRecord|undefined,ownerId:string){
 if(!r||r.ownerId!==ownerId)throw Object.assign(Error('Bridge not found.'),{status:404})
 return r
}
function decode(raw:string){
 if(typeof raw!=='string'||raw.length>2400||!raw.length)throw Error('Invalid bridge transaction.')
 const bytes=Buffer.from(raw,'base64')
 if(bytes.length>1232||bytes.toString('base64')!==raw)throw Error('Invalid bridge transaction.')
 return Transaction.from(bytes)
}
export function assertSolanaUsdtBridgeMessage(record:SolanaUsdtBridgeRecord,raw:string,complete:boolean){
 const approved=decode(record.quote.transaction),tx=decode(raw)
 if(!tx.serializeMessage().equals(approved.serializeMessage()))throw Error('Bridge transaction changed after review.')
 for(const s of approved.signatures){const bytes=s.signature;if(bytes&&!tx.signatures.some(t=>t.publicKey.equals(s.publicKey)&&t.signature?.equals(bytes)))throw Error('Bridge sponsor signature changed.')}
 if(!tx.verifySignatures(complete))throw Error('Invalid bridge signature.')
 return tx
}

/** Durable, owner-scoped approval/submission. Source confirmation is NOT bridge completion. */
export function createSolanaUsdtBridgeState(store:SolanaUsdtBridgeStore=durableSolanaUsdtBridgeStore,now=Date.now){
 const read=async(ownerId:string,id:string)=>owned(await store.read(id),ownerId)
 return {
  read,
  // Server-only: prepared quotes must come from prepareSolanaUsdtRelayTransaction.
  async register(input:{purpose?:'cash';ownerId:string;walletId:string;walletAddress:string;destinationAddress:string;quote:Prepared}){
   const q=input.quote,tx=decode(q.transaction)
   if(!input.ownerId||!input.walletId||q.source!=='solana'||!(['bsc','xlayer'].includes(q.destination)?['USDC','USDT'].includes(q.asset):['base','arbitrum'].includes(q.destination)&&q.asset==='USDT')||q.appFeeUnits!=='0'||!Number.isSafeInteger(q.expiresAt)||q.expiresAt<=now()||q.walletAddress!==input.walletAddress||q.destinationAddress!==input.destinationAddress)throw Error('Invalid bridge quote.')
   if(!tx.verifySignatures(false)||tx.signatures.length!==2||!tx.signatures[0].signature||tx.signatures[1].publicKey.toBase58()!==input.walletAddress||tx.signatures[1].signature)throw Error('Invalid bridge signers.')
   const id=randomUUID(),at=now()
   return store.update(id,current=>{if(current)throw Error('Bridge already exists.');return {...input,id,phase:'quoted',createdAt:at,updatedAt:at}})
  },
  async authorize(input:{ownerId:string;id:string;walletId:string;walletAddress:string;rawTransaction:string},startChallenge:()=>Promise<string>){
   const record=await read(input.ownerId,input.id)
   if(record.walletId!==input.walletId||record.walletAddress!==input.walletAddress)throw Error('Linked bridge wallet changed.')
   assertSolanaUsdtBridgeMessage(record,input.rawTransaction,false)
   if(record.quote.expiresAt<=now())throw Error('Bridge quote expired. Review a new quote.')
   if(record.phase==='awaiting_approval'&&record.challengeId)return {challengeId:record.challengeId}
   await store.update(input.id,current=>{
    const r=owned(current,input.ownerId)
    if(r.phase!=='quoted')throw Error('Bridge approval is already pending. Recover the saved approval.')
    return {...r,phase:'authorizing',updatedAt:now()}
   })
   // A timeout deliberately remains authorizing: never create a second challenge
   // when the provider may have accepted the first request.
   const challengeId=await startChallenge()
   if(!challengeId)throw Error('Bridge approval result is unknown.')
   await store.update(input.id,current=>{
    const r=owned(current,input.ownerId)
    if(r.phase!=='authorizing')throw Error('Bridge approval state changed.')
    return {...r,challengeId,phase:'awaiting_approval',updatedAt:now()}
   })
   return {challengeId}
  },
  async expireUnsigned(ownerId:string,id:string,blockHeight:number){
   return store.update(id,current=>{
    const r=owned(current,ownerId)
    // Raw signing never broadcasts. The only submission path persists signed
    // bytes first, so an unsigned expired blockhash cannot create a future debit.
    if(r.signedTransaction||!['quoted','authorizing','awaiting_approval'].includes(r.phase)
      ||!Number.isSafeInteger(blockHeight)||blockHeight<=r.quote.lastValidBlockHeight)return r
    return {...r,phase:'source_failed',updatedAt:now()}
   })
  },
  async saveSigned(ownerId:string,id:string,raw:string){
   const r=await read(ownerId,id),tx=assertSolanaUsdtBridgeMessage(r,raw,true)
   const signature=bs58.encode(tx.signature!)
   return store.update(id,current=>{
    const latest=owned(current,ownerId)
    if(latest.signedTransaction){if(latest.signedTransaction!==raw)throw Error('A different signed bridge is already saved.');return latest}
    if(latest.phase!=='awaiting_approval')throw Error('Approve this bridge before submitting.')
    return {...latest,phase:'signed',signedTransaction:raw,signature,updatedAt:now()}
   })
  },
  async submit(ownerId:string,id:string,rpc:{
   getSignatureStatuses(signatures:string[],options:{searchTransactionHistory:boolean}):Promise<{value:({err:unknown;confirmationStatus?:string|null}|null)[]}>;
   getBlockHeight(commitment:'confirmed'):Promise<number>;
   sendRawTransaction(bytes:Buffer,options:{skipPreflight:boolean;maxRetries:number}):Promise<string>;
  }){
   const r=await read(ownerId,id)
   if(!r.signedTransaction||!r.signature)throw Error('Bridge has not been signed.')
   if(['source_confirmed','source_failed','completed','refunded'].includes(r.phase))return r
   const status=(await rpc.getSignatureStatuses([r.signature],{searchTransactionHistory:true})).value[0]
   if(status&&['confirmed','finalized'].includes(status.confirmationStatus||'')){
    return store.update(id,current=>{
     const latest=owned(current,ownerId)
     if(['source_confirmed','source_failed','completed','refunded'].includes(latest.phase))return latest
     return {...latest,phase:status.err?'source_failed':'source_confirmed',updatedAt:now()}
    })
   }
   if(status)return r
   // An expired blockhash with no observed result stays unresolved. Do not replace
   // the transaction or invite a second debit based on one RPC's missing history.
   if(await rpc.getBlockHeight('confirmed')>r.quote.lastValidBlockHeight)return r
   const signature=await rpc.sendRawTransaction(Buffer.from(r.signedTransaction,'base64'),{skipPreflight:false,maxRetries:2})
   if(signature!==r.signature)throw Error('Bridge submission returned a different signature.')
   return store.update(id,current=>{
    const latest=owned(current,ownerId)
    return latest.phase==='signed'?{...latest,phase:'submitted',updatedAt:now()}:latest
   })
  },
 }
}
