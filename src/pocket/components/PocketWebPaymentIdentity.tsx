import {useState} from 'react'
import {WalletIcon as Wallet} from '@heroicons/react/24/solid'
import {CreditCard,Landmark,Link2} from './PocketIcons'
import {webPaymentMethodLabel,type WebPaymentMethod} from '../lib/pocketWebPaymentMethod'
import {pocketMerchantImageUrl} from '../lib/pocketMerchantImage'
export function PocketPaymentMethodIcon({method,className='h-4 w-4'}:{method?:WebPaymentMethod;className?:string}){
 const Icon=method==='card'?CreditCard:method==='bank_transfer'?Landmark:Wallet
 return <Icon className={className} aria-label={webPaymentMethodLabel(method)}/>
}
export function PocketWebPaymentIdentity({name,imageUrl}:{name?:string;imageUrl?:string}){
 const [failed,setFailed]=useState<string|null>(null)
 const initial=Array.from((name||'').trim())[0]?.toLocaleUpperCase()
 const safeUrl=pocketMerchantImageUrl(imageUrl)
 return safeUrl&&failed!==safeUrl?<span data-merchant-logo className="flex h-full w-full items-center justify-center rounded-full bg-white p-1"><img src={safeUrl} alt={name||'Merchant'} referrerPolicy="no-referrer" onError={()=>setFailed(safeUrl)} className="h-full w-full object-contain"/></span>:initial?<span aria-label={name} className="text-base font-semibold">{initial}</span>:<Link2 aria-label="Web payment" className="h-5 w-5"/>
}
export function PocketWebPaymentLabel({method}:{method?:WebPaymentMethod}){
 return <span className="inline-flex min-w-0 items-center gap-1.5"><PocketPaymentMethodIcon method={method}/><span aria-hidden="true">&middot;</span><span className="truncate">Web payment</span></span>
}
