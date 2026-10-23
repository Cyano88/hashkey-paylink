import assert from 'node:assert/strict'
import {quoteRelayUsdt} from '../api/pocket/usdt-relay-provider.ts'
import {pocketBridgeAmountIssue} from '../src/pocket/lib/pocketBridgeAmountIssue.ts'
const input={source:'base',destination:'solana',sender:'0x'+'1'.repeat(40),recipient:'11111111111111111111111111111111',amountUnits:'1000'}
for(const [status,errorCode,expected]of [[400,'AMOUNT_TOO_LOW',422],[429,'AMOUNT_TOO_LOW',429],[503,'AMOUNT_TOO_LOW',503],[400,'NO_QUOTES',503],[400,'INSUFFICIENT_LIQUIDITY',503]]){
 await assert.rejects(quoteRelayUsdt(input,'fixture',async()=>new Response(JSON.stringify({errorCode}),{status})),e=>e.status===expected&&(expected!==422||pocketBridgeAmountIssue(e.message)==='Amount too small.'))
}
for(const message of ['No bridge is available for this amount and network pair. Choose another amount or network.','Quote unavailable','HTTP 422','Insufficient balance','Bridge service is temporarily unavailable. Please try again.'])assert.equal(pocketBridgeAmountIssue(message),null)
assert.equal(pocketBridgeAmountIssue('Minimum 1 USDT'),'Minimum amount is 1 USDT.')
assert.equal(pocketBridgeAmountIssue('This amount is too small to cover the bridge fees. Enter a larger amount.'),'Amount is too small to cover fees.')
console.log('PASS Relay explicit amount code only; unknown/no-route/liquidity never become fee errors; local minimum and confirmed fee mappings.')
