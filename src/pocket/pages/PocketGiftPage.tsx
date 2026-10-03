import usePocketStockWallet from '../hooks/usePocketStockWallet'
import {xStockPath} from '../lib/pocketRail'
import type {GiftWalletSession} from '../api/pocketGiftsClient'
import {useCallback,useEffect,useState} from 'react'
import {useLocation,useNavigate} from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWalletController from '../controllers/usePocketWalletController'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketEmailLogin from '../components/PocketEmailLogin'
import PocketGetApp from '../components/PocketGetApp'
import PocketGiftRedeem from '../features/gifts/PocketGiftRedeem'
import {giftLink,parseGiftLink} from '../features/gifts/pocketGift'
import {readPocketGift} from '../api/pocketGiftsClient'
import {isPocketNativeRuntime,POCKET_ORIGIN,POCKET_ROUTES} from '../lib/pocketRoutes'

export default function PocketGiftPage(){
 const location=useLocation(),navigate=useNavigate(),identity=usePocketIdentity()
 const stocks=usePocketStockWallet(),[stockGift,setStockGift]=useState(false)
 const [login,setLogin]=useState(false),[install,setInstall]=useState(false)
 const link=POCKET_ORIGIN+location.pathname+location.search+location.hash
 const wallet=usePocketWalletController({authenticated:identity.authenticated,email:identity.email,getAccessToken:identity.getAccessToken})
 useEffect(()=>{if(identity.authenticated)setLogin(false)},[identity.authenticated])
 const getSession=useCallback(async():Promise<GiftWalletSession>=>{
  const parsed=parseGiftLink(link)
  if(!parsed)throw Error('Open a valid gift link.')
  const gift=await readPocketGift(parsed.id)
  if(gift.network==='xlayer'){setStockGift(true);if(!stocks.address)throw Error('Open your XStocks wallet to claim this gift.');return {chain:'xlayer',wallet:{address:stocks.address},userToken:'xstocks',signGift:stocks.signGift,recoverFunding:stocks.recoverGiftFunding,reconcile:stocks.reconcileGift}}
  if(gift.network==='solana')throw Error('This gift network is not enabled.')
  const account=await wallet.ensureWallet(gift.network)
  if(!account)throw Error('Open your Pocket wallet to claim this gift.')
  return wallet.getEvmSession(gift.network,account.address)
 },[link,wallet.ensureWallet,wallet.getEvmSession,stocks.address,stocks.signGift])
 const openApp=()=>{
  const parsed=parseGiftLink(link)
  if(!parsed)return
  setInstall(true)
  // Bearer credentials must never enter a hijackable custom URI scheme.
  window.location.href=giftLink(parsed.id,parsed.secret)
 }
 return <div className="min-h-[100dvh] bg-white dark:bg-black" data-pocket-gift-surface data-pocket-colour-scope={stockGift?'xstocks':'stablecoins'}>
  <PocketGiftRedeem onGiftLoaded={gift=>setStockGift(gift.network==='xlayer')} inApp={isPocketNativeRuntime()} onDone={isPocketNativeRuntime()?()=>navigate(stockGift?xStockPath('home'):POCKET_ROUTES.home,{replace:true}):undefined} onBack={isPocketNativeRuntime()?()=>navigate('/gifts/claim'+(stockGift?'?rail=xstocks':''),{replace:true}):undefined} link={link} identityKey={identity.user?.id||''} authenticated={identity.authenticated} signIn={()=>setLogin(true)} getAccessToken={identity.getAccessToken} getSession={getSession} onOpenApp={isPocketNativeRuntime()?undefined:openApp}/>
  {login&&!identity.authenticated&&<PocketBottomSheet title="Sign in to Pocket" onClose={()=>setLogin(false)} dismissOnBackdrop={false}><PocketEmailLogin/></PocketBottomSheet>}
  {install&&<PocketBottomSheet title="Redeem in Pocket" onClose={()=>setInstall(false)} dismissOnBackdrop={false}><p className="text-center text-sm text-gray-500 dark:text-gray-400">After installing Pocket, reopen this gift link to claim it.</p><PocketGetApp/><button className="pocket-cta-primary mt-5 w-full" onClick={openApp}>Open Pocket</button></PocketBottomSheet>}
 </div>
}
