import {createHash} from 'node:crypto'
import {GIFT_DEPLOYMENTS} from '../api/pocket/gifts/index.ts'
import {MULTI_GIFT_DEPLOYMENTS} from '../api/pocket/gifts/multi-deployment.ts'
const endpoint='https://pocket.hashpaylink.com/api/pocket/gifts/events',apply=process.argv.includes('--apply')
const idempotency=value=>{const h=createHash('sha256').update('pocket-gift-events-v1:'+value).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`}
async function request(path,body){const r=await fetch('https://api.circle.com'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+process.env.CIRCLE_API_KEY,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});const j=await r.json();if(!r.ok)throw Error('Circle '+r.status+' '+String(j.code||'')+' '+String(j.message||'').slice(0,180));return j.data}
const plans=[{address:GIFT_DEPLOYMENTS.base.escrow,events:['GiftFunded(bytes32,address,address,uint256,uint256,uint64)','GiftClaimed(bytes32,address,uint256)','GiftRefunded(bytes32,address,uint256)']},{address:MULTI_GIFT_DEPLOYMENTS.base.escrow,events:['GiftFunded(bytes32,address,address,address,uint128,uint32,uint256,uint64)','GiftClaimed(bytes32,bytes32,address,uint256,uint32)','GiftRefunded(bytes32,address,uint256)']}]
try{
 const subscriptions=await request('/v2/notifications/subscriptions');if(!Array.isArray(subscriptions))throw Error('Unexpected subscription response')
 let subscription=subscriptions.find(s=>s.endpoint===endpoint)
 if(apply&&!subscription){const ready=await fetch(endpoint,{method:'HEAD',signal:AbortSignal.timeout(15000)});if(!ready.ok)throw Error('Webhook receiver is not ready');subscription=await request('/v2/notifications/subscriptions',{endpoint,notificationTypes:['contracts.eventLog']})}
 console.log(JSON.stringify({receiver:!!subscription,enabled:subscription?.enabled,notificationTypes:subscription?.notificationTypes}))
 const existing=(await request('/v1/w3s/contracts/monitors?blockchain=BASE')).eventMonitors
 if(!Array.isArray(existing))throw Error('Unexpected monitor response')
 for(const plan of plans)for(const eventSignature of plan.events){
  let monitor=existing.find(m=>m.blockchain==='BASE'&&m.contractAddress.toLowerCase()===plan.address.toLowerCase()&&m.eventSignature===eventSignature)
  if(!monitor&&apply)monitor=(await request('/v1/w3s/contracts/monitors',{blockchain:'BASE',contractAddress:plan.address,eventSignature,idempotencyKey:idempotency(plan.address+':'+eventSignature)})).eventMonitor
  console.log(JSON.stringify({contract:plan.address,event:eventSignature,exists:!!monitor,enabled:monitor?.isEnabled,id:monitor?.id}))
 }
}catch(e){console.error(e instanceof Error?e.message:'Provisioning failed');process.exitCode=1}
