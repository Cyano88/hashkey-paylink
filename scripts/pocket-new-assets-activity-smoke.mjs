import assert from 'node:assert/strict'
import {circleNativeActivityRow,scanCircleNativeHistory,nativeHistoryNextPage} from '../api/pocket/native-wallet-activity.ts'
import {isPocketActivityReadData,isPocketActivityRow} from '../src/pocket/lib/pocketSchemas.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {collapsePocketAssetMoves} from '../src/pocket/lib/pocketAssetMoveActivity.ts'
import {pocketStockNoticeActivity} from '../src/pocket/lib/pocketStockNoticeActivity.ts'
import {stockUsdc,stockUsdt} from '../src/pocket/lib/pocketXStocksWallet.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const address='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64)
const base={eventId:'principal',txHash:hash,chain:'base',payer:address,recipient,amount:'1',assetSymbol:'USDC',memo:'Transfer',source:'wallet-withdrawal',direction:'out',paycrestStatus:'confirmed',ts:1}
for(const assetSymbol of ['USDC','USDT','USDT0','ETH','POL','OKB']){
 const principal={...base,assetSymbol},fee={...principal,eventId:'fee',recipient:EVM_PLATFORM_TREASURY,amount:assetSymbol==='ETH'?'0.000000000000000001':'0.02'}
 const grouped=mergePocketActivityRows([],[fee,principal]);assert.equal(grouped.length,1);assert.equal(grouped[0].feeAmount,fee.amount);assert.ok(isPocketActivityRow(grouped[0]));
 assert.equal(mergePocketActivityRows([],[fee]).length,1,'standalone treasury transfer retained');
 assert.equal(mergePocketActivityRows([],[fee,principal,{...principal,eventId:'other',recipient:'0x'+'3'.repeat(40)}]).length,3,'ambiguous batch retained');
 assert.equal(mergePocketActivityRows([],[fee,{...principal,chain:'polygon'}]).length,2);assert.equal(mergePocketActivityRows([],[fee,{...principal,payer:recipient}]).length,2);
}
const send={...base,assetSymbol:'ETH',eventId:'pocket-native-send:one',amount:'0.000001'}
assert.equal(mergePocketActivityRows([],[send,{...send,eventId:'circle-native:one',amount:'0.0000010'}]).length,1)
for(const source of ['wallet-swap','stock-swap','stock-buy','stock-sell','earn-deposit','earn-withdraw']){
 const action={...base,source};const raw={...base,eventId:'raw'};assert.deepEqual(collapsePocketAssetMoves([action,raw]),[action]);assert.equal(mergePocketActivityRows([],[action,raw]).length,1)
}
for(const kind of ['send','swap'])for(const state of ['processing','failed']){
 const row={...base,eventId:'pocket-native-'+kind+':one',txHash:'',source:kind==='send'?'wallet-withdrawal':'wallet-swap',settlementType:kind==='send'?'wallet_transfer':'wallet_swap',paycrestStatus:state};assert.ok(isPocketActivityRow(row));assert.ok(isPocketActivityReadData({payments:[row],merchants:[],collections:[]}));assert.equal(mergePocketActivityRows([],[row,{...row,eventId:row.eventId+'two'}]).length,2)
}
for(const [symbol,token] of [['USDC',stockUsdc.address],['USDT',stockUsdt.address],['OKB','native']])for(const direction of ['in','out']){
 const rows=pocketStockNoticeActivity([{id:symbol+direction,hash,at:1,title:'Transfer',body:'Transfer',transfer:{token,symbol,amount:'1',from:address,to:recipient,direction}}],address);assert.equal(rows.length,1);assert.equal(rows[0].source,direction==='in'?'wallet-deposit':'wallet-withdrawal')
}
for(const [network,blockchain,symbol,decimals] of [['base','BASE','ETH',18],['ethereum','ETH','ETH',18],['arbitrum','ARB','ETH',18],['polygon','MATIC','POL',18],['solana','SOL','SOL',9]]){
 const wallet=network==='solana'?'11111111111111111111111111111111':address,other=network==='solana'?'22222222222222222222222222222222':recipient
 const link={chain:network,circleBlockchain:blockchain,circleWalletId:'wallet',circleWalletAddress:wallet},token={id:'token-'+network,blockchain,isNative:true,symbol,decimals}
 for(const incoming of [true,false]){
  const tx={id:network,blockchain,walletId:'wallet',tokenId:token.id,operation:'TRANSFER',state:'COMPLETE',transactionType:incoming?'INBOUND':'OUTBOUND',sourceAddress:incoming?other:wallet,destinationAddress:incoming?wallet:other,amounts:['0.000001'],createDate:'2026-10-17T12:00:00Z',txHash:network==='solana'?'3'.repeat(88):hash}
  const row=circleNativeActivityRow(link,tx,token);assert.ok(isPocketActivityRow(row));assert.equal(row.amount,'0.000001');assert.equal(row.direction,incoming?'in':'out');assert.equal(circleNativeActivityRow(link,{...tx,state:'FAILED'},token),null);assert.throws(()=>circleNativeActivityRow(link,{...tx,walletId:'foreign'},token));assert.equal(circleNativeActivityRow(link,tx,{...token,isNative:false}),null)
 }
}
const link={chain:'base',circleBlockchain:'BASE',circleWalletId:'wallet',circleWalletAddress:address}
let cursor,persisted=[],reads=[],failPage=false
const path='/v1/w3s/transactions?walletIds=wallet&includeAll=true&pageSize=50'
const request=async url=>{
 reads.push(url);if(url.includes('/wallets/'))return {data:{wallet:{id:'wallet',blockchain:'BASE',address}}};if(url.includes('/tokens/'))return {data:{token:{id:'paging-token',blockchain:'BASE',isNative:true,symbol:'ETH',decimals:18}}}
 const page=Number(new URL(url,'https://api.circle.com').searchParams.get('pageAfter')||0);if(failPage&&page===1)throw Error('provider down')
 return {data:{transactions:[{id:'page-'+page,blockchain:'BASE',walletId:'wallet',tokenId:'paging-token',operation:'TRANSFER',state:'COMPLETE',transactionType:'INBOUND',sourceAddress:recipient,destinationAddress:address,amounts:['1'],createDate:'2026-10-17T12:00:00Z',txHash:'0x'+String(page+1).repeat(64)}]},link:page<4?'<https://api.circle.com'+path+'&pageAfter='+(page+1)+'>; rel="next"':null}
}
const deps={readCursor:async()=>cursor,saveCursor:async c=>{cursor=c},persist:async rows=>{persisted.push(...rows)}}
failPage=true;await assert.rejects(scanCircleNativeHistory(link,request,deps));assert.equal(cursor,undefined);assert.equal(persisted.length,1,'persist head even if backfill fails')
failPage=false;await scanCircleNativeHistory(link,request,deps);assert.ok(cursor.path.endsWith('pageAfter=3'));await scanCircleNativeHistory(link,request,deps);assert.equal(cursor.complete,true);assert.equal(new Set(persisted.map(r=>r.eventId)).size,5,'all historical pages retained')
reads=[];await scanCircleNativeHistory(link,request,deps);assert.equal(reads.filter(p=>p.includes('/transactions')).length,1,'completed backfill only refreshes head')
assert.throws(()=>nativeHistoryNextPage('<https://evil.example'+path+'&pageAfter=x>; rel="next"',path));assert.throws(()=>nativeHistoryNextPage('<https://api.circle.com'+path.replace('walletIds=wallet','walletIds=foreign')+'&pageAfter=x>; rel="next"',path));
console.log('PASS all native networks, exact amounts, fee grouping and isolation, action precedence, pending validation, X Layer coverage, durable paginated backfill and ownership checks')
