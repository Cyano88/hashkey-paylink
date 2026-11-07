import assert from 'node:assert/strict'
import {checkoutSelectionChildPolicy} from '../api/checkout-selection-policy.ts'
const recipient='0x'+'1'.repeat(40)
const policy={partnerId:'fixture',settlementMode:'usdc',defaultNetwork:'base',paymentOptions:['base','arc','arbitrum','solana','ethereum','polygon'].map(network=>({network,recipient}))}
const record={merchantName:'Fixture',choice:{network:'base',asset:'USDT'},options:policy.paymentOptions.filter(o=>o.network!=='arc').map(o=>({...o,asset:'USDT'}))}
assert.deepEqual(checkoutSelectionChildPolicy(policy,record).paymentOptions.map(o=>o.network),['base','arbitrum','solana','ethereum','polygon'])
assert.equal(checkoutSelectionChildPolicy(policy,record).defaultNetwork,'base')
assert.equal(checkoutSelectionChildPolicy({...policy,paymentOptions:policy.paymentOptions.map(o=>o.network==='arbitrum'?{...o,recipient:'0x'+'2'.repeat(40)}:o)},record).paymentOptions.some(o=>o.network==='arbitrum'),false,'changed recipient is not silently accepted')
assert.equal(checkoutSelectionChildPolicy({...policy,acceptedAssets:{base:['USDT'],arbitrum:['USDC']}},record).paymentOptions.some(o=>o.network==='arbitrum'),false,'merchant asset removal is respected')
assert.deepEqual(checkoutSelectionChildPolicy({...policy,settlementMode:'ngn'},record).paymentOptions.map(o=>o.network),['base'],'local settlement remains on its provider-bound route')
assert.deepEqual(checkoutSelectionChildPolicy(policy,{...record,choice:{network:'bsc',asset:'USDT'}}).paymentOptions,[],'BNB keeps its separate executable rail')
assert.equal(checkoutSelectionChildPolicy(policy,{...record,options:record.options.filter(o=>o.network!=='polygon')}).paymentOptions.some(o=>o.network==='polygon'),false,'options absent from the signed checkout are not added')
console.log('PASS one child preserves same-asset Circle network choices, original recipient snapshot, current merchant acceptance, and separate BNB/X Layer/local-settlement boundaries.')
