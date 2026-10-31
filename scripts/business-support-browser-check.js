async page => {
 const check=(value,message)=>{if(!value)throw Error(message)}
 await page.goto('http://127.0.0.1:4183/?view=business')
 await page.getByRole('button',{name:'Refresh cases',exact:true}).waitFor()
 await page.evaluate(()=>{const original=window.fetch;window.fetch=async(...args)=>{
  const r=await original(...args)
  if(String(args[0]).includes('/api/operations-cases')&&!args[1]?.body&&!String(args[0]).includes('presence=')){
   const d=await r.json();d.cases.push({...d.cases[0],id:'second-case',customer:{fullName:'Second builder'},summary:'Another checkout question'})
   if(window.__holdNextCaseRead){window.__holdNextCaseRead=false;return new Promise(resolve=>{window.__releaseOldRead=()=>resolve(Response.json(d))})}
   if(window.__latestCaseSummary)d.cases[0].summary=window.__latestCaseSummary
   return Response.json(d)
  }return r
 }})
 await page.getByRole('button',{name:'Refresh cases',exact:true}).click()
 const ada=()=>page.getByRole('button').filter({hasText:'Ada Okafor'})
 await ada().click()
 const input=page.getByRole('textbox',{name:'Reply to customer',exact:true})
 await input.fill('Unsaved reply for Ada')
 await page.getByRole('button').filter({hasText:'Second builder'}).click()
 check(await input.inputValue()==='', 'Draft leaked to another case')
 await input.fill('Separate draft')
 await ada().click()
 check(await input.inputValue()==='Unsaved reply for Ada','Draft lost on case switch')
 await page.evaluate(()=>{window.__holdNextCaseRead=true})
 await page.getByRole('button',{name:'Refresh cases',exact:true}).click()
 await page.waitForFunction(()=>Boolean(window.__releaseOldRead))
 await page.evaluate(()=>{window.__latestCaseSummary='Latest server case state'})
 await page.getByRole('button',{name:'Refresh cases',exact:true}).click()
 await page.getByRole('heading',{name:'Latest server case state',exact:true}).waitFor()
 await page.evaluate(async()=>{window.__releaseOldRead();await new Promise(resolve=>setTimeout(resolve,100))})
 check(await page.getByRole('heading',{name:'Latest server case state',exact:true}).isVisible(),'Stale list overwrote current case')
 check(await input.inputValue()==='Unsaved reply for Ada','Refresh cleared draft')
 await input.fill('Synthetic reply')
 await page.getByRole('button',{name:'Send message',exact:true}).click()
 await page.getByText('Reply sent.',{exact:true}).waitFor()
 check(await input.inputValue()==='','Successful send did not clear draft')
 await page.getByRole('button').filter({hasText:'Second builder'}).click()
 check(await input.inputValue()==='Separate draft','Sending another case cleared this draft')
 await ada().click();check(await input.inputValue()==='','Sent draft came back')
 return {draftIsolation:true,draftRetention:true,staleReadRejected:true,sendClearsOnlyItsDraft:true}
}
