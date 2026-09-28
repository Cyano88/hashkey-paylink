import assert from 'node:assert/strict'
import {xpayOrigin,xpayHome,xpayReturnPath} from '../src/pocket/lib/pocketXPayNavigation.ts'
import {POCKET_BASE_PATH,POCKET_ROUTES} from '../src/pocket/lib/pocketRoutes.ts'
assert.equal(xpayOrigin(null),'stablecoins');assert.equal(xpayOrigin({xpayOrigin:'xstocks'}),'xstocks')
assert.equal(xpayHome({xpayOrigin:'stablecoins'}),POCKET_BASE_PATH+POCKET_ROUTES.home)
assert.equal(xpayReturnPath({xpayReturnTo:POCKET_BASE_PATH+POCKET_ROUTES.xpay},'/fallback'),POCKET_BASE_PATH+POCKET_ROUTES.xpay)
for(const path of ['https://evil.invalid','//evil.invalid','/admin',null,7])assert.equal(xpayReturnPath({xpayReturnTo:path},'/fallback'),'/fallback')
assert.equal(xpayReturnPath({xpayReturnTo:POCKET_BASE_PATH+POCKET_ROUTES.bankActivity},'/fallback'),POCKET_BASE_PATH+POCKET_ROUTES.bankActivity)
console.log('PASS origin fallback, retained bank-activity return and restricted internal navigation targets.')
