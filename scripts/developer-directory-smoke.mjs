import assert from 'node:assert/strict'
import {createDeveloperProjectsHandler} from '../api/developer-projects.ts'
let store,identity={userId:'builder',email:'builder@example.test'}
const id='dev_directory12345678'
const handler=createDeveloperProjectsHandler({hasStore:()=>true,read:async()=>store,mutate:async(_k,fn)=>store=fn(store),verify:async()=>identity,requireVerification:()=>true,portalSecret:()=> 'directory-test-secret-more-than-32-characters',now:()=>new Date('2026-10-27T12:00:00Z'),createProjectId:()=>id})
async function call(method,body={},query={}){const res={statusCode:200,setHeader(){},status(v){this.statusCode=v;return this},json(v){this.body=v;return this}};await handler({method,body,query,headers:{}},res);return res}
assert.equal((await call('POST',{action:'create',name:'Example business',checkoutMode:'human',capabilities:['hosted_checkout']})).statusCode,201)
const profile={action:'directory-profile',projectId:id,enabled:true,introduction:'A software platform for independent sellers.'}
assert.equal((await call('POST',{...profile,introduction:'short'})).statusCode,400)
assert.equal((await call('POST',{...profile,introduction:'a'.repeat(241)})).statusCode,400)
assert.equal((await call('POST',profile)).statusCode,200)
assert.deepEqual((await call('GET',{}, {resource:'businesses'})).body.businesses,[])
store.projects[id].businessVerification.status='approved'
store.projects[id].ownerEmail='PRIVATE-EMAIL';store.projects[id].useCase='PRIVATE-BUSINESS-DESCRIPTION'
let directory=(await call('GET',{}, {resource:'businesses'})).body.businesses
assert.equal(directory.length,1)
assert.deepEqual(Object.keys(directory[0]).sort(),['id','introduction','logo','name','website'])
assert.equal(JSON.stringify(directory).includes('PRIVATE'),false)
identity={userId:'stranger',email:'stranger@example.test'}
assert.equal((await call('POST',profile)).statusCode,404)
assert.equal((await call('GET',{}, {resource:'businesses'})).body.businesses.length,1)
store.projects[id].operationalStatus='suspended'
assert.equal((await call('GET',{}, {resource:'businesses'})).body.businesses.length,0)
store.projects[id].operationalStatus='active';store.projects[id].directoryProfile.enabled=false
assert.equal((await call('GET',{}, {resource:'businesses'})).body.businesses.length,0)
console.log('PASS directory approval, opt-in, suspension, owner isolation, input validation and public projection.')

