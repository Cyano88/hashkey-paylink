import assert from 'node:assert/strict'
process.env.PAYCREST_API_KEY='fixture'
const {createMarketplacePaycrestOrder}=await import('../api/paycrest-pos.ts')
let calls=0
const original=globalThis.fetch
globalThis.fetch=async(url,init)=>{calls++;assert.ok(String(url).endsWith('/v2/sender/orders'));const b=JSON.parse(init.body);assert.equal(Object.hasOwn(b,'senderFeePercent'),false);assert.equal(b.senderFee,'0.00315');assert.equal(b.transactionFeePayer,'customer');assert.equal(b.source.currency,'USDC');assert.equal(b.source.network,'base');assert.equal(b.amount,'1.05');return new Response(JSON.stringify({data:{id:'fixture_order'}}),{status:201})}
try{assert.deepEqual(await createMarketplacePaycrestOrder({reference:'fixture_exact_fee',amount:'1.05',refundAddress:'0x'+'11'.repeat(20),bankCode:'TEST',accountNumber:'0123456789',accountName:'Test Seller'}),{id:'fixture_order'});assert.equal(calls,1)}finally{globalThis.fetch=original}
console.log('PASS Marketplace order requests exact 0.00315 USDC commission on 1.05 USDC (0.3%) and customer-paid provider fees.')
