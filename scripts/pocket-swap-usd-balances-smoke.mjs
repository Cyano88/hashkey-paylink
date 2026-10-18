import assert from 'node:assert/strict'
import {swapTokenUsdPrice,formatSwapOutputUsd} from '../src/pocket/lib/pocketSwapUsd.ts'
import {fetchCircleNativeBalance} from '../api/pocket/native-balances.ts'
import {fetchCircleStablecoinBalances,circleBalanceTokens} from '../api/pocket/circle-display-balances.ts'
assert.equal(formatSwapOutputUsd('0.009123456789',100),'\u2248 $0.91 USD')
assert.equal(formatSwapOutputUsd('0.000001',100),'\u2248 <$0.01 USD')
for(const p of [undefined,null,'',0,-1,'NaN',Infinity,{},'1e5'])assert.equal(swapTokenUsdPrice(p),undefined)
for(const a of ['',0,'NaN','-1','Infinity'])assert.equal(formatSwapOutputUsd(a,100),undefined)
process.env.CIRCLE_API_KEY='LIVE_fixture'
const address='0x'+'1'.repeat(40),link={privyUserId:'test',chain:'base',purpose:'payment',circleWalletId:'wallet',circleWalletAddress:address,circleBlockchain:'BASE',updatedAt:1}
for(const read of [fetchCircleNativeBalance,fetchCircleStablecoinBalances]){
 const jobs=[];let settled=false
 const result=read(link,async url=>new Promise(resolve=>jobs.push({url,resolve}))).then(x=>{settled=true;return x})
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(jobs.length,read===fetchCircleNativeBalance?2:3,'independent identity and balance reads start together')
 for(const job of jobs.filter(x=>x.url.includes('/balances?')))job.resolve(Response.json({data:{tokenBalances:[]}}))
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(settled,false,'no available balance before wallet identity validation')
 jobs.find(x=>!x.url.includes('/balances?')).resolve(Response.json({data:{wallet:{id:'wallet',address,blockchain:'BASE'}}}))
 await result;assert.equal(settled,true)
}
console.log('PASS quote USD display, absent/invalid prices, small amounts, parallel balance reads and identity-gated results')
