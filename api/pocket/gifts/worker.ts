import {withDurableSessionLock} from '../../render-durable-store.js'
import {durableGiftStore} from './store.js'
import {createGiftReconciler} from './reconciler.js'
import {GIFT_DEPLOYMENTS,giftService} from './index.js'
export async function drainPocketGifts(){
 if(!Object.keys(GIFT_DEPLOYMENTS).length)return
 return withDurableSessionLock('pocket:gifts:reconciliation',async client=>{
 const run=createGiftReconciler({
  list:async(now,limit)=>{const result=await client.query("select value->>'id' as id from render_durable_kv where store_key like 'hashpaylink:pocket-gift:v1:%' and value->>'version' in ('1','2') and (value ? 'funding' or value->>'state'<>'unfunded') and coalesce((value->>'reconcileComplete')::boolean,false)=false and coalesce((value->>'nextReconcileAt')::bigint,0)<=$1 order by coalesce((value->>'nextReconcileAt')::bigint,0),store_key limit $2",[now,limit]);return result.rows.map(r=>r.id)},
  refresh:giftService.refresh,
  schedule:async(id,next,complete)=>{await durableGiftStore.update(id,r=>{if(!r)throw Error('Gift missing');return {...r,nextReconcileAt:next,reconcileComplete:complete}})},
 });return run()
 })
}
