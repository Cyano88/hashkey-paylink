import assert from 'node:assert/strict'
import {stockRead,stockApiResponse,invalidateStockReads} from '../src/pocket/api/pocketStockRead.ts'
let now=100000,calls=0;const clock=Date.now;Date.now=()=>now
try {
 const read=()=>{calls++;return Promise.resolve({owner:'a'})}
 const pair=await Promise.all([stockRead('a','inbox',read),stockRead('a','inbox',read)])
 assert.equal(calls,1);assert.equal(pair[0],pair[1]);await stockRead('a','inbox',read);assert.equal(calls,1)
 await stockRead('b','inbox',read);assert.equal(calls,2)
 invalidateStockReads('a');await stockRead('a','inbox',read);assert.equal(calls,3)
 now+=11000;let rejected=0
 const fail=()=>{rejected++;return stockApiResponse(new Response('<!DOCTYPE html>',{status:429,headers:{'Retry-After':'60'}}))}
 await assert.rejects(stockRead('a','inbox',fail),/temporarily unavailable/)
 now+=15000;await assert.rejects(stockRead('a','inbox',fail),/temporarily unavailable/);assert.equal(rejected,1)
 now+=46000;await stockRead('a','inbox',read);assert.equal(calls,4)
 await assert.rejects(stockApiResponse(new Response('<!DOCTYPE html>',{status:502})),/temporarily unavailable/)
 await assert.rejects(stockApiResponse(new Response('<!DOCTYPE html>',{status:200})),/temporarily unavailable/)
 await assert.rejects(stockApiResponse(new Response(JSON.stringify({ok:false,error:'Approval required'}),{status:403})),/Approval required/)
 assert.deepEqual(await stockApiResponse(new Response(JSON.stringify({ok:true,notices:[]}))),{ok:true,notices:[]})
 console.log('PASS: deduplication, account isolation, mutation invalidation, Retry-After, recovery, HTML responses and authorization errors')
}finally{Date.now=clock}
