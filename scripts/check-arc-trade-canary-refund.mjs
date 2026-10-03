import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createPublicClient,http,decodeFunctionData,parseAbi,keccak256,stringToHex} from 'viem'
import {planArcTradeCandidate} from '../api/trade-agreement/arc-planner.ts'
import {verifyArcTradeExecutionAccount} from '../api/trade-agreement/arc-execution.ts'
import {CANARY_REFUND_EVIDENCE} from './arc-trade-canary-policy.mjs'
const record=JSON.parse(readFileSync('.codex-temp/arc-trade-canary.json','utf8').replace(/^\uFEFF/,''))
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
const account=record.wallets.find(w=>w.role==='seller').address
await verifyArcTradeExecutionAccount(account,record.policy,client)
const input={binding:record.binding,account,fundingEnabled:false,action:'refund',evidence:CANARY_REFUND_EVIDENCE}
const plan=await planArcTradeCandidate(input,client,record.release)
assert.equal(plan.state,2);assert(!plan.pending);assert(plan.transaction)
assert.equal(record.binding.contractTerms.amount,'100000')
assert.equal(plan.transaction.to.toLowerCase(),plan.escrow.toLowerCase())
const call=decodeFunctionData({abi:parseAbi(['function refundBySeller(bytes32 evidence)']),data:plan.transaction.data})
assert.equal(call.functionName,'refundBySeller')
assert.equal(call.args[0],keccak256(stringToHex(CANARY_REFUND_EVIDENCE)))
await assert.rejects(()=>planArcTradeCandidate({...input,account:record.wallets.find(w=>w.role==='buyer').address},client,record.release))
console.log(JSON.stringify({readOnly:true,chainId:5042,escrow:plan.escrow,state:plan.state,refundSimulated:true,buyerCannotRefund:true,amount:'0.10 USDC',recipient:record.binding.contractTerms.buyer,observedBlock:plan.observedBlock}))
