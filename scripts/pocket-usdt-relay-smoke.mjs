import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {decodeFunctionData,encodeFunctionData,parseAbi} from 'viem'
import {getOrderId} from '@relay-protocol/settlement-sdk'
import {validateRelayUsdtQuote,relayUsdtRequest,quoteRelayUsdt,relaySolanaDeposit} from '../api/pocket/usdt-relay-provider.ts'
let checks=0
for(const [source,destination] of [['base','solana'],['arbitrum','solana'],['solana','base'],['solana','arbitrum']]){
 const fixture=JSON.parse(readFileSync(new URL(`./fixtures/relay-usdt/relay-${source}-${destination}.json`,import.meta.url),'utf8'))
 const q=fixture.response,input={source,destination,sender:fixture.request.user,recipient:fixture.request.recipient,amountUnits:fixture.request.amount}
 const now=(q.protocol.v2.orderData.output.deadline-7*86400)*1000
 const result=validateRelayUsdtQuote(q,input,now)
 assert.equal(result.provider,'relay');assert.equal(result.appFeeUnits,'0');assert.equal(result.execution.kind,source==='solana'?'solana':'evm')
 assert.deepEqual(relayUsdtRequest(input).appFees,[])
 // A costly but internally consistent quote remains approvable; cost alone is not a rejection.
 const expensive=structuredClone(q),out=expensive.protocol.v2.orderData.output.payments[0]
 out.expectedAmount=(BigInt(input.amountUnits)*78n/100n).toString()
 out.minimumAmount=(BigInt(out.expectedAmount)*995n/1000n).toString()
 expensive.details.currencyOut.amount=out.expectedAmount
 const orderId=getOrderId(expensive.protocol.v2.orderData,{base:'ethereum-vm',arbitrum:'ethereum-vm',solana:'solana-vm'})
 expensive.protocol.v2.orderId=orderId
 const deposit=expensive.steps.find(s=>s.id==='deposit').items[0].data
 if(source==='solana'){
  const ix=relaySolanaDeposit(input.sender,BigInt(input.amountUnits),orderId)
  deposit.instructions[0].data=ix.data.toString('hex')
 }else{
  const abi=parseAbi(['function depositErc20(address depositor,address token,uint256 amount,bytes32 id)'])
  const decoded=decodeFunctionData({abi,data:deposit.data})
  deposit.data=encodeFunctionData({abi,functionName:'depositErc20',args:[...decoded.args.slice(0,3),orderId]})
 }
 assert.equal(validateRelayUsdtQuote(expensive,input,now).receiveUnits,out.expectedAmount)
 if(result.execution.kind==='evm'){
  const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:result.execution.callData}).args[0]
  assert.equal(batch.length,4)
  const approvals=[batch[0],batch[1],batch[3]].map(c=>decodeFunctionData({abi:parseAbi(['function approve(address spender,uint256 amount) returns(bool)']),data:c.data}).args[1])
  assert.deepEqual(approvals,[0n,BigInt(input.amountUnits),0n]);assert.ok(batch.every(c=>c.value===0n))
 }
 assert.throws(()=>relayUsdtRequest({...input,source:'base',destination:'arbitrum'}),/unsupported route/)
 assert.throws(()=>validateRelayUsdtQuote(q,input,q.protocol.v2.orderData.output.deadline*1000),/deadline/)

 const mutations=[
  x=>x.fees.app.amount='250000',
  x=>x.protocol.v2.orderData.output.payments[0].recipient=input.sender,
  x=>x.protocol.v2.orderData.inputs[0].payment.amount='1',
  x=>x.protocol.v2.orderData.inputs[0].refunds[0].recipient=input.recipient,
  x=>x.protocol.v2.orderData.output.payments[0].minimumAmount='1',
  x=>x.protocol.v2.orderData.output.deadline=1,
  x=>x.protocol.v2.orderId='0x'+'00'.repeat(32),
  x=>x.protocol.v2.paymentDetails.depository=input.sender,
  x=>x.details.currencyOut.currency.decimals=18,
  x=>x.steps.push({kind:'signature',items:[{}]}),
  x=>x.steps.find(s=>s.id==='deposit').requestId='not-an-id',
  x=>x.steps.find(s=>s.id==='deposit').items[0].check.endpoint='https://example.invalid/status',
  x=>x.steps.find(s=>s.id==='deposit').items[0].check.method='POST',
 ]
 if(source==='solana')mutations.push(x=>x.steps[0].items[0].data.instructions[0].keys[1].isSigner=false,x=>x.steps[0].items[0].data.instructions[0].programId=input.sender,x=>x.steps[0].items[0].data.instructions[0].data='00')
 else mutations.push(x=>x.steps[0].items[0].data.value='1',x=>x.steps.at(-1).items[0].data.to=input.sender,x=>x.steps.at(-1).items[0].data.data='0x')
 for(const mutate of mutations){const altered=structuredClone(q);mutate(altered);assert.throws(()=>validateRelayUsdtQuote(altered,input,now));checks++}
 assert.throws(()=>validateRelayUsdtQuote(q,{...input,amountUnits:'0'},now))
 await assert.rejects(()=>quoteRelayUsdt(input,'',()=>{throw Error('must not fetch')}),/API key required/)
}
console.log(`Relay USDT: four recorded routes validated; ${checks} tampering cases rejected; missing key rejected without request. No transactions sent.`)
