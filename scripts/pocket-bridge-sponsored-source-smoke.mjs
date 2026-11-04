import assert from 'node:assert/strict'
import {fixtureSponsoredSource} from './fixtures/bridge-sponsored-source.mjs'
const hash='0x'+'a'.repeat(64),owner='0x'+'1'.repeat(40),e={owner,callData:'0x12345678',userOperationHash:'0x'+'e'.repeat(64)}
for(const network of ['bsc','xlayer']){
 let settings={},receipt={transactionHash:hash,status:'success',logs:[]}
 const read=()=>fixtureSponsoredSource(()=>receipt,()=>settings)(network,hash,e)
 assert.equal((await read()).outcome,'completed')
 settings={operationFailed:true};assert.equal((await read()).outcome,'failed')
 settings={};receipt.status='reverted';assert.equal((await read()).outcome,'failed');receipt.status='success'
 for(const fault of [{owner:'0x'+'2'.repeat(40)},{callData:'0x12345679'},{duplicate:true},{wrongChain:true},{wrongHash:true},{txChain:'0x1'},{txReorg:true},{wrongIndex:true},{changedInput:true},{wrongTarget:true},{noEvent:true},{userOpHash:hash},{nonce:2n},{changedReceipt:true},{reorg:true},{unfinalized:true},{noMembership:true},{removed:true}]){settings=fault;await assert.rejects(read,Object.keys(fault).join())}
 receipt.status='reverted';for(const fault of [{callData:'0x12345679'},{owner:'0x'+'2'.repeat(40)},{unfinalized:true},{reorg:true}]){settings=fault;await assert.rejects(read)}
 console.log('PASS '+network+' sponsored source: finalized exact batch and operation outcome; wrong call/owner/hash/chain/index, missing events, mutation and reorg rejected, including reverted receipts.')
}
