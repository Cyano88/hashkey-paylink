import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeFunctionData,keccak256,zeroAddress,getAddress} from 'viem';
import {parseTradeCheckout,prepareTradeCheckoutBinding} from '../api/xstocks-agreement/trade.ts';
import {prepareTradeXLayerAction} from '../api/xstocks-agreement/planner.ts';
import {TRADE_ESCROW_ABI,SHARE_FACTORY_RUNTIME_HASH,SHARE_CUSTODY_POLICY,TRADE_XLAYER_ARBITER} from '../src/lib/xstocksAgreement/protocol.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/xstocks-share-factory-runtime.json',import.meta.url),'utf8'));
assert.equal(keccak256(fixture.runtime),SHARE_FACTORY_RUNTIME_HASH);
const token='0xc845b2894dbddd03858fd2d643b4ef725fe0849d',factory=getAddress('0x'+'55'.repeat(20)),buyer=getAddress('0x'+'11'.repeat(20)),seller=getAddress('0x'+'22'.repeat(20)),escrow=getAddress('0x'+'44'.repeat(20));
const env={HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED:'true',HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED:'true',HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'true',HASHPAYLINK_XSTOCKS_SHARE_FACTORY:factory,HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON:JSON.stringify([{address:token,decimals:18}])};
const body={kind:'trade',stockCustody:SHARE_CUSTODY_POLICY,title:'Test',description:'Test only',amount:'0.00222',paymentToken:token,trade:{offerId:'11111111-1111-4111-8111-111111111111',listingRevision:1,snapshotHash:'a'.repeat(64),price:'0.00222',deliveryFee:'0',handover:'Pickup',location:'Test only',carrier:'',returns:'Controlled test only',dispatchDays:1,deliveryDays:1,inspectionHours:48}};
assert.throws(()=>parseTradeCheckout(body,{...env,HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'false'}),/not enabled/);
const terms=parseTradeCheckout(body,env),b=prepareTradeCheckoutBinding('fixture',terms,buyer,seller,1000),old=prepareTradeCheckoutBinding('fixture',parseTradeCheckout({...body,stockCustody:undefined},{...env,HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'false'}),buyer,seller,1000);
assert.notEqual(b.termsHash,old.termsHash);assert.equal(b.custody,SHARE_CUSTODY_POLICY);assert.equal(b.factory,factory);assert.notEqual(old.factory,factory);
function client(options={}){return {getChainId:async()=>196,getBlockNumber:async()=>100n,getBlock:async()=>({hash:'0x'+'aa'.repeat(32),timestamp:options.now??1100n}),getCode:async()=>options.badCode?'0x00':fixture.runtime,readContract:async({address,functionName,blockNumber})=>{
 if(address===factory){if(functionName==='arbiter')return TRADE_XLAYER_ARBITER;if(functionName==='escrows')return options.absent?zeroAddress:escrow;if(functionName==='approvedTokens')return true;}
 if(address.toLowerCase()===token){if(functionName==='decimals')return 18;if(functionName==='allowance')return 2220000000000000n;if(functionName==='getUnderlyingAmountByShares'){if(options.conversionUnavailable)throw Error('Issuer conversion unavailable');return 2219999999999999n;}if(functionName==='getSharesByUnderlyingAmount')return options.zero?0n:2216229757026900n;}
 if(functionName==='settlementNonce')return blockNumber===undefined?(options.latestNonce??3n):3n;
 if(functionName==='settlementProposer')return options.proposer??seller;
 if(functionName==='proposedBuyerAmount')return 1110000000000000n;
 if(functionName==='settlementEvidence')return '0x'+'bb'.repeat(32);
 if(functionName==='state')return options.state??1;if(['dispatchBy','deliveryBy','inspectUntil'].includes(functionName))return 10000n;
 if(functionName==='fundedShares')return options.state>=2?2216229757026900n:0n;
 if(functionName==='sellerSettledShares')return options.state===6?2216229757026900n:0n;
 if(functionName==='sellerUnderlyingAtSettlement')return options.state===6?1997966759999999n:0n;
 if(['buyerSettledShares','buyerUnderlyingAtSettlement'].includes(functionName))return 0n;
 return b.contractTerms[functionName];},call:async()=>{}}}
const input={env,binding:b,account:buyer};
assert.ok((await prepareTradeXLayerAction({...input,action:'fund'},client())).transaction);
assert.ok((await prepareTradeXLayerAction({...input,account:seller,action:'create'},client({absent:true}))).transaction);
await assert.rejects(()=>prepareTradeXLayerAction(input,client({badCode:true})),/verified deployment/);
assert.deepEqual((await prepareTradeXLayerAction({...input,env:{...env,HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'false'}},client())).actions,['cancel']);
assert.ok((await prepareTradeXLayerAction({...input,env:{...env,HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'false'},action:'release'},client({state:3}))).transaction);
assert.deepEqual((await prepareTradeXLayerAction(input,client({zero:true}))).actions,['cancel']);
const receipt=(await prepareTradeXLayerAction(input,client({state:6}))).stockReceipt;
assert.equal(receipt.sellerSettledShares,'2216229757026900');assert.equal(receipt.sellerUnderlyingAtSettlement,'1997966759999999');assert.equal(receipt.observedBlock,'98');
console.log('V2 routing passed: consent version, pinned factory, feature pause/recovery, zero shares, immutable settlement receipts and legacy separation.');

const reviewed={nonce:'3',buyerAmount:'1110000000000000',evidence:'0x'+'bb'.repeat(32)};
let split=await prepareTradeXLayerAction({...input,action:'acceptSettlement',settlement:reviewed},client({state:5}));
assert.deepEqual(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:split.transaction.data}).args,[3n,1110000000000000n,reviewed.evidence]);
assert.ok(split.actions.includes('acceptSettlement'));assert.ok(!split.actions.includes('withdrawSettlement'));
await assert.rejects(()=>prepareTradeXLayerAction({...input,account:seller,action:'acceptSettlement',settlement:reviewed},client({state:5})),/no longer available/);
assert.ok((await prepareTradeXLayerAction({...input,account:seller,action:'withdrawSettlement',settlement:reviewed},client({state:5}))).transaction);
for(const change of [{nonce:'2'},{buyerAmount:'0'},{evidence:'0x'+'cc'.repeat(32)}])await assert.rejects(()=>prepareTradeXLayerAction({...input,action:'acceptSettlement',settlement:{...reviewed,...change}},client({state:5})),/proposal changed/);
await assert.rejects(()=>prepareTradeXLayerAction({...input,action:'acceptSettlement',settlement:reviewed},client({state:5,proposer:zeroAddress})),/no longer available/);
const pending=await prepareTradeXLayerAction({...input,action:'acceptSettlement',settlement:reviewed},client({state:5,latestNonce:4n}));assert.equal(pending.pending,true);assert.deepEqual(pending.actions,[]);assert.equal(pending.transaction,undefined);
for(const buyerAmount of ['0','1110000000000000','2220000000000000']){const proposal=await prepareTradeXLayerAction({...input,action:'proposeSettlement',settlement:{...reviewed,buyerAmount},evidence:'Agreed controlled test split'},client({state:5}));assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:proposal.transaction.data}).args[0],BigInt(buyerAmount));}
for(const buyerAmount of ['-1','2220000000000001','1.5','1e3',1])await assert.rejects(()=>prepareTradeXLayerAction({...input,action:'proposeSettlement',settlement:{...reviewed,buyerAmount},evidence:'Agreed controlled test split'},client({state:5})),/buyer amount/);
for(const state of [2,6,7,8,9])await assert.rejects(()=>prepareTradeXLayerAction({...input,action:'acceptSettlement',settlement:reviewed},client({state})),/no longer available/);
console.log('Dispute proposals passed: exact calldata, participant roles, full/partial allocations, stale nonce/amount/evidence, withdrawal, pending reads and terminal states.');

// Completed receipts survive unavailable live conversion; held funds still fail closed.
for(const state of [6,7,8,9]){const final=await prepareTradeXLayerAction(input,client({state,conversionUnavailable:true}));assert.deepEqual(final.actions,[]);assert.equal(final.stockReceipt.currentUnderlyingUnits,'0');}
await assert.rejects(()=>prepareTradeXLayerAction(input,client({state:2,conversionUnavailable:true})),/Issuer conversion unavailable/);
// Exact deadline boundaries on the actual share-custody planner, not only its action helper.
for(const [state,account,action,functionName] of [[2,buyer,'missedDispatch','refundUndispatched'],[3,seller,'dispute','openDispute'],[4,seller,'inspectionRelease','releaseAfterInspection']]){
 const before=await prepareTradeXLayerAction({...input,account},client({state,now:9999n}));assert.ok(!before.actions.includes(action));
 for(const now of [10000n,10001n]){const after=await prepareTradeXLayerAction({...input,account,action,evidence:'Controlled deadline scenario'},client({state,now}));assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:after.transaction.data}).functionName,functionName);}
}
assert.ok((await prepareTradeXLayerAction(input,client({state:4,now:9999n}))).actions.includes('dispute'));
assert.ok(!(await prepareTradeXLayerAction(input,client({state:4,now:10000n}))).actions.includes('dispute'));
for(const action of ['resolveDispute','resolve'])for(const account of [buyer,seller,TRADE_XLAYER_ARBITER])await assert.rejects(()=>prepareTradeXLayerAction({...input,account,action},client({state:5})),/not a participant|no longer available/);
console.log('Share custody boundaries passed: immutable final receipts, exact deadline transitions, reviewer operations excluded from participant API.');
