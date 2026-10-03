import assert from 'node:assert/strict'
import {get} from 'node:http'
import {existsSync} from 'node:fs'
const origin='http://127.0.0.1:4391',pending='.codex-temp/arc-trade-canary-pending.json'
const before=existsSync(pending)
for(const path of ['/seller/','/buyer/','/client.js'])assert.equal((await fetch(origin+path)).status,200)
const wrongHost=await new Promise((resolve,reject)=>get(origin,{headers:{Host:'untrusted.invalid'}},r=>{r.resume();resolve(r.statusCode)}).on('error',reject))
assert.equal(wrongHost,403)
for(const [path,headers,body] of [
 ['/challenge',{},{}],
 ['/challenge',{Origin:'https://untrusted.invalid'},{}],
 ['/challenge',{Origin:origin},{role:'buyer',action:'create',termsHash:'wrong',userToken:'fixture'}],
 ['/challenge',{Origin:origin},{role:'seller',action:'fund',termsHash:'wrong',userToken:'fixture'}],
 ['/challenge',{Origin:origin},{role:'buyer',action:'fund',termsHash:'wrong',userToken:'fixture',amount:'1'}],
 ['/api/circle-solana-email',{Origin:origin,'X-Canary-Role':'seller'},{chain:'arc',action:'createWallet'}],
 ['/api/circle-solana-email',{Origin:origin,'X-Canary-Role':'seller'},{chain:'arc',action:'requestEmailOtp',email:'wrong@example.invalid'}],
])assert.equal((await fetch(origin+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})).status,403)
assert.equal(existsSync(pending),before)
const seller=await(await fetch(origin+'/status?role=seller')).json()
const buyer=await(await fetch(origin+'/status?role=buyer')).json()
assert.equal(seller.action,process.argv.includes('--refund')?'refund':'create');assert.equal(buyer.action,null)
if(process.argv.includes('--refund')){assert.equal(seller.state,2);assert.equal(buyer.state,2);assert.equal(seller.label,'Return 0.10 USDC to buyer')}
console.log('PASS: page/bundle, Host/Origin, account/action/amount/consent restrictions, and participant actions. No OTP or challenge sent.')
