import {payerCheckoutFeeRows,type PayerCheckoutFeeEvidence} from '../src/lib/payerCheckoutFees.js'
import {checkoutPriceLabel,type CheckoutPricing} from '../src/lib/checkoutPricing.js'
import {webPaymentMethodLabel} from '../src/pocket/lib/pocketWebPaymentMethod.js'
import {formatPocketDisplayAmount} from '../src/pocket/lib/pocketMoney.js'
import {receiptPresentationEmail,receiptPresentationPdf,type ReceiptPresentation} from './receipt-presentation.js'
import {receiptMoney} from '../src/lib/receiptIdentity.js'
export type BillingReceipt={payerFees?:PayerCheckoutFeeEvidence;pricing?:CheckoutPricing;id:string;projectId?:string;merchant:string;merchantLogoUrl?:string;supportEmail?:string;timeZone?:string;description:string;amount:string;asset:string;network:string;paidAt:string;paymentMethod:'wallet'|'bank_transfer'|'card';settlement?:{amount:string;currency:string};receiptUrl:string;purpose?:'payment'|'funding';fundingAccount?:string}
export const receiptAmount=(r:BillingReceipt)=>r.payerFees?payerCheckoutFeeRows(r.amount,r.payerFees)[3].value:r.pricing?receiptMoney(r.pricing.amount,r.pricing.currency):receiptMoney(r.amount,r.asset)
export const receiptPdfUrl=(id:string)=>'https://app.hashpaylink.com/api/receipt?id='+encodeURIComponent(id)+'&format=pdf'
export function receiptPaidDate(r:BillingReceipt){return new Intl.DateTimeFormat('en-GB',{timeZone:r.timeZone||'UTC',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(new Date(r.paidAt))}
export function billingReceiptPresentation(r:BillingReceipt):ReceiptPresentation{
 const prefix=r.merchant+' order ',reference=r.description.startsWith(prefix)?r.description.slice(prefix.length):''
 const order=/^[a-z0-9-]{1,64}$/i.test(reference)?'Order #'+reference.toUpperCase():''
 const funding=r.purpose==='funding',rows:Array<[string,string]>=[]
 if(order||r.description)rows.push([order?'Order':'Description',order||r.description])
 if(r.payerFees)rows.push(...payerCheckoutFeeRows(r.amount,r.payerFees).slice(0,-1).map(row=>[row.label,row.value] as [string,string]))
 if(r.pricing)rows.push(['Paid with',formatPocketDisplayAmount(r.amount)+' '+r.asset],['Exchange rate','1 '+r.pricing.paymentAsset+' = '+r.pricing.rate+' '+r.pricing.currency])
 rows.push(['Payment method',webPaymentMethodLabel(r.paymentMethod)],['Network',r.network])
 if(funding&&r.fundingAccount)rows.push(['Funded account',r.fundingAccount])
 // This is the payer's document. Merchant net settlement is never disclosed here.
 return {brandName:r.merchant,logoUrl:r.merchantLogoUrl,icon:r.paymentMethod,title:funding?'Account funding receipt':'Payment receipt',headline:funding?'Your Polymarket account was funded':r.merchant+' received your payment',amount:receiptAmount(r),amountLabel:funding?'Amount paid':undefined,date:receiptPaidDate(r),sections:[{title:'Transaction details',rows}],reference:r.id,url:r.receiptUrl,linkLabel:'View receipt',supportEmail:r.supportEmail}
}
export function receiptEmail(r:BillingReceipt){return {subject:(r.purpose==='funding'?'Funding receipt from ':'Receipt from ')+r.merchant,...receiptPresentationEmail(billingReceiptPresentation(r))}}
export function billingReceiptPdf(r:BillingReceipt):Promise<Buffer>{return receiptPresentationPdf(billingReceiptPresentation(r))}
