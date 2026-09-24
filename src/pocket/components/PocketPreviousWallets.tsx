import {useRef,useState,useEffect} from 'react'
import {unlockPocketBaseWallet} from '../controllers/usePocketWalletController'
import {pocketMigrationRequest} from '../lib/pocketMigrationClient'
import PocketMigrationExecution from './PocketMigrationExecution'
export default function PocketPreviousWallets({email,getAccessToken,onBack}:{email:string;getAccessToken():Promise<string|null>;onBack():void}) {
 const [session,setSession]=useState<Awaited<ReturnType<typeof unlockPocketBaseWallet>>['session']|null>(null)
 const [additionalNetwork,setAdditionalNetwork]=useState<'ethereum'|'polygon'|undefined>()
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[complete,setComplete]=useState(false)
 const locked=useRef(false),active=useRef(false)
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[])
 async function review(network:string) {
  if(locked.current)return
  locked.current=true;setBusy(true);setError('');setMessage('')
  try {
   const token=await getAccessToken();if(!token)throw Error('Sign in again to review your previous wallet.')
   const unlocked=await unlockPocketBaseWallet({authenticated:true,email,getAccessToken})
   if(!active.current)return
   const result=await pocketMigrationRequest<{empty?:boolean}>(token,{action:'review',network,userToken:unlocked.session.userToken},{recovery:true,...(network==='ethereum'||network==='polygon'?{additionalNetwork:network}: {})})
   if(!active.current)return
   if(result.empty)setMessage('No USDC is waiting in this previous wallet.')
   else {setAdditionalNetwork(network==='ethereum'||network==='polygon'?network:undefined);setSession(unlocked.session)}
  }catch(reason){if(active.current)setError(reason instanceof Error?reason.message:'Previous wallet review is unavailable.')}
  finally{locked.current=false;if(active.current)setBusy(false)}
 }
 return <div className='space-y-4'>
  <h2 className='text-lg font-black'>{complete?'Balance recovered':'Previous wallets'}</h2>
  {complete?<p className='text-sm text-gray-500'>Your USDC transfer to your updated wallet is confirmed.</p>:session?<PocketMigrationExecution recovery additionalNetwork={additionalNetwork} session={session} getAccessToken={getAccessToken} onComplete={()=>setComplete(true)}/>:<>
   <p className='text-sm leading-6 text-gray-500'>Check for USDC sent to a previous wallet after your update.</p>
   {(['base','arbitrum','arc','ethereum','polygon'] as const).map(network=><button key={network} type='button' disabled={busy} onClick={()=>void review(network)} className='min-h-12 w-full rounded-full bg-gray-100 px-4 text-sm font-bold capitalize disabled:opacity-50 dark:bg-white/10'>{{base:'Base',arbitrum:'Arbitrum',arc:'Arc',ethereum:'Ethereum',polygon:'Polygon'}[network]}</button>)}
  </>}
  {message&&<p role='status' className='text-sm'>{message}</p>}{error&&<p role='alert' className='text-sm text-red-500'>{error}</p>}
  <button type='button' disabled={busy} onClick={onBack} className='min-h-12 w-full text-sm font-bold'>Back to Pocket</button>
 </div>
}
