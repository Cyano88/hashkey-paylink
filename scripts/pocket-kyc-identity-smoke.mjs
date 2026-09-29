import assert from 'node:assert/strict'
import {withPocketKycIdentity} from '../api/pocket/kyc-profile.ts'
import {containsPrivateIdentity} from '../api/og-privacy.ts'
const old={privyUserId:'fixture',nameStatus:'bank_resolved',resolvedName:'Legacy Bank Name',firstName:'Legacy',lastName:'Bank',pocketId:'123456',email:'fixture@example.invalid'}
let identity={level:'none'}
const repo={get:async()=>old,getByPocketId:async()=>old,ensure:async()=>({profile:old,unchanged:true}),updateProfile:async()=>({profile:old,unchanged:false}),deleteProfile:async()=>true,bindBankResolvedName:async()=>{throw Error('must not call')}}
const wrapped=withPocketKycIdentity(repo,async()=>identity)
assert.equal((await wrapped.get('fixture')).nameStatus,'unverified');assert.equal((await wrapped.get('fixture')).resolvedName,'')
identity={level:'basic',legalName:'ADA M LOVELACE',firstName:'ADA',lastName:'LOVELACE',reference:'private-job'}
for(const profile of [await wrapped.get('fixture'),await wrapped.getByPocketId('123456'),(await wrapped.ensure({})).profile,(await wrapped.updateProfile()).profile]){assert.equal(profile.nameStatus,'kyc_verified');assert.equal(profile.resolvedName,'ADA M LOVELACE');assert.equal(profile.firstName,'ADA');assert.equal(profile.lastName,'LOVELACE');assert.equal(JSON.stringify(profile).includes('private-job'),false)}
assert.equal(old.nameStatus,'bank_resolved');await assert.rejects(()=>wrapped.bindBankResolvedName({},'Forged'),e=>e.status===410)
for(const key of ['bvn','id_number','fullName','legal_name','email','phone_number','date_of_birth','selfie_image','kycReference','callbackProof'])assert.equal(containsPrivateIdentity({metadata:{nested:[{[key]:'fixture'}]}}),true)
assert.equal(containsPrivateIdentity({source:'pocket-support',metadata:{type:'pocket_support_case_commitment',commitment:'a'.repeat(64),privacy:'non_correlatable_content_hash_only'}}),false)
console.log('PASS KYC-only identity authority, private references, retired enrollment and recursive 0G identity guard')

identity={level:'basic',country:'UG',declaredName:'UGANDA TEST USER'}
const ug=await wrapped.get('fixture');assert.equal(ug.kycLevel,'basic');assert.equal(ug.kycCountry,'UG');assert.equal(ug.nameStatus,'unverified');assert.equal(ug.resolvedName,'');assert.equal(ug.declaredName,'UGANDA TEST USER');assert.equal(ug.firstName,'UGANDA TEST');assert.equal(ug.lastName,'USER')
assert.equal(containsPrivateIdentity({declaredName:'UGANDA TEST USER'}),true)
console.log('PASS Uganda verification badge independent from name verification; declared payer name remains private.')
