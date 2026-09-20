import { readDurableJson } from '../render-durable-store.js'
import type { MigrationPlan } from './wallet-migration-plan.js'
export type MigrationScope = { userId:string; revision:string; asset:'USDC'; leaveOtherAssets:true }
export function migrationScopeMatches(plan:Pick<MigrationPlan,'userId'|'revision'>,scope:MigrationScope|undefined) {
 return !!scope && scope.userId===plan.userId && scope.revision===plan.revision && scope.asset==='USDC' && scope.leaveOtherAssets===true
}
// Inventory must succeed. Consent is bound to the owner's exact reviewed plan.
// Calldata and receipt verification remain restricted to canonical USDC.
export async function migrationAssetsAccountedFor(plan:MigrationPlan,inventory:{otherAssets:unknown[]},readScope:(key:string)=>Promise<MigrationScope|undefined>=readDurableJson<MigrationScope>) {
 if(inventory.otherAssets.length===0)return true
 return migrationScopeMatches(plan,await readScope('pocket:wallet-migration-scope:v1:'+plan.userId))
}
