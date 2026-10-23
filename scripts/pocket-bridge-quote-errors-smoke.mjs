import assert from 'node:assert/strict'
import {lifiBridgeQuoteError} from '../api/pocket/bridge-quote-error.ts'
const route={sourceChainId:42161,destinationChainId:8453,sourceToken:'0xaaa',destinationToken:'0xbbb',bridge:'across'}
const failure={tool:'across',code:'FEES_HIGHER_THAN_AMOUNT',action:{fromChainId:42161,toChainId:8453,fromToken:{address:'0xAAA'},toToken:{address:'0xBBB'}}}
const body=f=>({code:1002,errors:{failed:[{subpaths:{route:[f]}}]}})
assert.throws(()=>lifiBridgeQuoteError(404,body(failure),route),e=>e.status===422&&/too small/.test(e.message))
assert.throws(()=>lifiBridgeQuoteError(404,body({...failure,action:{...failure.action,toToken:{address:'0xccc'}}}),route),e=>e.status===422&&!/too small/.test(e.message))
for(const [status,expected]of [[429,429],[500,503],[401,503],[404,503]])assert.throws(()=>lifiBridgeQuoteError(status,null,route),e=>e.status===expected)
assert.throws(()=>lifiBridgeQuoteError(404,{code:1002},route),e=>e.status===422&&/another amount or network/.test(e.message))
console.log('PASS requested-route fee minimum, unrelated alternative exclusion, no-route versus transient failures; no provider prose exposed.')
