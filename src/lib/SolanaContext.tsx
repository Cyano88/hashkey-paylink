import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import {
  useSignTransaction as usePrivySolanaSignTransaction,
  useWallets as usePrivySolanaWallets,
  type ConnectedStandardSolanaWallet,
} from '@privy-io/react-auth/solana'
import { Transaction } from '@solana/web3.js'
import { PRIVY_AUTH_ENABLED } from './authMode'

// ── Injected provider type (Phantom / Solflare / Backpack) ───────────────────
type SolanaProvider = {
  publicKey: { toString: () => string } | null
  isConnected: boolean
  connect:    (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString: () => string } }>
  disconnect: () => Promise<void>
  signTransaction: <T>(tx: T) => Promise<T>
  on?:  (event: string, cb: (...args: unknown[]) => void) => void
  off?: (event: string, cb: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    solana?:   SolanaProvider
    phantom?:  { solana?: SolanaProvider }
    solflare?: SolanaProvider
  }
}

type SolanaCtx = {
  address:     string | null
  isConnecting: boolean
  connect:     (opts?: { includeEmail?: boolean }) => Promise<void>
  disconnect:  () => void
  signTransaction: (tx: Transaction) => Promise<Transaction>
}

const Ctx = createContext<SolanaCtx>({
  address: null,
  isConnecting: false,
  connect: async () => {},
  disconnect: () => {},
  signTransaction: async (tx) => tx,
})

function getProvider(): SolanaProvider | null {
  return window.phantom?.solana ?? window.solana ?? window.solflare ?? null
}

function LegacySolanaProvider({ children }: { children: ReactNode }) {
  const [address,      setAddress]      = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    const p = getProvider()
    if (!p) return
    // Silently reconnect if already trusted
    p.connect({ onlyIfTrusted: true })
      .then(r => setAddress(r.publicKey.toString()))
      .catch(() => {})

    const onDisconnect = () => setAddress(null)
    const onAccount    = (pk: unknown) => {
      const pub = pk as ({ toString: () => string } | null)
      setAddress(pub?.toString() ?? null)
    }
    p.on?.('disconnect',     onDisconnect)
    p.on?.('accountChanged', onAccount)
    return () => { p.off?.('disconnect', onDisconnect); p.off?.('accountChanged', onAccount) }
  }, [])

  async function connect() {
    const p = getProvider()
    if (!p) { window.open('https://phantom.app', '_blank', 'noopener,noreferrer'); return }
    setIsConnecting(true)
    try {
      const r = await p.connect()
      setAddress(r.publicKey.toString())
    } catch { /* user rejected */ }
    finally { setIsConnecting(false) }
  }

  function disconnect() {
    getProvider()?.disconnect()
    setAddress(null)
  }

  async function signTransaction(tx: Transaction) {
    const p = getProvider()
    if (!p) throw new Error('No Solana wallet found. Install Phantom or Solflare.')
    return p.signTransaction(tx)
  }

  return <Ctx.Provider value={{ address, isConnecting, connect, disconnect, signTransaction }}>{children}</Ctx.Provider>
}

function PrivySolanaProvider({ children }: { children: ReactNode }) {
  const { authenticated, login, logout } = usePrivy()
  const { ready, wallets } = usePrivySolanaWallets()
  const { signTransaction: signPrivyTransaction } = usePrivySolanaSignTransaction()
  const [isConnecting, setIsConnecting] = useState(false)

  const wallet = useMemo(
    () => wallets.find((item) => item.address) ?? null,
    [wallets],
  )
  const address = wallet?.address ?? null

  async function connect(opts?: { includeEmail?: boolean }) {
    setIsConnecting(true)
    try {
      if (!authenticated) {
        login({ loginMethods: ['email'] })
      }
    } finally {
      setIsConnecting(false)
    }
  }

  function disconnect() {
    const maybeWallet = wallet as (ConnectedStandardSolanaWallet & { disconnect?: () => Promise<void> }) | null
    if (maybeWallet?.disconnect) {
      void maybeWallet.disconnect()
      return
    }
    void logout()
  }

  async function signTransaction(tx: Transaction) {
    if (!wallet) throw new Error('Sign in with a Solana wallet to continue.')
    const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false })
    const result = await signPrivyTransaction({
      wallet,
      transaction: bytes,
      chain: 'solana:mainnet',
    })
    return Transaction.from(result.signedTransaction)
  }

  return (
    <Ctx.Provider value={{ address, isConnecting: isConnecting || !ready, connect, disconnect, signTransaction }}>
      {children}
    </Ctx.Provider>
  )
}

export function SolanaProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_AUTH_ENABLED) return <LegacySolanaProvider>{children}</LegacySolanaProvider>
  return <PrivySolanaProvider>{children}</PrivySolanaProvider>
}

export function useSolana() { return useContext(Ctx) }
