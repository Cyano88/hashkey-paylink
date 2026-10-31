async page=>{
 await page.goto('http://127.0.0.1:4321/admin?view=verification');
 await page.getByRole('button',{name:'Open application',exact:true}).click();
 const access=page.getByRole('region',{name:'Payment access',exact:true});
 await access.getByRole('button',{name:'Suspend payment access',exact:true}).click();
 await access.getByLabel('Suspension reason',{exact:true}).fill('Multiple customer reports need investigation.');
 await access.getByRole('button',{name:'Review suspension',exact:true}).click();
 if(await page.evaluate(()=>window.__requests.some(r=>r.body&&JSON.parse(r.body).action==='admin-suspend')))throw Error('Suspension occurred before confirmation');
 await access.getByRole('button',{name:'Cancel',exact:true}).click();
 await access.getByRole('button',{name:'Suspend payment access',exact:true}).click();
 await access.getByLabel('Suspension reason',{exact:true}).fill('Multiple customer reports need investigation.');
 await access.getByRole('button',{name:'Review suspension',exact:true}).click();
 await access.getByRole('button',{name:'Confirm suspension',exact:true}).click();
 await access.getByText('Suspended',{exact:true}).waitFor();
 await access.getByText('Multiple customer reports need investigation.',{exact:true}).first().waitFor();
 await page.screenshot({path:'output/playwright/verification-suspended.png',fullPage:true});
 await access.getByRole('button',{name:'Lift suspension',exact:true}).click();
 await access.getByLabel('Reason for lifting suspension',{exact:true}).fill('Investigation completed and reports resolved.');
 await access.getByRole('button',{name:'Review lifting suspension',exact:true}).click();
 await access.getByRole('button',{name:'Confirm lift suspension',exact:true}).click();
 await access.getByText('Not suspended',{exact:true}).waitFor();
 await access.getByText('Payment access history',{exact:true}).click();
 await access.getByText('Investigation completed and reports resolved.',{exact:true}).waitFor();
 return {passed:true,checks:['reason','confirmation before mutation','cancel','suspend','lift suspension','history']};
}
