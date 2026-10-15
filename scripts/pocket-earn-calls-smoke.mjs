import assert from 'node:assert/strict'
import { decodeFunctionData, parseAbi } from 'viem'
import { preparePocketEarnCall, POCKET_EARN_POOL } from '../src/pocket/lib/pocketEarnCalls.ts'
const owner = '0x1111111111111111111111111111111111111111'
const base = { owner, amount:'1.01', symbol:'USDC' }
const abi = parseAbi(['function approve(address,uint256) returns(bool)','function supply(address,uint256,address,uint16)','function withdraw(address,uint256,address) returns(uint256)'])
for (const action of ['approve','deposit','withdraw']) {
 const call=preparePocketEarnCall({...base,action})
 const decoded=decodeFunctionData({abi,data:call.data})
 assert.equal(call.chainId,196);assert.equal(call.value,0n);assert.equal(call.from,owner)
 if(action==='approve'){assert.equal(decoded.args[0],POCKET_EARN_POOL);assert.equal(decoded.args[1],1010000n)}
 else{assert.equal(call.to,POCKET_EARN_POOL);assert.equal(decoded.args[1],1010000n);assert.equal(decoded.args[2],owner)}
}
for(const amount of ['0','-1','1e6','1.0000001','NaN','']) assert.throws(()=>preparePocketEarnCall({...base,amount,action:'deposit'}))
assert.throws(()=>preparePocketEarnCall({...base,symbol:'NVDAx',action:'deposit'}))
assert.throws(()=>preparePocketEarnCall({...base,action:'borrow'}))
console.log('PASS exact approvals, owner-only supply/withdraw destinations, chain and amount restrictions')
