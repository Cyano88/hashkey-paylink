import assert from 'node:assert/strict'
import {authorizeOperations,operationsPolicy,setOperationsRequestPolicy} from '../api/operations-policy.ts'
import {mergeOperationsTeam,teamKey,loadOperationsTeam} from '../api/operations-team-store.ts'
import {createOperationsTeamHandler} from '../api/operations-team.ts'
import {resolveAppSurface} from '../src/lib/appSurface.ts'
await assert.rejects(loadOperationsTeam({}, {hasStore:()=>false,read:async()=>{throw Error('must not read')}}),{status:503})
const project='dev_aaaaaaaa1111',owner={userId:'owner',email:'owner@example.test'},staff={userId:'staff',email:'staff@example.test'}
const base={OPERATIONS_FOUNDER_EMAILS:owner.email,OPERATIONS_WORKSPACES_JSON:JSON.stringify([{id:'merchant',name:'Merchant',projectIds:[project]}])}
const envFor=(roles,workspaceId='merchant')=>({...base,OPERATIONS_GRANTS_JSON:JSON.stringify([{email:staff.email,workspaceId,roles}])})
const req=(workspace,method='GET',action)=>({query:{workspace},method,body:{action}})
assert.equal(resolveAppSurface('admin.hashpaylink.com',false),'admin')
assert.equal(resolveAppSurface('admin.hashpaylink.com',true),'pocket')
authorizeOperations(staff,req('merchant','POST','admin-list'),'projects',project,envFor(['engineering']))
assert.throws(()=>authorizeOperations(staff,req('merchant','POST','admin-activate'),'projects',project,envFor(['engineering'])),{status:403})
authorizeOperations(staff,req('merchant','POST','admin-activate'),'projects',project,envFor(['compliance']))
assert.throws(()=>authorizeOperations(staff,req('merchant','POST','admin-arc-pilot-approve'),'projects',project,envFor(['compliance'])),{status:403})
authorizeOperations(staff,req('pocket'),'transactions',undefined,envFor(['support'],'pocket'))
assert.throws(()=>authorizeOperations(staff,req('pocket','POST','reconcile'),'transactions',undefined,envFor(['support'],'pocket')),{status:403})
authorizeOperations(staff,req('pocket','POST','reconcile'),'transactions',undefined,envFor(['engineering'],'pocket'))
authorizeOperations(staff,req('pocket','POST','staff-reply'),'support',undefined,envFor(['support'],'pocket'))
assert.throws(()=>authorizeOperations(staff,req('pocket','POST','staff-knowledge-approve'),'support',undefined,envFor(['support'],'pocket')),{status:403})
assert.throws(()=>operationsPolicy(envFor(['owner'])),{status:503})
const revoked=mergeOperationsTeam(envFor(['engineering']),{overrides:{[teamKey(staff.email,'merchant')]:{email:staff.email,workspaceId:'merchant',roles:[]}},history:[]})
assert.throws(()=>authorizeOperations(staff,req('merchant'),'projects',project,revoked),{status:403})
const request=req('merchant');setOperationsRequestPolicy(request,revoked)
assert.throws(()=>authorizeOperations(staff,request,'projects',project),{status:403})
let identity=staff,writes=0
const handler=createOperationsTeamHandler({verify:async()=>identity,env:()=>envFor(['engineering']),read:async()=>undefined,save:async()=>{writes++;return {overrides:{},history:[]}}})
async function call(method,body){const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};await handler({method,body},res);return res}
assert.equal((await call('PUT',{email:'new@example.test',workspaceId:'merchant',roles:['compliance']})).statusCode,403)
assert.equal(writes,0)
identity=owner
assert.equal((await call('PUT',{email:'new@example.test',workspaceId:'merchant',roles:['owner']})).statusCode,400)
assert.equal((await call('PUT',{email:owner.email,workspaceId:'merchant',roles:[]})).statusCode,409)
assert.equal((await call('PUT',{email:'new@example.test',workspaceId:'merchant',roles:['compliance']})).statusCode,200)
assert.equal(writes,1)
console.log('PASS role boundaries, read/write separation, owner-only assignment, owner protection, immediate revocation and admin/native routing.')
