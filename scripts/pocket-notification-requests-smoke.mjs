import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readPocketRequestInbox, readPocketRequests, markPocketRequestsRead } from '../src/pocket/api/pocketRequestsClient.ts'
globalThis.window = new EventTarget()
const realNow = Date.now
let now = 100_000, calls = 0, mode = 'ok', release
Date.now = () => now
globalThis.fetch = async (_url, options) => {
  calls++
  assert.equal(options.cache, 'no-store')
  if (mode === 'wait') await new Promise(resolve => { release = resolve })
  if (mode === 'rate') return new Response(JSON.stringify({ok:false,error:'Too many requests. Try again shortly.'}), {status:429,headers:{'Retry-After':'60'}})
  return new Response(JSON.stringify({ok:true,requests:[{id:options.headers.authorization}],unreadCount:0}), {status:200})
}
try {
  mode = 'wait'
  const first = readPocketRequestInbox('owner-a'), second = readPocketRequests('owner-a')
  assert.equal(calls,1,'concurrent badge and page share a single GET')
  release(); await Promise.all([first,second]); mode='ok'
  await readPocketRequestInbox('owner-a'); assert.equal(calls,1,'focus/event bursts reuse the recent read')
  const other=await readPocketRequestInbox('owner-b'); assert.equal(other.requests[0].id,'Bearer owner-b')
  now += 4000; mode='rate'
  await assert.rejects(readPocketRequests('owner-a'),/Too many/)
  const before=calls
  for(let i=0;i<10;i++) await assert.rejects(readPocketRequests('owner-a'),/Too many/)
  assert.equal(calls,before,'retry and polling cannot bypass Retry-After')
  now += 60_000; mode='ok'; await readPocketRequests('owner-a'); assert.equal(calls,before+1)
  await markPocketRequestsRead('owner-a'); await readPocketRequests('owner-a')
  assert.equal(calls,before+3,'successful mutations invalidate the read cache')
  const server=readFileSync(new URL('../server.ts',import.meta.url),'utf8')
  assert.match(server,/app\.get\('\/api\/pocket\/requests',\s+readLimiter, pocketRequestsHandler\)/)
  assert.match(server,/app\.all\('\/api\/pocket\/requests',\s+strictLimiter, pocketRequestsHandler\)/)
  console.log('Pocket notification request deduplication, account isolation, cooldown and route protection passed.')
} finally { Date.now=realNow }
