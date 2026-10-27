import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler} from '../api/developer-projects.ts'
const stores=new Map()
let identity={userId:'owner-a',email:'a@example.test'}
const handler=createDeveloperProjectsHandler({hasStore:()=>true,portalSecret:()=> 'profile-test-secret-that-is-at-least-32-characters',verify:async()=>identity,
  now:()=>new Date('2026-10-27T12:00:00Z'),read:async key=>stores.get(key),mutate:async(key,update)=>{const value=update(stores.get(key));stores.set(key,value);return value}})
async function request(method,body){const result={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await handler({method,body,query:{resource:'profile'}},result);return result}
assert.equal((await request('PUT',{action:'update-profile',name:'A'})).code,400)
assert.equal((await request('PUT',{action:'update-profile',name:'Alice Builder',role:'Founder',email:'spoof@example.test'})).body.profile.email,'a@example.test')
identity={userId:'owner-b',email:'b@example.test'}
assert.equal((await request('GET')).body.profile.name,undefined)
await request('PUT',{action:'update-profile',name:'Bob Builder',role:'Engineer'})
identity={userId:'owner-a',email:'a@example.test'}
assert.equal((await request('GET')).body.profile.name,'Alice Builder')
assert.equal(stores.size,1)
console.log('PASS profile validation, authenticated email, owner isolation and persistence.')
