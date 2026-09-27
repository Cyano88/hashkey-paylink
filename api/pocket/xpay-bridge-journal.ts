import { randomUUID } from 'node:crypto'
import { mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import type { XPayBridgePlan } from './xpay-cctp-provider.js'

export type XPayBridgeRecord = {
  id:string; key:string; owner:string; checkoutId:string; plan:XPayBridgePlan
  state:'quoted'|'burn_authorized'|'burn_submitted'|'burn_failed'|'attested'|'mint_requested'|'mint_submitted'|'mint_failed'|'completed'
  burnHash?:string; burnStartBlock?:string; burnScanBlock?:string; message?:string; attestation?:string; nonce?:string
  mintKey?:string; challengeId?:string; mintHash?:string; createdAt:number; updatedAt:number
}
type Store={records:XPayBridgeRecord[]}
const storeKey=(owner:string)=>'pocket:xpay:bridge:v1:'+owner
const fail=(message:string):never=>{throw Object.assign(new Error(message),{status:409})}
const defaults={read:readDurableJson<Store>,mutate:mutateDurableJson<Store>,now:Date.now,id:randomUUID}
export function createXPayBridgeJournal(overrides:Partial<typeof defaults>={}) {
  const d={...defaults,...overrides}
  async function update(owner:string,id:string,fn:(r:XPayBridgeRecord,store:Store)=>void){
    let found:XPayBridgeRecord|undefined
    await d.mutate(storeKey(owner),s=>{const store=s||{records:[]};const r=store.records.find(r=>r.owner===owner&&r.id===id);if(!r)fail('Bridge payment not found.');fn(r,store);r.updatedAt=d.now();found=structuredClone(r);return store})
    return found!
  }
  return {
    async find(owner:string,id:string){return (await d.read(storeKey(owner)))?.records.find(r=>r.owner===owner&&r.id===id)},
    async pending(owner:string){return (await d.read(storeKey(owner)))?.records.filter(r=>r.owner===owner&&!['completed','quoted','burn_failed'].includes(r.state))||[]},
    async create(owner:string,key:string,checkoutId:string,plan:XPayBridgePlan){
      let found:XPayBridgeRecord|undefined
      await d.mutate(storeKey(owner),s=>{const store=s||{records:[]};const existing=store.records.find(r=>r.key===key)
        if(existing){if(existing.owner!==owner||existing.checkoutId!==checkoutId||existing.plan.source!==plan.source||existing.plan.destination!==plan.destination||existing.plan.minimumReceiveUnits!==plan.minimumReceiveUnits)fail('This reference already has different bridge details.');found=existing;return store}
        if(store.records.some(r=>!['completed','quoted','burn_failed'].includes(r.state)))fail('An earlier bridge needs confirmation before another can start.')
        found={id:d.id(),key,owner,checkoutId,plan,state:'quoted',createdAt:d.now(),updatedAt:d.now()};store.records.push(found);return store})
      return found!
    },
    claimBurn:(owner:string,id:string,startBlock:string)=>update(owner,id,(r,store)=>{if(store.records.some(other=>other.id!==r.id&&!['completed','quoted','burn_failed'].includes(other.state)))fail('An earlier bridge is awaiting confirmation.');if(r.state!=='quoted')fail('This bridge already started. Check its status before retrying.');if(r.plan.expiresAt<=d.now())fail('Bridge quote expired. Review the updated quote.');if(!/^\d+$/.test(startBlock))fail('Source block is required before authorization.');r.burnStartBlock=startBlock;r.burnScanBlock=startBlock;r.state='burn_authorized'}),
    advanceBurnScan:(owner:string,id:string,end:string)=>update(owner,id,r=>{if(r.state==='burn_authorized'&&!r.burnHash&&/^\d+$/.test(end)&&BigInt(end)>=BigInt(r.burnScanBlock||'0'))r.burnScanBlock=end}),
    recordBurnHash:(owner:string,id:string,hash:string)=>update(owner,id,r=>{if(!/^0x[0-9a-f]{64}$/i.test(hash))fail('Invalid bridge transaction.');if(r.burnHash){if(r.burnHash.toLowerCase()!==hash.toLowerCase())fail('Bridge transaction cannot be replaced.');return}if(r.state!=='burn_authorized')fail('Authorize this bridge first.');r.burnHash=hash.toLowerCase();r.state='burn_submitted'}),
    // Only call after exact source transaction and canonical receipt verification.
    markBurnReverted:(owner:string,id:string)=>update(owner,id,r=>{if(r.state!=='burn_submitted'||!r.burnHash)fail('Source transaction has not been verified.');r.state='burn_failed'}),
    recordAttestation:(owner:string,id:string,proof:{message:string;attestation:string;nonce:string})=>update(owner,id,r=>{
      if(!r.burnHash||!['burn_submitted','attested','mint_failed'].includes(r.state))fail('This bridge is not waiting for an attestation.')
      if(r.nonce&&r.nonce!==proof.nonce)fail('Bridge nonce cannot change during recovery.')
      Object.assign(r,proof);r.state='attested'
    }),
    claimMint:(owner:string,id:string)=>update(owner,id,r=>{
      // A lost Circle response retries the same request key, never a second burn.
      if(['mint_requested','mint_submitted'].includes(r.state))return
      if(r.state!=='attested'||!r.message||!r.attestation)fail('Wait for the verified bridge attestation.')
      r.mintKey=d.id();r.challengeId=undefined;r.mintHash=undefined;r.state='mint_requested'
    }),
    recordChallenge:(owner:string,id:string,key:string,challengeId:string)=>update(owner,id,r=>{
      if(!['mint_requested','mint_submitted'].includes(r.state)||r.mintKey!==key)fail('Bridge approval changed. Check status.')
      if(r.challengeId&&r.challengeId!==challengeId)fail('Bridge challenge cannot change.');r.challengeId=challengeId;r.state='mint_submitted'
    }),
    // Only a provider-confirmed failed challenge or matching reverted mint can allow another mint.
    markMintFailed:(owner:string,id:string,key:string)=>update(owner,id,r=>{if(!['mint_requested','mint_submitted'].includes(r.state)||r.mintKey!==key)fail('Bridge approval changed.');r.state='mint_failed'}),
    // Only call after both MessageReceived and the exact native-USDC mint are verified on Base.
    complete:(owner:string,id:string,hash:string)=>update(owner,id,r=>{
      if(!/^0x[0-9a-f]{64}$/i.test(hash))fail('Invalid destination transaction.')
      if(r.state==='completed'){if(r.mintHash!==hash.toLowerCase())fail('Completed bridge receipt cannot change.');return}
      if(!['mint_requested','mint_submitted','mint_failed'].includes(r.state))fail('Bridge mint is not ready to confirm.')
      r.mintHash=hash.toLowerCase();r.state='completed'
    }),
  }
}
