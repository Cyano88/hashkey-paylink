import assert from 'node:assert/strict'
import {parseUnits} from 'viem'
import {quoteStockMaximum} from '../api/pocket/xstocks-max.ts'
const make=(amount,fee,native=false)=>({quote:{amount,amountUnits:String(parseUnits(amount,native?18:6)),tokenIn:{address:native?'native':'stable'},gasFee:fee},...(native?{}:{sponsorship:{feeUnits:fee}})})
let calls=[]
let r=await quoteStockMaximum(600000n,6,10000n,async a=>{calls.push(a);return make(a,'10000')});assert.equal(r.quote.amount,'0.59');assert.equal(calls.length,1)
calls=[];r=await quoteStockMaximum(600000n,6,10000n,async a=>{calls.push(a);if(calls.length===1)throw Object.assign(Error('fee increased'),{requiredFeeUnits:'20000'});return make(a,'20000')});assert.equal(r.quote.amount,'0.58');assert.equal(calls.length,2)
r=await quoteStockMaximum(15000n,6,10000n,async a=>make(a,'10000'));assert.equal(r.quote.amount,'0.005','small affordable amount is not falsely rejected')
calls=[];r=await quoteStockMaximum(parseUnits('0.01',18),18,0n,async a=>{calls.push(a);return make(a,'0.00001',true)});assert.equal(r.quote.amount,'0.009988');assert.equal(calls.length,2)
await assert.rejects(quoteStockMaximum(10000n,6,10000n,async()=>{throw Error('must not quote')}),/Insufficient/)
calls=[];await assert.rejects(quoteStockMaximum(600000n,6,10000n,async a=>{calls.push(a);throw Object.assign(Error('fee increased'),{requiredFeeUnits:String(10000+calls.length*10000)})}),/Try Max again/);assert.equal(calls.length,3)
await assert.rejects(quoteStockMaximum(600000n,6,10000n,async a=>({...make(a,'10000'),quote:{...make(a,'10000').quote,amountUnits:'1'}})),/changed/)
console.log('PASS exact stablecoin Max, fee changes, small affordable balances, native gas reserve, mismatched amounts, insufficient funds and bounded re-quoting')
