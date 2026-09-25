import type { WorkPayment } from './workXLayer'
import type { TradeXLayerStatus } from './protocol'
export type HostedWorkItem = {id:string;activeVersion:number;role:'customer'|'provider';terms:Array<{
  stockCustody?:import('./protocol').StockCustody;kind?:'trade';trade?:{price:string;deliveryFee:string;handover:'Pickup'|'Delivery';location:string;carrier:string;returns:string;dispatchDays:number;deliveryDays:number;inspectionHours:number;offerId:string;listingRevision:number;snapshotHash:string};version:number;title:string;description:string;amount:string;durationSeconds:number;xlayerPayment:WorkPayment
}>}
export type HostedAgreement = {
  id:string;walletAppId:string;consentHash:string;terms:HostedWorkItem['terms'][number]
  accepted:Partial<Record<'customer'|'provider',{address:string}>>
  binding?:{contractTerms:{fundBy:number}}
  evidence:Array<{hash:string;body:string;role:string;at:string}>
}
export type HostedReply = {ok:boolean;role:'customer'|'provider';fundingEnabled?:boolean;agreement:HostedAgreement;status?:TradeXLayerStatus}
export function createHostedWorkRequest(initial:HostedReply,post:(payload:Record<string,unknown>)=>Promise<HostedReply>,onReply?:(reply:HostedReply)=>void){
  let latest=initial
  async function send(payload:Record<string,unknown>){
    const reply=await post({agreementId:initial.agreement.id,...payload})
    if(!reply.ok||reply.agreement.id!==initial.agreement.id||reply.role!==initial.role
      ||reply.agreement.walletAppId!==initial.agreement.walletAppId
      ||reply.agreement.consentHash!==initial.agreement.consentHash)throw Error('Agreement identity changed. Reopen the checkout.')
    latest=reply;onReply?.(reply);return reply
  }
  return async(payload:Record<string,unknown>)=>{
    if(payload.requestId!==initial.agreement.id||payload.version!==initial.agreement.terms.version)throw Error('Agreement version changed.')
    let reply:HostedReply
    if(payload.action==='work_xlayer_wallet')reply=await send({action:'accept_terms',consentHash:initial.agreement.consentHash,address:payload.address})
    else{
      if(payload.action!=='work_xlayer_status')throw Error('Unsupported checkout operation.')
      if(!latest.agreement.binding)await send({action:'read'})
      reply=latest.agreement.binding?await send({action:'prepare',operation:payload.operation,evidence:payload.evidence}):latest
    }
    const a=reply.agreement
    return {enabled:reply.fundingEnabled===true,actions:[],...reply.status,wallet:a.accepted[reply.role]??null,
      clientAddress:a.accepted.customer?.address,workerAddress:a.accepted.provider?.address,
      customerReady:!!a.accepted.customer,providerReady:!!a.accepted.provider,fundBy:a.binding?.contractTerms.fundBy,
      workEvidence:a.evidence.map(note=>({...note,actor:note.role,createdAt:note.at}))}
  }
}
