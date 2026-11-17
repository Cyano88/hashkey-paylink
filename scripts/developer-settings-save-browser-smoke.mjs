import assert from 'node:assert/strict'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const tab of ['receipts','webhooks']){
 const p=await browser.newPage({viewport:{width:390,height:844}})
 await p.goto('http://127.0.0.1:4319/?receiptSettings&section='+(tab==='receipts'?'setup':'webhooks'))
 if(tab==='receipts')await p.getByRole('button',{name:'Receipts & support',exact:true}).click()
 const field=tab==='receipts'?p.getByRole('textbox',{name:/Merchant support email/}):p.getByLabel('Webhook URL',{exact:true})
 const save=p.getByRole('button',{name:'Save changes',exact:true}),original=await field.inputValue(),changed=tab==='receipts'?'support@example.test':'https://example.test/changed'
 assert(await save.isDisabled());await field.fill(changed);assert(await save.isEnabled());await field.fill(original);assert(await save.isDisabled())
 await field.fill(changed)
 await p.evaluate(()=>{const original=window.fetch;window.configCalls=0;window.failSave=true;window.fetch=async(path,o)=>{if(typeof o?.body==='string'&&JSON.parse(o.body).action==='configure'){window.configCalls++;await new Promise(r=>window.releaseConfigure=r);if(window.failSave)return Response.json({ok:false,error:'Settings could not be saved. Try again.'},{status:503})}return original(path,o)}})
 await save.evaluate(b=>{b.click();b.click()});await p.waitForFunction(()=>typeof window.releaseConfigure==='function')
 const pending=p.getByRole('button',{name:'Saving\u2026',exact:true});assert(await pending.isDisabled());assert.equal(await pending.getAttribute('aria-busy'),'true');assert.equal(await pending.locator('.animate-spin').count(),1);assert.equal(await p.evaluate(()=>window.configCalls),1)
 await p.evaluate(()=>window.releaseConfigure());await p.getByText('Settings could not be saved. Try again.',{exact:true}).waitFor();assert.equal(await field.inputValue(),changed);assert(await save.isEnabled())
 await p.evaluate(()=>window.failSave=false);await save.click();await p.evaluate(()=>window.releaseConfigure());await p.getByText('Project settings saved.',{exact:true}).waitFor();assert(await save.isDisabled())
 for(const dark of [false,true]){await p.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await save.scrollIntoViewIfNeeded();await p.screenshot({path:`output/playwright/settings-save-${tab}-${dark?'dark':'light'}.png`})}
 await p.close()
}console.log('PASS settings/webhook unchanged and reverted Save, pending spinner, duplicate-click lock, failure retention, retry, and saved baseline.')}
finally{await browser.close()}
