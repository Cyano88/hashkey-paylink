import {useEffect,useState} from 'react'
import type {PaylinkReceipt} from './paymentReceiptPdf'
import {pocketApiUrl} from '../pocket/lib/pocketRoutes'
export default function useCheckoutReceipt(id:string,enabled:boolean){
 const [receipt,setReceipt]=useState<{id:string;value:PaylinkReceipt}|null>(null)
 useEffect(()=>{
  if(!id||!enabled)return
  let active=true,attempt=0;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
  async function load(){
   try{
    const response=await fetch(pocketApiUrl('/api/receipt?id='+encodeURIComponent(id)),{cache:'no-store',signal:controller.signal})
    const data=response.ok?await response.json():null
    if(active&&data?.ok&&data.receipt?.status==='confirmed'){setReceipt({id,value:data.receipt});return}
   }catch{}
   if(active&&++attempt<5)timer=setTimeout(()=>void load(),2000*attempt)
  }
  void load()
  return()=>{active=false;controller.abort();clearTimeout(timer)}
 },[id,enabled])
 return enabled&&receipt?.id===id?receipt.value:null
}
