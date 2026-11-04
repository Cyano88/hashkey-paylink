import assert from 'node:assert/strict'
import {applyPocketBridgeReservation as apply} from '../src/pocket/lib/pocketBridgeReservation.ts'
import {savePocketBridgeTransfer,readPocketBridgeTransfers,parsePocketPendingBridge} from '../src/pocket/lib/pocketPendingBridge.ts'
const original={id:crypto.randomUUID(),source:'base',destination:'arbitrum',amount:'1',createdAt:Date.now(),progress:'submitted'}
const hash='0x'+'a'.repeat(64)
const pending=apply(original,{managed:true,status:'pending',txHash:hash,reservationReleased:false})
assert.equal(pending.reservationReleased,false)
assert.equal(apply(pending,{managed:true,status:'not_submitted',reservationReleased:true}).progress,'submitted','A late unsigned result cannot erase a saved hash')
assert.equal(apply(pending,{managed:true,status:'completed',sourceOutcome:'source_confirmed',txHash:hash,reservationReleased:true}).progress,'submitted','Source success is not destination success')
assert.throws(()=>apply(pending,{managed:true,txHash:'0x'+'b'.repeat(64)}),/changed/)
assert.throws(()=>apply(pending,{managed:false}),/unavailable/)
assert.equal(apply(original,{managed:true,status:'not_submitted',reservationReleased:true}).progress,'failed')
assert.equal(apply(pending,{managed:true,status:'failed',sourceOutcome:'source_failed',reservationReleased:true}).progress,'failed')
assert.throws(()=>parsePocketPendingBridge({...original,reservationReleased:'true'}),/Invalid/)
const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)}
savePocketBridgeTransfer('owner',{...original,progress:'failed'},storage)
savePocketBridgeTransfer('owner',pending,storage)
assert.equal(readPocketBridgeTransfers('owner',storage)[0].progress,'submitted','Backend recovery revives local failure')
savePocketBridgeTransfer('owner',{...original,txHash:hash,progress:'completed',historySynced:true},storage)
assert.equal(readPocketBridgeTransfers('owner',storage)[0].reservationReleased,false,'History sync does not release source reservation')
const release=apply(pending,{managed:true,status:'completed',sourceOutcome:'source_confirmed',txHash:hash,reservationReleased:true})
savePocketBridgeTransfer('owner',release,storage)
savePocketBridgeTransfer('owner',pending,storage)
assert.equal(readPocketBridgeTransfers('owner',storage)[0].reservationReleased,true,'Verified release survives late pending responses')
assert.equal(readPocketBridgeTransfers('other',storage).length,0)
console.log('PASS web reservation recovery: source/destination separation, hash binding, late cancellation, terminal proof, history merging and owner isolation. Fixtures only.')

// A recovered native Cash transfer must retain its purpose when web Activity records it.
const {recordPocketBridge,readPocketBridgeQuote}=await import('../src/pocket/api/pocketBridgeClient.ts')
const sent=[]
const fetcher=async(url,options)=>{sent.push(JSON.parse(options.body));return Response.json({ok:true,quote:{}})}
await readPocketBridgeQuote({accessToken:'fixture',source:'solana',destination:'base',amount:'1',purpose:'cash',fetcher})
await recordPocketBridge({accessToken:'fixture',source:'solana',destination:'base',amount:'1',purpose:'cash',txHash:'2'.repeat(88),status:'submitted',fetcher})
assert.deepEqual(sent.map(row=>row.purpose),['cash','cash'])
console.log('PASS web Cash attribution: quote and recovered Activity recording both carry Cash purpose.')
