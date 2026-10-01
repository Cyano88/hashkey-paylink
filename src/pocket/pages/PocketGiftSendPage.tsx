import PocketGiftList from '../features/gifts/PocketGiftList'
import usePocketGiftConfig from '../hooks/usePocketGiftConfig'
import PocketGiftCreateSkeleton from '../features/gifts/PocketGiftCreateSkeleton'
import PocketGiftShare from '../features/gifts/PocketGiftShare'
import {useEffect,useMemo,useRef,useState} from 'react'
import {useGiftAutoRefresh} from '../features/gifts/useGiftAutoRefresh'
import {useNavigate,useSearchParams} from 'react-router-dom'
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
import {approvePocketGift,createPocketGift,recoverPocketGiftFunding,preparePocketGiftFunding,preparePocketGiftRefund,readPocketGiftOwner} from '../api/pocketGiftsClient'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketConfirmationDetails from '../components/PocketConfirmationDetails'
import PocketEmailLogin from '../components/PocketEmailLogin'
import PocketPaymentSecurityGate from '../components/PocketPaymentSecurityGate'
import {requestPocketPaymentApproval} from '../lib/pocketPaymentApproval'
import {isPocketNativeRuntime,POCKET_ROUTES} from '../lib/pocketRoutes'

export default function PocketGiftSendPage(){
 const identity=usePocketIdentity(),navigate=useNavigate()
 if(!identity.ready)return <PocketGiftCreateSkeleton onBack={()=>navigate(POCKET_ROUTES.transfer)}/>
 if(!identity.authenticated)return <main className="mx-auto max-w-md p-6"><PocketEmailLogin/></main>
 return <PocketPaymentSecurityGate email={identity.email} getAccessToken={identity.getAccessToken}><Sender key={identity.user!.id} owner={identity.user!.id} email={identity.email} getAccessToken={identity.getAccessToken}/></PocketPaymentSecurityGate>
}
function Sender({owner,email,getAccessToken}:{owner:string;email:string;getAccessToken():Promise<string|null>}){
 const navigate=useNavigate(),[params,setParams]=useSearchParams(),wallet=usePocketWalletController({authenticated:true,email,getAccessToken})
 const {config,loading,error:configError,retry:retryConfig}=usePocketGiftConfig(owner,true,getAccessToken)
 const enabled=config?.sendEnabled===true
 const [error,setError]=useState(''),[draft,setDraft]=useState<SavedGiftDraft|null>(null),[sheet,setSheet]=useState(false),[revision,setRevision]=useState(0)
 const [state,setState]=useState<GiftFundingState>({phase:'draft',message:''})
 const vault=useMemo(()=>isPocketNativeRuntime()?nativeGiftDraftVault(owner):null,[owner])
 const flow=useRef<ReturnType<typeof createGiftFundingFlow>|null>(null)
 const callbacks=useRef({wallet,getAccessToken});callbacks.current={wallet,getAccessToken}
 useEffect(()=>()=>{flow.current?.dispose()},[vault])
 useEffect(()=>{
  if(!draft||!vault)return
  let session:CircleEvmEmailSession|undefined
  const token=async()=>{const value=await callbacks.current.getAccessToken();if(!value)throw Error('Sign in to continue.');return value}
  const controller=createGiftFundingFlow({draft,save:vault.save,create:async value=>{if(!value.giftId)await callbacks.current.wallet.ensureWallet('base');return createPocketGift({draft:value,accessToken:await token()})},status:async id=>{const result=await readPocketGiftOwner({id,accessToken:await token()});return result.fundingExpired?'expired_unfunded':result.gift.status},security:requestPocketPaymentApproval,
   recoverFundingQuiet:async id=>session?recoverPocketGiftFunding({id,session,accessToken:await token()}):{retryAllowed:false},
   recoverFunding:async id=>{const account=await callbacks.current.wallet.ensureWallet('base');if(!account)throw Error('Open your Base wallet.');const recoverySession=await callbacks.current.wallet.getEvmSession('base',account.address);return recoverPocketGiftFunding({id,session:recoverySession,accessToken:await token()})},
   prepare:async id=>{const account=await callbacks.current.wallet.ensureWallet('base');if(!account)throw Error('Open your Base wallet.');session=await callbacks.current.wallet.getEvmSession('base',account.address);return preparePocketGiftFunding({id,session,accessToken:await token()})},prepareRefund:async id=>{const account=await callbacks.current.wallet.ensureWallet('base');if(!account)throw Error('Open your Base wallet.');session=await callbacks.current.wallet.getEvmSession('base',account.address);return preparePocketGiftRefund({id,session,accessToken:await token()})},approve:approval=>approvePocketGift({approval,session:session!}),changed:setState})
  flow.current=controller;void controller.review()
  return()=>controller.dispose()
 },[draft,vault])
 useGiftAutoRefresh(sheet&&state.phase==='unconfirmed',async()=>{await flow.current?.refresh()})
 const busy=['preparing','approval','checking'].includes(state.phase)
 async function begin(value:GiftDraft){if(!vault||!enabled||busy)return;setError('');try{const next=await vault.create(value.amount,value.message);setState({phase:'preparing',message:'Preparing your gift.'});setDraft(next);setSheet(true)}catch{setError('Could not securely save this gift. No funding was started.')}}
 const listOpen=params.get('view')==='gifts',archived=params.get('archived')==='1'
 const close=()=>{setSheet(false);setDraft(null);setRevision(n=>n+1)}
 const openSaved=(id:string)=>{if(busy||!vault)return;setError('');void vault.load(id).then(next=>{setState({phase:'preparing',message:'Checking your gift.'});setDraft(next);setSheet(true)}).catch(()=>setError('Gift recovery data could not be opened.'))}
 const back=()=>{if(!busy)navigate(POCKET_ROUTES.transfer)}
 if(loading&&!listOpen)return <PocketGiftCreateSkeleton onBack={back}/>
 if(!vault)return <main className="mx-auto max-w-md p-6"><PocketFlowHeader title="Send a gift" onBack={back}/><p className="mt-6 text-sm">Create gifts in the Pocket app.</p></main>
 return <div data-pocket-colour-scope="stablecoins" className="min-h-[100dvh] bg-white text-gray-950 dark:bg-black dark:text-white">
  {listOpen?<PocketGiftList owner={owner} vault={vault} getAccessToken={getAccessToken} onOpen={openSaved} revision={revision} archived={archived} onBack={()=>setParams(archived?{view:'gifts'}:{})} onArchived={()=>setParams({view:'gifts',archived:'1'})}/>:enabled?<PocketGiftCreate key={revision} onYourGifts={()=>setParams({view:'gifts'})} networks={['base']} onContinue={begin} onBack={back}/>:<main className="mx-auto max-w-md p-6"><PocketFlowHeader title="Send a gift" onBack={back}/><p className="mt-6 text-sm text-gray-500">{configError||'Base gifts are not available yet.'}</p>{configError&&<button className="pocket-cta-primary mt-6 w-full" onClick={retryConfig}>Try again</button>}</main>}
  {error&&<p role="alert" className="mx-auto max-w-md px-6 text-sm text-red-500">{error}</p>}

  {sheet&&draft&&<PocketBottomSheet title={state.phase==='available'?'Gift ready':'Send a gift'} onClose={close} dismissOnBackdrop={false} dismissible={!busy}>
   {state.phase==='available'?<><p className="mt-3 flex items-center justify-center gap-2 text-xl font-bold"><CheckCircleIcon className="h-5 w-5 text-green-600"/>{draft.amount} USDC</p>{flow.current?.draft.giftId&&<><div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={giftLink(flow.current.draft.giftId,draft.secret)} size={128}/></div><PocketGiftShare key={flow.current.draft.giftId} id={flow.current.draft.giftId} secret={draft.secret} getAccessToken={getAccessToken}/></>}<p className="mt-3 text-center text-xs text-gray-500">Anyone with the code or link can claim this gift.</p></>:
    <>{state.review&&<PocketConfirmationDetails amount={draft.amount+' USDC'} rows={[["Network","Base"],["Platform fee",giftUsdc(state.review.platformFee)],["Total",giftUsdc(state.review.totalDebit)],["Expires",new Date(Number(draft.expiresAt)*1000).toLocaleDateString()]]}/>}
     {state.message&&<p role="status" className="my-4 text-center text-sm text-gray-500">{state.message}</p>}
     {state.phase==='review'&&<p className="my-3 text-center text-xs text-gray-500">The recipient gets the full gift amount. If unclaimed after expiry, you can recover the gift amount. The creation fee is not refunded.</p>}
     <button disabled={busy||state.phase==='review'&&!enabled} className="pocket-cta-primary mt-4 w-full disabled:opacity-50" onClick={()=>state.phase==='review'?void flow.current?.fund():state.phase==='draft'?void flow.current?.review():state.phase==='unconfirmed'?close():state.phase==='expired'?void flow.current?.refund():close()}>{busy?state.phase==='approval'?'Confirm in wallet':'Checking':state.phase==='review'?'Fund gift':state.phase==='draft'?'Try again':state.phase==='unconfirmed'?'Done':state.phase==='expired'?'Refund gift':'Done'}</button>
    </>}
  </PocketBottomSheet>}
 </div>
}
