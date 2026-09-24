import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { decodeFunctionData, getAddress, keccak256, zeroAddress } from 'viem';

import { prepareTradeXLayerAction, tradeLifecycleActions } from '../api/xstocks-agreement/planner.ts';
import { TRADE_XLAYER_FACTORY as factory, TRADE_XLAYER_ARBITER as arbiter, TRADE_TOKEN_ABI, TRADE_ESCROW_ABI } from '../src/lib/xstocksAgreement/protocol.ts';
const buyer=getAddress('0x'+'11'.repeat(20)),seller=getAddress('0x'+'22'.repeat(20)),token=getAddress('0x'+'33'.repeat(20)),escrow=getAddress('0x'+'44'.repeat(20));
const code=JSON.parse(readFileSync(new URL('./fixtures/xstocks-agreement-factory-runtime.json',import.meta.url),'utf8')).runtime;
assert.equal(keccak256(code),'0xcc80a2e8e46179070a0a664636e29fa5a83f62eed9d97139aacca5d95c14ec26');
const hash='0x'+'aa'.repeat(32);
const binding={chainId:196,factory,termsHash:hash,contractTerms:{offerId:hash,termsHash:hash,buyer,seller,arbiter,token,amount:'1000000',decimals:6,fundBy:2000,dispatchWindow:86400,deliveryWindow:86400,inspectionWindow:86400}};
function client(options={}){
 return {getChainId:async()=>options.chainId??196,getBlockNumber:async()=>10n,getBlock:async()=>({hash,timestamp:1000n}),getCode:async()=>options.badCode?'0x00':code,
 readContract:async({address,functionName,args,blockNumber})=>{
  if(address===factory){if(functionName==='arbiter')return arbiter;if(functionName==='approvedTokens')return options.approved??true;if(functionName==='escrows')return options.absent?zeroAddress:escrow;}
  if(address===token){if(functionName==='decimals')return 6;if(functionName==='allowance')return options.allowance??0n;}
  if(functionName==='state')return blockNumber===undefined?(options.headState??options.state??1):(options.state??1);
  if(['dispatchBy','deliveryBy','inspectUntil'].includes(functionName))return options.deadline??2000n;
  return binding.contractTerms[functionName];
 },call:async(tx)=>{assert.equal(tx.value,0n);options.calls?.push(tx);}};
}
const input={env:{HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED:'true'},binding,account:buyer};
assert.deepEqual(await prepareTradeXLayerAction({...input,env:{}},client()),{enabled:false,actions:[]});
await assert.rejects(()=>prepareTradeXLayerAction({...input,account:token},client()),/not a participant/);
await assert.rejects(()=>prepareTradeXLayerAction(input,client({chainId:1})),/network mismatch/);
await assert.rejects(()=>prepareTradeXLayerAction(input,client({badCode:true})),/verified deployment/);
assert.deepEqual((await prepareTradeXLayerAction(input,client({headState:2}))).actions,[]);
assert.deepEqual((await prepareTradeXLayerAction({...input,account:seller},client({absent:true}))).actions,['create']);
await assert.rejects(()=>prepareTradeXLayerAction({...input,action:'create'},client({absent:true})),/no longer available/);
let plan=await prepareTradeXLayerAction({...input,action:'approve'},client());
assert.equal(plan.transaction.to,token);
assert.deepEqual(decodeFunctionData({abi:TRADE_TOKEN_ABI,data:plan.transaction.data}).args,[escrow,1000000n]);
plan=await prepareTradeXLayerAction({...input,action:'approve'},client({allowance:1n}));
assert.equal(decodeFunctionData({abi:TRADE_TOKEN_ABI,data:plan.transaction.data}).args[1],0n);
plan=await prepareTradeXLayerAction({...input,action:'fund'},client({allowance:1000000n}));
assert.equal(plan.transaction.to,escrow);assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:plan.transaction.data}).functionName,'fund');
await assert.rejects(()=>prepareTradeXLayerAction({...input,action:'fund'},client({allowance:1000000n,approved:false})),/no longer available/);
plan=await prepareTradeXLayerAction({...input,action:'release'},client({state:3,approved:false}));assert.ok(plan.transaction);
await assert.rejects(()=>prepareTradeXLayerAction({...input,account:seller,action:'release'},client({state:3})),/no longer available/);
await assert.rejects(()=>prepareTradeXLayerAction({...input,action:'dispute',evidence:'short'},client({state:3})),/reference or explanation/);
assert.ok((await prepareTradeXLayerAction({...input,action:'dispute',evidence:'Package arrived damaged'},client({state:3}))).transaction);
const deadlines={fundBy:2000n,dispatchBy:2000n,deliveryBy:2000n,inspectUntil:2000n};
assert.deepEqual(tradeLifecycleActions(2,true,1000n,deadlines),[]);
assert.deepEqual(tradeLifecycleActions(2,true,2000n,deadlines),['missedDispatch']);
assert.ok(!tradeLifecycleActions(4,true,2000n,deadlines).includes('dispute'));
for(const state of [6,7,8,9])assert.deepEqual(tradeLifecycleActions(state,true,1000n,deadlines),[]);
console.log('Pinned factory runtime, roles, exact approvals, delisting recovery, lifecycle deadlines, disabled gate and confirmation checks passed.');
