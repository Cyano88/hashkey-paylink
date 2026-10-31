import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,readFile,readdir} from 'node:fs/promises'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const sessionId='chks_'+'a'.repeat(24),childId='chk_1234567890'
const pricing={currency:'NGN',amount:'2000',paymentAmount:'1.333334',paymentAsset:'USDT',rate:'1500',source:'paycrest',referenceNetwork:'base',quotedAt:new Date().toISOString()}
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import Entry from'./src/pages/HostedCheckoutEntry';createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path="/pay/c/:checkoutId" element={<Entry/>}/><Route path="/pay" element={<h1>Verified payment review</h1>}/></Routes></BrowserRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',loader:{'.png':'dataurl','.svg':'dataurl','.woff':'dataurl','.woff2':'dataurl'},plugins:[{name:'review-stub',setup(b){b.onLoad({filter:/[\\/](BscCheckoutPage|PocketXPayCheckoutPage|BrowserPaymentResult)\.tsx$/},()=>({contents:'export default function Stub(){return null}',loader:'tsx'}))}}]})
const cssName=(await readdir('dist/assets')).find(n=>/^index.*\.css$/.test(n)),css=cssName?await readFile('dist/assets/'+cssName,'utf8'):''
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [390,1280])for(const mode of ['web','pocket']){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];let writes=0
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://checkout.test/**',async route=>{
  const u=new URL(route.request().url())
  if(u.pathname==='/api/v2/checkouts'){
   const post=route.request().method()==='POST';if(post)writes++
   const result=post?{ok:true,selectedCheckoutUrl:'/pay/c/'+childId+'?attempt=pat_1234567890'}:u.searchParams.get('id')===sessionId?{ok:true,checkout:{id:sessionId,selectionCheckout:true,currency:'NGN',amount:'2000',merchantName:'Lunchroom',title:'Lunchroom order ABC123',expiresAt:new Date(Date.now()+900000).toISOString(),options:[{network:'base',asset:'USDC'},{network:'xlayer',asset:'USDT'}]}}:{ok:true,paymentUrl:'/pay?hosted='+childId,checkout:{id:childId,status:'pending',amount:'1.333334',asset:'USDT',merchantName:'Lunchroom',title:'Lunchroom order ABC123',pricing,expiresAt:new Date(Date.now()+900000).toISOString()}}
   return route.fulfill({contentType:'application/json',body:JSON.stringify(result)})
  }
  if(u.pathname==='/hash-logo-transparent.png')return route.fulfill({contentType:'image/png',body:await readFile('public/hash-logo-transparent.png')})
  if(/\.(png|svg|webp)$/.test(u.pathname))return route.fulfill({status:404,body:''})
  return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles.find(f=>!f.path.endsWith('.css')).text.replaceAll('</script','<\\/script')+'</script>'})
 })
 await page.goto('https://checkout.test/pay/c/'+sessionId)
 await page.getByRole('heading',{name:/2,000.00/}).waitFor();assert.equal(await page.getByLabel('Payment network').count(),0)
 await page.getByRole(mode==='web'?'button':'link',{name:mode==='web'?'Pay on web':'Pay with Pocket',exact:true}).click()
 await page.getByLabel('Payment network').waitFor();await page.getByLabel('Payment network').selectOption('xlayer');assert.equal(await page.getByLabel('Payment asset').inputValue(),'USDT');assert.equal(writes,0)
 await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/ngn-'+mode+'-'+width+'.png'})
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 if(mode==='web')await page.getByRole('heading',{name:'Verified payment review'}).waitFor()
 else {await page.getByRole('link',{name:'Pay with Pocket',exact:true}).waitFor();assert.match(page.url(),/pocket=1/);assert.equal(await page.getByLabel('Payment network').count(),0)}
 assert.equal(writes,1);assert.deepEqual(errors,[]);await page.close()
}}finally{await browser.close()}
console.log('PASS NGN mobile and desktop: Pocket/web first, stablecoin selection second, immutable amount, one request and correct child handoff.')
