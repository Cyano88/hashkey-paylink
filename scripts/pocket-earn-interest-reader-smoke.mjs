import assert from 'node:assert/strict'
import {refreshEarnLedger} from '../api/pocket/earn-interest-store.ts'
const R=10n**27n,owner='0x1111111111111111111111111111111111111111',token='0xB6CEceAB302E2E4948951eE7843FC24E92933061',pool='0xE3F3Caefdd7180F884c01E57f65Df979Af84f116'
let missing=false,wrongRevision=false,saved
const client={getChainId:async()=>196,getBlock:async({blockNumber=100n}={})=>({number:blockNumber,hash:'h'+blockNumber,timestamp:BigInt(Math.floor(Date.now()/1000))}),getCode:async()=> '0x01',readContract:async({functionName,blockNumber})=>({ATOKEN_REVISION:wrongRevision?6n:5n,UNDERLYING_ASSET_ADDRESS:token,POOL:pool,decimals:6,getPreviousIndex:blockNumber<20n?R:R+R/100n,scaledBalanceOf:1000000n,balanceOf:1020000n})[functionName],getLogs:async({event,fromBlock})=>event.name==='Mint'&&!missing?[{removed:false,blockHash:'h'+fromBlock,transactionHash:'tx',logIndex:0,args:{index:R+R/100n,balanceIncrease:10000n}}]:[]}
const initial={version:1,checkpoint:{block:'10',hash:'h10',index:String(R),interest:'100'}}
const result=await refreshEarnLedger(owner,'USDC',initial,async s=>{saved=s},client)
assert.equal(result.earnedUnits,'20100');assert.equal(saved.checkpoint.interest,'10100');assert.equal(saved.checkpoint.block,'88')
missing=true;saved=undefined;await assert.rejects(()=>refreshEarnLedger(owner,'USDC',initial,async s=>{saved=s},client),/Incomplete Earn interest events/);assert.equal(saved,undefined)
missing=false;wrongRevision=true;await assert.rejects(()=>refreshEarnLedger(owner,'USDC',initial,async()=>{},client),/Unsupported Earn accounting/)
console.log('PASS live-reader accounting: historical plus current interest, fixed-block reads, missing-log rejection and contract-upgrade guard')
