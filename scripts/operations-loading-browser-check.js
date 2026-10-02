async page => {
 const check=(v,m)=>{if(!v)throw Error(m)}
 await page.setViewportSize({width:1440,height:1000})
 await page.goto('http://127.0.0.1:4322/admin?loading')
 await page.getByRole('status',{name:'Loading dashboard'}).waitFor()
 check(await page.locator('.developer-shimmer').count()>10,'Missing layout skeleton')
 check(await page.getByText('Opening developer portal…',{exact:true}).count()===0,'Old opening text remains')
 await page.screenshot({path:'output/playwright/operations-shimmer-light.png'})
 await page.getByRole('button',{name:'Switch to dark theme'}).click()
 check(await page.evaluate(()=>document.documentElement.classList.contains('dark')),'Dark skeleton missing')
 await page.screenshot({path:'output/playwright/operations-shimmer-dark.png'})
 await page.emulateMedia({reducedMotion:'reduce'})
 check(await page.locator('.developer-shimmer').first().evaluate(el=>getComputedStyle(el,'::after').animationName)==='none','Reduced motion must disable shimmer')
 await page.setViewportSize({width:390,height:844})
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Skeleton overflows mobile')
 await page.emulateMedia({reducedMotion:'no-preference'})
 return 'PASS: themed layout skeleton, no opening text, reduced motion and mobile width.'
}
