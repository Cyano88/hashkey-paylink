import {useCallback,useEffect,useRef,useState} from 'react'
import usePocketIdentity from './usePocketIdentity'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {registerPocketRefreshHandler} from '../lib/pocketRefresh'
import {POCKET_CELO,type PocketCeloAsset} from '../lib/pocketCelo'

type Row={symbol:PocketCeloAsset;quantity:number;valueUsd:number|null}
type Snapshot={address:string|null;rows:Row[];observedAt:number}
const symbols=Object.keys(POCKET_CELO.assets) as PocketCeloAsset[]

export default function usePocketCeloBalances(){
 const identity=usePocketIdentity()
 const accounts=identity.user?.linkedAccounts.filter(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy')||[]
 const address=accounts.length===1&&accounts[0].type==='wallet'?accounts[0].address.toLowerCase():null
 const owner=identity.authenticated&&identity.user?.id?JSON.stringify([identity.user.id,address]):''
 const latest=useRef({identity,owner,address,accounts:accounts.length});latest.current={identity,owner,address,accounts:accounts.length}
 const [state,setState]=useState<{owner:string;snapshot?:Snapshot;busy:boolean;error:boolean}>({owner:'',busy:false,error:false})
 const load=useCallback(async(force=false)=>{
  const current=latest.current
  if(!current.owner||document.visibilityState==='hidden')return
  if(current.accounts>1){setState({owner:current.owner,busy:false,error:true});return}
  if(!current.address){setState({owner:current.owner,snapshot:{address:null,rows:symbols.map(symbol=>({symbol,quantity:0,valueUsd:null})),observedAt:Date.now()},busy:false,error:false});return}
  const key=current.owner
  if(!force&&state.owner===key&&state.snapshot&&Date.now()-state.snapshot.observedAt<30_000)return
  setState(previous=>({owner:key,snapshot:previous.owner===key?previous.snapshot:undefined,busy:true,error:false}))
  try{
   const token=await current.identity.getAccessToken();if(!token)throw Error()
   const response=await fetch(pocketApiUrl('/api/pocket/celo-account'),{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(12_000)})
   const body=await response.json()
   if(latest.current.owner!==key)return
   if(!response.ok||body?.ok!==true||body.network!=='celo'||!Array.isArray(body.rows)||body.rows.length!==symbols.length||!Number.isSafeInteger(body.observedAt)||body.observedAt>Date.now()+5000||Date.now()-body.observedAt>60_000||body.address?.toLowerCase()!==current.address)throw Error()
   const rows=body.rows.map((row:any,index:number)=>{
    if(row?.symbol!==symbols[index]||!Number.isFinite(row.quantity)||row.quantity<0||!(row.valueUsd===null||Number.isFinite(row.valueUsd)&&row.valueUsd>=0))throw Error()
    return {symbol:row.symbol as PocketCeloAsset,quantity:row.quantity,valueUsd:row.valueUsd as number|null}
   })
   setState({owner:key,snapshot:{address:body.address,rows,observedAt:body.observedAt},busy:false,error:false})
  }catch{if(latest.current.owner===key)setState(previous=>({owner:key,snapshot:previous.owner===key?previous.snapshot:undefined,busy:false,error:true}))}
 },[state.owner,state.snapshot])
 useEffect(()=>{if(!owner)return;void load();const onFocus=()=>{if(document.visibilityState==='visible')void load()};const unregister=registerPocketRefreshHandler(()=>load(true));window.addEventListener('focus',onFocus);window.addEventListener('online',onFocus);document.addEventListener('visibilitychange',onFocus);return()=>{unregister();window.removeEventListener('focus',onFocus);window.removeEventListener('online',onFocus);document.removeEventListener('visibilitychange',onFocus)}},[owner,load])
 const snapshot=state.owner===owner?state.snapshot:undefined
 const holdings=symbols.map(symbol=>{
  const row=snapshot?.rows.find(item=>item.symbol===symbol)
  return {id:'celo:'+symbol,symbol,icon:symbol==='USDC'?'/brand/usdc-circle-logo.png':symbol==='USDT'?'/brand/usdt.svg':'',network:'Celo',networkIcon:'/brand/celo-logo.svg',quantity:row?.quantity??0,valueUsd:row?.valueUsd??null,known:!owner||!!row,stale:!!state.error,valueLoading:!!state.busy}
 })
 return {address:snapshot?.address,holdings,complete:!owner||!!snapshot,unavailable:!!owner&&state.error,busy:!!owner&&state.busy,refresh:()=>load(true)}
}
