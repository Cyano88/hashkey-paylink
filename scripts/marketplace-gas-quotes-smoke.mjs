import assert from 'node:assert/strict'
import {createMarketplaceGasQuotes} from '../api/marketplace/gas-quotes.ts'
import {createCircleDeveloperTreasuryClient} from '../api/circle-developer-treasury.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
const address='0x'+'11'.repeat(20),recipient='0x'+'22'.repeat(20),walletId='11111111-1111-4111-8111-111111111111',walletSetId='22222222-2222-4222-8222-222222222222'
const config={verificationReady:true,apiBase:'https://api.circle.com',apiKey:'fixture',treasuryAddress:address,walletId,walletSetId,blockchain:'BASE',accountType:'SCA'}
let now=1000000,fee='0.000001',calls=[],bad=false
const client=createCircleDeveloperTreasuryClient({config,fetchImpl:async(url,init)=>{
 calls.push(url);assert.equal(init.headers.Authorization,'Bearer fixture')
 if(url.endsWith('/wallets/'+walletId))return new Response(JSON.stringify({data:{wallet:{id:walletId,walletSetId,address,blockchain:'BASE',accountType:'SCA',state:'LIVE'}}}))
 assert.ok(url.endsWith('/transactions/transfer/estimateFee'))
 const body=JSON.parse(init.body);assert.equal(body.entitySecretCiphertext,undefined);assert.equal(body.walletId,walletId);assert.equal(body.tokenAddress,BASE_STABLECOINS.USDC.address);assert.equal(body.destinationAddress,recipient)
 return new Response(JSON.stringify({data:{high:{networkFeeRaw:bad?'not-a-number':fee}}}))
}})
const gas=createMarketplaceGasQuotes({config,maximumFeeUnits:'100000',providerSurchargeBps:500,now:()=>now,estimate:client.estimateUsdcTransfer,rate:async()=>3000n*100000000n})
const quote=await gas.wallet({projectId:'project_a',paymentId:'payment_a',operationId:'operation_a',allocationId:'share_a',beneficiaryId:'wallet_a',recipient,debitUnits:'10000000'})
assert.equal(quote.networkFeeUnits,'3150');assert.equal(quote.recipientUnits,'9996850');assert.equal(quote.expiresAt-now,60000)
assert.equal(calls.filter(u=>u.includes('estimateFee')).length,2)
bad=true;await assert.rejects(()=>gas.networkFee(recipient,'1000000'),/unavailable/);bad=false
fee='1';await assert.rejects(()=>gas.networkFee(recipient,'1000000'),/limit/);fee='0.000001'
await assert.rejects(()=>gas.wallet({...quote,debitUnits:'1'}),/Minimum wallet/)
await assert.rejects(()=>gas.wallet({...quote,debitUnits:'503149'}),/Minimum wallet/)
assert.equal((await gas.wallet({...quote,debitUnits:'503150'})).recipientUnits,'500000')
const stale=createMarketplaceGasQuotes({config,maximumFeeUnits:'100000',providerSurchargeBps:0,now:()=>now,estimate:async()=>{now+=15001;return {networkFee:fee,asset:'ETH',blockchain:'BASE'}},rate:async()=>300000000000n})
await assert.rejects(()=>stale.networkFee(recipient,'1000000'),/stale/)
console.log('PASS Circle read-only estimate schema, owned wallet verification, no signing/transfer, fresh ETH conversion, fixed bounded net quote, provider surcharge, missing/malformed estimates, insufficient amount and stale/capped estimates. Fixtures only.')
