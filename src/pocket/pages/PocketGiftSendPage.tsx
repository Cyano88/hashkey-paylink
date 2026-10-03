import {formatUnits} from 'viem'
import usePocketStockWallet from '../hooks/usePocketStockWallet'
import {sameStockGiftAsset} from '../api/pocketStockGiftAsset'
import {xStockPath} from '../lib/pocketRail'
import PocketGiftList from '../features/gifts/PocketGiftList'
import usePocketGiftConfig from '../hooks/usePocketGiftConfig'
import PocketGiftCreateSkeleton from '../features/gifts/PocketGiftCreateSkeleton'
import PocketGiftShare from '../features/gifts/PocketGiftShare'
import {useEffect,useMemo,useRef,useState} from 'react'
import {useGiftAutoRefresh} from '../features/gifts/useGiftAutoRefresh'
import {useNavigate,useSearchParams} from 'react-router-dom'
import {QRCodeSVG} from 'qrcode.react'
import {CheckCircleIcon} from '@heroicons/react/24/solid'
import type {GiftWalletSession} from '../api/pocketGiftsClient'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWalletController from '../controllers/usePocketWalletController'
import PocketGiftCreate from '../features/gifts/PocketGiftCreate'
import {createGiftFundingFlow,type GiftFundingState} from '../features/gifts/giftFundingController'
import {giftLink,giftAssetUnits,type GiftDraft} from '../features/gifts/pocketGift'
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
 const stocks=usePocketStockWallet(),stockRail=params.get('rail')==='xstocks'
 const enabled=stockRail?!!config?.stockAssets?.length:config?.sendEnabled===true
 const maxRecipients=stockRail?config?.stockMaxRecipients||1:config?.maxRecipients||1
 const [error,setError]=useState(''),[draft,setDraft]=useState<SavedGiftDraft|null>(null),[sheet,setSheet]=useState(false),[revision,setRevision]=useState(0)
 const [state,setState]=useState<GiftFundingState>({phase:'draft',message:''})
 const vault=useMemo(()=>isPocketNativeRuntime()?nativeGiftDraftVault(owner):null,[owner])
 const flow=useRef<ReturnType<typeof createGiftFundingFlow>|null>(null)
 const callbacks=useRef({wallet,stocks,getAccessToken});callbacks.current={wallet,stocks,getAccessToken}
 useEffect(()=>()=>{flow.current?.dispose()},[vault])
 useEffect(()=>{
  if(!draft||!vault)return
  let session:GiftWalletSession|undefined
  const getSession=async():Promise<GiftWalletSession>=>{
   if(draft.network==='xlayer'){const stock=callbacks.current.stocks;if(!stock.address)throw Error('Open your XStocks wallet.');return {chain:'xlayer',wallet:{address:stock.address},userToken:'xstocks',signGift:stock.signGift,recoverFunding:stock.recoverGiftFunding,reconcile:stock.reconcileGift}}
   const account=await callbacks.current.wallet.ensureWallet('base');if(!account)throw Error('Open your Base wallet.');return callbacks.current.wallet.getEvmSession('base',account.address)
  }
  const token=async()=>{const value=await callbacks.current.getAccessToken();if(!value)throw Error('Sign in to continue.');return value}
  const controller=createGiftFundingFlow({draft,save:vault.save,create:async value=>{if(!value.giftId)await getSession();return createPocketGift({draft:value,accessToken:await token()})},status:async id=>{const result=await readPocketGiftOwner({id,accessToken:await token()});if(draft.asset){if(result.proof?.funding)callbacks.current.stocks.reconcileGift(id,'funding',result.proof.funding);if(result.proof?.refund)callbacks.current.stocks.reconcileGift(id,'refund',result.proof.refund)}return result.fundingExpired?'expired_unfunded':result.gift.status},security:requestPocketPaymentApproval,
   recoverFundingQuiet:async id=>{if(!session&&draft.asset)session=await getSession();return session?recoverPocketGiftFunding({id,session,accessToken:await token()}):{retryAllowed:false}},
   recoverFunding:async id=>{const recoverySession=await getSession();return recoverPocketGiftFunding({id,session:recoverySession,accessToken:await token()})},
   prepare:async id=>{session=await getSession();return preparePocketGiftFunding({id,session,accessToken:await token()})},prepareRefund:async id=>{session=await getSession();return preparePocketGiftRefund({id,session,accessToken:await token()})},approve:approval=>{
    if(draft.asset){const intent=approval.execution;if(!intent||intent.id!==flow.current?.draft.giftId||!sameStockGiftAsset(intent.asset,draft.asset)||intent.signer.toLowerCase()!==draft.signer.toLowerCase()||intent.expiresAt!==draft.expiresAt||intent.recipients!==draft.claims||formatUnits(giftAssetUnits(draft.amount,draft.asset)/BigInt(draft.claims!),draft.asset.decimals)!==intent.amountPerRecipient)throw Error('Gift approval changed. Review the gift again.')}
    return approvePocketGift({approval,session:session!})
   },changed:setState})
  flow.current=controller;void controller.review()
  return()=>controller.dispose()
 },[draft,vault])
 useGiftAutoRefresh(sheet&&state.phase==='unconfirmed',async()=>{await flow.current?.refresh()})
 const displayGift=(units:string)=>formatUnits(BigInt(units),draft?.asset?.decimals??6)+' '+(draft?.asset?.symbol||'USDC')
 const busy=['preparing','approval','checking'].includes(state.phase)
 async function begin(value:GiftDraft){if(value.claims>maxRecipients){setError('Multi-recipient gifts are not enabled yet.');return}if(!vault||!enabled||busy)return;setError('');try{const next=await vault.create(value.amount,value.message,value.claims,value.asset);setState({phase:'preparing',message:'Preparing your gift.'});setDraft(next);setSheet(true)}catch{setError('Could not securely save this gift. No funding was started.')}}
 const giftParams=(value:Record<string,string>)=>setParams({...value,...(stockRail?{rail:'xstocks'}:{})})
 const listOpen=params.get('view')==='gifts',archived=params.get('archived')==='1'
 const close=()=>{setSheet(false);setDraft(null);setRevision(n=>n+1)}
 const openSaved=(id:string)=>{if(busy||!vault)return;setError('');void vault.load(id).then(next=>{setState({phase:'preparing',message:'Checking your gift.'});setDraft(next);setSheet(true)}).catch(()=>setError('Gift recovery data could not be opened.'))}
 const back=()=>{if(!busy)navigate(POCKET_ROUTES.transfer)}
 if(loading&&!listOpen)return <PocketGiftCreateSkeleton onBack={back}/>
 if(!vault)return <main className="mx-auto max-w-md p-6"><PocketFlowHeader title="Send a gift" onBack={back}/><p className="mt-6 text-sm">Create gifts in the Pocket app.</p></main>
 return <div data-pocket-colour-scope={stockRail?'xstocks':'stablecoins'} className="min-h-[100dvh] bg-white text-gray-950 dark:bg-black dark:text-white">
  {listOpen?<PocketGiftList rail={stockRail?'xstocks':'stablecoins'} owner={owner} vault={vault} getAccessToken={getAccessToken} onOpen={openSaved} revision={revision} archived={archived} onBack={()=>giftParams(archived?{view:'gifts'}:{})} onArchived={()=>giftParams({view:'gifts',archived:'1'})}/>:enabled?<PocketGiftCreate key={revision} onYourGifts={()=>giftParams({view:'gifts'})} networks={stockRail?['xlayer']:['base']} assets={stockRail?config?.stockAssets:undefined} maxRecipients={maxRecipients} onContinue={begin} onBack={back}/>:<main className="mx-auto max-w-md p-6"><PocketFlowHeader title="Send a gift" onBack={back}/><p className="mt-6 text-sm text-gray-500">{configError||(stockRail?'Stock gifts are not available yet.':'Base gifts are not available yet.')}</p>{configError&&<button className="pocket-cta-primary mt-6 w-full" onClick={retryConfig}>Try again</button>}</main>}
  {error&&<p role="alert" className="mx-auto max-w-md px-6 text-sm text-red-500">{error}</p>}

  {sheet&&draft&&<PocketBottomSheet title={state.phase==='available'?'Gift ready':'Send a gift'} onClose={close} dismissOnBackdrop={false} dismissible={!busy}>
   {state.phase==='available'?<><p className="mt-3 flex items-center justify-center gap-2 text-xl font-bold"><CheckCircleIcon className="h-5 w-5 text-green-600"/>{draft.amount} {draft.asset?.symbol||'USDC'}</p>{flow.current?.draft.giftId&&<><div className="mx-auto mt-5 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={giftLink(flow.current.draft.giftId,draft.secret)} size={128}/></div><PocketGiftShare key={flow.current.draft.giftId} id={flow.current.draft.giftId} secret={draft.secret} getAccessToken={getAccessToken}/></>}<p className="mt-3 text-center text-xs text-gray-500">Anyone with the code or link can claim this gift.</p></>:
    <>{state.review&&<PocketConfirmationDetails amount={draft.amount+' '+(draft.asset?.symbol||'USDC')} rows={[["Network",draft.asset?"X Layer":"Base"],...(draft.version===2?[["Recipients",String(draft.claims)] as [string,string],["Each recipient",displayGift(String(BigInt(state.review.principal)/BigInt(draft.claims!)))] as [string,string]]:[]),["Platform fee",displayGift(state.review.platformFee)],["Total",displayGift(state.review.totalDebit)],["Expires",new Date(Number(draft.expiresAt)*1000).toLocaleDateString()]]}/>}
     {state.message&&<p role="status" className="my-4 text-center text-sm text-gray-500">{state.message}</p>}
     {state.phase==='review'&&<p className="my-3 text-center text-xs text-gray-500">The recipient gets the full gift amount. If unclaimed after expiry, you can recover the gift amount. The creation fee is not refunded.</p>}
     <button disabled={busy||state.phase==='review'&&!enabled} className="pocket-cta-primary mt-4 w-full disabled:opacity-50" onClick={()=>state.phase==='review'?void flow.current?.fund():state.phase==='draft'?void flow.current?.review():state.phase==='unconfirmed'?close():state.phase==='expired'?void flow.current?.refund():close()}>{busy?state.phase==='approval'?'Confirm in wallet':'Checking':state.phase==='review'?'Fund gift':state.phase==='draft'?'Try again':state.phase==='unconfirmed'?'Done':state.phase==='expired'?'Refund gift':'Done'}</button>
    </>}
  </PocketBottomSheet>}
 </div>
}
