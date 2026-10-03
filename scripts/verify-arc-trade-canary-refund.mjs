import assert from 'node:assert/strict'
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs'
import {createPublicClient,http,parseAbi,keccak256,stringToHex} from 'viem'
import {verifyArcTradeExecution} from '../api/trade-agreement/arc-execution.ts'
import {verifyArcTradeReceipt} from '../api/trade-agreement/receipt.ts'
import {CANARY_REFUND_EVIDENCE} from './arc-trade-canary-policy.mjs'
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''))
const record=read('.codex-temp/arc-trade-canary.json')
const refunds=readdirSync('.codex-temp').filter(n=>/^arc-trade-canary-history-.*\.json$/.test(n)).map(n=>read('.codex-temp/'+n)).filter(e=>e.action==='refund')
assert.equal(refunds.length,1)
const entry=refunds[0]
assert.equal(entry.status,'confirmed');assert.equal(entry.termsHash,record.binding.termsHash)
assert(!existsSync('.codex-temp/arc-trade-canary-pending.json'))
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
const execution=await verifyArcTradeExecution({call:entry.call,transactionHash:entry.transactionHash,policy:record.policy,preparedAfterBlock:BigInt(entry.preparedAfterBlock)},client)
assert.equal(execution.status,'confirmed')
const receipt=await verifyArcTradeReceipt({id:'tag_'+record.terms.trade.snapshotHash,partnerId:'local-arc-trade-canary',terms:record.terms,binding:record.binding},entry.transactionHash,client,record.release)
assert.deepEqual(receipt,entry.settlement)
assert.equal(receipt.state,7);assert.equal(receipt.buyerAmountUnits,'100000');assert.equal(receipt.sellerAmountUnits,'0')
assert.equal(receipt.evidence,keccak256(stringToHex(CANARY_REFUND_EVIDENCE)))
const blockNumber=await client.getBlockNumber({cacheTime:0}),block=await client.getBlock({blockNumber})
const balance=await client.readContract({address:receipt.token,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[receipt.escrow],blockNumber})
assert.equal(balance,0n)
assert.equal((await client.getBlock({blockNumber})).hash,block.hash);assert.equal(await client.getChainId(),5042)
const evidence={checkedAt:new Date().toISOString(),chainId:5042,state:'Refunded',principalReturnedUsdc:'0.10',escrowBalanceUnits:String(balance),observedBlock:String(blockNumber),receipt,execution,recoveryCompleted:true,productionReady:false}
writeFileSync('.codex-temp/arc-trade-canary-refund-verified.json',JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify(evidence))
