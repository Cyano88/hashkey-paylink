import assert from 'node:assert/strict'
import {keccak256} from 'viem'
import catalogue from '../src/pocket/lib/pocketXStocksCatalog.json' with {type:'json'}
import {executeStockGiftFunding,prepareStockGiftFundingCalls} from '../src/pocket/api/pocketStockGiftExecution.ts'
const addr=n=>'0x'+String(n).repeat(40),code='0x6000',asset={chainId:196,rail:'xstocks',token:catalogue.assets[0].address,symbol:catalogue.assets[0].symbol,decimals:18}
const review={owner:addr(1),escrow:addr(2),runtimeHash:keccak256(code),treasury:addr(3),authority:addr(4),asset,signer:addr(5),salt:'0x'+'6'.repeat(64),amountPerRecipient:'0.001',recipients:1000,expiresAt:1000n}
let allowance=0n,balance=1002500000000000000n,used=false,pins=0;const sent=[]
const rpc={getChainId:async()=>196,getCode:async()=>code,getBalance:async()=>1000n,getGasPrice:async()=>1n,estimateGas:async()=>100n,waitForTransactionReceipt:async()=>({status:'success'}),readContract:async r=>({decimals:18,treasury:review.treasury,claimAuthority:review.authority,supportedToken:true,PLATFORM_FEE_BPS:25n,gifts:[addr(0),addr(0),addr(0),0n,0,0,0n,used?1:0],balanceOf:balance,allowance}[r.functionName])}
const plan=await prepareStockGiftFundingCalls(review,rpc,100n);assert.equal(plan.plan.totalDebit,1002500000000000000n);assert.equal(plan.calls.length,2)
await executeStockGiftFunding(review,{client:rpc,now:()=>100n,assertCurrent:()=>{},approve:async()=>{pins++},submit:async(call,kind)=>{sent.push({call,kind});if(kind==='approval')allowance=plan.plan.totalDebit;else used=true;return '0x'+'7'.repeat(64)}})
assert.equal(pins,1);assert.deepEqual(sent.map(s=>s.kind),['approval','funding']);assert.equal(sent[0].call.to.toLowerCase(),asset.token.toLowerCase());assert.equal(sent[1].call.to,review.escrow)
await assert.rejects(()=>prepareStockGiftFundingCalls(review,rpc,100n));used=false;balance=1n;await assert.rejects(()=>prepareStockGiftFundingCalls(review,rpc,100n));balance=plan.plan.totalDebit;await assert.rejects(()=>prepareStockGiftFundingCalls({...review,runtimeHash:'0x'+'8'.repeat(64)},rpc,100n));await assert.rejects(()=>prepareStockGiftFundingCalls({...review,asset:{...asset,decimals:6}},rpc,100n))
console.log('PASS 1,000-share stock funding: exact in-kind debit, bounded approval, fresh RPC checks, duplicate funding rejection, insufficient stock and changed deployment/precision rejection.')
