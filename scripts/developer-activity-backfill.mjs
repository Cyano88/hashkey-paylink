// Run against the intended environment only. Prints counts, never source records or credentials.
import {hasRenderDurableStore,readDurableJson} from '../api/render-durable-store.ts'
import {backfillDeveloperActivity} from '../api/developer-activity-store.ts'
import {projectActivitySnapshots} from '../api/developer-activity-events.ts'
import {arcMainnetStoreKey} from '../api/arc-mainnet-boundary.ts'
if(!hasRenderDurableStore())throw Error('Configure durable storage before running this migration.')
const sources=[
 ['checkout',(process.env.HOSTED_CHECKOUT_STORE_KEY??'hashpaylink:hosted-checkouts:v2').trim()],
 ['funding',(process.env.POLYMARKET_FUNDING_CHECKOUT_STORE_KEY??'hashpaylink:polymarket-funding-checkouts:v1').trim()],
 ['agreement',arcMainnetStoreKey('agreements',process.env.ARC_AGREEMENT_STORE_KEY_MAINNET)],
 ['agreement_event',arcMainnetStoreKey('webhooks',process.env.ARC_AGREEMENT_WEBHOOK_STORE_KEY_MAINNET)],
]
const apply=process.argv.includes('--apply')
for(const [source,key]of sources){const result=apply?await backfillDeveloperActivity(source,key):{source,snapshots:projectActivitySnapshots(source,await readDurableJson(key)).length};console.log(JSON.stringify({mode:apply?'apply':'preview',...result}))}
// The pg pool remains open; all awaited operations above have finished.
process.exit(0)
