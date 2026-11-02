import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createPocketNativeLinkRouter,nativePocketDestination} from '../src/pocket/lib/pocketNativeLinks.ts'
import {checkoutHandoff} from '../src/lib/checkoutHandoff.ts'
import {pocketAppLinkPaths,pocketAndroidLinkExtensions} from '../api/pocket/app-link-policy.ts'
const first=checkoutHandoff('chk_12345678','first').url
const second=checkoutHandoff('chks_0123456789abcdef01234567','second').url
let time=0,calls=[]
const router=createPocketNativeLinkRouter((...args)=>calls.push(args),()=>time)
router.event(second)
router.launch(first)
assert.equal(calls.length,1)
assert.equal(calls[0][0],nativePocketDestination(second))
assert.deepEqual(calls[0][1],{replace:false})
router.event(second)
assert.equal(calls.length,1)
time=1501
router.event(second)
assert.equal(calls.length,2)
router.dispose()
router.event(first)
router.launch(first)
assert.equal(calls.length,2)
calls=[]
const cold=createPocketNativeLinkRouter((...args)=>calls.push(args),()=>time)
cold.event('https://evil.test/home')
cold.launch(first)
cold.event(first)
assert.equal(calls.length,1)
assert.deepEqual(calls[0][1],{replace:true})
assert.equal(nativePocketDestination('https://pocket.hashpaylink.com/home'),'/home')
for(const url of ['http://pocket.hashpaylink.com/home','https://evil.test/home','https://user:pass@pocket.hashpaylink.com/home','https://pocket.hashpaylink.com:123/home'])assert.equal(nativePocketDestination(url),'')
assert.equal(pocketAppLinkPaths('app.hashpaylink.com'),'/open/checkout/*')
assert.equal(pocketAppLinkPaths('pocket.hashpaylink.com'),'/*')
const rules=pocketAndroidLinkExtensions('app.hashpaylink.com')['delegate_permission/common.handle_all_urls'].dynamic_app_link_components
assert.deepEqual(rules,[{'/':'/open/checkout/*'},{'/':'*',exclude:true}])
const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8')
assert.match(manifest,/android:pathPrefix="\/open\/checkout\/"/)
assert.doesNotMatch(manifest,/android:pathPrefix="\/(?:pay|pos)/)
for(const id of ['chk_12345678','chkx_0123456789abcdef01234567','chkb_0123456789abcdef01234567','chks_0123456789abcdef01234567']) {
 const h=checkoutHandoff(id,'attempt_1')
 assert.equal(new URL(h.url).pathname,'/open/checkout/'+id)
 assert.equal(new URL(h.fallback,'https://app.hashpaylink.com').pathname,'/pay/c/'+id)
 assert.equal(nativePocketDestination(h.url),nativePocketDestination('https://app.hashpaylink.com/pay/c/'+id+'?attempt=attempt_1'))
}
console.log('PASS cold and warm intents, stale launch ordering, duplicate delivery, disposal, URL validation, browser-first associations, and all checkout handoffs.')
