// Run developer-portal-preview.mjs --build-only first. All requests stay in fixtures.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve, extname} from 'node:path'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const base={id:'dev_phone',accountType:'individual',builderProfileId:'personal',name:'Phone test',checkoutMode:'human',capabilities:['hosted_checkout'],networks:['base'],defaultNetwork:'base',recipients:{},keys:[],allowedOrigins:[],webhookDeliveries:[],updatedAt:'2026-10-30',settlementMode:'usdc'}
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],kyc=[]
 page.on('pageerror',e=>errors.push(e.message))
 let kycStatus=200
 let projectMode='valid',ownerBReady=false,releaseOwnerB
 let result={ok:true,environment:'production',status:'passed',verified:false,jobId:'basic',verification:{country:'NG',method:'bvn'},workflow:{basicPassed:true,bvnPassed:true,complete:false,needsAdditional:true}}
 await page.addInitScript(()=>{const native=window.fetch.bind(window);let value=native;Object.defineProperty(window,'fetch',{get:()=>value,set:next=>{value=(input,options)=>String(input).includes('/api/')?native(input,options):next(input,options)}})})
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url())
  if(url.pathname==='/api/pocket/kyc'){kyc.push({owner:req.headers().authorization,action:req.postDataJSON().action});return route.fulfill({status:kycStatus,json:kycStatus===401?{ok:false,error:'Sign in again to continue.',retryable:false}:result})}
  if(url.pathname==='/api/developer-projects'){
   const resource=url.searchParams.get('resource')
   if(resource)return route.fulfill({json:{ok:true,wallets:{},profile:{},institutions:[]}})
   if(projectMode==='error')return route.fulfill({status:503,json:{ok:false,error:'Fixture unavailable'}})
   const ownerB=req.headers().authorization?.endsWith(':owner-b')
   if(ownerB&&!ownerBReady)await new Promise(resolve=>{releaseOwnerB=()=>{ownerBReady=true;resolve()}})
   const projects=ownerB?[]:projectMode==='closed'?[{...base,removal:{status:'closed'}}]:projectMode==='business'?[{...base,accountType:'business'}]:[base]
   return route.fulfill({json:{ok:true,projects}})
  }
  if(url.origin!=='http://fixture.test')return route.abort()
  const file=extname(url.pathname)?url.pathname.slice(1):'index.html'
  try{return route.fulfill({body:readFileSync(resolve('output/playwright/developer-preview',file)),contentType:({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'application/octet-stream'})}catch{return route.fulfill({status:404,body:''})}
 })
 const link=id=>'http://fixture.test/?environment=live&section=verification&continueOnPhone=1&project='+id+'&level=advanced&verificationCountry=NG&verificationMethod=government_id'
 // A missing/wrong project must not fall back to the first owned project.
 for(const mode of ['missing','closed','business']){
  projectMode=mode;const before=kyc.length;await page.goto(link(mode==='missing'?'dev_foreign':'dev_phone'))
  await page.getByRole('heading',{name:'Check your account or verification link'}).waitFor()
  assert.equal(kyc.length,before);assert.equal(await page.getByRole('heading',{name:'Personal verification',exact:true}).count(),0)
 }
 await page.getByRole('button',{name:'Change account',exact:true}).click();assert.equal(await page.evaluate(()=>window.__fixtureLoggedOut),true)
 projectMode='error';await page.goto(link('dev_phone'));await page.getByRole('heading',{name:'Verification could not load'}).waitFor()
 projectMode='valid';await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByRole('button',{name:'Verify government ID',exact:true}).waitFor()
 assert.equal(await page.getByRole('checkbox').isChecked(),false);assert.ok(kyc.every(call=>call.action==='status'))
 // A provider-confirmed completion received on desktop stops the handoff UI.
 await page.goto('http://fixture.test/?environment=live&section=verification&project=dev_phone')
 await page.getByRole('button',{name:'Continue on phone',exact:true}).click()
 await page.addScriptTag({content:readFileSync('node_modules/jsqr/dist/jsQR.js','utf8')})
 const decoded=await page.evaluate(async()=>{const svg=document.querySelector('svg[role="img"]')||Array.from(document.querySelectorAll('svg')).find(node=>node.querySelector('title')?.textContent==='Open verification on your phone');const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=768;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,768,768);ctx.drawImage(image,0,0,768,768);const pixels=ctx.getImageData(0,0,768,768);return window.jsQR(pixels.data,768,768)?.data});assert.equal(decoded,await page.getByRole('textbox',{name:'Verification link'}).inputValue())
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('Denied')}}}));await page.getByRole('button',{name:'Copy link',exact:true}).click();await page.getByText('Select and copy the link above.',{exact:true}).waitFor()
 result={...result,status:'passed',verified:true,workflow:{...result.workflow,complete:true,needsAdditional:false}}
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')))
 await page.getByText('Advanced verification complete',{exact:true}).waitFor()
 assert.equal(await page.getByRole('textbox',{name:'Verification link'}).count(),0)
 assert.equal(await page.getByRole('button',{name:'Continue on phone',exact:true}).count(),0)
 // Account switch with delayed project fetch must not mount KYC with old projects.
 await page.goto(link('dev_phone'));await page.getByText('Advanced verification complete',{exact:true}).waitFor()
 await page.evaluate(()=>{window.__fixtureUserId='owner-b';window.dispatchEvent(new Event('fixture-auth-change'))})
 await page.getByRole('status',{name:'Loading dashboard'}).waitFor()
 assert.equal(await page.getByRole('heading',{name:'Personal verification',exact:true}).count(),0)
 assert.equal(kyc.some(call=>call.owner?.endsWith(':owner-b')),false)
 await page.waitForTimeout(50);assert.ok(releaseOwnerB);releaseOwnerB()
 await page.getByRole('heading',{name:'Check your account or verification link'}).waitFor()
 assert.equal(kyc.some(call=>call.owner?.endsWith(':owner-b')),false)
 // Basic and Uganda links preserve the document country without sending identity fields.
 for(const country of ['NG','UG']){
  result={ok:true,environment:'production',status:'not_started',verified:false,workflow:{basicPassed:false,bvnPassed:false,complete:false,needsAdditional:false}}
  await page.goto(link('dev_phone').replace('level=advanced','level=basic').replace('verificationCountry=NG','verificationCountry='+country))
  await page.getByRole('button',{name:country==='UG'?'Verify identity':'Verify Basic',exact:true}).waitFor()
  if(country==='UG')await page.getByText('Checks your National ID details. No selfie is required.',{exact:true}).waitFor()
  assert.equal(await page.getByRole('checkbox').isChecked(),false)
 }
 result={ok:true,environment:'production',status:'pending',jobId:'resume-fixture',canResume:true,canChangeMethod:true,verification:{country:'NG',method:'government_id'},workflow:{basicPassed:true,bvnPassed:true,complete:false,needsAdditional:false}}
 await page.goto('http://fixture.test/?environment=live&section=verification&project=dev_phone');await page.getByRole('button',{name:'Change verification method',exact:true}).waitFor();await page.getByRole('button',{name:'Continue on phone',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Change verification method',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Continue verification',exact:true}).count(),0)
 kycStatus=401;await page.goto(link('dev_phone'));await page.getByRole('alert').filter({hasText:'Sign in again to continue.'}).waitFor();assert.equal(await page.getByRole('button',{name:/^Verify (NIN|government ID|Basic|identity)$/}).count(),0)
 kycStatus=200;result={ok:true,environment:'production',status:'pending',canResume:false,uploadReported:true,verification:{country:'NG'},workflow:{basicPassed:true,bvnPassed:true,complete:false,needsAdditional:false}}
 await page.goto(link('dev_phone'));await page.getByText('Verification submitted',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:/^Verify |Continue verification/}).count(),0)
 assert.ok(kyc.every(call=>call.action==='status'))
 assert.deepEqual(errors,[])
 console.log('PASS full portal: wrong/removed/business project blocked without KYC; account switch hides stale owner state; load retry; selected ID method; fresh consent; desktop completion; QR decoded, clipboard denied, Basic/UG, expired auth, submitted state; all API calls mocked.')
}finally{await browser.close()}
