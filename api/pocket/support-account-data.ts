import { pocketActivityStore } from './activity-store.js'
import { activityFeedKey } from './activity-feed.js'
import { mergePocketActivityRows } from '../../src/pocket/lib/pocketActivitySnapshot.js'
import { personalPocketActivity } from '../../src/pocket/lib/pocketPurchaseKind.js'
import { pocketActivityArchiveKey } from '../../src/pocket/lib/pocketActivityArchive.js'
export async function readSupportPayments(owner:string){
 const {readPocketNotificationActivity,transformPocketActivitySnapshot}=await import('./activity.js')
 const [feed,persisted]=await Promise.all([pocketActivityStore.read(activityFeedKey(owner)),readPocketNotificationActivity(owner)])
 const saved=Object.values(feed?.sources||{}).reduce((rows,source)=>mergePocketActivityRows(rows,source.snapshot.payments),[] as Awaited<ReturnType<typeof readPocketNotificationActivity>>)
 const snapshot=await transformPocketActivitySnapshot(owner,{payments:mergePocketActivityRows(saved,persisted),merchants:[],collections:[]})
 const rows=snapshot.payments
 const excluded=new Set([...(snapshot.groupedTransactionHashes||[]),...Object.values(feed?.sources||{}).flatMap(source=>source.snapshot.groupedTransactionHashes||[])].map(hash=>hash.toLowerCase()))
 return personalPocketActivity(rows).filter(row=>!feed?.archivedKeys?.includes(pocketActivityArchiveKey(row))&&(!row.txHash||!excluded.has(row.txHash.toLowerCase())))
}
