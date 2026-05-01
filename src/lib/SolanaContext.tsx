import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

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
  connect:     () => Promise<void>
  disconnect:  () => void
}

const Ctx = createContext<SolanaCtx>({
  address: null, isConnecting: false,
  connect: async () => {}, disconnect: () => {},
})

function getProvider(): SolanaProvider | null {
  return window.phantom?.solana ?? window.solana ?? window.solflare ?? null
}

export function SolanaProvider({ children }: { children: ReactNode }) {
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

  return <Ctx.Provider value={{ address, isConnecting, connect, disconnect }}>{children}</Ctx.Provider>
}

export function useSolana() { return useContext(Ctx) }
