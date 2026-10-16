import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {decodeFunctionData,parseAbi} from 'viem'
import {validateRelayStablecoinQuote,relayStablecoinRequest} from '../api/pocket/xlayer-bridge-provider.ts'
let checks=0
for(const source of ['xlayer','base']) {
 const destination=source==='xlayer'?'base':'xlayer'
 const {input,now,response:q}=JSON.parse(readFileSync(`scripts/fixtures/relay-xlayer/USDC-${source}-${destination}.json`,'utf8'))
 const validated=validateRelayStablecoinQuote(q,input,now)
 assert.equal(validated.appFeeUnits,'0')
 assert.equal(validated.asset,'USDC')
 assert.deepEqual(relayStablecoinRequest(input).appFees,[])
 assert.equal(relayStablecoinRequest(input).disableOriginSwaps,true)
 const calls=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:validated.execution.callData}).args[0]
 assert.equal(calls.length,4)
 const approvals=[calls[0],calls[1],calls[3]].map(call=>decodeFunctionData({abi:parseAbi(['function approve(address spender,uint256 amount) returns(bool)']),data:call.data}).args[1])
 assert.deepEqual(approvals,[0n,BigInt(input.amountUnits),0n])
 const mutations=[
  x=>x.protocol.v2.orderData.inputs[0].payment.currency='0x779ded0c9e1022225f8e0630b35a9b54be713736',
  x=>x.protocol.v2.orderData.inputs[0].payment.amount='1',
  x=>x.protocol.v2.orderData.output.payments[0].recipient=input.sender,
  x=>x.protocol.v2.orderData.output.payments[0].minimumAmount='1',
  x=>x.protocol.v2.orderData.inputs[0].refunds[0].recipient=input.recipient,
  x=>x.protocol.v2.paymentDetails.depository=input.sender,
  x=>x.protocol.v2.orderId='0x'+'0'.repeat(64),
  x=>x.fees.app.amount='25000',
  x=>x.details.currencyOut.currency.decimals=18,
  x=>x.steps.at(-1).items[0].data.to=input.sender,
  x=>x.steps.at(-1).items[0].data.value='1',
  x=>x.steps.at(-1).items[0].check.endpoint='https://example.invalid',
  x=>x.steps.push({id:'sign',kind:'signature',items:[{}]}),
 ]
 for(const mutate of mutations){const altered=structuredClone(q);mutate(altered);assert.throws(()=>validateRelayStablecoinQuote(altered,input,now));checks++}
 assert.throws(()=>relayStablecoinRequest({...input,source:'base',destination:'arbitrum'}),/unsupported route/)
 assert.throws(()=>relayStablecoinRequest({...input,asset:'USDT',destination:'arc',source:'xlayer'}),/Arc/)
 const usdt=JSON.parse(readFileSync(`scripts/fixtures/relay-xlayer/USDT-${source}-${destination}.json`,'utf8'))
 assert.throws(()=>validateRelayStablecoinQuote(usdt.response,usdt.input,usdt.now),/input payment mismatch|refund mismatch/,'conversion routes are not mistaken for direct token deposits')
}
console.log(`PASS X Layer/Base USDC both directions, exact finite approvals, no app fee, ${checks} tampering cases and USDT conversion routes rejected. No funds moved.`)
