import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import {W3SSdk} from '@circle-fin/w3s-pw-web-sdk';import {createCircleSdk} from './src/lib/createCircleSdk';window.raw=()=>new W3SSdk({appSettings:{appId:'fixture'}});window.safe=()=>createCircleSdk({appSettings:{appId:'fixture'}});`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'unused-jwt-fixture',setup(b){b.onResolve({filter:/^jsonwebtoken$/},()=>({path:'jwt',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export function decode(){throw Error('JWT processing is outside this constructor regression')}"}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const id='g_'+'a'.repeat(22),secret='b'.repeat(43)
 for(const mode of ['raw','safe','oauth']) {
  const page=await browser.newPage()
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<main>Fixture</main>'}))
  const fragment=mode==='oauth'?'#access_token=fixture&state=fixture':'#claim='+secret
  await page.goto('https://fixture.invalid/gift/'+id+fragment)
  await page.evaluate(()=>history.replaceState({idx:2,key:'gift-route'},'',location.href))
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  const result=await page.evaluate(mode=>{
   const original=location.href
   mode==='raw'?window.raw():window.safe()
   return {preserved:location.href===original,state:history.state,frames:Array.from(document.querySelectorAll('#sdkIframe')).map(f=>({path:new URL(f.src).pathname,display:f.style.display}))}
  },mode)
  if(mode==='safe') {
   assert.equal(result.preserved,true,'Gift capability remains available to Pocket')
   assert.deepEqual(result.state,{idx:2,key:'gift-route'},'Router state is preserved')
   assert.deepEqual(result.frames,[],'Real Circle SDK does not enter OAuth for a gift fragment')
   await page.evaluate(()=>window.safe())
   assert.equal(await page.locator('#sdkIframe').count(),0,'SDK singleton reinitialization is protected too')
  } else {
   assert.equal(result.preserved,false,'Real SDK consumes key=value fragment')
   assert.deepEqual(result.frames,[{path:'/social/verify-token',display:'none'}],mode==='raw'?'Reproduces original claim blocker':'Real OAuth handling remains untouched')
  }
  await page.close()
 }
 console.log('PASS real installed Circle SDK: gift collision reproduced; protected construction preserves capability/router state and creates no OAuth frame; real OAuth behavior unchanged.')
} finally {await browser.close()}
