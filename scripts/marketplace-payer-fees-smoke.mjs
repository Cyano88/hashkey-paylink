import assert from 'node:assert/strict'
import {createPaymentFeeQuote} from '../api/payment-fee-quotes.ts'
import {createPayerCheckoutFeeVerifier} from '../api/merchant-checkout-fees.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const prior=process.env.POCKET_SWAP_QUOTE_SECRET
process.env.POCKET_SWAP_QUOTE_SECRET='payer-checkout-fixture-secret-at-least-32-characters'
try{
 const payer='0x'+'11'.repeat(20),holding='0x'+'22'.repeat(20),tx='0x'+'aa'.repeat(32)
 const checkout={id:'chk_payerfees123',feePayer:'payer',amount:'100',asset:'USDC',network:'base',recipient:holding,flexible:false,createdAt:new Date(1000).toISOString(),expiresAt:new Date(120000).toISOString()}
 const binding={checkoutId:checkout.id,purpose:'payment',asset:'USDC',chain:'base',walletId:'wallet_fixture',walletAddress:payer,recipient:holding,amountUnits:'100000000',mode:'gross'}
 const signed=createPaymentFeeQuote(binding,10000n,false,2000)
 let stored,calls=[],feeMissing=false
 const verify=createPayerCheckoutFeeVerifier({read:async()=>structuredClone(stored),verifyTransfer:async input=>{calls.push(input);assert.equal(input.payer,payer);assert.equal(input.txHash,tx);assert.equal(input.exactAmount,true);if(input.recipient.toLowerCase()===holding.toLowerCase())assert.equal(input.minAmount,'100');else{assert.equal(input.recipient,EVM_PLATFORM_TREASURY);assert.equal(input.minAmount,'0.26');if(feeMissing)throw Error('Fee absent')}return {amount:input.minAmount,confirmedAt:new Date(10000).toISOString()}}})
 const reset=()=>{stored={quotes:{[signed.quote.id]:{...signed,acceptedAt:3000}}};calls=[];feeMissing=false}
 const request={payer,txHash:tx,network:'base'}
 reset();const result=await verify(checkout,request)
 assert.equal(result.amount,'100');assert.equal(result.payerFees.totalUnits,'100260000');assert.equal(result.payerFees.platformFeeUnits,'250000');assert.equal(result.payerFees.networkFeeUnits,'10000');assert.equal(result.fees,undefined);assert.equal(calls.length,2)
 for(const mutation of [()=>stored=undefined,()=>stored.quotes[signed.quote.id].token+='tamper',()=>stored.quotes[signed.quote.id].acceptedAt=200000,()=>delete stored.quotes[signed.quote.id].acceptedAt,()=>feeMissing=true]){reset();mutation();await assert.rejects(()=>verify(checkout,request),/still being verified/)}
 for(const patch of [{mode:'net'},{purpose:'wallet-send'},{checkoutId:'chk_another'},{recipient:'0x'+'33'.repeat(20)},{amountUnits:'99000000'},{asset:'USDT'}]){reset();const other=createPaymentFeeQuote({...binding,...patch},10000n,false,2000);stored={quotes:{[other.quote.id]:{...other,acceptedAt:3000}}};await assert.rejects(()=>verify(checkout,request))}
 reset();const exempt=createPaymentFeeQuote(binding,10000n,true,2000);stored={quotes:{[exempt.quote.id]:{...exempt,acceptedAt:3000}}};await assert.rejects(()=>verify(checkout,request))
 for(const patch of [{feePayer:'merchant'},{feePayer:undefined},{flexible:true},{network:'arbitrum'},{recipient:EVM_PLATFORM_TREASURY}]){reset();await assert.rejects(()=>verify({...checkout,...patch},request))}
 console.log('PASS Marketplace payer fees: signed accepted gross quote, full order principal, shared 25 bps fee, separate gas reimbursement, exact treasury transfer, no merchant deduction, tamper/expiry/exemption/asset/route and missing-fee rejection. Fixture verification only.')
}finally{if(prior===undefined)delete process.env.POCKET_SWAP_QUOTE_SECRET;else process.env.POCKET_SWAP_QUOTE_SECRET=prior}
