import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const html=readFileSync('dist/index.html','utf8')
const sheets=[...html.matchAll(/href="(\/assets\/[^" ]+\.css)"/g)].map(m=>m[1])
assert.ok(sheets.length,'initial HTML links a stylesheet')
const css=sheets.map(path=>readFileSync(resolve('dist','.'+path),'utf8')).join('\n')
assert.ok(css.includes('.verification-input'),'verification CSS must be in initial HTML styles, not only a lazy layout chunk')
assert.ok(css.includes('.developer-primary'),'shared console actions must be styled on initial load')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [320,1440])for(const dark of [false,true]){
 const page=await browser.newPage({viewport:{width,height:900}})
 await page.setContent('<html><head><style>'+css+'</style></head><body><main class="developer-surface portal-console"><div class="verification-flow"><fieldset class="verification-fields"><div class="verification-grid"><label class="verification-field">Name<input class="verification-input"></label><label class="verification-field">Country<select class="verification-input"><option>Nigeria</option></select></label></div><nav class="verification-steps"><button>Business</button><button>People</button><button>Review</button></nav><label class="verification-upload">Upload</label></fieldset></div></main></body></html>')
 await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
 const actual=await page.evaluate(()=>({height:getComputedStyle(document.querySelector('input')).height,steps:getComputedStyle(document.querySelector('nav')).display,upload:getComputedStyle(document.querySelector('.verification-upload')).display,columns:getComputedStyle(document.querySelector('.verification-grid')).gridTemplateColumns.split(' ').length,overflow:document.documentElement.scrollWidth>innerWidth}))
 assert.equal(actual.height,'52px');assert.equal(actual.steps,'grid');assert.equal(actual.upload,'flex');assert.equal(actual.columns,width<640?1:2);assert.equal(actual.overflow,false)
 await page.close()
}}finally{await browser.close()}
console.log('PASS production entry CSS: verification and shared console styles present before lazy routes; field height, step grid, upload layout and responsive columns verified in light/dark.')
