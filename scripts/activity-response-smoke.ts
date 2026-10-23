import assert from 'node:assert/strict'
import { readActivityResponse } from '../src/developer/activityResponse'
for (const status of [500, 502, 503, 504]) {
  await assert.rejects(readActivityResponse(new Response('<!DOCTYPE html>', { status })), /temporarily unavailable/)
}
for (const body of ['<!DOCTYPE html>', 'null', '[]', '{}', '{"ok":false}']) {
  await assert.rejects(readActivityResponse(new Response(body)), /could not be loaded/)
}
await assert.rejects(readActivityResponse(new Response('', { status: 401 })), /Sign in again/)
await assert.rejects(readActivityResponse(new Response('', { status: 403 })), /do not have access/)
const page = { ok: true, events: [], nextCursor: null, coverage: 'complete' }
assert.deepEqual(await readActivityResponse(Response.json(page)), page)
console.log('Activity HTML error handling and successful response: passed')
