import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const [width,dark] of [[390,false],[320,true]]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:4321/admin/workspaces/hashpaystream/projects')
 await page.getByRole('button',{name:'Open application',exact:true}).waitFor()
 if(dark)await page.getByRole('button',{name:'Switch to dark theme'}).click()
 await page.evaluate(()=>{
  const original=window.fetch
  window.__reviewCalls=[]
  window.fetch=async(url,options={})=>{
   const body=JSON.parse(options.body||'{}')
   if(!String(body.action).startsWith('admin-verification-'))return original(url,options)
   window.__reviewCalls.push(body.action)
   await new Promise(resolve=>window.__releaseReview=resolve)
   if(body.action==='admin-verification-download')return Response.json({error:'Test failure'},{status:500})
   const response=await original(url,options),data=await response.json()
   if(body.action==='admin-verification-read'){
    data.application.owners=[{id:'owner-fixture',fullName:'Alex Example',ownership:'100',controlPerson:true}]
    data.verification.documents=[{id:'doc1',slot:'incorporation',name:'company.pdf'},{id:'doc2',slot:'owner-id:owner-fixture',name:'identity.pdf'},{id:'doc3',slot:'owner-address:missing-owner',name:'address.pdf'},{id:'doc4',slot:'legacy:internal-id',name:'legacy.pdf'}]
   }
   return Response.json(data)
  }
 })
 await page.getByRole('button',{name:'Open application',exact:true}).click()
 const opening=page.getByRole('button',{name:'Opening',exact:false})
 assert.equal(await opening.getAttribute('aria-busy'),'true')
 assert.equal(await opening.locator('.animate-spin').count(),1)
 await page.evaluate(()=>window.__releaseReview())
 await page.getByRole('button',{name:'Reload application',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:/Certificate of incorporation.*company.pdf/}).count(),1)
 const ownerDoc=page.getByRole('button',{name:/Alex Example.*Government-issued ID/})
 assert.equal(await ownerDoc.count(),1)
 assert.equal(await page.getByRole('button',{name:/Proof of residential address.*address.pdf/}).count(),1)
 assert.equal(await page.getByRole('button',{name:/Supporting document.*legacy.pdf/}).count(),1)
 assert.equal(await page.getByText(/owner-id:|missing-owner|legacy:internal-id/).count(),0)
 await ownerDoc.click()
 assert.equal(await ownerDoc.getAttribute('aria-busy'),'true')
 assert.equal(await ownerDoc.locator('.animate-spin').count(),1)
 assert.equal(await page.getByRole('button',{name:'Reload application',exact:true}).getAttribute('aria-busy'),'false')
 await page.evaluate(()=>window.__releaseReview())
 await page.getByRole('alert').filter({hasText:'Document could not be downloaded.'}).waitFor()
 assert.equal(await ownerDoc.isEnabled(),true)
 await page.getByLabel('Smile verification reference',{exact:true}).fill('FIXTURE-ONLY')
 await page.getByRole('checkbox',{name:/I have checked/}).check()
 await page.getByRole('button',{name:'Approve business',exact:true}).click()
 const saving=page.getByRole('button',{name:'Saving',exact:false})
 assert.equal(await saving.getAttribute('aria-busy'),'true')
 assert.equal(await saving.isDisabled(),true)
 assert.equal(await saving.locator('.animate-spin').count(),1)
 assert.equal(await page.getByRole('button',{name:'Reload application',exact:true}).count(),1)
 await page.screenshot({path:`output/playwright/admin-review-actions-${width}.png`,fullPage:true})
 await page.evaluate(()=>window.__releaseReview())
 await page.getByText('Verified',{exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 assert.deepEqual(errors,[])
 assert.deepEqual(await page.evaluate(()=>window.__reviewCalls),['admin-verification-read','admin-verification-download','admin-verification-review'])
 await page.close()
 }
 console.log('PASS readable document ownership/fallbacks; correct read/download/review busy indicators; download failure recovery; 320 dark/390 light; no overflow.')
}finally{await browser.close()}
