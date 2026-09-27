import { useState } from 'react'
import logos from '../lib/pocketBankLogos.json'
import { Landmark } from './PocketIcons'
const bankLogos: Record<string, {name:string;src:string}> = logos
export default function PocketBankLogo({code='',name}:{code?:string;name:string}) {
 const record=bankLogos[code] || Object.values(bankLogos).find(bank=>bank.name.toLowerCase()===name.toLowerCase())
 const source=/^mtn mobile money$/i.test(name)?'/brand/mobile-networks/mtn.svg':/^airtel money$/i.test(name)?'/brand/mobile-networks/airtel.svg':record?.src
 const [failed,setFailed]=useState('')
 return <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5 dark:ring-white/10">{source&&failed!==source?<img src={source} alt="" className="h-full w-full object-contain p-1" onError={()=>setFailed(source)}/>:<Landmark className="h-5 w-5 text-gray-500"/>}</span>
}
