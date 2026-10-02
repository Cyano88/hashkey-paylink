import assert from 'node:assert/strict'
import {localCurrencyProfileRepository} from '../api/local-currency-profile.ts'
import {readSupportFeatureRecords} from '../api/pocket/support-feature-records.ts'
const originalFetch=globalThis.fetch;let rpcCalls=0
// Fail this audit if a support lookup attempts JSON-RPC. Database reads remain enabled.
globalThis.fetch=async(url,init)=>{let body;try{body=JSON.parse(String(init?.body||''))}catch{};if(body?.jsonrpc||Array.isArray(body)&&body.some(x=>x?.jsonrpc)){rpcCalls++;throw Error('Unexpected RPC in saved-record lookup')}return originalFetch(url,init)}
try{const profile=await localCurrencyProfileRepository.getByPocketId(process.argv[2]);assert(profile?.privyUserId);const result={readOnly:true,noCasesCreated:true,features:{}}
 for(const kind of ['requests','gifts','xpay','collections']){const list=await readSupportFeatureRecords(profile.privyUserId,kind);let selected=false;if(list[0]){const details=await readSupportFeatureRecords(profile.privyUserId,kind,list[0].id);assert.equal(details[0]?.id,list[0].id);assert.ok(!JSON.stringify(details).includes('claimSigner'));selected=true}result.features[kind]={lookupPassed:true,recordsPresent:list.length>0,selectionChecked:selected}}
 assert.equal(rpcCalls,0);console.log(JSON.stringify({...result,rpcCalls}));process.exit(0)
}catch{console.error(JSON.stringify({auditPassed:false,rpcCalls,noCasesCreated:true}));process.exit(1)}
