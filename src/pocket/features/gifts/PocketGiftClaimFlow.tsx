import { formatStockQuantity } from '../../lib/pocketStockDisplay'
import {useEffect,useRef,useState} from 'react'
import {useGiftAutoRefresh} from './useGiftAutoRefresh'
import {CheckCircleIcon} from '@heroicons/react/24/solid'
import type {GiftWalletSession} from '../../api/pocketGiftsClient'
import {approvePocketGift,preparePocketGiftClaim,readPocketGiftClaimStatus,type GiftApproval} from '../../api/pocketGiftsClient'
import PocketBottomSheet from '../../components/PocketBottomSheet'
import {PocketGiftArtwork} from './PocketGiftExperience'
import {parseGiftLink,type GiftView} from './pocketGift'
import {createGiftClaimFlow,type GiftClaimProgress} from './giftClaimController'

type Props={onConfirmed?():void;onSuccessDone?():void;link:string;gift:GiftView;identityKey:string;getAccessToken():Promise<string|null>;getSession():Promise<GiftWalletSession>;onDone():void}

// Remount on identity or link changes; old wallet responses cannot update a new claim.
export default function PocketGiftClaimFlow(props:Props){
 return <Claim key={props.identityKey+':'+props.link} {...props}/>
}
function Claim({link,gift,identityKey,getAccessToken,getSession,onDone,onConfirmed,onSuccessDone}:Props){
 const callbacks=useRef({getAccessToken,getSession,onConfirmed});callbacks.current={getAccessToken,getSession,onConfirmed}
 const [progress,setProgress]=useState<GiftClaimProgress>({phase:'ready',message:''})
 const [flow,setFlow]=useState<ReturnType<typeof createGiftClaimFlow<GiftApproval>>|null>(null)
 useEffect(()=>{
  const parsed=parseGiftLink(link)
  if(!parsed){setProgress({phase:'unavailable',message:'Open a valid Pocket gift link.'});return}
  let session:GiftWalletSession|undefined
  // Persist only an attempt marker; never the bearer credential.
  const key='pocket:gift-claim-attempt:v1:'+encodeURIComponent(identityKey)+':'+parsed.id
  const token=async()=>{const value=await callbacks.current.getAccessToken();if(!value)throw Error('Sign in to claim your gift.');return value}
  const controller=createGiftClaimFlow({
   prepare:async()=>{session=await callbacks.current.getSession();return preparePocketGiftClaim({link,session,accessToken:await token()})},
   approve:async approval=>{try{sessionStorage.setItem(key,'1')}catch{};return approvePocketGift({approval,session:session!})},
   status:async hash=>{const result=await readPocketGiftClaimStatus({id:parsed.id,accessToken:await token(),transactionHash:hash});if(result.status==='confirmed'&&result.transactionHash&&gift.asset){const stockSession=session||await callbacks.current.getSession();if(stockSession.chain==='xlayer')stockSession.reconcile(parsed.id,'claim',result.transactionHash)}return result},
   changed:next=>{setProgress(next);if(next.phase==='confirmed')callbacks.current.onConfirmed?.();if(next.phase==='confirmed'||next.phase==='unavailable'||next.phase==='ready'){try{sessionStorage.removeItem(key)}catch{}}},
  })
  setFlow(controller)
  try{if(sessionStorage.getItem(key))void controller.recheck()}catch{}
  return()=>controller.dispose()
 },[link,identityKey])
 useGiftAutoRefresh(progress.phase==='unconfirmed',async()=>{await flow?.refresh()})
 const busy=['preparing','approval','checking'].includes(progress.phase)
 const terminal=progress.phase==='confirmed'||progress.phase==='unavailable'
 return <PocketBottomSheet title={progress.phase==='confirmed'?'Successful':'Claim gift'} onClose={onDone} dismissOnBackdrop={false} dismissible={!busy&&progress.phase!=='confirmed'}>
  <section data-pocket-colour-scope={gift.asset?.rail||'stablecoins'} className="text-center text-gray-950 dark:text-white">
   {progress.phase==='confirmed'?<CheckCircleIcon aria-hidden="true" className="mx-auto h-14 w-14 text-green-600"/>:<PocketGiftArtwork compact/>}
   <p className="mt-5 text-2xl font-bold">{gift.asset?.rail==='xstocks'?formatStockQuantity(gift.amount):gift.amount} {gift.asset?.symbol||'USDC'}</p>
   <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">From {gift.sender}</p>
   {progress.message&&!(gift.asset?.rail==='xstocks'&&progress.phase==='approval')&&<p role="status" className="mt-4 text-sm text-gray-500 dark:text-gray-400">{progress.message}</p>}
   <button type="button" disabled={busy||(!flow&&!terminal)} className="pocket-cta-primary mt-6 w-full disabled:opacity-50" onClick={()=>progress.phase==='confirmed'?(onSuccessDone??onDone)():terminal?onDone():progress.phase==='unconfirmed'?onDone():void flow?.claim()}>
    {terminal?'Done':progress.phase==='unconfirmed'?'Done':busy?progress.phase==='approval'?(gift.asset?.rail==='xstocks'?'Processing':'Confirm in wallet'):progress.phase==='checking'?'Checking':'Preparing':'Claim gift'}
   </button>
  </section>
 </PocketBottomSheet>
}
