import assert from 'node:assert/strict'
import {fixture,owner,wallet} from './fixtures/native-evm-swap.mjs'
import {quoteNativeEvmSwap,sealNativeEvmSwap} from '../api/pocket/native-evm-swap-quote.ts'
import {createNativeEvmSwapHandler} from '../api/pocket/native-evm-swap.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='fee-buffer-regression-'.repeat(3)
for(const network of ['ethereum','base','arbitrum','polygon'])for(const reverse of [false,true]){
 const f=await fixture(network,reverse);let estimates=0
 const q=await quoteNativeEvmSwap(f.binding,async()=>++estimates===1?'0.00001':'0.000011',f.provider,()=>f.now)
 assert.equal(estimates,2,'small fee movement must fit the buffer already quoted');assert.equal(q.feeUnits,'15000000000000')
 for(const [fee,expected] of [['0.000014',200],['0.000015',200],['0.000015000000000001',409]]){
  let claims=0,signs=0;const handler=createNativeEvmSwapHandler({identity:async()=>({userId:owner}),enabled:()=>true,now:()=>f.now,readLink:async()=>({privyUserId:owner,chain:network,purpose:'payment',circleBlockchain:{ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC'}[network],circleWalletId:'wallet',circleWalletAddress:wallet}),find:async()=>null,approval:async()=>true,estimate:async()=>fee,rpc:async(n,m)=>m==='eth_chainId'?'0x'+({ethereum:1,base:8453,arbitrum:42161,polygon:137}[network]).toString(16):'0x1000000000000000000',claim:async input=>{claims++;return{claimed:true,record:{...input,status:'started'}}},record:async input=>input,challenge:async()=>{signs++;return{challengeId:'fixture'}}})
  let status=200;await handler({method:'POST',headers:{},body:{action:'execute',quoteToken:sealNativeEvmSwap(q),circleUserToken:'fixture'}},{setHeader(){},status(s){status=s;return this},json(){return this}})
  assert.equal(status,expected);assert.equal(claims,expected===200?1:0);assert.equal(signs,expected===200?1:0)
 }
}
console.log('PASS four EVM networks both directions: fee jitter uses existing buffer; exact cap accepted, one wei over cap rejected before claim/challenge')
