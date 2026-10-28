import assert from 'node:assert/strict'
import {readCheckoutWalletSession} from '../api/pocket/checkout-wallet-session.ts'
const address='0x1111111111111111111111111111111111111111'
for(const [chain,blockchain] of [['base','BASE'],['arbitrum','ARB'],['arc','ARC'],['ethereum','ETH'],['polygon','MATIC']]){
 const wallet={id:chain+'-wallet',address,blockchain,accountType:'SCA',state:'LIVE'}
 const link={privyUserId:'owner',chain,purpose:'payment',circleWalletId:wallet.id,circleWalletAddress:address,circleBlockchain:blockchain}
 let reads=0
 const input={userId:'owner',chain,link,readOwnedWallet:async(n,id)=>{reads++;assert.equal(n,chain);assert.equal(id,wallet.id);return wallet}}
 assert.deepEqual(await readCheckoutWalletSession(input),wallet)
 assert.equal(reads,1)
 await assert.rejects(readCheckoutWalletSession({...input,userId:'other'}))
 await assert.rejects(readCheckoutWalletSession({...input,link:null}))
 await assert.rejects(readCheckoutWalletSession({...input,link:{...link,purpose:'agent'}}))
 for(const changed of [null,{...wallet,id:'other'},{...wallet,address:'0x2222222222222222222222222222222222222222'},{...wallet,blockchain:'SOL'},{...wallet,state:'FROZEN'},{...wallet,accountType:'EOA'}]){
  await assert.rejects(readCheckoutWalletSession({...input,readOwnedWallet:async()=>changed}))
 }
}
console.log('Checkout wallet lookup: all five networks, owner/ID/address/chain/state/account checks passed')
