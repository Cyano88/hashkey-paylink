import {useNavigate} from 'react-router-dom'
import {parsePocketFundingCode} from '../lib/pocketFundingCode'
import {POCKET_BASE_PATH} from '../lib/pocketRoutes'
import {readPocketClipboard} from '../lib/pocketClipboard'
import {useId,useRef,useState} from 'react'
import {QrCodeIcon} from '@heroicons/react/24/outline'
import PocketAddressScanner from './PocketAddressScanner'
import {pocketWalletAddressCode} from '../lib/pocketWalletAddressCode'
export default function PocketSendAddressInput({value,onChange,disabled=false,solana=false,network}:{value:string;onChange(value:string):void;disabled?:boolean;solana?:boolean;network?:string}){
 const navigate=useNavigate()
 const id=useId(),[scanning,setScanning]=useState(false),[error,setError]=useState('')
 const pasting=useRef(false)
 const selectedNetwork=network||(solana?'solana':'base'),current=useRef({disabled,value,selectedNetwork});current.current={disabled,value,selectedNetwork}
 const paste=async()=>{
  if(pasting.current)return;const snapshot=current.current;pasting.current=true
  try{const raw=await readPocketClipboard();if(current.current.disabled||current.current.value!==snapshot.value||current.current.selectedNetwork!==snapshot.selectedNetwork)return;if(!raw.trim())throw Error('Clipboard is empty.');const funding=parsePocketFundingCode(raw);if(funding)navigate(POCKET_BASE_PATH+funding.path);else onChange(pocketWalletAddressCode(raw,selectedNetwork));setError('')}catch(reason){setError(reason instanceof DOMException||!navigator.clipboard?'Touch and hold the address field to paste.':reason instanceof Error?reason.message:'Could not paste. Touch and hold the address field.')}finally{pasting.current=false}
 }
 return <div><label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-200">Recipient wallet address</label><div className="mt-2 flex min-h-14 items-center rounded-full border border-gray-200 bg-gray-50 pl-4 pr-1.5 dark:border-[#262626] dark:bg-[#181818]">
  <input id={id} aria-label="Recipient" aria-describedby={error?id+'-error':undefined} type="text" disabled={disabled} value={value} onChange={event=>{setError('');onChange(event.target.value.trim())}} placeholder="Wallet address" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/>
  <button type="button" aria-label="Paste wallet address" disabled={disabled} onClick={()=>void paste()} className="min-h-11 shrink-0 px-2 text-sm font-medium text-gray-600 disabled:opacity-40 dark:text-gray-300">Paste</button>
  <button type="button" aria-label="Scan wallet address" disabled={disabled} onClick={()=>{setError('');setScanning(true)}} className="flex h-11 w-11 shrink-0 items-center justify-center text-gray-600 disabled:opacity-40 dark:text-gray-300"><QrCodeIcon className="h-5 w-5"/></button>
 </div>{error&&<p id={id+'-error'} role="status" className="mt-2 text-xs text-gray-500 dark:text-gray-400">{error}</p>}{scanning&&!disabled&&<PocketAddressScanner key={selectedNetwork} network={selectedNetwork} onFunding={path=>{if(!current.current.disabled)navigate(POCKET_BASE_PATH+path);setScanning(false)}} onClose={()=>setScanning(false)} onAddress={address=>{if(!current.current.disabled)onChange(address);setError('');setScanning(false)}}/>}</div>
}
