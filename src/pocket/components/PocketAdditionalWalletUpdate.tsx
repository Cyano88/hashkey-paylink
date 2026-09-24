import {useRef,useState,useEffect} from 'react'
import {unlockPocketBaseWallet,preparePocketWalletsAfterSignIn} from '../controllers/usePocketWalletController'
import {resumeCircleAdditionalEvmWallet,type CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import PocketMigrationExecution from './PocketMigrationExecution'
type Network='ethereum'|'polygon'
export default function PocketAdditionalWalletUpdate({email,getAccessToken,networks,onComplete}:{email:string;getAccessToken():Promise<string|null>;networks:Network[];onComplete():void}) {
 const [index,setIndex]=useState(0),[session,setSession]=useState<CircleEvmEmailSession|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const active=useRef(true),locked=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function advance(base:CircleEvmEmailSession,next:number) {
  setReady(false)
  if(next<networks.length){setIndex(next);return}
  await preparePocketWalletsAfterSignIn({email,getAccessToken,session:base,shouldContinue:()=>active.current})
  if(active.current)onComplete()
 }
 async function prepare() {
  if(locked.current)return
  locked.current=true;setBusy(true);setError('')
  try {
   const token=await getAccessToken();if(!token)throw Error('Sign in again to update your wallets.')
   const base=session??(await unlockPocketBaseWallet({authenticated:true,email,getAccessToken})).session
   if(!active.current)return
   const target=await resumeCircleAdditionalEvmWallet(base,networks[index],token)
   if(!active.current)return
   setSession(base)
   if(target.wallet.address.toLowerCase()===base.wallet.address.toLowerCase())await advance(base,index+1)
   else setReady(true)
  }catch(reason){if(active.current)setError(reason instanceof Error?reason.message:'Wallet update is unavailable.')}
  finally{locked.current=false;if(active.current)setBusy(false)}
 }
 return <section className='pt-6'><article className='rounded-[26px] bg-white p-5 dark:bg-[#121212]'>
  <h2 className='text-lg font-black'>Update your {networks[index]==='ethereum'?'Ethereum':'Polygon'} wallet</h2>
  <p className='mt-3 text-sm leading-6 text-gray-500'>Use your unified Pocket address. Your current wallet stays active until the update is verified.</p>
  {ready&&session?<PocketMigrationExecution key={networks[index]} additionalNetwork={networks[index]} session={session} getAccessToken={getAccessToken} onComplete={()=>{void advance(session,index+1).catch(reason=>setError(reason instanceof Error?reason.message:'Reopen Pocket to refresh your wallets.'))}}/>:<button type='button' disabled={busy} onClick={()=>void prepare()} className='mt-5 min-h-12 w-full rounded-full bg-gray-950 px-4 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'>{busy?'Checking...':'Verify updated wallet'}</button>}
  {error&&<p role='alert' className='mt-4 text-sm text-red-500'>{error}</p>}
 </article></section>
}
