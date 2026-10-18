import assert from 'node:assert/strict'
import {pocketStockNoticeActivity} from '../src/pocket/lib/pocketStockNoticeActivity.ts'
import {normalizeStockNotices,recordStockTransfer,deliverStockNotices} from '../api/pocket/xstocks-notifications-store.ts'
import {recordStockTradeNotices,stockTradeProof} from '../api/pocket/stock-trade-notifications.ts'
import {stockAssets,stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.ts'
import {OKX_XLAYER_ROUTER} from '../src/pocket/lib/pocketXStocksSwap.ts'
const owner='0x1111111111111111111111111111111111111111',router=OKX_XLAYER_ROUTER,stock=stockAssets[0],hash='0x'+'a'.repeat(64)
for(const action of ['buy','sell','swap']){
 const input=action==='buy'?stockUsdc:stock,output=action==='sell'?stockUsdc:action==='swap'?stockAssets[1]:stock
 const s=normalizeStockNotices();s.wallets.user={address:owner,since:1}
 const rows=[{id:'out',hash,from:owner,to:router,token:input.address.toLowerCase(),symbol:input.symbol,units:'1000000',decimals:6,at:5},{id:'in',hash,from:router,to:owner,token:output.address.toLowerCase(),symbol:output.symbol,units:'10000',decimals:6,at:5}]
 rows.forEach(t=>recordStockTransfer(s,t));const proof={hash,owner,input:input.address.toLowerCase(),output:output.address.toLowerCase()}
 recordStockTradeNotices(s,[...rows,...rows],[proof]);recordStockTradeNotices(s,rows,[proof]);const trades=Object.values(s.notices).filter(n=>n.trade);assert.equal(trades.length,1);assert.equal(trades[0].trade.action,action);assert.equal(trades[0].trade.input.amount,'1');assert.equal(trades[0].trade.output.amount,'0.01');assert.equal(trades[0].title,action==='buy'?'Stock purchased':action==='sell'?'Stock sold':'Swap successful')
 const activity=pocketStockNoticeActivity(Object.values(s.notices),owner);assert.equal(activity.length,1);assert.equal(activity[0].source,'stock-'+action);assert.equal(activity[0].txHash,hash);
 const sent=[],deps={configured:()=>true,listOwners:async()=>['user'],read:async()=>s,mutate:async fn=>{fn(s);return s},send:async(...args)=>{sent.push(args);return true}}
 await deliverStockNotices({...deps,send:async()=>false});assert.equal(trades[0].delivered,false);await deliverStockNotices(deps);await deliverStockNotices(deps);assert.equal(sent.length,1);assert.ok(sent[0][2].path.includes(hash))
 const missing=normalizeStockNotices();missing.wallets=s.wallets;recordStockTradeNotices(missing,[rows[0]],[proof]);assert.equal(Object.keys(missing.notices).length,0)
 const other=normalizeStockNotices();other.wallets=s.wallets;recordStockTradeNotices(other,rows,[{...proof,owner:router}]);assert.equal(Object.keys(other.notices).length,0)
}
assert.equal(stockTradeProof({hash,from:owner,to:owner,input:'0x'}, {status:'success'}),undefined)
assert.equal(stockTradeProof({hash,from:owner,to:router,input:'0x'}, {status:'reverted'}),undefined)
assert.equal(stockTradeProof({hash,from:owner,to:router,input:'0x'}, {status:'success'}),undefined)
console.log('PASS buy/sell/swap precise push summaries, duplicate legs, single delivery, retry, missing/foreign legs, invalid/reverted proof rejection')

