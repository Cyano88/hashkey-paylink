import assert from 'node:assert/strict'
import {fundingRouteNeedsReview} from '../src/pocket/lib/pocketFundingQuoteReview.ts'
import {readPocketBridgeQuote} from '../src/pocket/api/pocketBridgeClient.ts'
const old={kind:'bridge',source:'arbitrum',destination:'base',amountUnits:1000000n,totalSourceUnits:1010000n}
assert.equal(fundingRouteNeedsReview(old,{...old}),false)
assert.equal(fundingRouteNeedsReview(old,{...old,totalSourceUnits:1009000n}),false)
for(const changed of [{totalSourceUnits:1010001n},{source:'polygon'},{destination:'arc'},{amountUnits:2000000n}])assert.equal(fundingRouteNeedsReview(old,{...old,...changed}),true)
assert.equal(fundingRouteNeedsReview(null,old),true)
assert.equal(fundingRouteNeedsReview({kind:'direct',destination:'base',amountUnits:1000000n},old),true)
assert.equal(fundingRouteNeedsReview(old,{kind:'direct',destination:'base',amountUnits:1000000n}),false)
const quote={source:'arbitrum',destination:'base',amount:'1',total:'1.01',fee:'0.01',receive:'1',destinationAddress:'0xrecipient',expiresAt:Date.now()+30000,quoteToken:'signed'}
const result=await readPocketBridgeQuote({accessToken:'privy-fixture',circleUserToken:'circle-fixture',source:'arbitrum',destination:'base',amount:'1',fetcher:async(url,init)=>{const body=JSON.parse(init.body);assert.equal(body.circleUserToken,'circle-fixture');assert.equal(init.headers.authorization,'Bearer privy-fixture');assert.equal(body.amount,'1');return Response.json({ok:true,quote})}})
assert.deepEqual(result,quote)
console.log('PASS: Circle quote session is forwarded, full quote retained, and funding rejects increased debit or changed route while accepting lower totals.')
