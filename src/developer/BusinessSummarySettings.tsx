import {defaultBusinessSummaryPreferences,type BusinessSummaryPreferences} from '../lib/businessSummaryPreferences'
export default function BusinessSummarySettings({value,onChange,audience='business'}:{value?:BusinessSummaryPreferences;onChange:(value:BusinessSummaryPreferences)=>void;audience?:'business'|'seller'}){
 const settings={...defaultBusinessSummaryPreferences,...value}
 const field='mt-2 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-950 dark:border-white/10 dark:bg-white/5 dark:text-white'
 return <section aria-label="Sales summaries" className="space-y-4 border-t border-gray-200 pt-5 dark:border-white/10">
  <div><h3 className="font-semibold">Sales summaries</h3><p className="mt-2 text-sm leading-6 text-gray-500">{audience==='seller'?'A statement of your own sales allocations, balances and completed withdrawals.':'A statement of your app’s sales and settlement activity. Marketplace collections, seller allocations and your platform earnings are shown separately.'}</p></div>
  <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={settings.enabled} onChange={e=>onChange({...settings,enabled:e.target.checked})} className="mt-1 h-4 w-4"/><span>Email my sales summary<span className="mt-1 block text-xs text-gray-500">Delivered to your verified account email. No copy of each customer’s purchase receipt.</span></span></label>
  <label className="block text-sm">Frequency<select className={field} value={settings.frequency} onChange={e=>onChange({...settings,frequency:e.target.value as 'daily'|'weekly'})}><option value="daily">Daily (recommended)</option><option value="weekly">Weekly (Monday to Sunday)</option></select></label>
  <label className="block text-sm">Reporting timezone<select className={field} value={settings.timeZone} onChange={e=>onChange({...settings,timeZone:e.target.value})}>{[...new Set(['UTC','Africa/Lagos','Africa/Kampala',settings.timeZone])].map(zone=><option key={zone} value={zone}>{zone}</option>)}</select></label>
  <p className="text-xs leading-5 text-gray-500">Save to apply. Reports start from enrollment and arrive after each period closes; periods with no activity are skipped. Changing frequency or timezone starts a new reporting period. Payment, refund and completed withdrawal receipts remain individual records.</p>
 </section>
}
