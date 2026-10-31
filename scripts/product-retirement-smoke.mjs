import assert from 'node:assert/strict'
import express from 'express'
import {readFileSync} from 'node:fs'
import {retiredProductBoundary} from '../api/product-retirement.ts'
const app=express();let reached=0;app.use(retiredProductBoundary);app.use((_req,res)=>{reached++;res.json({ok:true})})
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port
try{
 for(const path of ['/api/v2/agreements','/api/v2/agreements/payer','/api/v2/agreements/verified-recipient','/api/hashpaystream/arc-agreement-webhook','/api/relay-stream','/api/relay-checkpoint','/api/get-content-checkpoint','/api/creator-social/comment','/api/arc-agreement-operations'])for(const method of ['GET','POST','PUT','DELETE']){
 const r=await fetch(origin+path,{method});assert.equal(r.status,410,path);assert.equal((await r.json()).code,'PRODUCT_UNAVAILABLE')
 }
 assert.equal(reached,0)
 for(const path of ['/api/v2/checkouts','/api/v2/trade-agreements','/api/v2/xstocks-agreements','/api/pocket/kyc','/api/receipt'])assert.equal((await fetch(origin+path)).status,200)
 const source=readFileSync('server.ts','utf8');assert.doesNotMatch(source,/import .*hash paystream roll downs|app\.(get|post|all)\('\/api\/v2\/agreements'/);assert.doesNotMatch(source,/drainArcAgreement/)
 for(const path of ['src/App.tsx','src/surfaces/CheckoutApp.tsx'])assert.doesNotMatch(readFileSync(path,'utf8'),/import.*StreamPayApp/)
 console.log('PASS retired APIs reject all methods before handlers; Trade, Pocket, checkout and receipt routes remain separate; no generic escrow workers mounted.')
}finally{await new Promise(r=>server.close(r))}
