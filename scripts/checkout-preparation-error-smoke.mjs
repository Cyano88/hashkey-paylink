import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {transform} from 'esbuild'

const source=await readFile('src/pages/PaymentPage.tsx','utf8')
const body=source.slice(source.indexOf('  async function prepareNgPosPaycrestOrder('),source.indexOf('  async function verifyBankSendRefundAccount('))
const js=(await transform(body,{loader:'ts',target:'es2020'})).code
let response={ok:false,error:'Complete Basic verification to use bank transfers.',code:'KYC_BASIC_REQUIRED'}
let shown='',busy=false,notified=0,continued=0
const deps={isNgPosPaycrestOfframp:true,pocketScan:false,paycrestOrder:null,ngPosPaycrestIntentId:'chk_test',setPaycrestPreparing:v=>busy=v,setPaycrestStatusText:()=>{},getAccessToken:async()=> 'test',fetch:async()=>({ok:response.ok,json:async()=>response}),showPrivyCircleEmailPay:true,privyEmail:'payer@example.com',circleEmail:'',attendeeName:'',notifyPocketKycRequirement:()=>notified++,isHostedLocalSettlement:false,setPaycrestOrder:()=>{},refetchCircleWalletBalance:async()=>{},setCirclePasskeyError:v=>shown=v,readableErrorMsg:(e,f)=>e.message||f}
const prepare=Function(...Object.keys(deps),js+';return prepareNgPosPaycrestOrder')(...Object.values(deps))
const session={wallet:{address:'0x'+'1'.repeat(40)}}
async function review(){await prepare(session,true);continued++}
await assert.rejects(review(),/Complete Basic verification/)
assert.equal(shown,response.error);assert.equal(busy,false);assert.equal(continued,0);assert.equal(notified,1)
assert.equal(await prepare(session),null,'Direct payment retains its existing stop-on-null contract')
response={ok:false,error:'Your session ended. Sign in again to continue.'}
await assert.rejects(review(),/Your session ended/);assert.equal(continued,0)
response={ok:true,order:{intent_id:'chk_test',receive_address:session.wallet.address,amount_usdc:'1.5'}}
assert.equal(await prepare(session,true),response.order);assert.equal(busy,false)
await review();assert.equal(continued,1)
console.log('PASS preparation preserves KYC/auth errors, stops review on failure, clears busy state and allows successful review.')
