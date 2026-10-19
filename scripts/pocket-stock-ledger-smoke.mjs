import assert from 'node:assert/strict'
import {archiveStockInvestments,stockInvestmentNotices} from '../api/pocket/stock-investment-ledger.ts'
import {stockAssets} from '../src/pocket/lib/pocketXStocksWallet.ts'
import {buildStockBasis} from '../src/pocket/lib/pocketStockPnl.ts'
for(const asset of stockAssets){
 const n={id:'buy',owner:'owner',at:100,hash:'hash',title:'',body:'',trade:{action:'buy',input:{symbol:'USDC',amount:'10'},output:{symbol:asset.symbol,amount:'1'}}}
 const s={wallets:{owner:{address:'wallet-a',since:1}},notices:{buy:n},requests:{},reads:{}}
 archiveStockInvestments(s)
 delete s.notices.buy // Activity retention must not remove investment history.
 assert.equal(buildStockBasis(stockInvestmentNotices(s,'owner'),stockAssets,{hash:'10'})[asset.address.toLowerCase()].costUsd,'10')
 assert.equal(stockInvestmentNotices(s,'stranger').length,0)
 s.wallets.owner={address:'wallet-b',since:101}
 archiveStockInvestments(s)
 assert.equal(stockInvestmentNotices(s,'owner').length,0)
 s.wallets.owner={address:'WALLET-A',since:102}
 assert.equal(stockInvestmentNotices(s,'owner').length,1,'Original wallet retains its own basis after relinking')
 s.notices.buy={...n,at:103,trade:{...n.trade,output:{symbol:asset.symbol,amount:'2'}}}
 archiveStockInvestments(s)
 assert.equal(stockInvestmentNotices(s,'owner').length,1,'Enrichment updates rather than duplicates a record')
 assert.equal(stockInvestmentNotices(s,'owner')[0].trade.output.amount,'2')
}
console.log('PASS permanent investment history, retention, wallet isolation and enrichment for all '+stockAssets.length+' stocks')
