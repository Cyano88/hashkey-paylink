import {build} from 'esbuild'
import assert from 'node:assert/strict'
await build({entryPoints:['api/pocket/xpay-bank.ts'],outfile:'.codex-temp/xpay-bank-api-test.mjs',bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'fixtures',setup(b){const mocks={'../privy-circle-link.js':'export const verifiedPrivyUser=async()=>{}','./xpay-bank-service.js':'export const createXPayBankService=()=>({})'};b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {createXPayBankHandler}=await import('../.codex-temp/xpay-bank-api-test.mjs')
const p={id:'payment',key:'private-idempotency',owner:'alice',state:'payout_submitted',source:'wallet',payoutKey:'private-payout-key',payout:{merchantName:'Merchant',fundingUnits:'100',walletId:'private-wallet-id',currency:'NGN'},createdAt:1,updatedAt:2}
const bridge={state:'completed',message:'private-message',attestation:'private-attestation',mintKey:'private-mint-key',plan:{destinationWalletId:'private-wallet-id'}}
let auth=true,approved,session,seenOwner
const handler=createXPayBankHandler({identity:async()=>{if(!auth)throw Object.assign(Error('Sign in.'),{status:401});return {userId:'alice'}},service:{list:async owner=>{seenOwner=owner;return [p]},snapshot:async(owner,id)=>{assert.equal(owner,'alice');if(id!=='payment')throw Object.assign(Error('Not found.'),{status:404});return {payment:p,bridge}},approve:async(owner,id,token)=>{approved={owner,id,token};if(token!=='pin')throw Object.assign(Error('PIN required'),{status:403})},status:async(owner,id,token)=>{session=token},payout:async()=>{throw Error('private provider response')},authorizeSwap:async()=>({record:p,quote:{id:'review'},swap:{to:'0x1',data:'0x1234',value:0n},gas:100n,gasPrice:2n})}})
async function call(body,headers={},method='POST'){let status=200,result;const res={setHeader(){},status(n){status=n;return this},json(b){result=b;JSON.stringify(b);return this}};await handler({method,body,headers},res);return {status,result}}
auth=false;assert.equal((await call({action:'list'})).status,401);auth=true
assert.equal((await call({action:'list'}, {},'GET')).status,405)
const list=await call({action:'list',owner:'bob'});assert.equal(seenOwner,'alice');assert.equal(list.status,200)
for(const secret of ['private-idempotency','private-payout-key','private-wallet-id'])assert.equal(JSON.stringify(list.result).includes(secret),false)
assert.equal((await call({action:'prepare'})).status,409)
assert.equal((await call({action:'approve',id:'payment',approval:'pin'})).status,409)
assert.equal((await call({action:'approve',id:'payment'},{'x-pocket-payment-approval':'bad'})).status,409)
assert.equal((await call({action:'approve',id:'payment'},{'x-pocket-payment-approval':'pin'})).status,409)
assert.equal(approved,undefined,'retired stock-to-bank path must not approve a new payment')
const status=await call({action:'status',id:'payment',circleUserToken:'ephemeral-session'})
assert.equal(session,'ephemeral-session');assert.equal(status.result.payment.progress.payment,'waiting')
for(const secret of ['private-message','private-attestation','private-mint-key','ephemeral-session'])assert.equal(JSON.stringify(status.result).includes(secret),false)
assert.equal((await call({action:'status',id:'other'})).status,404)
const signed=await call({action:'swap',id:'payment'});assert.equal(signed.result.transaction.value,'0');assert.equal(signed.result.transaction.gas,'100')
const error=await call({action:'payout',id:'payment',circleUserToken:'session'});assert.equal(error.status,503);assert.equal(JSON.stringify(error.result).includes('private provider'),false)
assert.equal((await call({action:'unsupported',id:'payment'})).status,400)
console.log('PASS XPay API: authenticated owner scope, header-only PIN approval, sanitized snapshots/errors, ephemeral Circle sessions, and JSON-safe signing calls.')
