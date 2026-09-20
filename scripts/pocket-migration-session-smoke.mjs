import assert from 'node:assert/strict'
import { restoreActivatedMigrationWallets } from '../api/pocket/wallet-migration-session.ts'
import { applyActivatedWalletSession } from '../src/pocket/lib/pocketActivatedWalletSession.ts'
import { verifiedLegacyPaymentWallets } from '../api/pocket/wallet-migration-history.ts'
const networks=['base','arbitrum','arc'], address='0x1111111111111111111111111111111111111111', old='0x2222222222222222222222222222222222222222'
const wallets=Object.fromEntries(networks.map((n,i)=>[n,{id:'new-'+n,address,blockchain:['BASE','ARB','ARC'][i],accountType:'SCA',state:'LIVE'}]))
const targets=Object.fromEntries(networks.map(n=>[n,{walletId:wallets[n].id,address}]))
const sources=Object.fromEntries(networks.map(n=>[n,{walletId:'old-'+n,address:old}]))
const record={version:2,userId:'owner',phase:'completed',completedAt:3,replacementVerifiedAt:1,executionVerifiedAt:2,targets,sources}
const links=networks.map(chain=>({privyUserId:'owner',chain,circleWalletId:'new-'+chain,circleWalletAddress:address}))
let reads=0
const input={userId:'owner',record,links,readOwnedWallet:async n=>{reads++;return wallets[n]}}
assert.deepEqual(await restoreActivatedMigrationWallets(input),wallets)
assert.equal(reads,3)
for(const override of [{userId:'other'},{record:{...record,phase:'prepared'}},{record:{...record,executionVerifiedAt:undefined}},{links:links.slice(0,2)},{links:links.map(l=>({...l,purpose:'agent'}))},{links:links.map((l,i)=>i===2?{...l,circleWalletId:'old-arc'}:l)}]){
 reads=0;await assert.rejects(restoreActivatedMigrationWallets({...input,...override}),/not activated/);assert.equal(reads,0)
}
for(const bad of [{id:'different'},{address:old},{blockchain:'ARC-TESTNET'},{accountType:'EOA'},{state:'FROZEN'}]) await assert.rejects(restoreActivatedMigrationWallets({...input,readOwnedWallet:async n=>n==='arc'?{...wallets[n],...bad}:wallets[n]}),/could not verify/)
const oldBase={...wallets.base,id:'old-base',address:old}, oldArb={...wallets.arbitrum,id:'old-arbitrum',address:old}, oldArc={...wallets.arc,id:'old-arc',address:old}
const session={chain:'base',wallet:oldBase,arcMainnetWallet:oldArc,productionEvmTopology:{wallets:{base:oldBase,arbitrum:oldArb},legacyWallets:[]},userToken:'synthetic-only',encryptionKey:'synthetic-only',refreshToken:'synthetic-only',deviceId:'synthetic-only'}
const restored=applyActivatedWalletSession(session,wallets)
assert.equal(restored.wallet.id,'new-base')
assert.equal(restored.arcMainnetWallet.id,'new-arc')
assert.equal(restored.productionEvmTopology.wallets.arbitrum.id,'new-arbitrum')
assert.equal(restored.productionEvmTopology.legacyWallets.length,3)
assert.equal(restored.userToken,session.userToken)
assert.equal(session.wallet.id,'old-base')
assert.equal(applyActivatedWalletSession(restored,wallets).productionEvmTopology.legacyWallets.length,3)
assert.throws(()=>applyActivatedWalletSession(session,{...wallets,arc:{...wallets.arc,address:old}}),/could not be restored/)
const archive={version:1,userId:'owner',links:networks.map(chain=>({privy_user_id:'owner',chain,purpose:'payment',circle_wallet_id:'old-'+chain,circle_wallet_address:old}))}
assert.equal(verifiedLegacyPaymentWallets('owner',record,archive).length,3)
assert.deepEqual(verifiedLegacyPaymentWallets('other',record,archive),[])
assert.deepEqual(verifiedLegacyPaymentWallets('owner',{...record,phase:'prepared'},archive),[])
for(const bad of [{privy_user_id:'other'},{purpose:'agent'},{circle_wallet_id:'different'},{circle_wallet_address:address}]) assert.deepEqual(verifiedLegacyPaymentWallets('owner',record,{...archive,links:archive.links.map((l,i)=>i===0?{...l,...bad}:l)}),[])
console.log('PASS: activated-only restoration, Circle ownership, correct chains, immutable session upgrade, legacy metadata preservation and account-isolated purchase history. Synthetic only.')
