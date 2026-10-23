import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiParameters} from 'viem'
import {lifiRevenueProven,lifiRevenueMetadata} from '../api/pocket/lifi-revenue-evidence.ts'
const token='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',router='0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae',forwarder='0xce40449b773a3e6e5e769adb4e567179d4828cbd',hash='0x'+'a'.repeat(64)
const revenue={recipient,bps:10,amountUnits:'100000'}
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)','event FeesForwarded(address indexed token,(address recipient,uint256 amount)[] distributions)'])
const transfer=(from=router,to=recipient,value=100000n)=>({address:token,data:encodeAbiParameters(parseAbiParameters('uint256'),[value]),topics:encodeEventTopics({abi,eventName:'Transfer',args:{from,to}})})
const event=(amount=100000n)=>({address:forwarder,topics:encodeEventTopics({abi,eventName:'FeesForwarded',args:{token}}),data:encodeAbiParameters(parseAbiParameters('(address recipient,uint256 amount)[]'),[[{recipient,amount}]])})
const receipt={status:'success',transactionHash:hash,logs:[transfer(),event()]}
assert(lifiRevenueProven(revenue,token,receipt,hash))
assert(lifiRevenueProven(undefined,token,{},hash),'Legacy quotes retain their independent existing checks')
for(const patch of [{status:'reverted'},{transactionHash:'0x'+'b'.repeat(64)},{logs:[transfer()]},{logs:[event()]},{logs:[transfer(forwarder),event()]},{logs:[transfer(router,recipient,99999n),event()]},{logs:[transfer(),event(99999n)]},{logs:[transfer(),event(),transfer()]},{logs:[transfer(),event(),event()]},{logs:[transfer(),event(),transfer(recipient,router,1n)]},{logs:[{...transfer(),removed:true},event()]}])assert.equal(lifiRevenueProven(revenue,token,{...receipt,...patch},hash),false)
assert.equal(lifiRevenueProven(revenue,router,receipt,hash),false)
assert.equal(lifiRevenueProven({...revenue,recipient:router},token,receipt,hash),false)
assert(lifiRevenueProven({...revenue,amountUnits:'0'},token,{...receipt,logs:[]},hash))
assert.deepEqual(lifiRevenueMetadata(revenue,'3000'),{gasReimbursementUnits:'3000',bridgeRevenueUnits:'100000',bridgeRevenueRecipient:recipient,bridgeRevenueBps:'10',bridgeRevenueCollector:'lifi',bridgeRevenueRefundPolicy:'retain_after_collection'})
assert.equal(lifiRevenueMetadata(undefined).bridgeRevenueRefundPolicy,undefined)
console.log('PASS: exact token/router/recipient transfer plus forwarder event; missing, duplicated, removed, wrong-value, reversed and reverted evidence rejected; revenue and gas accounting kept separate.')
