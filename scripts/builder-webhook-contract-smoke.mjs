import assert from 'node:assert/strict'
import {buildDeveloperWebhookRequest} from '../api/developer-projects.ts'
import {verifyWebhook} from '../examples/hosted-checkout/hashpaylink.mjs'
const secret='fixture-only-webhook-secret',now=Date.parse('2026-10-30T10:00:00Z')
const signed=buildDeveloperWebhookRequest(secret,'payment.confirmed',{checkoutSessionId:'chks_'+'a'.repeat(24),checkoutId:'chkx_'+'b'.repeat(24)},{attemptedAt:new Date(now).toISOString(),createdAt:'2026-10-29T09:00:00Z',eventId:'stock-paid:fixture'})
const event=verifyWebhook(Buffer.from(signed.payload),`t=${signed.timestamp},v1=${signed.signature}`,secret,now)
assert.equal(event.id,'stock-paid:fixture');assert.equal(event.data.checkoutSessionId,'chks_'+'a'.repeat(24));assert.equal(event.createdAt,'2026-10-29T09:00:00Z')
assert.throws(()=>verifyWebhook(Buffer.from(signed.payload+' '),`t=${signed.timestamp},v1=${signed.signature}`,secret,now))
assert.throws(()=>verifyWebhook(Buffer.from(signed.payload),`t=${signed.timestamp},v1=${signed.signature}`,secret,now+301000))
console.log('PASS production webhook signer interoperates with copyable verifier; old event with fresh retry signature accepted, tampering/stale delivery rejected.')
