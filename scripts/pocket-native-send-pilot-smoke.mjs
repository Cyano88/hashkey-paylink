import assert from 'node:assert/strict'
import {nativeSendPilotAllowed} from '../api/pocket/native-send-pilot.ts'
import {createNativeSendHandler} from '../api/pocket/native-send.ts'
const now=Date.now(),owner='pilot-owner',walletId='11111111-2222-4333-8444-555555555555',address='0x'+'1'.repeat(40)
const link={privyUserId:owner,chain:'base',purpose:'payment',circleBlockchain:'BASE',circleWalletId:walletId,circleWalletAddress:address}
const pilot={walletId,walletAddress:address,expiresAt:now+3600000}
for(const raw of ['', 'invalid','null',JSON.stringify({...pilot,expiresAt:now}),JSON.stringify({...pilot,expiresAt:now+25*3600000})]){process.env.POCKET_NATIVE_SEND_PILOT=raw;assert.equal(nativeSendPilotAllowed(owner,link,'base',now),false)}
process.env.POCKET_NATIVE_SEND_PILOT=JSON.stringify(pilot)
assert.equal(nativeSendPilotAllowed(owner,link,'base',now),true)
for(const changed of [null,{...link,privyUserId:'other'},{...link,circleWalletId:'other'},{...link,circleWalletAddress:'0x'+'2'.repeat(40)},{...link,purpose:'agent'},{...link,circleBlockchain:'BASE-SEPOLIA'}])assert.equal(nativeSendPilotAllowed(owner,changed,'base',now),false)
assert.equal(nativeSendPilotAllowed(owner,link,'ethereum',now),false)
let current=link,clock=now,rpc=0
const handler=createNativeSendHandler({identity:async()=>({userId:owner}),readLink:async()=>current,list:async()=>[],enabled:()=>false,now:()=>clock,rpc:async()=>{rpc++;throw Error('Read reached')},challenge:async()=>assert.fail('No provider writes')})
async function call(method,body){let status=200,result;await handler({method,body,headers:{},query:{}},{setHeader(){},status(s){status=s;return this},json(b){result=b;return this}});return{status,result}}
assert.equal((await call('GET')).result.enabled,true)
current={...link,circleWalletId:'different'};assert.equal((await call('GET')).result.enabled,false)
assert.equal((await call('POST',{action:'quote',network:'base',recipient:'0x'+'2'.repeat(40),amount:'0.00001'})).status,409);assert.equal(rpc,0)
current=link;clock=pilot.expiresAt;assert.equal((await call('GET')).result.enabled,false)
assert.equal((await call('POST',{action:'quote',network:'base'})).status,409);assert.equal(rpc,0)
clock=now;assert.equal((await call('POST',{action:'quote',network:'base',recipient:'0x'+'2'.repeat(40),amount:'0.00001'})).status,503);assert.equal(rpc,1);
console.log('PASS native pilot: exact owned Base wallet, default-off, malformed/expired/overlong access rejected, no provider work for excluded wallet, public flag stays off')

