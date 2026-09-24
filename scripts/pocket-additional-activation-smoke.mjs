import assert from 'node:assert/strict'
import {activateAdditionalMigration,buildAdditionalMigration} from '../api/pocket/wallet-additional-migration.ts'
const a='0x'+'1'.repeat(40),b='0x'+'2'.repeat(40),network='ethereum'
const source={privyUserId:'user',chain:network,circleWalletId:'source',circleWalletAddress:b,purpose:'payment'}
const anchor={id:'base',address:a,blockchain:'BASE',state:'LIVE',accountType:'SCA'}
const target={...anchor,id:'target',blockchain:'ETH'}
const plan=buildAdditionalMigration('user',network,source,target,anchor,0n)
function fixture({units=0n,pending=false,baseChanged=false,failWrite=false,intents=[]}={}){
 let state={plan:structuredClone(plan),source:{privy_user_id:'user',chain:network,purpose:'payment',circle_wallet_id:'source',circle_wallet_address:b},archive:null},writes=0
 const io={operation:async(_,fn)=>fn(),hold:async()=>{},release:async()=>{},balance:async()=>units,intents:async()=>intents,provider:()=>({noPending:async()=>!pending,inventory:async()=>({otherAssets:[{asset:'unmoved'}]})}),transaction:async fn=>{const before=structuredClone(state);try{return await fn({query:async(sql,args)=>{
 if(sql.includes('pg_advisory'))return {rows:[]}
 if(sql.startsWith('select value'))return {rows:[{value:state.plan}]}
 if(sql.startsWith('select * from privy_circle_links'))return {rows:[{chain:'base',circle_wallet_id:baseChanged?'changed':'base',circle_wallet_address:a},state.source]}
 if(sql.startsWith('insert into render_durable_kv')){writes++;state.archive=JSON.parse(args[1]);return {rowCount:1}}
 if(sql.startsWith('update privy_circle_links')){if(failWrite)throw Error('simulated write failure');state.source.circle_wallet_id=args[1];state.source.circle_wallet_address=args[2];return {rowCount:1}}
 if(sql.startsWith('update render_durable_kv')){state.plan=JSON.parse(args[1]);return {rowCount:1}}
 throw Error('Unexpected query '+sql)
 }})}catch(error){state=before;throw error}}}
 return {io,get state(){return state},get writes(){return writes}}
}
const good=fixture();assert.equal((await activateAdditionalMigration(plan,'session',good.io)).completed,true);assert.equal(good.state.source.circle_wallet_id,'target');assert.equal(good.state.archive.source.walletId,'source');assert.equal(good.state.plan.phase,'confirmed');await activateAdditionalMigration(plan,'session',good.io);assert.equal(good.writes,1)
for(const options of [{units:1n},{pending:true},{baseChanged:true},{failWrite:true},{intents:[{sourceNetwork:'ethereum'}]}]){const test=fixture(options);await assert.rejects(()=>activateAdditionalMigration(plan,'session',test.io));assert.equal(test.state.source.circle_wallet_id,'source');assert.equal(test.state.archive,null)}
const funded=buildAdditionalMigration('user',network,source,target,anchor,1n);await assert.rejects(()=>activateAdditionalMigration(funded,'session',fixture().io),/not ready/)
console.log('PASS additional activation: exact canonical anchor, fresh zero USDC, pending operations blocked, archive+link+completion atomic, rollback, idempotent replay and funded migration requires receipts.')
