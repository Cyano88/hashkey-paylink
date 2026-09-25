const executing=new Set<string>()
export function claimSendAttempt(owner:string,id:string){const k=owner+':'+id;if(executing.has(k))return false;executing.add(k);return true}
export function releaseSendAttempt(owner:string,id:string){executing.delete(owner+':'+id)}
import type { PocketNetwork, PocketActivityRow } from './pocketSchemas'
export type PocketSendAttempt = {
 idempotencyKey: string; owner: string; network: PocketNetwork; sourceAddress: string; recipient: string; amount: string;
 fingerprint: string; context: string; state: 'preparing'|'submitted'|'accepted'|'confirmed'|'failed';
 challengeId: string; transactionId: string; txHash: string; createdAt: number; updatedAt: number; error?: string
}
const PREFIX = 'pocket:send-attempt:v1:'
export const POCKET_SENDS_UPDATED = 'pocket:sends-updated'
export const sendOwner = (owner: string) => owner.trim().toLowerCase()
const key = (owner:string,id:string) => PREFIX + encodeURIComponent(sendOwner(owner)) + ':' + encodeURIComponent(id)
export function readSendAttempts(owner:string, storage:Storage=localStorage):PocketSendAttempt[] {
 if(!owner)return []
 const prefix=PREFIX+encodeURIComponent(sendOwner(owner))+':'
 const records:PocketSendAttempt[]=[]
 for(let i=0;i<storage.length;i++) {const k=storage.key(i);if(!k?.startsWith(prefix))continue
  const record=JSON.parse(storage.getItem(k)||'null') as PocketSendAttempt|null
  if(!record||record.owner!==sendOwner(owner)||!record.idempotencyKey||!record.sourceAddress||!record.recipient||!record.amount||!['solana','base','arbitrum','arc','ethereum','polygon'].includes(record.network)||!['preparing','submitted','accepted','confirmed','failed'].includes(record.state)||!Number.isFinite(record.createdAt))throw Error('A saved transfer could not be read. Check Activity before repeating it.')
  records.push(record)
 }
 return records.sort((a,b)=>b.createdAt-a.createdAt)
}
export function saveSendAttempt(record:PocketSendAttempt, storage:Storage=localStorage) {
 const k=key(record.owner,record.idempotencyKey),old=JSON.parse(storage.getItem(k)||'null') as PocketSendAttempt|null
 // Late callbacks cannot overwrite another attempt or regress a terminal result.
 const next=old&&['confirmed','failed'].includes(old.state)?old:{...record,owner:sendOwner(record.owner),updatedAt:Date.now()}
 storage.setItem(k,JSON.stringify(next))
 if(typeof window!=='undefined')window.dispatchEvent(new Event(POCKET_SENDS_UPDATED))
 return next
}
export function updateSendAttempt(owner:string,id:string,patch:Partial<PocketSendAttempt>,storage:Storage=localStorage) {
 const record=readSendAttempts(owner,storage).find(r=>r.idempotencyKey===id)
 return record?saveSendAttempt({...record,...patch,owner:record.owner,idempotencyKey:record.idempotencyKey},storage):null
}
export function migrateLegacySends(owner:string,wallets:Partial<Record<PocketNetwork,{address:string}>>,storage:Storage=localStorage) {
 for(const [legacy,rail]of [['pocket:evm-send:operation:v1','evm'],['pocket:solana-send:operation:v2','solana']]as const){
  const value=JSON.parse(storage.getItem(legacy)||'null');if(!value)continue
  const network:PocketNetwork=rail==='solana'?'solana':value.network
  const source=value.sourceAddress||(rail==='solana'?value.fingerprint?.split(':')[0]:'')
  const linked=wallets[network]?.address
  if(!linked||!source||(network==='solana'?linked!==source:linked.toLowerCase()!==source.toLowerCase()))continue
  if(!value.idempotencyKey||!value.recipient||!value.amount)continue
  saveSendAttempt({...value,owner:sendOwner(owner),network,sourceAddress:source,context:value.context||'send',txHash:value.txHash||'',createdAt:value.createdAt||value.updatedAt},storage)
  storage.removeItem(legacy)
 }
}
export function mergeSendActivity(rows:PocketActivityRow[],attempts:PocketSendAttempt[]):PocketActivityRow[] {
 const matchKey=(network:string,hash:string)=>network+':'+(network==='solana'?hash:hash.toLowerCase())
 const terminal=new Map(attempts.filter(r=>r.txHash&&['confirmed','failed'].includes(r.state)).map(r=>[matchKey(r.network,r.txHash),r]))
 rows=rows.map(row=>{
  const saved=row.txHash?terminal.get(matchKey(row.chain||'',row.txHash)):undefined
  // Local chain proof may advance an ordinary transfer, never bank/bill/request settlement.
  if(saved&&row.source==='wallet-withdrawal'&&['pending','submitted','processing',''].includes(row.paycrestStatus||''))return {...row,paycrestStatus:saved.state==='confirmed'?'confirmed':'failed'}
  return row
 })
 const hashes=new Set(rows.filter(r=>r.txHash).map(r=>matchKey(r.chain||'',r.txHash)))
 const local=attempts.filter(r=>!r.txHash||!hashes.has(matchKey(r.network,r.txHash))).map<PocketActivityRow>(r=>({eventId:'send:'+r.idempotencyKey,txHash:r.txHash,chain:r.network,payer:r.sourceAddress,recipient:r.recipient,amount:r.amount,memo:r.context.startsWith('request:')?'Request payment':'USDC sent',ts:r.createdAt,source:r.context.startsWith('request:')?'request':'wallet-withdrawal',settlementType:'wallet_transfer',direction:'out',paycrestStatus:r.state==='confirmed'?'confirmed':r.state==='failed'?'failed':'pending',supportReference:r.idempotencyKey}))
 return [...rows,...local].sort((a,b)=>b.ts-a.ts)
}
