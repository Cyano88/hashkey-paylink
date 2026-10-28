import assert from 'node:assert/strict'
import {transitionPause,initialPauseState,assertSolanaSponsorshipRunning} from '../api/emergency-pause.ts'
import {emergencyPermissions,createEmergencyPauseHandler} from '../api/operations-emergency-pause.ts'
const owner={userId:'owner-id',email:'owner@example.com'},other={userId:'other-id',email:'other@example.com'}
const env={OPERATIONS_FOUNDER_EMAILS:owner.email,OPERATIONS_PAUSE_RESPONDER_EMAILS:'responder@example.com',OPERATIONS_RESUME_APPROVER_EMAILS:other.email}
assert.deepEqual(emergencyPermissions(owner,env),{pause:true,resume:true})
assert.deepEqual(emergencyPermissions({userId:'engineer',email:'engineer@example.com'},env),{pause:false,resume:false})
assert.deepEqual(emergencyPermissions({userId:'r',email:'responder@example.com'},env),{pause:true,resume:false})
assert.deepEqual(emergencyPermissions(other,env),{pause:false,resume:true})
let state=transitionPause(undefined,{action:'pause',revision:0,reason:'Incident under investigation'},owner)
await assert.rejects(assertSolanaSponsorshipRunning(async()=>state),e=>e.status===503&&e.code==='PAYMENTS_PAUSED')
await assert.rejects(assertSolanaSponsorshipRunning(async()=>{throw Error('database offline')}),e=>e.status===503)
assert.throws(()=>transitionPause(state,{action:'request-resume',revision:0,reason:'Investigation complete'},owner),/Controls changed/)
state=transitionPause(state,{action:'request-resume',revision:1,reason:'Investigation complete'},owner)
assert.throws(()=>transitionPause(state,{action:'approve-resume',revision:2,reason:'Reviewed evidence',proposalId:state.resume.id},owner),/different authorized/)
assert.throws(()=>transitionPause(state,{action:'approve-resume',revision:2,reason:'Reviewed evidence',proposalId:'stale'},other),/no longer current/)
state=transitionPause(state,{action:'approve-resume',revision:2,reason:'Reviewed evidence',proposalId:state.resume.id},other)
assert.equal(state.paused,false);assert.equal(state.history.length,3)
await assertSolanaSponsorshipRunning(async()=>state)
state=transitionPause(state,{action:'pause',revision:3,reason:'New incident discovered'},owner)
state=transitionPause(state,{action:'request-resume',revision:4,reason:'Investigation complete'},owner)
state=transitionPause(state,{action:'pause',revision:5,reason:'Further review required'},owner)
assert.equal(state.resume,undefined);assert.equal(state.paused,true)
let saves=0
const call=async(identity,method,body)=>{const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await createEmergencyPauseHandler({verify:async()=>identity,env:()=>env,read:async()=>initialPauseState(),save:async(input,actor)=>{saves++;return transitionPause(undefined,input,actor)}})({method,body},res);return res}
assert.equal((await call({userId:'s',email:'support@example.com'},'POST',{action:'pause'})).statusCode,403)
assert.equal((await call({userId:'r',email:'responder@example.com'},'POST',{action:'approve-resume'})).statusCode,403)
assert.equal(saves,0)
assert.equal((await call(owner,'POST',{action:'pause',revision:0,reason:'Security investigation'})).statusCode,200)
assert.equal(saves,1)
console.log('PASS emergency controls: explicit permissions, fail-closed reads, revision conflicts, distinct-person resume, cancel resume and audit history')

const {operationsSession}=await import('../api/operations-access.ts')
const session=operationsSession(other,[{id:'dev_test12345678',name:'Private customer project'}],env)
assert.equal(session.founder,false)
assert.deepEqual(session.workspaces,[])
assert.throws(()=>operationsSession({userId:'outsider',email:'outsider@example.com'},[],env),/no operations access/)
console.log('PASS resume-only approver can open controls without any workspace or customer access')
