import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {decodeFunctionData,parseAbi} from 'viem'
const quote={intentId:'intent',providerOrderId:'provider',merchantId:'merchant',fiatAmount:'1000.00',currency:'NGN',fundingUnits:'736603',recipient:'0x'+'1'.repeat(40),wallet:'0x'+'2'.repeat(40),walletId:'wallet',expiresAt:Date.now()+300000}
const order={intent_id:'intent',paycrest_order_id:'provider',merchant_id:'merchant',amount_ngn:'1000.00',fiat_currency:'NGN',amount_usdc:'0.736603',receive_address:quote.recipient,refund_address:quote.wallet,status:'initiated',valid_until:new Date(quote.expiresAt).toISOString(),created_at:new Date().toISOString()}
const mocks={
 '../ng-pos.js':`export default async function handler(){};export const listPocketXPayPosDestinations=async()=>[]`,
 './xpay.js':`export const listPocketXPayStockDestinations=async()=>[]`,
 './unified-xpay-store.js':`export const assertUnifiedXPayDestination=async()=>({})`,
 '../local-currency-profile.js':`export const localCurrencyProfileRepository={}`,
 '../privy-circle-link.js':`export const circleLinkKey=()=>'';export const readCircleLink=async()=>null`,
 '../paycrest-pos.js':`export const getPaycrestPosOrder=async()=>globalThis.testOrder;export const markPaycrestPosPayment=async input=>{globalThis.marked=input;return globalThis.testOrder}`,
 '../paycrest-reconcile.js':`export const schedulePaycrestOrderReconciliation=()=>{globalThis.scheduled=true}`,
 '../usdc-transfer-verify.js':`export const verifyEvmUsdcTransfer=async input=>{globalThis.verified=input;if(!globalThis.proved)throw Error('Not confirmed')}`,
}
await build({entryPoints:['api/pocket/xpay-bank-payout.ts'],outfile:'.codex-temp/xpay-payout-test.mjs',bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const {assertXPayPayoutPayable,confirmXPayPayout,xpayPayoutCall}=await import('../.codex-temp/xpay-payout-test.mjs')
assert.equal(assertXPayPayoutPayable(order,quote),quote.expiresAt)
for(const patch of [{amount_usdc:'0.736604'},{refund_address:quote.recipient},{merchant_id:'other'},{fiat_currency:'UGX'},{amount_ngn:'2000.00'},{paycrest_order_id:'other'},{status:'pending'},{tx_hash:'0x123'},{valid_until:new Date().toISOString()}])assert.throws(()=>assertXPayPayoutPayable({...order,...patch},quote))
const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:xpayPayoutCall(quote)})
assert.equal(batch.args[0].length,1);assert.equal(batch.args[0][0].value,0n)
const transfer=decodeFunctionData({abi:parseAbi(['function transfer(address,uint256) returns(bool)']),data:batch.args[0][0].data})
assert.equal(transfer.args[0].toLowerCase(),quote.recipient);assert.equal(transfer.args[1],736603n)
globalThis.testOrder=order;const hash='0x'+'3'.repeat(64)
await assert.rejects(()=>confirmXPayPayout(quote,hash),/Not confirmed/);assert.equal(globalThis.marked,undefined)
globalThis.proved=true;await confirmXPayPayout(quote,hash)
assert.equal(globalThis.verified.confirmation,'base-included');assert.equal(globalThis.verified.payer,quote.wallet);assert.equal(globalThis.verified.recipient,quote.recipient);assert.equal(globalThis.marked.txHash,hash);assert.equal(globalThis.scheduled,true)
globalThis.testOrder={...order,tx_hash:'0x'+'4'.repeat(64)};await assert.rejects(()=>confirmXPayPayout(quote,hash))
console.log('PASS payout adapter: exact provider amount (no duplicate fee), recipient/refund/merchant/currency binding, expiry, canonical Base proof before marking funded, and conflicting-hash rejection.')
