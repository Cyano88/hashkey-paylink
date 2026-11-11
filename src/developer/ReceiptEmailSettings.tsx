import{defaultReceiptEmailSettings,type ReceiptEmailSettings as Settings}from'../lib/receiptEmailSettings'
import BusinessSummarySettings from './BusinessSummarySettings'
export default function ReceiptEmailSettings({value,onChange,eligible}:{value?:Settings;onChange:(value:Settings)=>void;eligible:boolean}){
 const settings={...defaultReceiptEmailSettings,...value,enabled:true}
 const field='mt-2 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-950 dark:border-white/10 dark:bg-white/5 dark:text-white'
 return <section className="mt-7 space-y-5" aria-label="Customer receipt emails">
  <div><h2 className="text-base font-semibold">Customer receipts</h2><p className="mt-2 text-sm leading-6 text-gray-500">Customers automatically receive an email with their PDF receipt and a link to view it after a confirmed payment.</p></div>
  <p className="text-xs leading-5 text-gray-500">Available across supported Checkout networks, including bank and mobile-money settlement, when the customer signs in with a verified email. Sent only after payment and any required local delivery are confirmed.{!eligible&&' Enable human Checkout to use this feature.'}</p>
  <label className="block text-sm font-medium">Merchant support email<input type="email" autoComplete="email" className={field} value={settings.supportEmail} onChange={e=>onChange({...settings,supportEmail:e.target.value})} placeholder="support@yourbusiness.com"/><span className="mt-2 block text-xs font-normal leading-5 text-gray-500">Shown on receipts and used for customer replies. Use an inbox your business monitors.</span></label>
  <label className="block text-sm font-medium">Receipt timezone<select className={field} value={settings.timeZone} onChange={e=>onChange({...settings,timeZone:e.target.value})}>{[...new Set(['UTC','Africa/Lagos','Africa/Kampala',settings.timeZone])].map(zone=><option key={zone} value={zone}>{zone==='UTC'?'UTC':zone==='Africa/Lagos'?'West Africa Time (Lagos)':zone==='Africa/Kampala'?'East Africa Time (Kampala)':zone}</option>)}</select></label>
  <p className="text-xs leading-5 text-gray-500">Sent from your business name via Hash PayLink. Your saved branding is used automatically. A support email is optional and does not affect receipt delivery. Marketplace sellers receive their own completed withdrawal receipts; buyers receive their own refunds. These are never redirected to the app owner.</p>
  <BusinessSummarySettings value={settings.businessSummary} onChange={businessSummary=>onChange({...settings,businessSummary})}/>
 </section>
}
