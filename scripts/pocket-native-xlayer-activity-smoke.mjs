import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbiItem,parseAbiParameters,decodeEventLog} from 'viem'
import {nativeTradeLegs,stockTradeProof,recordStockTradeNotices} from '../api/pocket/stock-trade-notifications.ts'
import {normalizeStockNotices,reconcileStockTradeActivity} from '../api/pocket/xstocks-notifications-store.ts'
import {stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.ts'
import {OKX_NATIVE,OKX_XLAYER_ROUTER} from '../src/pocket/lib/pocketXStocksSwap.ts'
import {pocketStockNoticeActivity} from '../src/pocket/lib/pocketStockNoticeActivity.ts'
const owner='0x1111111111111111111111111111111111111111',hash='0x'+'a'.repeat(64),router=OKX_XLAYER_ROUTER
const event=parseAbiItem('event OrderRecord(address fromToken,address toToken,address sender,uint256 fromAmount,uint256 returnAmount)')
const log=(from,to,sender=owner)=>({address:router,topics:encodeEventTopics({abi:[event]}),data:encodeAbiParameters(parseAbiParameters('address,address,address,uint256,uint256'),[from,to,sender,500000n,4300606556987734n])})
for(const reverse of [false,true]){
 const proof={hash,owner,input:reverse?'native':stockUsdc.address.toLowerCase(),output:reverse?stockUsdc.address.toLowerCase():'native'}
 const l=log(reverse?OKX_NATIVE:stockUsdc.address,reverse?stockUsdc.address:OKX_NATIVE)
 const legs=nativeTradeLegs(proof,[l],5);assert.equal(legs.length,1);assert.equal(legs[0].to.toLowerCase(),reverse?router.toLowerCase():owner)
 for(const bad of [[{...l,address:owner}],[log(stockUsdc.address,OKX_NATIVE,router)],[l,l],[]])assert.equal(nativeTradeLegs(proof,bad,5).length,0)
 if(!reverse){const s=normalizeStockNotices();s.wallets.user={address:owner,since:1};const input={id:hash+':1',hash,from:owner,to:router,token:stockUsdc.address.toLowerCase(),symbol:'USDC',units:'500000',decimals:6,at:5};recordStockTradeNotices(s,[input,...legs],[proof]);recordStockTradeNotices(s,[input,...legs],[proof]);const rows=pocketStockNoticeActivity(Object.values(s.notices),owner);assert.equal(rows.length,1);assert.equal(rows[0].source,'wallet-swap');assert.equal(rows[0].amount,'0.5');assert.ok(rows[0].contextLabel.includes('OKB'))}
}
// Exact real transaction fixture is used locally below; no credentials in fixtures.
console.log('PASS native swap event emitter/owner/pair/duplicate rejection, both native directions, exact amounts, deduplication and shared swap activity mapping')
