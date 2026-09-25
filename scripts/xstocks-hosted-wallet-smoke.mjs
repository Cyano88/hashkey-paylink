import assert from 'node:assert/strict'
import {selectHostedWallet} from '../src/lib/xstocksAgreement/hostedWallet.ts'
const address='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20)
const wallet={address,walletClientType:'privy'},user={linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',address}]}
// A usable authenticated linked wallet must not wait for unrelated connectors.
assert.equal(selectHostedWallet(true,user,[wallet]),wallet)
assert.equal(selectHostedWallet(false,user,[wallet]),undefined)
assert.equal(selectHostedWallet(true,null,[wallet]),undefined)
assert.equal(selectHostedWallet(true,user,[]),undefined)
assert.equal(selectHostedWallet(true,user,[{...wallet,address:other}]),undefined)
assert.equal(selectHostedWallet(true,user,[wallet,{...wallet,address:other}]),undefined)
assert.equal(selectHostedWallet(true,{linkedAccounts:[...user.linkedAccounts,{...user.linkedAccounts[0],address:other}]},[wallet]),undefined)
assert.equal(selectHostedWallet(true,user,[{...wallet,walletClientType:'external'}]),undefined)
console.log('Hosted wallet selection passed: authenticated linked ownership, unavailable signer, ambiguity and account mismatch.')
