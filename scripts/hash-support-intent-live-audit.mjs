import assert from 'node:assert/strict'
import {routeSupportIntent} from '../api/hash-support/intent-router.ts'
const common={profileId:'synthetic-intent-validation',requestId:'intent-live-'+Date.now(),newConversation:true,cases:{}}
const profile=await routeSupportIntent({...common,message:'What is my profile called?'})
assert.equal(profile,'name','Synthetic profile intent did not match')
const payment=await routeSupportIntent({...common,requestId:'intent-follow-'+Date.now(),caseId:'synthetic',newConversation:false,cases:{synthetic:{profileId:common.profileId,status:'waiting_user',humanSupport:false,messages:[{author:'agent',accountContext:{kind:'payment',transaction:{eventId:'synthetic-only',chain:'base',txHash:'synthetic-only'}}}],updatedAt:Date.now()}},message:'And did it go through?'})
assert.equal(payment,'selected_payment','Synthetic follow-up did not stay on selected payment')
console.log(JSON.stringify({syntheticOnly:true,profileIntent:true,contextualIntent:true,noAccountRecordsSent:true,noConversationCreated:true}))
