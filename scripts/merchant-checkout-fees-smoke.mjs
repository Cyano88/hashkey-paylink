import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createPaymentFeeQuote} from '../api/payment-fee-quotes.ts'
const secret='q'.repeat(40);process.env.POCKET_SWAP_QUOTE_SECRET=secret
const now=Date.now(),payer='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40)
const checkout={id:'chk_1234567890',checkoutMode:'human',feePayer:'merchant',network:'base',recipient,amount:'1',createdAt:new Date(now-10000).toISOString(),expiresAt:new Date(now+600000).toISOString()}
const binding={checkoutId:checkout.id,purpose:'payment',asset:'USDC',chain:'base',walletId:'wallet',walletAddress:payer,recipient,amountUnits:'1000000',mode:'net'}
const signed=createPaymentFeeQuote(binding,10000n,false,now)
globalThis.fixture={checkout,store:{quotes:{}},calls:[],failTreasury:false}
const mocks={
 './checkout-selection.js':`export const claimCheckoutSelectionPayment=async id=>{if(fixture.rejectClaim)throw Error('Payment option changed');fixture.claimed=id}`,
 './ng-pos.js':`export const readPosCryptoFeeContext=async()=>({recipient:fixture.checkout.recipient,createdAt:fixture.checkout.createdAt})`,
 './hosted-checkouts.js':`export const readVerifiedHostedCheckoutRecord=async()=>fixture.checkout;export const hostedCheckoutPaymentOption=(c,n)=>n===c.network?{recipient:c.recipient}:undefined`,
 './render-durable-store.js':`export const readDurableJson=async()=>fixture.store;export const mutateDurableJson=async(k,f)=>{fixture.store=f(fixture.store);return fixture.store}`,
 './usdc-transfer-verify.js':`export const normalizeEvmUsdcChain=c=>c;export const verifyEvmUsdcTransfer=async i=>{fixture.calls.push(i);if(i.recipient===fixture.checkout.recipient){if(i.minAmount!=='0.9875')throw Error('wrong net')}else if(fixture.failTreasury||i.minAmount!=='0.0125')throw Error('missing fee');return {amount:i.minAmount,confirmedAt:new Date(${now+1000}).toISOString()}}`,
 './solana-usdc-transfer-verify.js':`export const verifySolanaUsdcTransfer=async()=>{throw Error('unexpected')}`,
}
await build({entryPoints:['api/merchant-checkout-fees.ts'],outfile:'.codex-temp/merchant-checkout-fees-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {assertMerchantFeeBinding,rememberMerchantFeeQuote,verifyMerchantCheckoutTransfer}=await import('../.codex-temp/merchant-checkout-fees-test.mjs')
await assertMerchantFeeBinding(binding)
for(const patch of [{purpose:'wallet-send'},{mode:'gross'},{recipient:payer},{amountUnits:'2'},{asset:'USDT'},{chain:'polygon'}])await assert.rejects(()=>assertMerchantFeeBinding({...binding,...patch}))
const input={txHash:'0x'+'a'.repeat(64),payer,network:'base'}
await assert.rejects(()=>verifyMerchantCheckoutTransfer(checkout,input))
await rememberMerchantFeeQuote(signed.token,signed.quote)
assert.equal(fixture.claimed,checkout.id,'Signing evidence first claims the shared checkout route')
fixture.rejectClaim=true;await assert.rejects(()=>rememberMerchantFeeQuote(signed.token,signed.quote),/Payment option changed/);fixture.rejectClaim=false
const result=await verifyMerchantCheckoutTransfer(checkout,input)
assert.equal(result.amount,'1');assert.deepEqual(result.fees,{payer:'merchant',platformFee:'0.0025',networkFee:'0.01',netAmount:'0.9875'})
assert.equal(fixture.calls.length,2);assert(fixture.calls.every(x=>x.exactAmount&&x.txHash===input.txHash&&x.payer===payer&&x.notAfter===checkout.expiresAt))
fixture.failTreasury=true;await assert.rejects(()=>verifyMerchantCheckoutTransfer(checkout,input));fixture.failTreasury=false
await assert.rejects(()=>verifyMerchantCheckoutTransfer(checkout,{...input,payer:recipient}))
fixture.store.quotes[signed.quote.id].token+='x';await assert.rejects(()=>verifyMerchantCheckoutTransfer(checkout,input))
console.log('PASS signed checkout fee binding, durable recovery, exact merchant and treasury proof, full order fulfillment amount, wrong payer/asset/network and tampered quote rejection. No live calls.')

fixture.checkout={...checkout,feePayer:'payer'}
const gross=createPaymentFeeQuote({...binding,mode:'gross'},10000n,false,Date.now())
await assertMerchantFeeBinding(gross.quote)
await rememberMerchantFeeQuote(gross.token,gross.quote)
assert.ok(Number.isSafeInteger(fixture.store.quotes[gross.quote.id].acceptedAt))
assert.equal(fixture.store.quotes[gross.quote.id].quote.recipientUnits,'1000000')
assert.equal(fixture.store.quotes[gross.quote.id].quote.totalUnits,'1012500')
await assert.rejects(()=>assertMerchantFeeBinding(binding))
const tampered=createPaymentFeeQuote({...binding,mode:'gross'},10000n,false,Date.now())
await assert.rejects(()=>rememberMerchantFeeQuote(tampered.token+'x',tampered.quote))
assert.equal(fixture.store.quotes[tampered.quote.id],undefined)
fixture.checkout={...checkout,feePayer:undefined}
const ordinary=createPaymentFeeQuote({...binding,mode:'gross'},10000n,false,Date.now())
await rememberMerchantFeeQuote(ordinary.token,ordinary.quote)
assert.equal(fixture.store.quotes[ordinary.quote.id],undefined,'ordinary payer checkout behavior stays unchanged')
console.log('PASS Marketplace gross quote is durably recorded before signing with an acceptance time; net mode and tampered tokens cannot bypass payer fees.')
