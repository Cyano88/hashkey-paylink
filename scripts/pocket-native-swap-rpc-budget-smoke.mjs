import assert from 'node:assert/strict'
import {fixture,owner,wallet} from './fixtures/native-evm-swap.mjs'
import {createNativeEvmSwapHandler} from '../api/pocket/native-evm-swap.ts'
import {quoteNativeEvmSwap} from '../api/pocket/native-evm-swap-quote.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='rpc-budget-test-'.repeat(4)
for(const network of ['ethereum','base','arbitrum','polygon'])for(const reverse of [false,true]){
 const f=await fixture(network,reverse),ids={ethereum:1,base:8453,arbitrum:42161,polygon:137},blockchains={ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC'}
 let balance=10n**20n,reads=[],challenges=0,chainId=ids[network]
 const handler=createNativeEvmSwapHandler({identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:network,purpose:'payment',circleBlockchain:blockchains[network],circleWalletId:'wallet',circleWalletAddress:wallet}),enabled:()=>true,now:()=>f.now,approval:async()=>true,find:async()=>null,estimate:async()=> '0.00001',quote:(binding,estimate,_read,now,affordable)=>quoteNativeEvmSwap(binding,estimate,f.provider,now,affordable),challenge:async()=>{challenges++;throw Error('Unexpected submission')},rpc:async(_network,method)=>{reads.push(method);return '0x'+(method==='eth_chainId'?BigInt(chainId):balance).toString(16)}})
 async function call(body){let status=200,data;await handler({method:'POST',body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){data=b;return this}});return {status,data}}
 const body={action:'quote',network,from:f.binding.from,to:f.binding.to,amount:f.binding.amount}
 const first=await call(body);assert.equal(first.status,200,JSON.stringify(first.data));assert.deepEqual(reads,['eth_chainId',reverse?'eth_call':'eth_getBalance'])
 reads=[];balance=0n
 const execute=await call({action:'execute',quoteToken:first.data.quoteToken});assert.equal(execute.status,409);assert.match(execute.data.error,/Insufficient/);assert.equal(reads.length,2);assert.equal(challenges,0,'No challenge from stale quote balance')
 reads=[];const second=await call(body);assert.equal(second.status,409);assert.match(second.data.error,/Insufficient/);assert.equal(reads.length,2,'New quote reads the current balance')
 reads=[];chainId=999;assert.equal((await call(body)).status,503);assert.deepEqual(reads,['eth_chainId'],'Wrong network fails before balance or execution')
}
console.log('PASS all four EVM networks, both directions: two RPC reads per quote, fresh execution/next quote balances, insufficient funds and wrong-chain rejection')
