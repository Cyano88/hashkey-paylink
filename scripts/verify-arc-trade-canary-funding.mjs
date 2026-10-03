import assert from 'node:assert/strict'
import {readFileSync,readdirSync,writeFileSync} from 'node:fs'
import {createPublicClient,http,parseAbi,decodeEventLog} from 'viem'
import {verifyArcTradeExecution} from '../api/trade-agreement/arc-execution.ts'
import {planArcTradeCandidate} from '../api/trade-agreement/arc-planner.ts'
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''))
const record=read('.codex-temp/arc-trade-canary.json')
const funds=readdirSync('.codex-temp').filter(name=>/^arc-trade-canary-history-.*\.json$/.test(name)).map(name=>read('.codex-temp/'+name)).filter(e=>e.action==='fund')
assert.equal(funds.length,1);const entry=funds[0]
assert.equal(entry.status,'confirmed');assert.equal(entry.termsHash,record.binding.termsHash)
assert.equal(record.binding.contractTerms.amount,'100000')
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
const result=await verifyArcTradeExecution({call:entry.call,transactionHash:entry.transactionHash,policy:record.policy,preparedAfterBlock:BigInt(entry.preparedAfterBlock)},client)
assert.equal(result.status,'confirmed')
const buyer=record.wallets.find(w=>w.role==='buyer').address
const state=await planArcTradeCandidate({binding:record.binding,account:buyer,fundingEnabled:true},client,record.release)
assert.equal(state.state,2);assert(!state.pending)
const blockNumber=BigInt(state.observedBlock),block=await client.getBlock({blockNumber})
const token=record.binding.contractTerms.token,abi=parseAbi(['function balanceOf(address) view returns(uint256)','event Transfer(address indexed from,address indexed to,uint256 value)'])
const balance=await client.readContract({address:token,abi,functionName:'balanceOf',args:[state.escrow],blockNumber})
assert.equal(balance,100000n)
const receipt=await client.getTransactionReceipt({hash:entry.transactionHash})
const transfers=receipt.logs.filter(log=>log.address.toLowerCase()===token.toLowerCase()).flatMap(log=>{
 try{return [decodeEventLog({abi,eventName:'Transfer',data:log.data,topics:log.topics,strict:true}).args]}catch{return []}
})
const incoming=transfers.filter(t=>t.to.toLowerCase()===state.escrow.toLowerCase())
assert.equal(incoming.length,1);assert.equal(incoming[0].from.toLowerCase(),buyer.toLowerCase());assert.equal(incoming[0].value,100000n)
assert.equal((await client.getBlock({blockNumber})).hash,block.hash);assert.equal(await client.getChainId(),5042)
const evidence={checkedAt:new Date().toISOString(),chainId:5042,escrow:state.escrow,termsHash:record.binding.termsHash,principalUsdc:'0.10',escrowBalanceUnits:String(balance),state:'Funded',observedBlock:String(blockNumber),...result,exactBuyerTransfer:true,productionReady:false,recoveryCompleted:false}
writeFileSync('.codex-temp/arc-trade-canary-funding-verified.json',JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify(evidence))
