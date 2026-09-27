import assert from 'node:assert/strict'
import {encodeFunctionData,parseAbi} from 'viem'
import {build} from 'esbuild'
await build({entryPoints:['src/pocket/lib/pocketXPayBankClient.ts'],outfile:'.codex-temp/xpay-client-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'routes',setup(b){b.onResolve({filter:/pocketRoutes$/},()=>({path:'routes',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const pocketApiUrl=s=>s'}))}}]})
const {validateXPayBankCall}=await import('../.codex-temp/xpay-client-test.mjs')
const source='0x'+'1'.repeat(40),destination='0x'+'2'.repeat(40),token='0xB6CEceAB302E2E4948951eE7843FC24E92933061',messenger='0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'
const review={id:'p',checkoutId:'qr',merchantId:'m',source,token,amountUnits:'101',bridgeUnits:'101',baseWallet:destination,fundingUnits:'100'}
const plan={source,destination,burnUnits:'101',minimumReceiveUnits:'100',maxFeeUnits:'1',finality:1000,expiresAt:Date.now()+30000}
const approval={kind:'approval',to:token,data:encodeFunctionData({abi:parseAbi(['function approve(address,uint256) returns(bool)']),functionName:'approve',args:[messenger,101n]}),value:'0',gas:'100',gasPrice:'1'}
const response={payment:review,bridgePlan:plan,transaction:approval}
assert.equal(validateXPayBankCall(review,response),approval)
for(const patch of [{destination:source},{source:destination},{burnUnits:'102'},{maxFeeUnits:'2'},{minimumReceiveUnits:'99'},{expiresAt:0}])assert.throws(()=>validateXPayBankCall(review,{...response,bridgePlan:{...plan,...patch}}))
assert.throws(()=>validateXPayBankCall(review,{...response,transaction:{...approval,value:'1'}}))
assert.throws(()=>validateXPayBankCall(review,{...response,payment:{...review,id:'other'}}))
const word='0x'+destination.slice(2).padStart(64,'0')
const burn={...approval,kind:'burn',to:messenger,data:encodeFunctionData({abi:parseAbi(['function depositForBurn(uint256,uint32,bytes32,address,bytes32,uint256,uint32)']),functionName:'depositForBurn',args:[101n,6,word,token,word,1n,1000]})}
assert.equal(validateXPayBankCall(review,{...response,transaction:burn}),burn)
assert.throws(()=>validateXPayBankCall(review,{...response,transaction:{...burn,to:source}}))
console.log('PASS client binding: merchant/payment/source, original Base destination, exact approval, native USDC burn, domain, fee cap, quote expiry and zero native value.')
