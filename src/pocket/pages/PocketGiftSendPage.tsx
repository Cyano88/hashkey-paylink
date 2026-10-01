import {useEffect,useMemo,useRef,useState} from 'react'
import {useNavigate} from 'react-router-dom'
import {QRCodeSVG} from 'qrcode.react'
import {CheckCircleIcon} from '@heroicons/react/24/solid'
import type {CircleEvmEmailSession} from '../../lib/circleEvmEmailWallet'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWalletController from '../controllers/usePocketWalletController'
import PocketGiftCreate from '../features/gifts/PocketGiftCreate'
import {createGiftFundingFlow,giftUsdc,type GiftFundingState} from '../features/gifts/giftFundingController'
import {giftLink,type GiftDraft} from '../features/gifts/pocketGift'
import type {SavedGiftDraft} from '../features/gifts/giftDraftVault'
import {nativeGiftDraftVault} from '../lib/pocketGiftVault'
import {approvePocketGift,createPocketGift,recoverPocketGiftFunding,preparePocketGiftFunding,preparePocketGiftRefund,readPocketGiftConfig,readPocketGiftOwner} from '../api/pocketGiftsClient'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketConfirmationDetails from '../components/PocketConfirmationDetails'
import PocketEmailLogin from '../components/PocketEmailLogin'
import PocketPaymentSecurityGate from '../components/PocketPaymentSecurityGate'
import {requestPocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {isPocketNativeRuntime,POCKET_ROUTES} from '../lib/pocketRoutes'

export default function PocketGiftSendPage(){
 const identity=usePocketIdentity()
 if(!identity.ready)return <div role="status" aria-label="Loading gifts" className="mx-auto mt-16 h-64 max-w-sm animate-pulse rounded-3xl bg-gray-100 dark:bg-[#171717]"/>
 if(!identity.authenticated)return <main className="mx-auto max-w-md p-6"><PocketEmailLogin/></main>
 return <PocketPaymentSecurityGate email={identity.email} getAccessToken={identity.getAccessToken}><Sender key={identity.user!.id} owner={identity.user!.id} email={identity.email} getAccessToken={identity.getAccessToken}/></PocketPaymentSecurityGate>
}
function Sender({owner,email,getAccessToken}:{owner:string;email:string;getAccessToken():Promise<string|null>}){
 const navigate=useNavigate(),wallet=usePocketWalletController({authenticated:true,email,getAccessToken})
 const [enabled,setEnabled]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[draft,setDraft]=useState<SavedGiftDraft|null>(null),[sheet,setSheet]=useState(false),[saved,setSaved]=useState<string[]>([])
 const [state,setState]=useState<GiftFundingState>({phase:'draft',message:''}),[copied,setCopied]=useState(false)
 const vault=useMemo(()=>isPocketNativeRuntime()?nativeGiftDraftVault(owner):null,[owner])
 const flow=useRef<ReturnType<typeof createGiftFundingFlow>|null>(null)
 const callbacks=useRef({wallet,getAccessToken});callbacks.current={wallet,getAccessToken}
 useEffect(()=>{let active=true;void readPocketGiftConfig().then(config=>{if(active)setEnabled(config.sendEnabled)}).catch(()=>{if(active)setError('Gifts are temporarily unavailable.')}).finally(()=>{if(active)setLoading(false)});try{setSaved(vault?.list()||[])}catch{setError('Saved gifts could not be loaded.')}return()=>{active=false;flow.current?.dispose()}},[vault])
 useEffect(()=>{
  if(!draft||!vault)return
  let session:CircleEvmEmailSession|undefined
  const token=async()=>{const value=await callbacks.current.getAccessToken();if(!value)throw Error('Sign in to continue.');return value}
  const controller=createGiftFundingFlow({draft,save:vault.save,create:async value=>{if(!value.giftId)await callbacks.current.wallet.ensureWallet('base');return createPocketGift({draft:value,accessToken:await token()})},status:async id=>(await readPocketGiftOwner({id,accessToken:await token()})).gift.status,security:requestPocketPaymentApproval,
   recoverFunding:async id=>{const account=await callbacks.current.wallet.ensureWallet('base');if(!account)throw Error('Open your Base wallet.');const recoverySession=await callbacks.current.wallet.getEvmSession('base',account.address);return recoverPocketGiftFunding({id,session:recoverySession,accessToken:await token()})},
   prepare:async id=>{const account=await callbacks.current.wallet.ensureWallet('base');if(!account)throw Error('Open your Base wallet.');session=await callbacks.current.wallet.getEvmSession('base',account.address);return preparePocketGiftFunding({id,session,accessToken:await token()})},prepareRefund:async id=>{const account=await callbacks.current.wallet.ensureWallet('base');if(!account)throw Error('Open your Base wallet.');session=await callbacks.current.wallet.getEvmSession('base',account.address);return preparePocketGiftRefund({id,session,accessToken:await token()})},approve:approval=>approvePocketGift({approval,session:session!}),changed:setState})
  flow.current=controller;void controller.review()
  return()=>controller.dispose()
 },[draft,vault])
 const busy=['preparing','approval','checking'].includes(state.phase)
 async function begin(value:GiftDraft){if(!vault||!enabled||busy)return;setError('');try{const next=await vault.create(value.amount,value.message);setSaved(vault.list());setDraft(next);setSheet(true)}catch{setError('Could not securely save this gift. No funding was started.')}}
 const back=()=>{if(!busy)navigate(POCKET_ROUTES.transfer)}
 if(!vault)return <main className="mx-auto max-w-md p-6"><PocketFlowHeader title="Send a gift" onBack={back}/><p className="mt-6 text-sm">Create gifts in the Pocket app.</p></main>
 return <div data-pocket-colour-scope="stablecoins" className="min-h-[100dvh] bg-white text-gray-950 dark:bg-black dark:text-white">
  {enabled?<PocketGiftCreate networks={['base']} onContinue={begin} onBack={back}/>:<main className="mx-auto max-w-md p-6"><PocketFlowHeader title="Send a gift" onBack={back}/>{loading?<div role="status" aria-label="Loading gifts" className="mt-8 h-40 animate-pulse rounded-2xl bg-gray-100 dark:bg-[#171717]"/>:<p className="mt-6 text-sm text-gray-500">Base gifts are not available yet.</p>}</main>}
  {error&&<p role="alert" className="mx-auto max-w-md px-6 text-sm text-red-500">{error}</p>}
  {!!saved.length&&<section className="mx-auto max-w-md px-6 pb-8"><h2 className="text-sm font-semibold">Your saved gifts</h2>{[...saved].reverse().map((id,i)=><button key={id} disabled={busy} className="block min-h-12 w-full border-b border-gray-100 py-3 text-left text-sm dark:border-[#262626]" onClick={()=>void vault.load(id).then(next=>{setDraft(next);setSheet(true);setCopied(false)}).catch(()=>setError('Gift recovery data could not be opened.'))}>Gift {saved.length-i}</button>)}</section>}
  {sheet&&draft&&<PocketBottomSheet title={state.phase==='available'?'Gift ready':'Send a gift'} onClose={()=>setSheet(false)} dismissOnBackdrop={false} dismissible={!busy}>
   {state.phase==='available'?<><CheckCircleIcon className="mx-auto h-14 w-14 text-green-600"/><p className="mt-4 text-center text-2xl font-bold">{draft.amount} USDC</p>{flow.current?.draft.giftId&&<><div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={giftLink(flow.current.draft.giftId,draft.secret)} size={160}/></div><button className="pocket-cta-primary mt-5 w-full" onClick={()=>void navigator.clipboard.writeText(giftLink(flow.current!.draft.giftId!,draft.secret)).then(()=>setCopied(true)).catch(()=>setError('Could not copy the gift link.'))}>{copied?'Copied':'Copy gift link'}</button></>}<p className="mt-3 text-center text-xs text-gray-500">Anyone with this link can claim your gift.</p><button className="mt-3 min-h-11 w-full text-sm" onClick={()=>{setSheet(false);setDraft(null)}}>Done</button></>:
    <>{state.review&&<PocketConfirmationDetails amount={draft.amount+' USDC'} rows={[["Network","Base"],["Platform fee",giftUsdc(state.review.platformFee)],["Total",giftUsdc(state.review.totalDebit)],["Expires",new Date(Number(draft.expiresAt)*1000).toLocaleDateString()]]}/>}
     {state.message&&<p role="status" className="my-4 text-center text-sm text-gray-500">{state.message}</p>}
     {state.phase==='review'&&<p className="my-3 text-center text-xs text-gray-500">The recipient gets the full gift amount. If unclaimed after expiry, you can recover the gift amount. The creation fee is not refunded.</p>}
     <button disabled={busy||state.phase==='review'&&!enabled} className="pocket-cta-primary mt-4 w-full disabled:opacity-50" onClick={()=>state.phase==='review'?void flow.current?.fund():state.phase==='draft'?void flow.current?.review():state.phase==='unconfirmed'?void flow.current?.recheck():state.phase==='expired'?void flow.current?.refund():setSheet(false)}>{busy?state.phase==='approval'?'Confirm in wallet':'Checking':state.phase==='review'?'Fund gift':state.phase==='draft'?'Try again':state.phase==='unconfirmed'?'Check status':state.phase==='expired'?'Refund gift':'Done'}</button>
    </>}
  </PocketBottomSheet>}
 </div>
}
