import assert from 'node:assert/strict'
import {encodeFunctionData,decodeFunctionData,parseAbi,parseUnits} from 'viem'
import {xLayerFeeAssets} from '../src/pocket/lib/pocketXLayerFeeAssets.ts'
import {quoteXLayerReimbursement,sealXLayerReimbursement,openXLayerReimbursement,refreshXLayerReimbursement} from '../api/pocket/xlayer-reimbursement.ts'
import {createXLayerBillingGuard} from '../api/pocket/xlayer-billing-guard.ts'
import {encodeEventTopics} from 'viem'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='test-only-expanded-reimbursement-secret-123456'
const wallet='0x'+'1'.repeat(40),now=Date.now(),abi=parseAbi(['function transfer(address,uint256) returns(bool)','event Transfer(address indexed from,address indexed to,uint256 value)'])
for(const asset of ['USDe','USDG']){
 const token=xLayerFeeAssets[asset],scale=10n**BigInt(token.decimals-6),amount=parseUnits('100',token.decimals),cost=8000n*scale
 const binding={ownerId:'owner',walletId:'wallet',walletAddress:wallet,asset,amountUnits:String(amount),intentId:'fixture-'+asset}
 const calls=[{to:token.address,value:'0x0',data:encodeFunctionData({abi,functionName:'transfer',args:['0x'+'2'.repeat(40),amount]})}]
 const estimate=async()=>({feeUnits:String(cost),expiresAt:now+25000,estimateId:'fixture'})
 const q=await quoteXLayerReimbursement(binding,calls,now+30000,estimate,{marginBps:2500,minimumFeeUnits:'10000'},()=>now)
 assert.equal(q.networkFeeUnits,String(parseUnits('0.01',token.decimals)))
 assert.equal(q.totalUnits,String(parseUnits('100.01',token.decimals)))
 const last=q.calls.at(-1),decoded=decodeFunctionData({abi,data:last.data})
 assert.equal(last.to.toLowerCase(),token.address)
 assert.equal(decoded.args[0].toLowerCase(),EVM_PLATFORM_TREASURY.toLowerCase())
 assert.equal(decoded.args[1],BigInt(q.networkFeeUnits))
 const sealed=sealXLayerReimbursement(q)
 assert.equal(openXLayerReimbursement(sealed,binding,calls,now).asset,asset)
 assert.throws(()=>openXLayerReimbursement(sealed,{...binding,asset:'USDC'},calls,now))
 await assert.rejects(refreshXLayerReimbursement(q,calls,async()=>({feeUnits:String(cost*3n),expiresAt:now+25000,estimateId:'increased'}),()=>now),/increased/)
 const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),topics=encodeEventTopics({abi,eventName:'Transfer',args:{from:wallet,to:EVM_PLATFORM_TREASURY}})
 const guard=createXLayerBillingGuard({now:()=>now,readHalt:async()=>undefined,halt:async()=>{throw Error('Incorrect decimal scaling halted billing')},spend:async()=>9000n,prices:async()=>({[token.address]:{usd:1,fetchedAt:now}}),rpc:async(method)=>method==='eth_chainId'?'0xc4':method==='eth_getBlockByNumber'?{hash:blockHash}:{status:'0x1',transactionHash:hash,blockHash,blockNumber:'0x1',logs:[{address:token.address,topics,data:'0x'+BigInt(q.networkFeeUnits).toString(16).padStart(64,'0')}]}})
 await guard([{wallet,at:now,hash,coverage:{walletId:'wallet',asset,feeUnits:q.networkFeeUnits}}])
}
console.log('PASS USDe/USDG exact fee units, 100-token inputs, treasury token binding, fee-rise rejection and six/eighteen-decimal billing coverage; no funds moved')
