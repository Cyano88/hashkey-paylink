import assert from 'node:assert/strict'
import {rankPocketDataPlans} from '../api/pocket/bills-popularity.ts'
import {parsePocketDataBundles,popularPocketDataBundles} from '../src/pocket/lib/pocketDataBundles.ts'
const now=Date.now(), day=86400000
const purchase=(serviceId,variationCode,extra={})=>({serviceId,variationCode,category:'data',state:'delivered',providerEnvironment:'live',createdAt:now-day,...extra})
const ranks=rankPocketDataPlans([
 purchase('mtn-data','a'),purchase('mtn-data','b'),purchase('mtn-data','b'),purchase('airtel-data','a'),purchase('airtel-data','c'),purchase('airtel-data','c'),
 purchase('mtn-data','sandbox',{providerEnvironment:'sandbox'}),purchase('mtn-data','failed',{state:'failed'}),purchase('mtn-data','refunded',{state:'refunded'}),purchase('mtn-data','old',{createdAt:now-31*day}),purchase('mtn-data','future',{createdAt:now+day}),purchase('mtn-data','airtime',{category:'airtime'})
],now)
assert.deepEqual(ranks,{'mtn-data':['b','a'],'airtel-data':['c','a']})
assert.deepEqual(rankPocketDataPlans([],now),{})
const bundles=parsePocketDataBundles([{variationCode:'a',name:'1GB 1 Day',amountNgn:'100',available:true,popularityRank:2},{variationCode:'b',name:'100GB Router 90 Days',amountNgn:'1000',available:true,popularityRank:1},{variationCode:'c',name:'50GB 30 Days',amountNgn:'900',available:true},{variationCode:'d',name:'2GB 7 Days',amountNgn:'300',available:false,popularityRank:3}], 'mtn-data')
assert.deepEqual(bundles.map(x=>x.category),['daily','monthly','monthly','weekly'])
assert.deepEqual(popularPocketDataBundles(bundles).map(x=>x.variationCode),['b','a'])
console.log('PASS per-network popularity, live delivered purchases only, 30-day window, empty history, availability and merged Monthly categories.')
