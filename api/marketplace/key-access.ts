import {readDurableJson} from '../render-durable-store.js'
import {readPocketKycLevel} from '../pocket/kyc-level.js'
export function marketplaceKeyPolicy(project:{id:string;ownerId:string;capabilities?:string[];accountType?:string;operationalStatus?:string;removal?:unknown;businessVerification?:{status:string}},requests:Array<{projectId:string;ownerId:string;status:string}>,kycLevel:string){
 const matches=requests.filter(r=>r.projectId===project.id&&r.ownerId===project.ownerId)
 return project.capabilities?.length===1&&project.capabilities[0]==='marketplace_payments'&&project.operationalStatus==='active'&&!project.removal&&!['rejected','changes_requested'].includes(project.businessVerification?.status??'')&&matches.length===1&&matches[0].status==='approved'&&(project.accountType==='business'?project.businessVerification?.status==='approved':project.accountType==='individual'&&['basic','advanced'].includes(kycLevel))
}
export async function marketplaceKeyAccess(project:Parameters<typeof marketplaceKeyPolicy>[0]){
 if(project.capabilities?.length!==1||project.capabilities[0]!=='marketplace_payments')return false
 const [store,kyc]=await Promise.all([readDurableJson<{requests:Parameters<typeof marketplaceKeyPolicy>[1]}>('hashpaylink:marketplace-access-requests:v1'),project.accountType==='individual'?readPocketKycLevel(project.ownerId):Promise.resolve({level:'none'})])
 return marketplaceKeyPolicy(project,store?.requests??[],kyc.level)
}
