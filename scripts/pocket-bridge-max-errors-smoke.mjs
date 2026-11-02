import assert from 'node:assert/strict'
import {bridgeQuoteErrorFields} from '../api/pocket/bridge-quote-error.ts'
import {sponsoredTransferRequest} from '../src/pocket/api/pocketSponsoredTransfer.ts'
assert.deepEqual(bridgeQuoteErrorFields({maximumAmountUnits:'4990000000000000000'}),{code:'insufficient_balance',maximumAmountUnits:'4990000000000000000'})
assert.deepEqual(bridgeQuoteErrorFields({maximumAmountUnits:'-1',code:'provider-secret',message:'private'}),{})
for(const code of ['route_unavailable','amount_too_low','rate_limited','provider_unavailable'])assert.equal(bridgeQuoteErrorFields({code}).code,code)
const fetcher=async()=>({ok:false,status:422,json:async()=>({ok:false,error:'Insufficient balance for fees.',code:'insufficient_balance',maximumAmountUnits:'4980000'})})
await assert.rejects(()=>sponsoredTransferRequest({action:'quote',purpose:'bridge'},async()=> 'fixture',fetcher),e=>e.maximumAmountUnits==='4980000'&&e.code==='insufficient_balance'&&e.status===422)
console.log('PASS quote error metadata: exact integer hints preserved, categories retained, unsafe fields omitted, X Layer quote failures never described as submitted Activity transfers.')
import {relayBridgeQuoteError} from '../api/pocket/bridge-quote-error.ts'
for(const [status,body,code] of [[400,{errorCode:'NO_SWAP_ROUTES_FOUND'},'route_unavailable'],[422,{errorCode:'AMOUNT_TOO_LOW'},'amount_too_low'],[429,{},'rate_limited'],[500,{},'provider_unavailable'],[400,{errorCode:'UNKNOWN'},'provider_unavailable']])assert.throws(()=>relayBridgeQuoteError(status,body),e=>e.code===code&&!e.message.includes('Insufficient'))
console.log('PASS existing Relay adapters: no-route/minimum/rate-limit/outage are distinct and never mislabeled as balance failures.')
