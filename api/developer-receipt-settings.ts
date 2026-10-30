import{readDurableJson}from'./render-durable-store.js'
import type{ReceiptEmailSettings}from'../src/lib/receiptEmailSettings.js'
type Project={receiptEmails?:ReceiptEmailSettings;removal?:unknown;operationalStatus?:string;checkoutMode?:string;capabilities?:string[];xlayerCheckout?:unknown;settlementMode?:string}
export function activeReceiptSettings(project?:Project){
 if(!project||project.removal||project.operationalStatus==='suspended'||project.checkoutMode==='agentic'||!project.capabilities?.includes('hosted_checkout'))return
 const settings=project.receiptEmails
 if(!settings?.enabled||!settings.supportEmail||!settings.enabledAt||!Number.isFinite(Date.parse(settings.enabledAt)))return
 return settings
}
export async function readDeveloperReceiptSettings(projectId:string){
 const store=await readDurableJson<{projects:Record<string,Project>}>((process.env.DEVELOPER_PROJECT_STORE_KEY??'hashpaylink:developer-projects:v1').trim())
 return activeReceiptSettings(store?.projects?.[projectId])
}
