import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateBscRelayQuote,bscRelayRequest} from '../api/pocket/bsc-bridge-provider.ts'
const owner='0xd7579fa0784288ef6eab335bc97d3c8ebc7ec435'
for(const asset of ['USDC','USDT'])for(const inbound of [true,false]){
 const q=JSON.parse(readFileSync(new URL('./fixtures/bsc-bridge/'+asset.toLowerCase()+'-'+(inbound?'in':'out')+'.json',import.meta.url),'utf8'))
 const i={asset,source:inbound?'base':'bsc',destination:inbound?'bsc':'base',sender:owner,recipient:owner,amountUnits:inbound?'10000000':'10000000000000000000'}
 const now=q.protocol.v2.orderData.output.deadline*1000-7*86400000
 const valid=validateBscRelayQuote(q,i,now)
 assert.equal(valid.execution.kind,'evm')
 assert.equal(bscRelayRequest(i).originChainId,inbound?8453:56)
 assert.equal(bscRelayRequest(i).destinationChainId,inbound?56:8453)
 const mutate=fn=>{const copy=structuredClone(q);fn(copy);assert.throws(()=>validateBscRelayQuote(copy,i,now))}
 mutate(v=>v.details.currencyOut.currency.decimals=inbound?6:18)
 mutate(v=>v.details.currencyIn.currency.decimals=inbound?18:6)
 mutate(v=>v.protocol.v2.orderData.output.payments[0].recipient='0x'+'1'.repeat(40))
 mutate(v=>v.protocol.v2.paymentDetails.depository='0x'+'1'.repeat(40))
 mutate(v=>v.protocol.v2.orderData.inputs[0].payment.chainId='bsc')
 mutate(v=>v.protocol.v2.orderData.output.payments[0].expectedAmount=inbound?'11000000000000000000':'11000000')
 mutate(v=>v.protocol.v2.orderData.inputs[0].refunds[0].recipient='0x'+'1'.repeat(40))
 mutate(v=>v.steps.find(s=>s.id==='deposit').items[0].data.value='1')
 mutate(v=>v.steps.find(s=>s.id==='deposit').items[0].data.to='0x'+'1'.repeat(40))
 console.log('PASS '+asset+' '+i.source+' -> '+i.destination+': pinned chain, decimals, wallets, deposit, refund and amount checks')
}
assert.throws(()=>bscRelayRequest({asset:'USDT',source:'arc',destination:'bsc',sender:owner,recipient:owner,amountUnits:'1000000'}))
