import assert from 'node:assert/strict'
import {giftUnits,validateGiftDraft,giftLink,parseGiftLink,giftStateCopy} from '../src/pocket/features/gifts/pocketGift.ts'
assert.equal(giftUnits('100.000001'),100000001n)
for(const amount of ['0','-1','1e2','1.0000001','NaN','Infinity','01',' 1'])assert.throws(()=>giftUnits(amount))
assert.deepEqual(validateGiftDraft({amount:'100',network:'arbitrum',message:'Hello',claims:100}),{totalUnits:100000000n,perClaimUnits:1000000n})
assert.throws(()=>validateGiftDraft({amount:'1',network:'base',message:'',claims:3}))
assert.throws(()=>validateGiftDraft({amount:'1',network:'bogus',message:'',claims:1}))
assert.throws(()=>validateGiftDraft({amount:'1',network:'base',message:'x'.repeat(161),claims:1}))
const id='g_'+'a'.repeat(22),secret='b'.repeat(43),link=giftLink(id,secret)
assert.deepEqual(parseGiftLink(link),{id,secret})
assert.equal(new URL(link).search,'')
for(const invalid of [link.replace('https:','http:'),link.replace('pocket.hashpaylink.com','evil.test'),link.replace('#','?'),link+'&claim='+secret,link.replace('/gift/','/gift/../'),link.replace('https://','https://user@'),link.replace('#','?redirect=evil#')])assert.equal(parseGiftLink(invalid),null)
for(const state of ['funding','claiming','claimed','expired','refunding','refunded'])assert.ok(giftStateCopy(state))
console.log('PASS gift integer accounting, equal drop allocations, input limits, capability URL isolation and terminal states.')
