import {Check,Copy,Undo2,X} from '../pocket/components/PocketIcons'
import {paymentReceiptOutcome,paymentReceiptView,type PaylinkReceipt} from '../lib/paymentReceiptPdf'
export default function CheckoutReceiptDetails({receipt,copied,onCopy}:{receipt:PaylinkReceipt;copied:boolean;onCopy:()=>void}){
 const view=paymentReceiptView(receipt),outcome=paymentReceiptOutcome(receipt)
 const Icon=outcome.state==='successful'?Check:outcome.state==='reversed'?Undo2:X
 return <div className="space-y-4" data-checkout-receipt>
  <section className="rounded-3xl bg-white px-6 py-7 text-center dark:bg-[#17181c]">
   <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Web payment</p>
   <p className="mt-4 text-4xl font-bold tracking-tight text-gray-950 dark:text-white">{view.amount}</p>
   <p role="status" className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold" style={{color:outcome.color}}>
    {outcome.state==='pending'?<span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent [animation-duration:1.5s] motion-reduce:animate-none"/>:<Icon aria-hidden="true" className="h-4 w-4"/>}{outcome.label}
   </p>
  </section>
  <section className="rounded-3xl bg-white px-5 py-5 dark:bg-[#17181c]">
   <h2 className="text-sm font-semibold">Payment details</h2>
   <dl className="mt-3 space-y-4">{view.rows.map(row=><div key={row.label} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-4 text-sm"><dt className="text-gray-500 dark:text-gray-400">{row.label}</dt><dd className="min-w-0 break-words text-right font-medium">{row.value}</dd></div>)}
    <div className="border-t border-gray-100 pt-4 dark:border-white/10"><dt className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">Payment reference<button type="button" onClick={onCopy} aria-label="Copy reference" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 dark:text-gray-200">{copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}</button></dt><dd className="break-all font-mono text-xs leading-5">{view.reference}</dd></div>
   </dl>
  </section>
 </div>
}
