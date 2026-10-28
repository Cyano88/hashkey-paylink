import assert from 'node:assert/strict'
import {developerReceivingWallets} from '../api/developer-receiving-wallets.ts'
const base='0x1111111111111111111111111111111111111111',embedded='0x2222222222222222222222222222222222222222'
const deps={readLink:async key=>key.endsWith(':base')?{privyUserId:'owner',chain:'base',purpose:'payment',circleWalletAddress:base}:null,readEmbedded:async owner=>{assert.equal(owner,'owner');return {address:embedded,id:'wallet'}}}
const result=await developerReceivingWallets('owner',deps)
assert.deepEqual(result,{base,bsc:embedded,xlayer:embedded})
const foreign=await developerReceivingWallets('owner',{...deps,readLink:async()=>({privyUserId:'someone-else',chain:'base',circleWalletAddress:base}),readEmbedded:async()=>null})
assert.deepEqual(foreign,{})
const unavailable=await developerReceivingWallets('owner',{readLink:async()=>{throw Error('offline')},readEmbedded:async()=>{throw Error('offline')}})
assert.deepEqual(unavailable,{})
console.log('PASS per-owner, per-network wallet suggestions; no Circle address copied to BNB and unavailable wallets omitted.')
