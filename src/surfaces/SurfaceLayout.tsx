import '../pages/stock-wallet.css'
import { useEffect, useMemo, useState } from 'react'
import { Outlet } from 'react-router-dom'
import type { LayoutOutletContext } from '../Layout'
import type { ChainKey } from '../lib/chains'

export default function SurfaceLayout() {
  useEffect(() => { document.body.setAttribute('data-hosted-stock-wallet','true'); return () => document.body.removeAttribute('data-hosted-stock-wallet') }, [])
  const [selectedNet, setSelectedNet] = useState<ChainKey>('base')
  const [wallet, setWallet] = useState<{ connected: boolean; disconnect?: () => void }>({ connected: false })
  const [success, setSuccess] = useState(false)
  const context = useMemo<LayoutOutletContext>(() => ({
    selectedNet,
    onNetworkSelect: setSelectedNet,
    onPayChainChange: setSelectedNet,
    onPayWalletStateChange: setWallet,
    onPaySuccessVisibleChange: setSuccess,
  }), [selectedNet])
  return <div className="min-h-screen bg-white font-sans text-gray-950 dark:bg-gray-950 dark:text-white">
    {wallet.connected && wallet.disconnect && !success && <div className="mx-auto flex max-w-5xl justify-end px-4 pt-4">
      <button type="button" onClick={wallet.disconnect} className="text-sm font-semibold text-gray-500">Disconnect</button>
    </div>}
    <main className="mx-auto max-w-5xl px-4 py-8"><Outlet context={context} /></main>
  </div>
}
