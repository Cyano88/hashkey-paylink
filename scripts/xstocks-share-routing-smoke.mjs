import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {keccak256,zeroAddress,getAddress} from 'viem';
import {parseTradeCheckout,prepareTradeCheckoutBinding} from '../api/xstocks-agreement/trade.ts';
import {prepareTradeXLayerAction} from '../api/xstocks-agreement/planner.ts';
import {SHARE_FACTORY_RUNTIME_HASH,SHARE_CUSTODY_POLICY,TRADE_XLAYER_ARBITER} from '../src/lib/xstocksAgreement/protocol.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/xstocks-share-factory-runtime.json',import.meta.url),'utf8'));
assert.equal(keccak256(fixture.runtime),SHARE_FACTORY_RUNTIME_HASH);
const token='0xc845b2894dbddd03858fd2d643b4ef725fe0849d',factory=getAddress('0x'+'55'.repeat(20)),buyer=getAddress('0x'+'11'.repeat(20)),seller=getAddress('0x'+'22'.repeat(20)),escrow=getAddress('0x'+'44'.repeat(20));
const env={HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED:'true',HASHPAYLINK_XSTOCKS_AGREEMENT_PLANNER_ENABLED:'true',HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'true',HASHPAYLINK_XSTOCKS_SHARE_FACTORY:factory,HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON:JSON.stringify([{address:token,decimals:18}])};
const body={kind:'trade',stockCustody:SHARE_CUSTODY_POLICY,title:'Test',description:'Test only',amount:'0.00222',paymentToken:token,trade:{offerId:'11111111-1111-4111-8111-111111111111',listingRevision:1,snapshotHash:'a'.repeat(64),price:'0.00222',deliveryFee:'0',handover:'Pickup',location:'Test only',carrier:'',returns:'Controlled test only',dispatchDays:1,deliveryDays:1,inspectionHours:48}};
assert.throws(()=>parseTradeCheckout(body,{...env,HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'false'}),/not enabled/);
const terms=parseTradeCheckout(body,env),b=prepareTradeCheckoutBinding('fixture',terms,buyer,seller,1000),old=prepareTradeCheckoutBinding('fixture',parseTradeCheckout({...body,stockCustody:undefined},{...env,HASHPAYLINK_XSTOCKS_SHARE_ENABLED:'false'}),buyer,seller,1000);
assert.notEqual(b.termsHash,old.termsHash);assert.equal(b.custody,SHARE_CUSTODY_POLICY);assert.equal(b.factory,factory);assert.notEqual(old.factory,factory);
function client(options={}){return {getChainId:async()=>196,getBlockNumber:async()=>100n,getBlock:async()=>({hash:'0x'+'aa'.repeat(32),timestamp:1100n}),getCode:async()=>options.badCode?'0x00':fixture.runtime,readContract:async({address,functionName})=>{
 if(address===factory){if(functionName==='arbiter')return TRADE_XLAYER_ARBITER;if(functionName==='escrows')return options.absent?zeroAddress:escrow;if(functionName==='approvedTokens')return true;}
 if(address.toLowerCase()===token){if(functionName==='decimals')return 18;if(functionName==='allowance')return 2220000000000000n;if(functionName==='getUnderlyingAmountByShares')return 2219999999999999n;if(functionName==='getSharesByUnderlyingAmount')return options.zero?0n:2216229757026900n;}
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
