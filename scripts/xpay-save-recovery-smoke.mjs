import assert from 'node:assert/strict'
import {saveXPayCoinWithRecovery} from '../src/pocket/lib/pocketXPayRead.ts'
const before={id:'xp_fixture',version:1,destinations:[]},saved={...before,version:2,destinations:[{id:'circle',kind:'stablecoins'}],acceptance:{routes:[{destinationId:'circle',asset:'USDC',network:'base'}]}}
let writes=0,reads=0;const input={checkout:before,asset:'USDC',networks:['base'],send:async()=>{writes++;throw Object.assign(Error('The operation was aborted.'),{name:'AbortError'})},read:async()=>{reads++;return {checkouts:[saved]}}}
assert.equal((await saveXPayCoinWithRecovery(input)).checkout,saved);assert.equal(writes,1);assert.equal(reads,1)
for(const checkout of [{...saved,version:1},{...saved,id:'another'}, {...saved,acceptance:{routes:[{destinationId:'circle',asset:'USDT',network:'base'}]}},{...saved,acceptance:{routes:[{destinationId:'circle',asset:'USDC',network:'ethereum'}]}}])await assert.rejects(saveXPayCoinWithRecovery({...input,read:async()=>({checkouts:[checkout]})}),/could not confirm/)
let checked=false;await assert.rejects(saveXPayCoinWithRecovery({...input,send:async()=>{throw Error('Confirm with your PIN.')},read:async()=>{checked=true;return {checkouts:[saved]}}}),/PIN/);assert.equal(checked,false)
await assert.rejects(saveXPayCoinWithRecovery({...input,read:async()=>{throw Error('Offline')}}),/could not confirm/)
console.log('PASS lost save response reconciles only a newer matching server configuration; no write retries, mismatched routes and authorization failures stay rejected.')
