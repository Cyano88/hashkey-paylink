import {Check} from 'lucide-react'
import {CHECKOUT_PRODUCTS, isOpenCheckoutProduct, type ProductCapability} from '../lib/developerProducts'

export default function ProductPicker({mode,value,onChange,disabled=false}:{disabled?:boolean;mode:'human'|'agentic';value:ProductCapability[];onChange:(value:ProductCapability[])=>void}) {
  return <div className="mt-6 divide-y divide-gray-100 dark:divide-white/10">
    {CHECKOUT_PRODUCTS.map(group=>{
      const options=group.options.filter(option=>mode === 'human' || value.includes(option.capability))
      if(!options.length)return null
      return <fieldset key={group.id} className="min-w-0 py-5">
        <legend className="pt-5 text-base font-semibold">{group.title}</legend>
        <p className="mb-3 text-sm leading-6 text-gray-500">{group.description}</p>
        <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-white/10">{options.map(option=>{
          const selected=value.includes(option.capability)
          return <button type="button" role="checkbox" aria-checked={selected} disabled={disabled} key={option.capability}
            onClick={()=>{const next=selected?value.filter(v=>v!==option.capability):[...value,option.capability];if(next.some(isOpenCheckoutProduct))onChange(next)}}
            className="disabled:cursor-wait flex min-h-20 w-full items-center gap-3 border-b border-gray-100 p-4 text-left last:border-b-0 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:hover:bg-white/5">
            <span className={'grid h-5 w-5 shrink-0 place-items-center rounded-md border '+(selected?'border-blue-600 bg-blue-600 text-white':'border-gray-300 dark:border-gray-600')}>{selected&&<Check className="h-3 w-3"/>}</span>
            <span><span className="block text-sm font-semibold">{option.title}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{option.detail}</span></span>
          </button>
        })}</div>
      </fieldset>
    })}
    {value.some(capability=>!isOpenCheckoutProduct(capability)) && <p className="pt-4 text-xs leading-5 text-gray-500">Existing legacy product settings are preserved.</p>}
    <p className="pt-4 text-xs leading-5 text-gray-500">Keep at least one payment option selected.</p>
  </div>
}
