import assert from 'node:assert/strict'
import {runFundingAttempt,readFundingAttempt} from '../src/pocket/lib/pocketFundingAttempt.ts'
import {readPocketBridgeTransfers} from '../src/pocket/lib/pocketPendingBridge.ts'
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)}}
const db=storage(),owner='owner@example.com',key='bills:1',route={source:'base',destination:'arbitrum',amount:'1',walletAddress:'0x'+'1'.repeat(40)}
let sends=0,release;const hash='0x'+'a'.repeat(64)
const input={owner,key,route,storage:db,execute:async(id,challenge)=>{sends++;assert.equal(readFundingAttempt(owner,key,db).id,id);challenge('challenge');await new Promise(r=>release=r);throw Error('Lost response')},recover:async record=>({...record,txHash:hash,progress:'submitted'})}
const one=runFundingAttempt(input),two=runFundingAttempt(input);assert.equal(one,two);release();await assert.rejects(one,/saved/);assert.equal(sends,1)
const record=await runFundingAttempt({...input,execute:async()=>{throw Error('No redispatch')}});assert.equal(record.txHash,hash);assert.equal(record.challengeId,'challenge');assert.equal(sends,1)
await assert.rejects(runFundingAttempt({...input,key:'bills:2'}),/saved/)
await assert.rejects(runFundingAttempt({...input,route:{...route,source:'polygon'}}),/saved/)
await assert.rejects(runFundingAttempt({...input,route:{...route,amount:'2'}}),/saved/)
const lost=storage();let id;
await assert.rejects(runFundingAttempt({...input,storage:lost,execute:async attempt=>{id=attempt;throw Error('No response before challenge')}}),/saved/)
const recovered=await runFundingAttempt({...input,storage:lost,recover:async row=>{assert.equal(row.id,id);assert.equal(row.challengeId,undefined);return {...row,txHash:hash}},execute:async()=>{throw Error('Must not execute')}});assert.equal(recovered.txHash,hash)
const failed=storage();await assert.rejects(runFundingAttempt({...input,storage:failed,execute:async()=>{throw Error('Unknown')}}),/saved/)
await assert.rejects(runFundingAttempt({...input,storage:failed,recover:async row=>({...row,progress:'failed',managedReservation:true,reservationReleased:true})}),/not completed/)
assert.equal(readPocketBridgeTransfers(owner,failed)[0].progress,'failed')
assert.equal(readPocketBridgeTransfers('other',db).length,0)
let dispatched=false;await assert.rejects(runFundingAttempt({...input,storage:{getItem:()=>null,setItem:()=>{throw Error('Storage failed')}},execute:async()=>{dispatched=true;return hash}}),/Storage failed/);assert.equal(dispatched,false)
console.log('PASS web funding attempts: persist-before-send, concurrent taps, lost response with/without challenge, restart recovery without redispatch, cross-payment blocking, route binding, verified failure, owner isolation and storage failure.')
