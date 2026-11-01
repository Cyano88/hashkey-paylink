import {parseUnits} from 'viem'
import {readDurableJson,queryDurablePostgres} from '../render-durable-store.js'
import type {StockCheckout} from '../hosted-stock-checkouts.js'
import type {BscCheckout} from '../hosted-bsc-checkouts.js'
import type {PaymentExecutionIntent} from './payment-execution-intents.js'

type Attempt={status?:string;state?:string;expiresAt?:number;authorizedAt?:number;authorizedBlock?:string;hash?:string;transactionId?:string;userOperationHash?:string;recoveryBlock?:string;quote?:{expiresAt:number;checkoutId:string}}
export type CheckoutExpiryEvidence={xpay:Attempt[];bsc:Attempt[];journal:unknown[];ledger:Array<{state:string;transaction_hash?:string|null;provider_reference?:string|null}>}
export async function readCheckoutExpiryEvidence(intent:PaymentExecutionIntent):Promise<CheckoutExpiryEvidence>{
 const [xpay,bsc,journal,ledger]=await Promise.all([
  readDurableJson<{payments:Record<string,Attempt&{merchantId:string;checkoutId?:string}>}>('hashpaylink:pocket-xpay:v1'),
  readDurableJson<{operations:Record<string,Attempt>}>('pocket:bsc-payment-operations:v1'),
  readDurableJson<{actions:Record<string,unknown>}>((process.env.CIRCLE_POCKET_ACTION_STORE_KEY||'hashpaylink:circle-pocket-actions').trim()),
  queryDurablePostgres<CheckoutExpiryEvidence['ledger'][number]>('select state,transaction_hash,provider_reference from pocket_money_ledger where execution_id=$1',[intent.id]),
 ])
 return {xpay:Object.values(xpay?.payments||{}).filter(p=>p.merchantId===intent.resourceId||p.checkoutId===intent.resourceId),bsc:Object.values(bsc?.operations||{}).filter(p=>p.quote?.checkoutId===intent.resourceId),journal:Object.values(journal?.actions||{}).filter(p=>JSON.stringify(p).includes(intent.resourceId!)),ledger:ledger.rows}
}
/** The caller must supply a checkout from its integrity-verifying reader.
 * Expiry alone is insufficient: all durable evidence must show no submission.
 * Authorizers check expiry inside their durable claim before allowing a send.
 */
export function canExpireUnusedCheckout(intent:PaymentExecutionIntent,record:StockCheckout|BscCheckout,e:CheckoutExpiryEvidence,now:number){
 if(intent.kind!=='hosted_checkout'||intent.state!=='prepared'||intent.transactionHash||intent.providerReference||record.payment)return false
 if(record.id!==intent.resourceId||'partner:'+record.partnerId!==intent.ownerId||record.network!==intent.sourceNetwork||record.network!==intent.settlementNetwork||record.asset!==intent.asset)return false
 const expiry=Date.parse(record.expiresAt)
 if(!Number.isFinite(expiry)||expiry>now-60_000)return false
 try{if(parseUnits(record.amount,record.token.decimals)!==parseUnits(intent.amount,record.token.decimals))return false}catch{return false}
 if(!intent.token||intent.token.address.toLowerCase()!==record.token.address.toLowerCase()||intent.token.chainId!==record.token.chainId||intent.token.decimals!==record.token.decimals)return false
 if(!e.ledger.length||e.ledger.some(r=>r.state!=='prepared'||r.transaction_hash||r.provider_reference)||e.journal.length)return false
 const hasProof=(p:Attempt)=>Boolean(p.authorizedAt||p.authorizedBlock||p.hash||p.transactionId||p.userOperationHash||p.recoveryBlock)
 if(e.xpay.some(p=>p.status!=='ready'||hasProof(p)||!Number.isFinite(p.expiresAt)||p.expiresAt!>now-60_000))return false
 if(e.bsc.some(p=>!['prepared','cancelled'].includes(p.state||'')||hasProof(p)||!Number.isFinite(p.quote?.expiresAt)||p.quote!.expiresAt>now-60_000))return false
 return true
}
