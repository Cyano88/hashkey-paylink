import assert from 'node:assert/strict'
import { activateMigration } from '../api/pocket/wallet-migration-activation.ts'
import { buildMigrationPlan } from '../api/pocket/wallet-migration-plan.ts'
const networks=['base','arbitrum','arc'], userId='owner', attemptId='11111111-1111-4111-8111-111111111111'
const address='0x1111111111111111111111111111111111111111', old='0x2222222222222222222222222222222222222222'
const plan=buildMigrationPlan({userId,attemptId,now:100, wallets:networks.map((n,i)=>({id:'new-'+n,address,blockchain:['BASE','ARB','ARC'][i],accountType:'SCA',state:'LIVE',refId:'pocket:evm-candidate:v2:'+attemptId})),links:Object.fromEntries(networks.map(chain=>[chain,{privyUserId:userId,chain,circleWalletId:'old-'+chain,circleWalletAddress:old}])),units:{base:0n,arbitrum:0n,arc:0n}})
const key='pocket:wallet-migration-plan:v1:'+userId
function fixture(failAt=0) {
 let db={kv:{[key]:structuredClone(plan)},links:networks.map(chain=>({link_key:userId+':'+(chain==='arc'?'arc-mainnet':chain),privy_user_id:userId,chain,purpose:'payment',circle_wallet_id:'old-'+chain,circle_wallet_address:old}))}, updates=0
 const io={now:()=>200,verify:async()=>({revision:plan.revision,checkedAt:200,oldBalancesEmpty:true,assetsAccountedFor:true,noPendingOperations:true,legacyAccessReady:true}),transaction:async fn=>{
  const draft=structuredClone(db)
  const client={query:async(sql,args)=>{
   if(sql.startsWith('select value'))return {rows:[{value:draft.kv[args[0]]}]}
   if(sql.startsWith('select pg_advisory'))return {rows:[]}
   if(sql.startsWith('select *'))return {rows:draft.links}
   if(sql.startsWith('insert into render_durable')){draft.kv[args[0]]=JSON.parse(args[1]);return {rowCount:1}}
   if(sql.startsWith('update privy')){updates++;if(updates===failAt)throw Error('simulated database failure');const l=draft.links.find(l=>l.link_key===args[0]&&l.circle_wallet_id===args[4]);if(!l)return {rowCount:0};l.circle_wallet_id=args[1];l.circle_wallet_address=args[2];return {rowCount:1}}
   if(sql.startsWith('update render_durable')){draft.kv[args[0]]=JSON.parse(args[1]);return {rowCount:1}}
   throw Error('Unexpected SQL')
  }}
  const result=await fn(client);db=draft;return result
 }}
 return {io,get db(){return db}}
}
const ok=fixture()
assert.equal((await activateMigration(plan,ok.io)).completed,true)
assert.ok(ok.db.links.every(l=>l.circle_wallet_id==='new-'+l.chain))
assert.equal(ok.db.kv['pocket:wallet-update:v2:owner'].phase,'completed')
assert.ok(ok.db.kv['pocket:wallet-migration-legacy:v1:owner'].links.every(l=>l.circle_wallet_id==='old-'+l.chain))
assert.equal((await activateMigration(ok.db.kv[key],ok.io)).replayed,true)
for(const failAt of [1,2,3]){
 const failed=fixture(failAt)
 await assert.rejects(activateMigration(plan,failed.io),/simulated/)
 assert.ok(failed.db.links.every(l=>l.circle_wallet_id==='old-'+l.chain))
 assert.equal(failed.db.kv['pocket:wallet-update:v2:owner'],undefined)
 assert.equal(failed.db.kv['pocket:wallet-migration-legacy:v1:owner'],undefined)
}
for(const flag of ['oldBalancesEmpty','assetsAccountedFor','noPendingOperations','legacyAccessReady']){
 const failed=fixture();const verify=failed.io.verify;failed.io.verify=async()=>({...await verify(),[flag]:false})
 await assert.rejects(activateMigration(plan,failed.io),/incomplete/)
 assert.ok(failed.db.links.every(l=>l.circle_wallet_id==='old-'+l.chain))
}
const changed=fixture();changed.db.links[1].circle_wallet_id='different'
await assert.rejects(activateMigration(plan,changed.io),/changed/)
const unconfirmed=structuredClone(plan);unconfirmed.rows[0].units='1'
await assert.rejects(activateMigration(unconfirmed,fixture().io),/not confirmed/)
console.log('PASS: three-link activation, legacy archive, completion record, replay, stale links, incomplete verification and rollback at each link update. In-memory transaction simulation; no production writes.')
