import assert from 'node:assert/strict'
import { build } from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import {shareReceiptFile} from './src/lib/shareReceiptFile';window.shareReceiptFile=shareReceiptFile`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',plugins:[{name:'native-fixture',setup(b){b.onResolve({filter:/^@capacitor\/core$/},()=>({path:'fixture',namespace:'native'}));b.onLoad({filter:/.*/,namespace:'native'},()=>({contents:`export const Capacitor={getPlatform:()=>window.platform||'android'};export const registerPlugin=(name)=>({share:async args=>{window.nativeCalls.push({name,...args});if(window.rejectNative)throw Error('Native share failed')}});`,loader:'js'}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{const page=await browser.newPage();await page.goto('about:blank');await page.evaluate(()=>{window.nativeCalls=[]});await page.addScriptTag({content:bundle.outputFiles[0].text});
for(const [name,mime,bytes] of [['pocket-receipt.jpg','image/jpeg',[255,216,255,224]],['pocket-receipt.pdf','application/pdf',[37,80,68,70,45]]]){
 await page.evaluate(async({name,mime,bytes})=>window.shareReceiptFile(new File([new Uint8Array(bytes)],name,{type:mime}),'Pocket receipt'),{name,mime,bytes});const call=await page.evaluate(()=>window.nativeCalls.at(-1));assert.equal(call.name,name);assert.equal(call.mimeType,mime);assert.deepEqual([...Buffer.from(call.base64,'base64')],bytes)
}
assert.equal(await page.evaluate(async()=>{window.rejectNative=true;try{await window.shareReceiptFile(new File(['%PDF-'],'pocket-receipt.pdf',{type:'application/pdf'}),'Pocket receipt');return false}catch{return true}}),true)
console.log('PASS Android image/PDF file bytes and MIME route to native sharing; native failures propagate without silent browser download.')
}finally{await browser.close()}
