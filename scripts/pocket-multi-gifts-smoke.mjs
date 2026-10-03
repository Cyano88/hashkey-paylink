import assert from 'node:assert/strict'
import {multiGiftReview,multiGiftPlan,multiGiftClaimTypedData,prepareMultiGiftFunding} from '../src/pocket/features/gifts/pocketMultiGift.ts'
import {multiGiftAccountId,authorizeMultiGiftClaim} from '../api/pocket/gifts/multi-authorization.ts'
const token='0x'+'1'.repeat(40),escrow='0x'+'2'.repeat(40),recipient='0x'+'3'.repeat(40),id='0x'+'4'.repeat(64),asset={chainId:8453,token,decimals:6,symbol:'USDC',rail:'stablecoins'}
const plan=multiGiftPlan('10',10,asset);assert.equal(plan.total,'100');assert.equal(plan.fee,250000n);assert.equal(plan.totalDebit,100250000n)
assert.equal(multiGiftPlan('0.1',10,{...asset,decimals:18,chainId:196,symbol:'STOCK',rail:'xstocks'}).principal,10n**18n)
for(const count of [0,-1,1.5,1001,NaN])assert.throws(()=>multiGiftPlan('10',count,asset))
for(const amount of ['1e2','-1','0','0.0000001'])assert.throws(()=>multiGiftPlan(amount,10,asset))
const key='a'.repeat(64),a=multiGiftAccountId(key,id,'owner');assert.equal(a,multiGiftAccountId(key,id,'owner'));assert.notEqual(a,multiGiftAccountId(key,id,'other'));assert.notEqual(a,multiGiftAccountId(key,'0x'+'5'.repeat(64),'owner'))
let calls=0;const deps={identityKey:key,now:()=>100n,wallet:async()=>recipient,eligible:async()=>true,sign:async(data)=>{calls++;assert.equal(data.message.recipient,recipient);return '0x'+'6'.repeat(130)}}
const input={ownerId:'owner',giftId:id,chainId:8453,escrow,expiresAt:1000n};const auth=await authorizeMultiGiftClaim(input,deps);assert.equal(auth.deadline,400n);assert.equal(auth.accountId,a)
await assert.rejects(()=>authorizeMultiGiftClaim(input,{...deps,eligible:async()=>false}));await assert.rejects(()=>authorizeMultiGiftClaim({...input,expiresAt:100n},deps));assert.equal(calls,1)
assert.throws(()=>multiGiftClaimTypedData({...input,accountId:a,recipient:escrow,deadline:400n}))
assert.equal(prepareMultiGiftFunding({sender:recipient,escrow,asset,signer:recipient,salt:id,amountPerRecipient:'10',recipients:10,expiresAt:1000n,now:100n}).principal,100000000n)
console.log('PASS multi-gift exact totals, stock precision, input bounds, gift-scoped account identity, wallet-bound authorization and expiry checks.')

const review=multiGiftReview('0.1',10,{...asset,decimals:18,chainId:196,symbol:'STOCK',rail:'xstocks'});assert.equal(review.plan.fee,2500000000000000n);assert.equal(review.plan.totalDebit,1002500000000000000n);assert.equal(review.feeToken,asset.token);assert.deepEqual(review.rows[1],['Each recipient','0.1 STOCK']);assert.deepEqual(review.rows[3],['Creation fee (0.25%)','0.0025 STOCK']);assert.deepEqual(review.rows[4],['Total stock debit','1.0025 STOCK']);assert.equal(multiGiftReview('0.000001',1,asset).plan.fee,0n)
console.log('PASS approved stock fee: 1 stock principal, 0.0025 stock fee, 1.0025 stock debit, ten full 0.1-stock shares; base-unit rounding retained.')
