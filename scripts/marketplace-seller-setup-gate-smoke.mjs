import assert from 'node:assert/strict'
import {createMarketplaceApplication} from '../api/marketplace/application.ts'
assert.throws(()=>createMarketplaceApplication({}),/instructions are not enabled/)
const app=createMarketplaceApplication({MARKETPLACE_INSTRUCTIONS_ENABLED:'true',MARKETPLACE_COLLECTIONS_ENABLED:'false',MARKETPLACE_BANK_PAYOUTS_ENABLED:'false'})
assert.equal(typeof app.createSellerSession,'function');assert.equal(typeof app.sellerVerification,'function')
await assert.rejects(()=>app.createSellerSession('invalid',{sellerId:'seller_one',returnUrl:'https://example.test'}),/denied/)
console.log('PASS seller application initializes with financial adapters disabled; live credential authorization remains mandatory.')
