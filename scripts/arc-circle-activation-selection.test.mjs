import {test} from 'node:test'
import assert from 'node:assert/strict'
import {selectActivationWallet} from './arc-circle-activation-selection.mjs'
const expected={walletId:'seller',address:'0xAbCd'}
const wallet={id:'seller',address:'0xabcd',blockchain:'ARC',accountType:'SCA',state:'LIVE'}
test('selects the linked wallet even when another Arc wallet is first',()=>{
 const other={...wallet,id:'other',address:'0x1234'}
 const result=selectActivationWallet({ok:true,wallet:other,wallets:[other,wallet]},expected)
 assert.deepEqual(result.wallet,wallet)
 assert.deepEqual(result.wallets,[wallet])
})
test('fails closed on absent, mismatched, inactive or ambiguous wallets',()=>{
 for(const wallets of [[],[{...wallet,id:'other'}],[{...wallet,address:'0x1234'}],[{...wallet,blockchain:'ARC-TESTNET'}],[{...wallet,accountType:'EOA'}],[{...wallet,state:'FROZEN'}],[wallet,wallet]]){
  assert.equal(selectActivationWallet({ok:true,wallet,wallets},expected).ok,false)
 }
})
