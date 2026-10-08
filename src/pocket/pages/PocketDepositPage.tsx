import {supportsPocketUsdt} from '../lib/pocketUsdtAssets'
import {pocketUsdtEnabled} from '../lib/pocketBaseUsdt'
import PocketSelect from '../components/PocketSelect'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCheck, Copy, Loader2, Wallet } from '../components/PocketIcons'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketLoadingState from '../components/PocketLoadingState'
import type { PocketNavTab } from '../components/PocketBottomNav'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import usePocketWalletController from '../controllers/usePocketWalletController'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'


type DepositNetwork = 'base' | 'arbitrum' | 'solana' | 'arc' | 'ethereum' | 'polygon'
const NETWORKS = [
  { key: 'ethereum', label: 'Ethereum', logo: '/brand/ethereum-logo.png', dark: false },
  { key: 'polygon', label: 'Polygon', logo: '/brand/polygon-logo.png', dark: false },
  { key: 'base', label: 'Base', logo: '/brand/base-logo.jpeg', dark: false },
  { key: 'arbitrum', label: 'Arbitrum', logo: '/brand/arbitrum-logo.jpeg', dark: false },
  { key: 'arc', label: 'Arc', logo: '/brand/arc-logo.jpeg', dark: true },
  { key: 'solana', label: 'Solana', logo: '/brand/solana-logo.jpeg', dark: true },
] as const

function navPath(tab: PocketNavTab) {
  if (tab === 'profile') return POCKET_ROUTES.profile
  if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'overview' })
  if (tab === 'activity') return POCKET_ROUTES.activity
  return POCKET_ROUTES.home
}

export default function PocketDepositPage({initialNetwork,initialAsset='USDC',embedded=false,onBack}:{initialNetwork?:DepositNetwork;initialAsset?:string;embedded?:boolean;onBack?:()=>void}={}) {
  const [asset,setAsset] = useState(initialAsset)
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const [network, setNetwork] = useState<DepositNetwork>(() => {
    const saved = initialNetwork || window.localStorage.getItem('pocket.home.network')
    if (initialAsset === 'USDT' && !supportsPocketUsdt(saved || '')) return 'base'
    return saved === 'ethereum' || saved === 'polygon' || saved === 'arbitrum' || saved === 'solana' || saved === 'arc' ? saved : 'base'
  })
  const [selected,setSelected]=useState(false)
  const [depositError,setDepositError]=useState('')
  const [opening, setOpening] = useState(false)
  const [copied, setCopied] = useState(false)
  const onWalletReady = useCallback((key: DepositNetwork, wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => wallets.setWallets(current => ({ ...current, [key]: wallet })), [wallets.setWallets])
  const controller = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const wallet = wallets.wallets[network]
  useEffect(() => { window.localStorage.setItem('pocket.home.network', network) }, [network])
  const openWallet = async () => { setOpening(true); try { await controller.ensureWallet(network) } catch {setDepositError('Could not open wallet. Try again.')} finally { setOpening(false) } }
  const copy = async () => { if (!wallet?.address) return; try { await navigator.clipboard.writeText(wallet.address); setCopied(true); window.setTimeout(() => setCopied(false), 1200) } catch { setDepositError('Could not copy address. Try again.') } }
  if (authenticated && !wallets.resolved) return <PocketLoadingState active="home" />
  const content = <>
    <PocketFlowHeader centered title={'Deposit '+asset} onBack={onBack || (() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.receive))} />
    <section className="space-y-5">
      {pocketUsdtEnabled && !embedded && <PocketSelect ariaLabel="Deposit asset" value={asset} options={[{value:'USDC',label:'USDC'},{value:'USDT',label:'USDT'}]} onChange={value=>{setAsset(value);setSelected(false);setCopied(false);setDepositError('');if(value==='USDT'&&!supportsPocketUsdt(network))setNetwork('base')}} />}
      <PocketSelect ariaLabel="Deposit network" showNetworkBalances={asset==='USDC'} value={selected?network:''} initialOpen={embedded} buttonClassName="min-h-14 rounded-xl border-gray-100 bg-white px-4 shadow-sm dark:border-[#262626] dark:bg-[#121212] dark:shadow-none" layer={embedded?170:85} onDismiss={()=>{if(embedded&&!selected)(onBack||(()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.receive)))()}} placeholder="Select network" options={NETWORKS.filter(n=>asset==='USDC'||asset==='USDT'&&supportsPocketUsdt(n.key)||asset!=='USDT'&&n.key===initialNetwork).map(n=>({value:n.key,label:n.label}))} onChange={value=>{setNetwork(value as DepositNetwork);setSelected(true);setCopied(false);setDepositError('')}}/>
      {selected && (wallet?.address ? <div className="mt-7 text-center">
        <div className="mx-auto w-fit rounded-[24px] bg-white p-4"><QRCodeSVG value={wallet.address} size={200} /></div>
        <p className="mt-5 break-all text-xs font-semibold leading-5 text-gray-600 dark:text-gray-300">{wallet.address}</p>
        <button type="button" onClick={() => void copy()} className="pocket-cta-primary mt-5 inline-flex items-center justify-center gap-2 px-6">{copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy address'}</button>
        <p className="mt-4 text-[10px] leading-4 text-gray-500 dark:text-gray-400">Send {asset} on {NETWORKS.find(item => item.key === network)?.label} only.</p>
      </div> : <button type="button" onClick={() => void openWallet()} disabled={opening} className="pocket-cta-primary mt-7 flex w-full items-center justify-center gap-2">{opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}Open deposit wallet</button>)}
      {depositError&&<p role="alert" className="mt-4 text-center text-xs text-gray-500">{depositError}</p>}
    </section>
  </>
  return embedded ? content : <PocketRouteShell active="home" onSelect={tab=>navigate(POCKET_BASE_PATH+navPath(tab))}>{content}</PocketRouteShell>
}
