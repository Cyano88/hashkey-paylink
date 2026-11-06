import assert from 'node:assert/strict'
import handler,{parseStockCandles,readStockHistory,stockChartRanges} from '../api/pocket/xstocks-history.ts'
import fs from 'node:fs'
const assets=JSON.parse(fs.readFileSync('src/pocket/lib/pocketXStocksCatalog.json')).assets,now=Date.now()
const candle=(time,price=100)=>[String(time),String(price),String(price+1),String(price-1),String(price),'0','0','1']
const valid=candle(now-300000)
assert.equal(parseStockCandles([valid,valid],300000,now).length,1)
assert.equal(parseStockCandles([candle(now)],300000,now)[0].time,now)
for(const bad of [candle(now+1),candle(-1),candle(now,0),candle(now,NaN),[...valid.slice(0,7),'x'],[valid[0],100,50,90,100,0,0,1]])assert.equal(parseStockCandles([bad],300000,now).length,0)
assert.deepEqual(parseStockCandles([candle(now-1000000),candle(now-2000000)],300000,now).map(p=>p.openTime),[now-2000000,now-1000000])
const keys=['OKX_DEX_API_KEY','OKX_DEX_SECRET_KEY','OKX_DEX_PASSPHRASE'],old=keys.map(k=>process.env[k]);keys.forEach(k=>process.env[k]='fixture')
let calls=0
try{
 const fetcher=async(url,options)=>{calls++;assert.ok(url.startsWith('https://web3.okx.com/api/v6/dex/market/historical-candles?'));assert.equal(new URL(url).searchParams.get('chainIndex'),'196');assert.ok(options.headers['OK-ACCESS-SIGN']);return new Response(JSON.stringify({code:'0',data:[candle(now-600000),candle(now-300000)]}))}
 const [a,b]=await Promise.all([readStockHistory(assets[0].address,'1D',fetcher,now),readStockHistory(assets[0].address.toUpperCase(),'1D',fetcher,now)])
 assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.points.length,2);assert.equal(a.complete,true)
 await readStockHistory(assets[0].address,'1D',fetcher,now);assert.equal(calls,1)
 const stale=await readStockHistory(assets[0].address,'1D',async()=>{throw Error('offline')},now+60001);assert.deepEqual(stale,a,'failed refresh retains the same series and original observed time')
 await assert.rejects(()=>readStockHistory('0x'+'f'.repeat(40),'1D',fetcher,now))
 await assert.rejects(()=>readStockHistory(assets[0].address,'bad',fetcher,now))
 for(const range of Object.keys(stockChartRanges)){
  const h=await readStockHistory(assets[1].address,range,fetcher,now);assert.equal(h.range,range)
 }
 let pages=0
 const paged=await readStockHistory(assets[2].address,'1Y',async(url)=>{
  pages++;const after=new URL(url).searchParams.get('after');if(pages===2)assert.ok(after)
  const rows=pages===1?Array.from({length:299},(_,i)=>candle(now-(i+1)*86400000)):Array.from({length:100},(_,i)=>candle(now-(i+300)*86400000))
  return new Response(JSON.stringify({code:'0',data:rows}))
 },now)
 assert.equal(pages,2);assert.ok(paged.points.every(p=>p.time>=now-365*86400000));assert.equal(paged.complete,true)
 const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(x){this.body=x;return this}}
 await handler({method:'GET',query:{address:assets[0].address,range:'__proto__'}},res);assert.equal(res.statusCode,400)
 await handler({method:'POST',query:{}},res);assert.equal(res.statusCode,405)
 await assert.rejects(()=>readStockHistory(assets[3].address,'1D',async()=>new Response(JSON.stringify({code:'50011'}),{status:429}),now))
 let retryCalls=0;await assert.rejects(()=>readStockHistory(assets[4].address,'1D',async()=>{retryCalls++;return fetcher()},now));assert.equal(retryCalls,0,'rate limit blocks retry storms')
 console.log('PASS stock history: exact token/chain, signed reads, OHLC/time validation, sorted deduplication, shared cache, stale retention, all ranges, pagination, route validation and provider backoff')
}finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i])}
