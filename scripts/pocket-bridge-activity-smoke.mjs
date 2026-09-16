import assert from 'node:assert/strict'
import { readPocketBridgeTransfers, savePocketBridgeTransfer, savePendingPocketBridge, ambiguousMatchingBridge, bridgeProgressFromProvider } from '../src/pocket/lib/pocketPendingBridge.ts'
import { mergePocketBridgeActivity } from '../src/pocket/lib/pocketBridgeActivity.ts'
const values=new Map()
const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)}
const first={id:'a',source:'base',destination:'arc',amount:'2.25',createdAt:100,challengeId:'challenge-a'}
savePendingPocketBridge('owner',first,storage)
assert.equal(readPocketBridgeTransfers('owner',storage).length,1,'legacy pending transfer is retained')
savePocketBridgeTransfer('owner',{...first,txHash:'hash-a',progress:'arriving',sourceConfirmed:true},storage)
const second={...first,id:'b',amount:'3',challengeId:'challenge-b',createdAt:200}
savePocketBridgeTransfer('owner',second,storage)
let records=readPocketBridgeTransfers('owner',storage)
assert.equal(records.length,2,'multiple transfers coexist')
assert.equal(readPocketBridgeTransfers('other',storage).length,0)
assert.equal(ambiguousMatchingBridge(records,'base','arc','2.250000'),undefined,'an arriving bridge must not block an intentional new bridge')
assert.equal(ambiguousMatchingBridge(records,'base','arc','3.000000').id,'b','only the same ambiguous attempt is protected')
assert.equal(ambiguousMatchingBridge(records,'base','arc','4'),undefined)
assert.equal(ambiguousMatchingBridge(records,'arbitrum','arc','3'),undefined)
savePocketBridgeTransfer('owner',{...second,progress:'failed'},storage)
assert.equal(ambiguousMatchingBridge(readPocketBridgeTransfers('owner',storage),'base','arc','3'),undefined,'provider-confirmed no-transaction failure permits a fresh attempt')
savePocketBridgeTransfer('owner',{...first,txHash:'hash-a',progress:'completed'},storage)
savePocketBridgeTransfer('owner',{...first,txHash:'hash-a',progress:'submitted'},storage)
records=readPocketBridgeTransfers('owner',storage)
assert.equal(records.find(x=>x.id==='a').progress,'completed','late state cannot downgrade a completed transfer')
assert.equal(bridgeProgressFromProvider('pending'),'submitted')
assert.equal(bridgeProgressFromProvider('attested'),'arriving')
assert.equal(bridgeProgressFromProvider('pending',true),'arriving')
assert.equal(bridgeProgressFromProvider('confirmed'),'completed')
assert.equal(bridgeProgressFromProvider('failed',true),'needs_attention','forwarding failure cannot invite another burn')
const server={eventId:'server-a',txHash:'hash-a',chain:'base',amount:'2.25',payer:'wallet',memo:'bridge',ts:100,source:'wallet-bridge',destination:'arc',paycrestStatus:'completed'}
const rows=mergePocketBridgeActivity([server,{...server,eventId:'burn-a',source:'wallet-withdrawal'}],records)
assert.equal(rows.length,2,'one Activity row per transfer, without a duplicate source debit')
assert.equal(rows.find(x=>x.bridge?.id==='a').paycrestStatus,'Completed')
assert.equal(rows.find(x=>x.bridge?.id==='b').paycrestStatus,'Failed')
const remoteCompleted=mergePocketBridgeActivity([server],[{...first,txHash:'hash-a',progress:'arriving'}])
assert.equal(remoteCompleted[0].bridge.progress,'completed','server confirmation wins over stale local progress')
assert.throws(()=>savePocketBridgeTransfer('owner',{...first,id:'c'}, {...storage,setItem:()=>{throw Error('storage unavailable')}}),/storage unavailable/)
console.log('Pocket Activity bridge progress and multiple-transfer tests passed.')
