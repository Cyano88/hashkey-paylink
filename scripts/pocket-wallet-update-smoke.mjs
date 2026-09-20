import assert from 'node:assert/strict'
import { pocketWalletUpdateNotice as notice, retainWalletUpdateCompletion as retain, saveVerifiedPocketWalletUpdate } from '../api/pocket/wallet-update-state.ts'
import { createPocketBalancesHandler } from '../api/pocket/balances.ts'
const userId='synthetic-owner'
const address='0x1111111111111111111111111111111111111111'
const link={privyUserId:userId,chain:'base',purpose:'payment',circleWalletId:'old-base',circleWalletAddress:address,circleBlockchain:'BASE',updatedAt:1}
const record={version:2,userId,phase:'ready',sources:{base:{walletId:'old-base',address}},replacementVerifiedAt:1,executionVerifiedAt:1}
const input={userId,record,links:{base:link},rows:[{key:'base',label:'Base',status:'ok',balance:2}]}
assert.equal(notice(input),'available')
assert.equal(notice({...input,record:undefined}),'hidden')
assert.equal(notice({...input,rows:[{...input.rows[0],balance:0}]}),'hidden')
assert.equal(notice({...input,rows:[{...input.rows[0],status:'error'}]}),'hidden')
assert.equal(notice({...input,rows:[{...input.rows[0],balance:NaN}]}),'hidden')
assert.equal(notice({...input,links:{base:{...link,circleWalletId:'new-base'}}}),'hidden')
assert.equal(notice({...input,userId:'another-owner'}),'hidden')
for(const phase of ['in_progress','failed']) assert.equal(notice({...input,record:{...record,phase}}),'resume')
for(const change of [{phase:'prepared'},{phase:'completed'}, {completedAt:1}, {executionVerifiedAt:undefined}, {replacementVerifiedAt:undefined}, {executionVerifiedAt:true}, {sources:{}}]) assert.equal(notice({...input,record:{...record,...change}}),'hidden')
const done={...record,phase:'completed',completedAt:10}
assert.equal(retain(done,{...record,phase:'failed'}),done)
assert.equal(retain(done,{...record,phase:'ready'}),done)
assert.equal(notice({...input,record:done,rows:[{...input.rows[0],balance:100}]}),'hidden')
assert.throws(()=>retain(done,{...record,userId:'other'}),/owner/)
await assert.rejects(saveVerifiedPocketWalletUpdate(done,async()=>false),/verification/)
let balanceCalls=0
let currentRecord=record
const handler=createPocketBalancesHandler({verifyUser:async()=>({userId}),readLink:async key=>key.endsWith(':base')?link:null,readBalance:async()=>{balanceCalls++;return 2},readWalletUpdate:async()=>currentRecord})
function res(){return {code:200,status(code){this.code=code;return this},json(body){this.body=body;return this}}}
const first=res();await handler({method:'GET'},first)
assert.equal(first.body.walletUpdate,'available')
assert.equal(balanceCalls,1,'notice must reuse the existing balance read')
currentRecord=done
const anotherDevice=res();await handler({method:'GET'},anotherDevice)
assert.equal(anotherDevice.body.walletUpdate,'hidden')
console.log('Wallet update eligibility, zero/error balances, account isolation, completion permanence and no extra balance reads passed.')

// Saved plans resume independently of the obsolete eligibility record/balances.
const migrationPlan={version:1,userId,phase:'transferring',reviewedAt:1,rows:['base','arbitrum','arc'].map(network=>({network,source:{walletId:'old-'+network,address},target:{walletId:'new-'+network,address:'0x2222222222222222222222222222222222222222'},units:'0'})),transfers:{base:{state:'reserved'}}}
const links=Object.fromEntries(migrationPlan.rows.map(row=>[row.network,{...link,chain:row.network,circleWalletId:row.source.walletId}]))
assert.equal(notice({userId,migrationPlan,links,rows:[]}),'resume')
assert.equal(notice({userId,migrationPlan:{...migrationPlan,phase:'review'},links,rows:[]}),'resume')
for(const changed of [{userId:'other'},{phase:'confirmed'},{rows:migrationPlan.rows.slice(0,2)},{reviewedAt:0}])assert.equal(notice({userId,migrationPlan:{...migrationPlan,...changed},links,rows:[]}),'hidden')
assert.equal(notice({userId,migrationPlan,links:{...links,base:{...links.base,circleWalletId:'new-base'}},rows:[]}),'hidden')
const pendingHandler=createPocketBalancesHandler({verifyUser:async()=>({userId}),readLink:async key=>links[key.endsWith(':arc-mainnet')?'arc':key.split(':').at(-1)]??null,readBalance:async()=>{throw Error('Offline balance provider')},readMigrationPlan:async()=>migrationPlan})
const pendingResponse=res();await pendingHandler({method:'GET'},pendingResponse);assert.equal(pendingResponse.body.walletUpdate,'resume');assert.equal(pendingResponse.body.totalComplete,false)
console.log('PASS: saved migration remains visible with zero/unavailable balances and without legacy eligibility; activated and other-owner plans stay hidden.')

assert.equal(notice({userId,record:done,migrationPlan,links,rows:[]}),'hidden')
