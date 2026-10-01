import { ChevronDown } from './PocketIcons'

export default function PocketDateField({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) {
 return <label className="block min-w-0 text-xs text-gray-500 dark:text-gray-400">{label}
  <span className="relative mt-2 flex min-h-10 w-full min-w-0 items-center justify-between gap-3 overflow-hidden rounded-xl border border-gray-200 bg-white px-3 py-2 text-left text-sm font-semibold text-gray-900 shadow-sm focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10 dark:border-[#262626] dark:bg-[#121212] dark:text-white">
   <span className={'min-w-0 flex-1 truncate '+(!value?'text-gray-400':'')}>{value?value.slice(8,10)+'-'+value.slice(5,7)+'-'+value.slice(2,4):'Select date'}</span>
   <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"/>
   <input type="date" aria-label={label+' date'} value={value} onChange={event=>onChange(event.target.value)} onClick={event=>{try{event.currentTarget.showPicker?.()}catch{ /* Native input remains usable. */ }}} className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"/>
  </span>
 </label>
}
