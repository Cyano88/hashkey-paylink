import assert from 'node:assert/strict'
import {assertLifiBridgeAvailable,deferLifiBridgeQuotes,lifiBridgeQuoteError} from '../api/pocket/bridge-quote-error.ts'
const route={sourceChainId:42161,destinationChainId:8453,sourceToken:'0xaaa',destinationToken:'0xbbb',bridge:'across'}
const failure={tool:'across',code:'FEES_HIGHER_THAN_AMOUNT',action:{fromChainId:42161,toChainId:8453,fromToken:{address:'0xAAA'},toToken:{address:'0xBBB'}}}
const body=f=>({code:1002,errors:{failed:[{subpaths:{route:[f]}}]}})
assert.throws(()=>lifiBridgeQuoteError(404,body(failure),route),e=>e.status===422&&/too small/.test(e.message))
assert.throws(()=>lifiBridgeQuoteError(404,body({...failure,action:{...failure.action,toToken:{address:'0xccc'}}}),route),e=>e.status===422&&!/too small/.test(e.message))
for(const [status,expected]of [[429,429],[500,503],[401,503],[404,503]])assert.throws(()=>lifiBridgeQuoteError(status,null,route),e=>e.status===expected)
assert.throws(()=>lifiBridgeQuoteError(404,{code:1002},route),e=>e.status===422&&/another amount or network/.test(e.message))
console.log('PASS requested-route fee minimum, unrelated alternative exclusion, no-route versus transient failures; no provider prose exposed.')
assert.throws(()=>deferLifiBridgeQuotes({message:'Rate limit exceeded, retry in 1 hour'},null,1000),e=>e.status===429&&e.retryAfterSeconds===3600)
assert.throws(()=>assertLifiBridgeAvailable(2000),e=>e.status===429&&e.retryAfterSeconds===3599)
assert.doesNotThrow(()=>assertLifiBridgeAvailable(3601000))
assert.throws(()=>deferLifiBridgeQuotes({},'120',4000000),e=>e.retryAfterSeconds===120)
assert.doesNotThrow(()=>assertLifiBridgeAvailable(4120000))
console.log('PASS provider Retry-After and one-hour limit are shared across LI.FI bridge routes; requests resume only after cooldown.')
const {quoteUsdtBridge}=await import('../api/pocket/usdt-bridge-provider.ts')
const {quoteLifiOutbound}=await import('../api/pocket/lifi-outbound-bridge.ts')
const address='0x'+'1'.repeat(40),blockedFetch=()=>assert.fail('Cooling-down routes must not contact LI.FI')
assert.throws(()=>deferLifiBridgeQuotes({},'60'),e=>e.status===429)
await assert.rejects(()=>quoteUsdtBridge({ownerId:'owner',walletId:'wallet',walletAddress:address,destinationAddress:address,source:'base',destination:'arbitrum',amount:'1'},blockedFetch),e=>e.status===429)
await assert.rejects(()=>quoteLifiOutbound({owner:address,recipient:address,destination:'arbitrum',amountUnits:'1000000'},blockedFetch),e=>e.status===429)
console.log('PASS both Across and X Layer quote paths stop before provider I/O during shared cooldown.')
