import assert from 'node:assert/strict'
import {withSupportStaffAvatars} from '../api/support-staff-profile.ts'
import {developerCaseView} from '../api/developer-support.ts'
import {caseView} from '../api/operations-cases.ts'
const image='data:image/png;base64,aGVsbG8=',profiles={staffNames:{one:'Shy'},staffImages:{one:image}}
const original={id:'case',messages:[{id:'join',author:'agent',kind:'staff_joined',text:'Shy joined the conversation.',createdAt:1}]}
const hydrated=withSupportStaffAvatars(original,profiles)
assert.equal(hydrated.messages[0].avatarDataUrl,image);assert.equal(original.messages[0].avatarDataUrl,undefined)
assert.equal(withSupportStaffAvatars(original,{...profiles,staffNames:{one:'Shy',two:'Shy'}}).messages[0].avatarDataUrl,undefined)
const keyed={...original,messages:[{...original.messages[0],staffUserId:'one',avatarDataUrl:'old'}]}
assert.equal(withSupportStaffAvatars(keyed,profiles).messages[0].avatarDataUrl,image)
assert.equal(withSupportStaffAvatars(keyed,{...profiles,staffImages:{one:''}}).messages[0].avatarDataUrl,undefined)
assert.equal(withSupportStaffAvatars(keyed,undefined).messages[0].avatarDataUrl,'old')
const user={messages:[{author:'user',text:'Shy',displayName:'Shy'}]};assert.deepEqual(withSupportStaffAvatars(user,profiles),user)
for(const view of [caseView,developerCaseView])assert.equal(JSON.stringify(view({...keyed,workspaceId:'builders'})).includes('staffUserId'),false)
console.log('PASS legacy avatar recovery, duplicate-name isolation, current keyed image/removal, unavailable-store fallback, no mutations or staff-ID disclosure')
