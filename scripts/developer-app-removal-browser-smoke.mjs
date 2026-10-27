import assert from 'node:assert/strict'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 for(const mode of ['delete','blocked','failure','close']){
  await page.goto('http://127.0.0.1:4319/?section=setup'+({delete:'',blocked:'&removeBlocked',failure:'&removeFail',close:'&closeApp'})[mode])
  await page.getByRole('button',{name:'Delete app',exact:true}).click()
  const dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name:/Builder demo/}).waitFor()
  if(mode==='blocked'){await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('button',{name:'Delete app',exact:true}).count(),0);await dialog.getByRole('button',{name:'Cancel'}).click();continue}
  const action=dialog.getByRole('button',{name:mode==='close'?'Close app':'Delete app',exact:true})
  await dialog.getByLabel('App name confirmation').waitFor();assert.equal(await action.isEnabled(),false)
  await dialog.getByLabel('App name confirmation').fill('wrong');assert.equal(await action.isEnabled(),false)
  await dialog.getByLabel('App name confirmation').fill('Builder demo');assert.equal(await action.isEnabled(),true)
  await dialog.screenshot({path:`output/playwright/app-removal-${mode}.png`});await action.click()
  if(mode==='failure'){await dialog.getByRole('alert').filter({hasText:'A payment started'}).waitFor();continue}
  await page.getByRole('heading',{name:'Apps',exact:true}).waitFor()
  assert.equal(await page.getByRole('button',{name:/Builder demo/}).count(),0)
  if(mode==='close'){await page.getByLabel('Show closed apps').check();await page.getByRole('button',{name:/Builder demo/}).click();await page.getByText('Closed app. Payment history is retained for your records.').waitFor();assert.equal(await page.getByRole('button',{name:'Settings',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Delete app',exact:true}).count(),0)}
 }
 assert.deepEqual(errors,[]);console.log('PASS removal confirmation, exact name, pending denial, race error, delete navigation and read-only closed history on mobile.')
}finally{await browser.close()}
