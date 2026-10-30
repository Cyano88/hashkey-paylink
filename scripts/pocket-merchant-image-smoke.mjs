import assert from 'node:assert/strict'
import {pocketMerchantImageUrl as image} from '../src/pocket/lib/pocketMerchantImage.ts'
const hosted='https://app.hashpaylink.com/brand/lunchroom.png'
assert.equal(image(hosted,true),'https://pocket.hashpaylink.com/brand/lunchroom.png')
assert.equal(image('/brand/lunchroom.png?v=2',true),'https://pocket.hashpaylink.com/brand/lunchroom.png?v=2')
assert.equal(image(hosted,false),hosted)
assert.equal(image('/brand/logo.png',false),'/brand/logo.png')
assert.equal(image('https://merchant.example/logo.webp',true),'https://merchant.example/logo.webp')
for(const value of ['//evil.example/logo.png','http://merchant.example/a.png','javascript:alert(1)','https://user:secret@merchant.example/logo.png','https://']) assert.equal(image(value,true),undefined)
console.log('PASS native hosted-image routing, external merchant URLs, web URLs and unsafe URL rejection.')
