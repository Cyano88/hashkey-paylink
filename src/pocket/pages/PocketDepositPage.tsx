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
import { cn } from '../../lib/utils'

type DepositNetwork = 'base' | 'arbitrum' | 'solana'
const NETWORKS = [
  { key: 'base', label: 'Base', logo: '/brand/base-logo.jpeg', dark: false },
  { key: 'arbitrum', label: 'Arbitrum', logo: '/brand/arbitrum-logo.jpeg', dark: false },
  { key: 'solana', label: 'Solana', logo: '/brand/solana-logo.jpeg', dark: true },
] as const

function navPath(tab: PocketNavTab) {
  if (tab === 'profile') return POCKET_ROUTES.profile
  if (tab === 'bills') return pocketPathFor({ section: 'bills', view: 'airtime' })
  if (tab === 'activity') return POCKET_ROUTES.activity
  return POCKET_ROUTES.home
}

export default function PocketDepositPage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const [network, setNetwork] = useState<DepositNetwork>(() => {
    const saved = window.localStorage.getItem('pocket.home.network')
    return saved === 'arbitrum' || saved === 'solana' ? saved : 'base'
  })
  const [opening, setOpening] = useState(false)
  const [copied, setCopied] = useState(false)
  const onWalletReady = useCallback((key: DepositNetwork, wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => wallets.setWallets(current => ({ ...current, [key]: wallet })), [wallets.setWallets])
  const controller = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const wallet = wallets.wallets[network]
  useEffect(() => { window.localStorage.setItem('pocket.home.network', network) }, [network])
  const openWallet = async () => { setOpening(true); try { await controller.ensureWallet(network) } finally { setOpening(false) } }
  const copy = async () => { if (!wallet?.address) return; await navigator.clipboard.writeText(wallet.address); setCopied(true); window.setTimeout(() => setCopied(false), 1200) }
  if (authenticated && !wallets.resolved) return <PocketLoadingState active="home" />
  return <PocketRouteShell active="home" onSelect={tab => navigate(POCKET_BASE_PATH + navPath(tab))}>
    <PocketFlowHeader title="Deposit USDC" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
    <section className="rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/[0.07] dark:bg-white/[0.035]">
      <div className="grid grid-cols-3 gap-3">{NETWORKS.map(item => <button key={item.key} type="button" onClick={() => setNetwork(item.key)} className={cn('flex min-h-14 items-center justify-center rounded-2xl border transition', network === item.key ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950' : 'border-gray-100 dark:border-white/10')} aria-label={'Deposit on ' + item.label}><img src={item.logo} alt="" className={cn('h-7 w-7 rounded-md object-cover grayscale contrast-200', item.dark && 'invert', network !== item.key && 'dark:invert')} /></button>)}</div>
      {wallet?.address ? <div className="mt-7 text-center">
        <div className="mx-auto w-fit rounded-[24px] bg-white p-4"><QRCodeSVG value={wallet.address} size={164} /></div>
        <p className="mt-5 break-all text-xs font-semibold leading-5 text-gray-600 dark:text-gray-300">{wallet.address}</p>
        <button type="button" onClick={() => void copy()} className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gray-950 px-6 text-sm font-bold text-white dark:bg-white dark:text-gray-950">{copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy address'}</button>
        <p className="mt-4 text-[10px] leading-4 text-gray-400">Send only native USDC on {NETWORKS.find(item => item.key === network)?.label} to this address.</p>
      </div> : <button type="button" onClick={() => void openWallet()} disabled={opening} className="mt-7 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-bold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">{opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}Open deposit wallet</button>}
    </section>
  </PocketRouteShell>
}
