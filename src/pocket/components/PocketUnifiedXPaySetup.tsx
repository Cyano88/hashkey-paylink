import PocketXPayAssetList from './PocketXPayAssetList'
import {useCallback,useEffect,useRef,useState} from 'react'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import usePocketStockWallet from '../hooks/usePocketStockWallet'
import usePocketPosPageController from '../controllers/usePocketPosPageController'
import {PocketPosSetupPanel} from '../features/move/PocketPosPanels'
import PocketVerifiedNameGate from './PocketVerifiedNameGate'
import PocketRecentActivitySkeleton from './PocketRecentActivitySkeleton'
import {stockAssets,stockUsdc} from '../lib/pocketXStocksWallet'
import {xpayRequest} from '../api/pocketXPayClient'

type Props={setupKey?:string;name:string;onCreated:(id:string)=>void|Promise<void>}
export function XPayBankSetup({name,onCreated,setupKey}:Props){
 const identity=usePocketIdentity(),profile=usePocketProfile(identity)
 const verifiedName=profile.profile?.nameStatus==='bank_resolved'?profile.profile.resolvedName:''
 const step=useCallback(()=>{},[])
 const pos=usePocketPosPageController({...identity,setupKey,profile:profile.profile,profileReady:Boolean(verifiedName&&identity.email),verifiedIdentityName:verifiedName,routeStep:'setup',onStepChange:step})
 const initialized=useRef(false),reported=useRef(''),callback=useRef(onCreated);callback.current=onCreated
 const [linkError,setLinkError]=useState(''),[linkBusy,setLinkBusy]=useState(false)
 const finish=async(id:string)=>{setLinkBusy(true);setLinkError('');try{await callback.current(id)}catch(e){setLinkError(e instanceof Error?e.message:'Could not attach the receiving account. Try again.')}finally{setLinkBusy(false)}}
 useEffect(()=>{if(!initialized.current){initialized.current=true;pos.controller.actions.setMerchantName(name)}},[name,pos.controller.actions])
 useEffect(()=>{const id=pos.merchant?.merchant_id;if(id&&reported.current!==id){reported.current=id;void finish(id)}},[pos.merchant?.merchant_id])
 if(pos.merchant?.merchant_id)return <div className="space-y-4"><p className="text-xs text-gray-500">{linkError||'Adding receiving account...'}</p>{linkError&&<button className="pocket-cta-primary w-full shrink-0" disabled={linkBusy} onClick={()=>void finish(pos.merchant!.merchant_id)}>Try again</button>}</div>
 if(!profile.loaded&&!profile.profile)return <PocketRecentActivitySkeleton/>
 if(!verifiedName)return <PocketVerifiedNameGate/>
 return <PocketPosSetupPanel controller={pos.controller} showName={false} networkOptions={[{key:'base',label:'Base'}]} instantBankPayout bankInstitutions={pos.institutions} bankInstitutionsBusy={pos.institutionsBusy} bankCode={pos.bankCode} bankAccount={pos.bankAccount} bankAccountName={pos.bankAccountName} bankVerified={pos.bankVerified} bankVerifyBusy={pos.bankVerifyBusy} error={pos.error}/>
}
export function XPayWalletSetup({name,onCreated,setupKey,reservedAssets=[],initialAssets=[]}:Props&{reservedAssets?:string[];initialAssets?:string[]}){
 const wallet=usePocketStockWallet(),{getAccessToken}=usePocketIdentity()
 const [tokens,setTokens]=useState<string[]>(()=>[stockUsdc,...stockAssets].filter(a=>initialAssets.includes(a.symbol)).map(a=>a.address.toLowerCase())),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const guard=useRef(false),alive=useRef(true),requestKey=useRef(crypto.randomUUID())
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const assets=[stockUsdc,...stockAssets]
 const fits=(address:string)=>new Set([...reservedAssets,...assets.filter(a=>tokens.includes(a.address.toLowerCase())||a.address.toLowerCase()===address).map(a=>a.symbol)]).size<=3
 const save=async()=>{if(guard.current||!wallet.address)return;guard.current=true;setBusy(true);setError('');try{const data=await xpayRequest(getAccessToken,{action:'merchant-save',create:true,key:setupKey||requestKey.current,wallet:wallet.address,name,tokens});if(!data.merchant)throw Error('Receiving assets could not be saved.');if(alive.current)await onCreated(data.merchant.id)}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Please try again.')}finally{guard.current=false;if(alive.current)setBusy(false)}}
 return <div className="flex min-h-0 flex-1 flex-col gap-4"><p className="shrink-0 text-xs text-gray-500">Choose up to 3 assets in total for this QR.</p><PocketXPayAssetList selected={tokens} onChange={setTokens} disabled={busy} fits={fits} snapshot={wallet.displaySnapshot||wallet.snapshot}/>{wallet.address?<button className="pocket-cta-primary w-full shrink-0" disabled={busy||!tokens.length} onClick={()=>void save()}>{busy?'Saving…':'Continue'}</button>:<button className="pocket-cta-primary w-full shrink-0" disabled={!wallet.ready||wallet.busy} onClick={wallet.connect}>Open wallet</button>}{(error||wallet.error)&&<p role="alert" className="text-xs text-red-500">{error||wallet.error}</p>}</div>
}
