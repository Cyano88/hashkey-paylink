import assert from 'node:assert/strict'
import {runPocketReconciliation} from '../api/pocket/reconciliation-worker.ts'
const sources=['base','arbitrum','ethereum','polygon','arc','solana'],seen=[],saved=[]
const records=sources.map(source=>({id:source,ownerId:'fixture',idempotencyKey:'bridge:'+source,action:'wallet.bridge',status:'submitted',createdAt:1,updatedAt:1,metadata:{source,destination:source==='base'?'arbitrum':'base',txHash:'fixture-'+source,amount:'1'}}))
const deps={executions:{listUnresolved:async()=>[]},listBridges:async kind=>kind==='wallet.bridge'?records:[],readBridge:async source=>{seen.push(source);return {status:'confirmed',destinationTxHash:'0x'+'a'.repeat(64)}},recordAction:async r=>{saved.push(r);return r},appendLedger:async()=>{},reconcileBscOutbound:async()=>({checked:0,errors:0}),reconcileBsc:async()=>({checked:0}),auditXLayerBilling:async()=>{},sendEmail:async()=>{},mutateDurable:async(k,f)=>f(undefined),now:()=>100}
const result=await runPocketReconciliation(deps)
assert.equal(result.errors,0);assert.equal(result.reconciled,6);assert.deepEqual(seen.sort(),sources.sort());assert.equal(saved.length,6)
const failed=await runPocketReconciliation({...deps,listBridges:async()=>[],reconcileBscOutbound:async()=>({checked:1,errors:1})})
assert.equal(failed.ok,false);assert.equal(failed.errors,1)
console.log('PASS all six CCTP sources reconcile; BNB bridge failures cannot disappear from worker health')
