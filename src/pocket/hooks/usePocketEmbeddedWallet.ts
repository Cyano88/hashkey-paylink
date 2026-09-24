import { useCallback,useEffect,useState } from 'react'
import { useCreateWallet } from '@privy-io/react-auth'
import usePocketIdentity from './usePocketIdentity'
import { ensurePocketEmbeddedWallet,pocketEmbeddedAddresses,retryPocketEmbeddedWallet } from '../lib/pocketEmbeddedWallet'

export default function usePocketEmbeddedWallet() {
 const {ready,authenticated,user}=usePocketIdentity()
 const {createWallet}=useCreateWallet()
 const owner=authenticated&&ready?user?.id||'':''
 const addresses=pocketEmbeddedAddresses(user),linked=addresses.length===1?addresses[0]:undefined
 const [attempt,setAttempt]=useState(0)
 const [state,setState]=useState<{owner:string;address?:string;busy:boolean;error:string}>({owner:'',busy:false,error:''})
 useEffect(()=>{
  if(!owner||linked||addresses.length>1)return
  let active=true
  setState({owner,busy:true,error:''})
  const timer=setTimeout(()=>{if(active)setState({owner,busy:false,error:'Your XStocks wallet is taking longer to open. Try again.'})},20000)
  const work=attempt?retryPocketEmbeddedWallet(owner,createWallet):ensurePocketEmbeddedWallet(owner,createWallet)
  void work.then(address=>{if(active)setState({owner,address,busy:false,error:''})},()=>{if(active)setState({owner,busy:false,error:'Could not open your XStocks wallet. Try again.'})}).finally(()=>clearTimeout(timer))
  return()=>{active=false;clearTimeout(timer)}
 },[owner,linked,addresses.length,createWallet,attempt])
 const current=state.owner===owner?state:undefined
 return {address:owner&&addresses.length<=1?(linked||current?.address):undefined,busy:!!owner&&!linked&&!!current?.busy,error:addresses.length>1?'Multiple embedded wallets found. Wallet selection needs review.':linked?'':current?.error||'',retry:useCallback(()=>setAttempt(n=>n+1),[])}
}
