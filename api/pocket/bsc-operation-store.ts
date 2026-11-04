import {lockBridgeJournal,assertNoCrossBridgeReservation} from './cross-bridge-reservation.js'
import {withDurablePostgresTransaction} from '../render-durable-store.js'

export const BSC_OPERATION_KEYS=['pocket:bsc-bridge-operations:v1','pocket:bsc-operations:v1','pocket:bsc-payment-operations:v1','pocket:bsc-send-operations:v1'] as const
type Operation={state:string;quote:{walletAddress:string;expiresAt:number};hash?:string;transactionId?:string;userOperationHash?:string}
type Store={operations:Record<string,Operation>}
function invalid():never {throw Object.assign(Error('Wallet reservation storage needs reconciliation.'),{status:503})}
function store(value:unknown):Store|undefined {
 if(value===undefined||value===null)return undefined
 const s=value as Store
 if(!s||typeof s!=='object'||!s.operations||typeof s.operations!=='object'||Array.isArray(s.operations))invalid()
 for(const op of Object.values(s.operations))if(!op||typeof op.state!=='string'||!/^0x[0-9a-f]{40}$/i.test(op.quote?.walletAddress)||!Number.isFinite(op.quote?.expiresAt))invalid()
 return s
}
const terminal=(state:string)=>['completed','failed','refunded','cancelled','not_submitted'].includes(state)
function reserved(op:Operation,now:number){return !terminal(op.state)&&!(op.state==='prepared'&&op.quote.expiresAt<=now&&!op.hash&&!op.transactionId&&!op.userOperationHash)}
/** All four dispatch families lock the same existing rows in deterministic order.
 * No migration or second copy of pending operations: old reservations participate
 * immediately. Callbacks must only mutate state; provider calls happen afterwards. */
export function createBscOperationMutator(transaction=withDurablePostgresTransaction,now=Date.now){
 return async function mutate<T>(key:string,fn:(current:T|undefined)=>T|Promise<T>):Promise<T>{
  if(!(BSC_OPERATION_KEYS as readonly string[]).includes(key))invalid()
  return transaction(async client=>{
   const journal=await lockBridgeJournal(client)
   const stores=new Map<string,Store|undefined>()
   for(const candidate of BSC_OPERATION_KEYS){
    await client.query("insert into render_durable_kv (store_key,value,updated_at) values ($1,'null'::jsonb,now()) on conflict (store_key) do nothing",[candidate])
    const result=await client.query('select value from render_durable_kv where store_key = $1 for update',[candidate])
    stores.set(candidate,store(result.rows[0]?.value))
   }
   const previous=stores.get(key),next=await fn(structuredClone(previous) as T|undefined),validated=store(next)
   if(!validated)invalid()
   for(const [id,op] of Object.entries(validated.operations)){
    const old=previous?.operations[id]
    if(!old||old.state==='prepared'&&op.state==='submitting'){
     if(!old&&op.state!=='prepared')invalid()
     assertNoCrossBridgeReservation(journal,{network:'bsc',address:op.quote.walletAddress},now())
     for(const [otherKey,otherStore] of stores)for(const [otherId,other] of Object.entries(otherKey===key?validated.operations:otherStore?.operations??{})){
      if(otherKey===key&&otherId===id)continue
      if(other.quote.walletAddress.toLowerCase()===op.quote.walletAddress.toLowerCase()&&reserved(other,now()))throw Object.assign(Error('Another action from this BNB Chain wallet is still being confirmed. Check Activity before trying again.'),{status:409,code:'wallet_action_pending'})
     }
    }
   }
   await client.query('update render_durable_kv set value = $2::jsonb, updated_at = now() where store_key = $1',[key,JSON.stringify(next)])
   return next
  })
 }
}
export const mutateBscOperationStore=createBscOperationMutator()
