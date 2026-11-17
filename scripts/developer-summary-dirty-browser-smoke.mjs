import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const saved of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.goto('http://127.0.0.1:4319/?receiptSettings&section=setup'+(saved?'&savedSummary':''))
 await page.getByRole('button',{name:'Receipts & support',exact:true}).click()
 const save=page.getByRole('button',{name:'Save changes',exact:true}),toggle=page.getByRole('checkbox',{name:/Email my activity summary/})
 const frequency=page.getByRole('combobox',{name:/^Frequency/}),zone=page.getByRole('combobox',{name:/^Reporting timezone/})
 assert(await save.isDisabled())
 const initial=await toggle.isChecked()
 assert.equal(initial,saved)
 await toggle.setChecked(!initial);assert(await save.isEnabled())
 await toggle.setChecked(initial);assert(await save.isDisabled(),'Restoring the summary toggle must restore clean state')
 for(const [field,changed] of [[frequency,saved?'daily':'weekly'],[zone,saved?'UTC':'Africa/Lagos']]){
  const original=await field.inputValue()
  await field.selectOption(changed);assert(await save.isEnabled())
  await field.selectOption(original);assert(await save.isDisabled(),'Restoring summary preferences must restore clean state')
 }
 const support=page.getByRole('textbox',{name:/Merchant support email/})
 const oldEmail=await support.inputValue()
 await support.fill('support@example.test');await toggle.setChecked(!initial);await toggle.setChecked(initial)
 assert(await save.isEnabled(),'Reverting summary must not hide another edited field')
 await support.fill(oldEmail);assert(await save.isDisabled())
 assert.equal(await page.evaluate(()=>window.__portalWrites.length),0)
 await page.getByRole('button',{name:'Back to apps',exact:true}).click()
 assert.equal(await page.getByRole('dialog').count(),0,'Reverted summaries must not prompt to discard')
 await page.close()
 }
 console.log('PASS default and saved summaries: toggle/frequency/timezone revert, other edits retained, Back without discard, zero saves.')
}finally{await browser.close()}
