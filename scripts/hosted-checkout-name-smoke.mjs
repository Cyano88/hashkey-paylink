import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {transform} from 'esbuild'
const source=await readFile('api/ng-pos.ts','utf8')
const block=source.slice(source.indexOf("    if (action === 'createOfframpOrder') {"),source.indexOf("    if (action === 'createBankSendOrder') {"))
const js=(await transform('async function handle(req,res){const body=req.body,action=body.action;'+block+'}',{loader:'ts',target:'es2020'})).code
let existing={intent_id:'chk_fixture',source:'hosted-checkout'},verified=true,kyc=true,checks=0
const deps={checkCheckoutBuyerAllowance:async()=>{},cleanText:(v,f)=>typeof v==='string'?v:f,isAddress:v=>/^0x[a-f0-9]{40}$/.test(v),getPaycrestPosOrder:async()=>existing,readStore:async()=>({intents:{},merchants:{}}),verifiedPrivyUser:async()=>{if(!verified)throw Error('sign in');return{userId:'payer'}},requirePocketBasicKyc:async()=>{checks++;if(!kyc)throw Error('verify identity')},syncOwnedPosExecution:async()=>null}
const handler=Function(...Object.keys(deps),js+';return handle')(...Object.values(deps))
async function run(body={}){let code=200,data;await handler({body:{action:'createOfframpOrder',intent_id:'chk_fixture',refund_address:'0x'+'1'.repeat(40),...body}},{status(n){code=n;return this},json(v){data=v;return this}});return{code,data}}
assert.equal((await run()).data.order,existing);assert.equal(checks,1)
kyc=false;await assert.rejects(run(),/verify identity/);kyc=true
verified=false;await assert.rejects(run(),/sign in/);verified=true
existing={...existing,source:'ngpos'};assert.equal((await run({source:'hosted-checkout'})).code,400,'Client cannot claim the hosted exemption')
assert.equal((await run({payer_name:'Payer'})).code,200)
existing=undefined;assert.equal((await run()).code,400,'New payout creation still requires its existing input')
const page=await readFile('src/pages/PaymentPage.tsx','utf8'),expr=page.match(/const requiresAttendeeName = ([^\r\n]+)/)[1]
const needsName=Function('isHostedLocalSettlement','isEventMode','isNgPosPayment','isPolymarketFunding','isAgentOrWalletFunding','isHelperAccess','return '+expr)
assert.equal(needsName(true,false,true,false,false,false),false)
assert.equal(needsName(false,false,true,false,false,false),true)
assert.equal(needsName(false,true,false,false,false,false),true)
console.log('PASS hosted checkout restores without name; authentication and KYC still enforced; client spoofing, new payouts and event-name requirements remain protected.')
