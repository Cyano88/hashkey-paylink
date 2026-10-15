import assert from 'node:assert/strict'
import {build} from 'esbuild'
const result=await build({stdin:{contents:"export {pocketStockNoticeActivity} from './src/pocket/lib/pocketStockNoticeActivity';export {isPocketActivityReadData} from './src/pocket/lib/pocketSchemas'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',packages:'external'})
// Write under the workspace so external packages resolve normally.
const {mkdir,writeFile,unlink}=await import('node:fs/promises')
await mkdir('.codex-temp',{recursive:true});const file=new URL('../.codex-temp/shared-notice-schema.mjs',import.meta.url)
await writeFile(file,result.outputFiles[0].text)
try{
 const {pocketStockNoticeActivity,isPocketActivityReadData}=await import(file.href)
 const owner='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64)
 const notices=['USDC','USDT0'].flatMap(symbol=>['deposit','withdraw'].map(action=>({id:symbol+action,hash,at:1,earn:{action,symbol},transfer:{amount:'0.01',from:owner,to:owner}})))
 notices.push({id:'trade',hash:'0x'+'b'.repeat(64),at:2,title:'Stock purchased',body:'0.01 TSLAx added to your investments.',trade:{action:'buy',input:{symbol:'USDC',amount:'3'},output:{symbol:'TSLAx',amount:'0.01'}}})
 const payments=pocketStockNoticeActivity(notices,owner)
 assert.equal(payments.length,5)
 assert.ok(isPocketActivityReadData({payments,merchants:[],collections:[]}),'Mixed Earn and stock history must pass the actual client schema')
 assert.ok(!isPocketActivityReadData({payments:payments.map((r,i)=>i===0?{...r,memo:''}:r),merchants:[],collections:[]}),'Regression reproduces the previously rejected response')
 console.log('PASS mixed USDC/USDT Earn and stock activity passes client response validation')
}finally{await unlink(file)}
