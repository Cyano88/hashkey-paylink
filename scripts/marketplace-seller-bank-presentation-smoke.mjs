import assert from 'node:assert/strict'
import {sellerBankPresentation} from '../api/marketplace/seller-bank-presentation.ts'
const base={projectId:'project_a',sellerId:'seller_a',beneficiaryId:'bank_a',status:'active',verifiedAt:1,last4:'6789',encryptedDetails:'secret',ownershipEvidenceId:'private'}
let decrypted=[],calls=0
const d={read:async()=>({bankBeneficiaries:[base,{...base,projectId:'other'},{...base,sellerId:'other'},{...base,status:'revoked'}]}),decrypt:b=>{decrypted.push(b);return {bankCode:'TEST',accountName:'Verified Holder',accountNumber:'0123456789'}},institutions:async()=>{calls++;return [{code:'TEST',name:'Example bank'}]}}
const scope={projectId:'project_a',sellerId:'seller_a'}
assert.deepEqual(await sellerBankPresentation(scope,d),[{beneficiaryId:'bank_a',accountName:'Verified Holder',bankName:'Example bank',bankCode:'TEST',last4:'6789',status:'active'}])
assert.equal(decrypted.length,1)
assert.deepEqual(await sellerBankPresentation({...scope,sellerId:'missing'},d),[]);assert.equal(calls,1)
assert.equal((await sellerBankPresentation(scope,{...d,institutions:async()=>{throw Error('Unavailable')}}))[0].bankName,null)
assert.deepEqual(await sellerBankPresentation(scope,{...d,read:async()=>undefined}),[])
console.log('PASS seller-private bank presentation: scoped active records, masked numbers, verified names, missing institution fallback, empty records.')
