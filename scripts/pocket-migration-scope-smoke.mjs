import assert from 'node:assert/strict'
import { migrationAssetsAccountedFor } from '../api/pocket/wallet-migration-scope.ts'
const plan={version:1,userId:'new-owner',revision:'existing-review'}
for(const otherAssets of [[],[{token:'ETH',amount:'0.1'}],[{token:'ETH'},{token:'unrelated-token'}]]) {
 const inventory={otherAssets}
 const before=structuredClone(inventory)
 assert.equal(await migrationAssetsAccountedFor(plan,inventory),true)
 assert.deepEqual(inventory,before,'Non-USDC inventory must remain untouched')
 assert.equal(await migrationAssetsAccountedFor({...plan,userId:'another-owner',revision:'new-review'},inventory),true)
}
for(const invalid of [{...plan,version:2},{...plan,userId:''},{...plan,revision:''}])assert.equal(await migrationAssetsAccountedFor(invalid,{otherAssets:[]}),false)
for(const inventory of [undefined,{}, {otherAssets:null}])assert.equal(await migrationAssetsAccountedFor(plan,inventory),false)
console.log('PASS: Existing and new USDC-only plans allow unrelated assets without account exceptions; inventory remains untouched and malformed inventory fails closed.')
