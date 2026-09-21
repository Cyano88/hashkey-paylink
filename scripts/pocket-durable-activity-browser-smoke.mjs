import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readdirSync, readFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const mocks = {
  '../api/pocketReadClient': `export async function readPocketActivity(input){return new Promise((resolve,reject)=>{window.reads.push({input,resolve,reject});input.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})})}`,
  '../hooks/usePocketIdentity': `export default ()=>({authenticated:true,email:window.owner,getAccessToken:async()=>window.owner})`,
  '../hooks/usePocketWallets': `export default ()=>({resolved:true,error:null,total:3.5,totalComplete:true,rows:[{key:'base',balance:3.5}],walletUpdate:'hidden',displayRows:[{key:'base',balance:3.5,known:true}],displayTotal:3.5,displayComplete:true})`,
  '../hooks/usePocketProfile': `export default ()=>({profile:{displayCurrency:'USD'}})`,
  '../hooks/usePocketFxQuote': `export default ()=>({quote:null,busy:false})`,
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import useActivity,{prefetchPocketActivity} from './src/pocket/hooks/usePocketActivity';import Home from './src/pocket/pages/PocketHomePage';
window.reads=[];let root=createRoot(document.getElementById('root'));
function Harness({owner,recent}){const data=useActivity({authenticated:!!owner,email:owner,enabled:true,recent,getAccessToken:async()=>owner});window.refresh=data.refresh;return <pre id='state'>{JSON.stringify(data)}</pre>}
window.mount=(owner,recent=false,home=false)=>{window.owner=owner;root.render(<MemoryRouter>{home?<Home/>:<Harness owner={owner} recent={recent}/>}</MemoryRouter>)};
window.prefetch=(owner,recent)=>prefetchPocketActivity({email:owner,recent,getAccessToken:async()=>owner});`
const bundle = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'jsx' }, bundle: true, write: false, format: 'iife', jsx: 'automatic', plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /.*/ }, a => mocks[a.path] ? { path: a.path, namespace: 'fixture' } : undefined)
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: mocks[a.path], loader: 'jsx', resolveDir: process.cwd() }))
} }] })
const browser = await chromium.launch({ headless: true, channel: 'chrome' })
const rows = Array.from({ length: 6 }, (_, i) => ({ eventId: 'fixture-' + i, txHash: '0x' + String(i + 1).repeat(64), chain: 'base', payer: 'fixture', memo: 'Fixture payment ' + i, amount: '1', ts: Date.now() - i * 1000, direction: 'out', source: 'wallet-withdrawal' }))
const empty = { payments: [], merchants: [], collections: [], complete: true, refreshing: false, partial: false }
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.route('https://fixture.invalid/**', route => route.fulfill({ contentType: 'text/html', body: '<div data-hashpaylink-top-nav style="position:fixed;top:0;height:80px">Pocket fixture</div><div id="root"></div>' }))
  const boot = async () => { await page.goto('https://fixture.invalid'); await page.addScriptTag({ content: bundle.outputFiles[0].text }) }
  await boot()
  await page.evaluate(({ rows, empty }) => {
    localStorage.setItem('pocket:activity:snapshot:v2:' + encodeURIComponent('a@fixture.invalid'), JSON.stringify({ ...empty, payments: rows, merchants: [{ merchant_id: 'fixture-pos', display_name: 'Saved POS' }], savedAt: 1, full: true }))
    window.mount('a@fixture.invalid')
  }, { rows, empty })
  const state = () => page.locator('#state').textContent().then(JSON.parse)
  await page.waitForFunction(() => document.getElementById('state')?.textContent.includes('Saved POS'))
  assert.equal((await state()).rows.length, 6, 'cached history and POS paint before request completion')
  await page.waitForFunction(() => window.reads.length === 1)
  await page.evaluate(() => { void window.refresh(); void window.prefetch('a@fixture.invalid', true) })
  assert.equal(await page.evaluate(() => window.reads.length), 1, 'prefetch and mounted consumers share request')
  await page.evaluate(empty => window.reads[0].resolve(empty), empty)
  await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).busy === false)
  assert.equal((await state()).rows.length, 6, 'empty response cannot erase history')
  await page.evaluate(() => { void window.refresh() })
  await page.waitForFunction(() => window.reads.length === 2)
  await page.evaluate(() => window.mount('b@fixture.invalid'))
  await page.waitForFunction(() => window.reads.length === 3)
  assert.equal((await state()).rows.length, 0, 'account switch hides old rows immediately')
  await page.evaluate(({ empty, rows }) => window.reads[1].resolve({ ...empty, payments: [{ ...rows[0], memo: 'Late account data' }] }), { empty, rows })
  await page.evaluate(empty => window.reads[2].resolve(empty), empty)
  await page.waitForFunction(() => JSON.parse(document.getElementById('state').textContent).resolved)
  assert.equal((await state()).rows.length, 0)
  assert(!(await page.evaluate(() => localStorage.getItem('pocket:activity:snapshot:v2:' + encodeURIComponent('a@fixture.invalid')))).includes('Late account data'))
  // A full page reload loses all module caches and restores the device snapshot.
  await boot(); await page.evaluate(() => window.mount('a@fixture.invalid', true))
  await page.waitForFunction(() => document.getElementById('state')?.textContent.includes('Saved POS'))
  assert.equal((await state()).rows.length, 4)
  await page.evaluate(empty => window.reads[0].resolve(empty), empty)
  const assets = process.env.POCKET_TEST_ASSETS ?? '.codex-temp/preparation-build/assets'
  const css = readdirSync(assets).filter(name => name.endsWith('.css')).map(name => readFileSync(assets + '/' + name, 'utf8')).join('\n')
  await page.addStyleTag({ content: css + '\n:root {--pocket-safe-top:0px;--pocket-safe-bottom:0px}' })
  for (const width of [320, 390, 480]) {
    await page.setViewportSize({ width, height: 740 })
    await page.evaluate(() => window.mount('a@fixture.invalid', true, true))
    await page.getByText('Recent activity', { exact: true }).waitFor()
    const section = page.locator('section').filter({ hasText: 'Recent activity' })
    assert.equal(await section.getByRole('button').count(), 5, 'four recent rows plus one View all')
    const last = section.getByRole('button').last()
    await page.locator('[data-pocket-scroller]').evaluate(element => { element.scrollTop = element.scrollHeight })
    await page.waitForFunction(() => { const element = document.querySelector('[data-pocket-scroller]'); return element.scrollTop > 0 })
    const box = await last.boundingBox(), nav = await page.getByRole('navigation', { name: 'Pocket navigation' }).boundingBox()
    assert(box.y + box.height <= nav.y, 'last row must scroll clear of fixed navigation: ' + JSON.stringify({width,box,nav, layout:await page.locator('[data-pocket-scroller]').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight,top:el.scrollTop,pad:getComputedStyle(el.lastElementChild).paddingBottom}))}))
    assert(box.x >= 0 && box.x + box.width <= width)
  }
  assert.deepEqual(errors, [])
  console.log('PASS: immediate saved activity/POS, restart cache, single-flight prefetch, account-switch race, empty retention, recent max 4 and real Home scroll clearance at 320/390/480px.')
} finally { await browser.close() }
