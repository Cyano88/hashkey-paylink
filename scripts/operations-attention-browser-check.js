async page => {
 await page.reload();
 await page.getByRole('heading',{name:'Verification',exact:true}).waitFor();
 if(!(await page.getByLabel('Workspace',{exact:true}).textContent()).includes('(1)'))throw Error('Workspace option count missing');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Open navigation',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Admin navigation'});
 await dialog.getByRole('link',{name:'Verification 1 applications awaiting review'}).waitFor();
 await dialog.getByRole('link',{name:'Support 2 conversations needing reply'}).waitFor();
 await page.screenshot({path:'output/playwright/admin-attention-mobile.png'});
 await page.getByRole('button',{name:'Close navigation',exact:true}).click();
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('link',{name:'Businesses',exact:true}).click();
 await page.getByRole('table').waitFor();
 if(await page.getByRole('table').getByLabel('1 application awaiting review',{exact:true}).count()!==1)throw Error('Project verification count missing');
 if(await page.getByRole('table').getByLabel('2 conversations needing reply',{exact:true}).count()!==1)throw Error('Project support count missing');
 await page.evaluate(()=>window.__clearAttention());
 await page.waitForFunction(()=>!document.querySelector('[aria-label="1 application awaiting review"]'));
 return {passed:true,checks:['workspace options','mobile nav','project counts','clear after handled']};
}
