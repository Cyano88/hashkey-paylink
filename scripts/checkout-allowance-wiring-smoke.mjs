import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {transform} from 'esbuild'
const source=await readFile('api/circle-solana-email.ts','utf8')
let body=source.slice(source.indexOf('async function verifiedPayoutExemption('),source.indexOf('async function bridgeSourceBalance('))
body=body.replaceAll("await import('./paycrest-pos.js')",'fixtureDeps').replaceAll("await import('./checkout-buyer-allowance.js')",'fixtureDeps').replaceAll("await import('./pocket/transfer-allowance.js')",'fixtureDeps')
const js=(await transform(body,{loader:'ts',target:'es2020'})).code
const address='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40)
let order={source:'hosted-checkout',intent_id:'checkout1',paycrest_order_id:'provider1',receive_address:recipient,refund_address:address,amount_usdc:'5000',status:'initiated',valid_until:new Date(Date.now()+600000).toISOString()},owned=true,calls=[]
const deps={baseStablecoin:s=>s||'USDC',getPaycrestPosOrder:async()=>order,parseUnits:s=>BigInt(Number(s)*1e6),readCircleUserWallet:async()=>({address:owned?address:recipient}),findPaymentCircleLinkByWallet:async()=>({privyUserId:'actual-buyer'}),checkCheckoutBuyerAllowance:async(...args)=>calls.push(['checkout',...args]),reservePocketBankAllowance:async(...args)=>calls.push(['pocket',...args])}
const verify=Function(...Object.keys(deps),'fixtureDeps',js+';return verifiedPayoutExemption')(...Object.values(deps),deps)
const params={feeBps:'0',asset:'USDC',payoutIntentId:'checkout1',chain:'base',recipient,walletAddress:address,walletId:'wallet1',userToken:'fixture',totalUnits:'5000000000'}
await verify(params);assert.equal(calls[0][0],'checkout');assert.equal(calls[0][1],'actual-buyer');assert.equal(calls[0][3],true)
await verify(params,false);assert.equal(calls[1][3],false)
owned=false;await assert.rejects(verify(params,false),/wallet could not be verified/);assert.equal(calls.length,2);owned=true
order={...order,source:'bank-withdraw'};await verify(params,false);assert.equal(calls.at(-1)[0],'pocket')
await assert.rejects(verify({...params,totalUnits:'1'},false),/does not match/)
assert.ok(source.indexOf("verifiedPayoutExemption({ ...params, feeBps: '0' },false)")<source.indexOf('let paymentIdempotencyKey=idempotencyKey'))
assert.match(source,/idempotencyKey:paymentIdempotencyKey/)
console.log('PASS hosted quotes and executions use buyer quota, wallet ownership precedes reservation, mismatched amounts fail, Pocket withdrawals retain their own quota, and hosted signing uses a server-bound retry key.')
