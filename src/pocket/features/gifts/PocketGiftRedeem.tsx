import PocketFlowHeader from '../../components/PocketFlowHeader'
import {useEffect,useRef,useState} from 'react'
import type {CircleEvmEmailSession} from '../../../lib/circleEvmEmailWallet'
import {readPocketGift} from '../../api/pocketGiftsClient'
import {PocketGiftLanding} from './PocketGiftExperience'
import PocketGiftClaimFlow from './PocketGiftClaimFlow'
import {parseGiftLink,type GiftView} from './pocketGift'

type Props={onDone?():void;onBack?():void;onOpenApp?():void;link:string;identityKey:string;authenticated:boolean;signIn():void;getAccessToken():Promise<string|null>;getSession():Promise<CircleEvmEmailSession>}
/** Integration surface. Capability stays in memory/URL; never localStorage or analytics. */
export default function PocketGiftRedeem(props:Props){
 return <Redeem key={props.link} {...props}/>
}
function Redeem(props:Props){
 const {link,authenticated,identityKey}=props
 const [gift,setGift]=useState<GiftView|null>(null),[error,setError]=useState(''),[sheet,setSheet]=useState(false),[revision,setRevision]=useState(0)
 const wantsClaim=useRef(false)
 useEffect(()=>{
  let current=true
  const parsed=parseGiftLink(link)
  if(!parsed){setError('Open a valid Pocket gift link.');return}
  setError('')
  void readPocketGift(parsed.id).then(value=>{if(current)setGift(value)}).catch(()=>{if(current)setError('This gift could not be loaded. Try again shortly.')})
  return()=>{current=false}
 },[link,revision])
 useEffect(()=>{if(authenticated&&wantsClaim.current){wantsClaim.current=false;setSheet(true)}if(!authenticated)setSheet(false)},[authenticated,identityKey])
 if(!gift)return <main className="mx-auto min-h-[100dvh] w-full max-w-md px-6 pb-8 pt-[max(1.5rem,var(--pocket-safe-top))] text-center text-gray-950 dark:text-white">{props.onBack&&<div className="mb-8"><PocketFlowHeader title="Claim a gift" onBack={props.onBack}/></div>}{error?<><p role="alert">{error}</p><button className="pocket-cta-primary mt-6 w-full" onClick={()=>setRevision(value=>value+1)}>Try again</button></>:<div role="status" aria-label="Loading gift" className="animate-pulse space-y-6"><div className="aspect-[3/2] rounded-[28px] bg-gray-200 dark:bg-[#171717]"/><div className="mx-auto h-7 w-40 rounded bg-gray-200 dark:bg-[#171717]"/><div className="h-12 rounded-xl bg-gray-200 dark:bg-[#171717]"/></div>}</main>
 return <><PocketGiftLanding onDone={gift.status==='claimed'&&!sheet?props.onDone:undefined} onBack={gift.status==='claimed'?undefined:props.onBack} gift={gift} onRedeem={()=>{if(props.onOpenApp){props.onOpenApp();return}if(authenticated)setSheet(true);else{wantsClaim.current=true;props.signIn()}}}/>
  {sheet&&authenticated&&<PocketGiftClaimFlow onConfirmed={()=>setGift(value=>value?{...value,status:'claimed'}:value)} onSuccessDone={props.onDone} link={link} gift={gift} identityKey={identityKey} getAccessToken={props.getAccessToken} getSession={props.getSession} onDone={()=>{setSheet(false);setRevision(value=>value+1)}}/>}
 </>
}
