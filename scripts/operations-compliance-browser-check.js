async page=>{
 await page.goto('http://127.0.0.1:4321/admin?view=verification&reviewfixture=1');
 await page.getByRole('heading',{name:'Verification',exact:true}).waitFor();
 if(await page.getByText('Pocket Compliance cases',{exact:true}).count())throw Error('Pocket queue remains in verification');
 if(await page.getByRole('heading',{name:'Review queue',exact:true}).count())throw Error('Escalations remain in verification');
 await page.getByRole('link',{name:'Compliance 1 cases awaiting specialist review',exact:true}).click();
 await page.getByRole('heading',{name:'Compliance',exact:true}).waitFor();
 await page.getByLabel('Workspace',{exact:true}).selectOption('hashpaystream');
 await page.getByRole('button',{name:/Business payment review/}).waitFor();
 await page.getByText('Business',{exact:true}).waitFor();
 await page.screenshot({path:'output/playwright/admin-compliance-business.png'});
 await page.getByLabel('Workspace',{exact:true}).selectOption('pocket');
 await page.getByText('No cases in this queue.',{exact:true}).waitFor();
 if(await page.getByRole('button',{name:/Business payment review/}).count())throw Error('Cross-workspace case visible');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Open navigation'}).click();
 await page.getByRole('dialog').getByRole('link',{name:'Compliance 1 cases awaiting specialist review'}).waitFor();
 await page.getByRole('button',{name:'Close navigation'}).click();
 await page.screenshot({path:'output/playwright/admin-compliance-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 return {passed:true,checks:['verification separation','review count','business label','workspace isolation','mobile navigation']};
}
