import {useEffect,useState} from 'react'
import {pocketUsdtEnabled} from '../lib/pocketBaseUsdt'
import {POCKET_USDT_NETWORKS,type PocketUsdtNetwork} from '../lib/pocketUsdtAssets'
import {readPocketUsdtBalance} from '../lib/pocketUsdtBalance'
type Snapshot={address:string;balance:number;stale:boolean}
export default function usePocketUsdtBalance(wallets:Partial<Record<PocketUsdtNetwork,{address:string}>>,getAccessToken:()=>Promise<string|null>) {
  const [snapshots,setSnapshots]=useState<Partial<Record<PocketUsdtNetwork,Snapshot>>>({})
  const binding=JSON.stringify(POCKET_USDT_NETWORKS.map(network=>wallets[network]?.address||''))
  useEffect(()=>{
    let cancelled=false,busy=false
    const addresses=JSON.parse(binding) as string[]
    if(!pocketUsdtEnabled)return
    const read=async()=>{if(busy)return;busy=true;try{await Promise.all(POCKET_USDT_NETWORKS.map(async(network,index)=>{
      const address=addresses[index];if(!address)return
      try{const value=await readPocketUsdtBalance(network,address,getAccessToken);if(!cancelled)setSnapshots(old=>({...old,[network]:{address,balance:value.amount,stale:false}}))}
      catch{if(!cancelled)setSnapshots(old=>({...old,[network]:old[network]?.address===address?{...old[network]!,stale:true}:undefined}))}
    }))}finally{busy=false}}
    void read();const timer=setInterval(()=>{if(document.visibilityState==='visible')void read()},30000)
    window.addEventListener('focus',read)
    return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',read)}
  },[binding,getAccessToken])
  const rows=POCKET_USDT_NETWORKS.map(network=>{
    const address=wallets[network]?.address,current=address&&snapshots[network]?.address===address?snapshots[network]:undefined
    return {network,balance:pocketUsdtEnabled?current?.balance??0:0,known:!pocketUsdtEnabled||!address||!!current,stale:current?.stale??false}
  })
  return {rows,balance:rows.reduce((sum,row)=>sum+row.balance,0),known:rows.every(row=>row.known),stale:rows.some(row=>row.stale)}
}
