import assert from 'node:assert/strict'
import { migrationScopeMatches,migrationAssetsAccountedFor } from '../api/pocket/wallet-migration-scope.ts'
const plan={userId:'owner',revision:'review'}
const consent={...plan,asset:'USDC',leaveOtherAssets:true}
assert.equal(migrationScopeMatches(plan,consent),true)
for(const invalid of [undefined,{...consent,userId:'other'},{...consent,revision:'other'},{...consent,asset:'ETH'},{...consent,leaveOtherAssets:false},{...consent,leaveOtherAssets:'true'}])assert.equal(migrationScopeMatches(plan,invalid),false)
assert.equal(await migrationAssetsAccountedFor(plan,{otherAssets:[]}),true)
console.log('PASS: USDC-only consent is owner/revision/asset bound; missing, stale and other-owner consent fail closed.')

const inventory={otherAssets:[{token:'untouched'}]}
assert.equal(await migrationAssetsAccountedFor(plan,inventory,async key=>{assert.equal(key,'pocket:wallet-migration-scope:v1:owner');return consent}),true)
assert.equal(await migrationAssetsAccountedFor(plan,inventory,async()=>undefined),false)
assert.equal(await migrationAssetsAccountedFor(plan,inventory,async()=>({...consent,revision:'old'})),false)
await assert.rejects(migrationAssetsAccountedFor(plan,inventory,async()=>{throw Error('Store unavailable')}),/unavailable/)
