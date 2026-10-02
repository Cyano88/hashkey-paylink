async (page) => {
  const check=(value,message)=>{if(!value)throw Error(message)}
  await page.setViewportSize({width:1440,height:1000})
  await page.goto('http://127.0.0.1:4321/admin/workspaces/hashpaystream/trade-disputes')
  await page.getByText('Sample delivery dispute',{exact:true}).waitFor()
  await page.getByRole('button',{name:'Review case',exact:true}).click()
  await page.getByText('Synthetic case opened. No chain or signing calls were made.',{exact:true}).waitFor()
  const calls=await page.evaluate(()=>window.__requests.filter(r=>r.path==='/api/xstocks-review'))
  check(calls.length>=2&&calls.every(r=>r.workspace==='hashpaystream'),'Missing workspace scope')
  check(calls.some(r=>JSON.parse(r.body).action==='read'&&JSON.parse(r.body).agreementId==='xag_'+'12'.repeat(32)),'Wrong case reference')
  await page.getByRole('combobox',{name:'Cases',exact:true}).selectOption('all')
  await page.waitForFunction(()=>window.__requests.some(r=>r.path==='/api/xstocks-review'&&JSON.parse(r.body).filter==='all'))
  await page.screenshot({path:'output/playwright/operations-trade-queue-desktop.png'})
  await page.setViewportSize({width:390,height:844})
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile overflow')
  await page.screenshot({path:'output/playwright/operations-trade-queue-mobile.png'})
  return 'PASS: scoped queue, exact case selection, filters, and mobile layout.'
}
