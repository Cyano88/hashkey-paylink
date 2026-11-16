import{readDurableJson}from'./render-durable-store.js'
import type{ReceiptEmailSettings}from'../src/lib/receiptEmailSettings.js'
import{defaultReceiptEmailSettings}from'../src/lib/receiptEmailSettings.js'
type Project={receiptEmails?:ReceiptEmailSettings;removal?:unknown;operationalStatus?:string;checkoutMode?:string;capabilities?:string[];xlayerCheckout?:unknown;settlementMode?:string}
export function activeReceiptSettings(project?:Project){
 if(!project||project.removal||project.operationalStatus==='suspended'||project.checkoutMode==='agentic'||!project.capabilities?.some(capability=>['hosted_checkout','marketplace_payments','polymarket_funding'].includes(capability)))return
 return {...defaultReceiptEmailSettings,...project.receiptEmails,enabled:true}
}
export async function readDeveloperReceiptSettings(projectId:string){
 if(projectId.startsWith('xpay:')){const {xpayHostedPartnerExists}=await import('./pocket/xpay-hosted-destinations.js');return await xpayHostedPartnerExists(projectId)?{...defaultReceiptEmailSettings}:undefined}
 const store=await readDurableJson<{projects:Record<string,Project>}>((process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim())
 return activeReceiptSettings(store?.projects?.[projectId])
}
