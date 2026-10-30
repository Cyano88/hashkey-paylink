import assert from 'node:assert/strict'
import {createDeveloperSandboxHandler} from '../api/developer-sandbox.ts'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const stores=new Map()
const handler=createDeveloperSandboxHandler(async()=>({userId:'browser-fixture-owner'}),{read:async k=>stores.get(k),mutate:async(k,fn)=>{const next=fn(stores.get(k));stores.set(k,next);return next}})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{const native=window.fetch.bind(window);let value=native;Object.defineProperty(window,'fetch',{get:()=>value,set:next=>{value=(input,options)=>String(input).includes('resource=sandbox')?native(input,options):next(input,options)}})})
 await page.route('**/api/developer-projects?resource=sandbox',async route=>{
  const request=route.request();const response={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}}
  await handler({method:request.method(),body:request.postDataJSON(),headers:request.headers(),query:{resource:'sandbox'}},response)
  await route.fulfill({status:response.statusCode,contentType:'application/json',body:JSON.stringify(response.body)})
 })
 await page.goto('http://127.0.0.1:4319/')
 await page.getByRole('button',{name:'Create test payment',exact:true}).waitFor()
 assert.equal(await page.getByRole('switch',{name:'Production'}).getAttribute('aria-checked'),'false')
 await page.getByRole('button',{name:'Create test payment',exact:true}).click()
 await page.getByRole('button',{name:'Simulate paid',exact:true}).click()
 await page.getByRole('button',{name:'Get signed webhook fixture',exact:true}).click()
 await page.getByRole('heading',{name:'Signed fixture',exact:true}).waitFor()
 await page.getByRole('button',{name:'Create sandbox key',exact:true}).click()
 await page.getByText('Copy this key now. It will not be shown again.',{exact:true}).waitFor()
 for(const width of [320,390,768,1440])for(const dark of [false,true]){
  await page.setViewportSize({width,height:960});await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
  await page.evaluate(()=>scrollTo(0,0))
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no overflow at '+width)
  if(width===1440){const rect=await page.getByRole('switch',{name:'Production'}).boundingBox();assert.ok(rect.y>700&&rect.y<960,'switch is at bottom left')}
  await page.screenshot({path:'output/playwright/sandbox-'+width+(dark?'-dark':'-light')+'.png',fullPage:true})
 }
 await page.getByRole('switch',{name:'Production'}).click()
 await page.waitForURL('**environment=live**')
 await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label=Production]')?.getAttribute('aria-checked')==='true')
 assert.equal(await page.getByRole('switch',{name:'Production'}).getAttribute('aria-checked'),'true')
 assert.equal(await page.getByRole('heading',{name:'Build your first payment',exact:true}).count(),0)
 await page.getByRole('switch',{name:'Production'}).click()
 await page.getByRole('button',{name:'Get signed webhook fixture',exact:true}).waitFor()
 assert.equal(await page.getByText('Copy this key now. It will not be shown again.',{exact:true}).count(),0,'secret cleared when environment changes')
 await page.getByRole('button',{name:'Revoke',exact:true}).click()
 await page.getByRole('button',{name:'Revoke',exact:true}).waitFor({state:'detached'})
 assert.deepEqual(errors,[])
 console.log('Sandbox browser: real handler with isolated memory store; payment, signature fixture, key/revoke, environment switching, state retention, secret clearing, 320/390/768/1440 light/dark passed.')
}finally{await browser.close()}
