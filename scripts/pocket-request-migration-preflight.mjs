import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

// Dry-run only. Never initializes a store or prints request identities/content.
export function inspectRequestMigration(store, journal) {
 if(!store || !store.requests || typeof store.requests!=='object' || Array.isArray(store.requests)) throw Error('Invalid request-store envelope')
 if(!journal || !journal.actions || typeof journal.actions!=='object') throw Error('Invalid action-journal envelope')
 const records=Object.entries(store.requests)
 let malformedRecords=0
 for(const [id,record] of records) {
  if(!record || typeof record!=='object' || record.id!==id || !record.wallet || !record.payUrl || !record.network || !record.label || !record.mode || !Number.isFinite(record.createdAt)) malformedRecords++
 }
 const actions=Object.values(journal.actions).filter(item=>item?.action==='create-usdc-paylink')
 let missingRecords=0,identityConflicts=0
 for(const action of actions) {
  const record=Object.hasOwn(store.requests,action.resourceId)?store.requests[action.resourceId]:undefined
  if(!record){missingRecords++;continue}
  if(!action.ownerId || !action.idempotencyKey || record.ownerId!==action.ownerId || record.idempotencyKey!==action.idempotencyKey) identityConflicts++
 }
 return {requestCount:records.length,historicalActions:actions.length,missingRecords,identityConflicts,malformedRecords,readyForReviewedMigration:missingRecords===0&&identityConflicts===0&&malformedRecords===0}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 try {
  if(process.argv.length!==4) throw Error('Usage: node scripts/pocket-request-migration-preflight.mjs REQUEST_STORE_JSON ACTION_JOURNAL_JSON')
  const [store,journal]=await Promise.all(process.argv.slice(2).map(async file=>JSON.parse(await readFile(file,'utf8'))))
  const result=inspectRequestMigration(store,journal)
  console.log(JSON.stringify(result))
  if(!result.readyForReviewedMigration)process.exitCode=2
 }catch {console.error('Preflight failed. Supply valid request-store and action-journal JSON files. No migration performed.');process.exitCode=1}
}
