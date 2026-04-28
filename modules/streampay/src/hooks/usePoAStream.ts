import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'

// EIP-712 domain for Proof-of-Attention intents on Arc Network
const POA_DOMAIN = { name: 'ArcPoA', version: '1', chainId: 5042002 } as const

const POA_TYPES = {
  SessionIntent: [
    { name: 'viewer',    type: 'address' },
    { name: 'creator',   type: 'address' },
    { name: 'contentId', type: 'bytes32' },
    { name: 'amount',    type: 'uint256' },
    { name: 'nonce',     type: 'uint256' },
    { name: 'deadline',  type: 'uint256' },
  ],
} as const

// ── Ghost Vault ───────────────────────────────────────────────────────────────
// Only the latest/highest cumulative signature is kept — it supersedes all prior
// sigs for the same (contentId, viewer) pair.

export type GhostVaultEntry = {
  sig:       string
  amountRaw: string            // 6-decimal USDC, stringified bigint
  nonce:     string
  deadline:  string
  viewer:    `0x${string}`
  creator:   `0x${string}`
  contentId: string
  ts:        number
}

export function readGhostVault(contentId: string, viewer: string): GhostVaultEntry | null {
  try {
    const raw = localStorage.getItem(`sp_poa_${contentId}_${viewer.toLowerCase()}`)
    return raw ? (JSON.parse(raw) as GhostVaultEntry) : null
  } catch { return null }
}

function writeGhostVault(entry: GhostVaultEntry) {
  localStorage.setItem(
    `sp_poa_${entry.contentId}_${entry.viewer.toLowerCase()}`,
    JSON.stringify(entry),
  )
}

// Encode a UTF-8 content string as a zero-padded bytes32 hex
function toBytes32(s: string): `0x${string}` {
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s as `0x${string}`
  const bytes = Array.from(new TextEncoder().encode(s))
  const hex   = bytes.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 64).padEnd(64, '0')
  return `0x${hex}` as `0x${string}`
}

// ── Public API ────────────────────────────────────────────────────────────────

export type PoAConfig = {
  contentId:     string
  creator:       `0x${string}`
  dripRate:      number  // USDC / second  (e.g. 0.001)
  sessionCap:    number  // max USDC this session (e.g. 0.10)
  signInterval?: number  // seconds between re-signs (default 30)
}

export type PoAState = {
  accrued:      number
  isActive:     boolean
  isVisible:    boolean
  capHit:       boolean
  ghostVault:   GhostVaultEntry | null
  sessionStart: () => Promise<void>
  sessionStop:  () => void
  forceSign:    () => Promise<void>
  setVisible:   (v: boolean) => void
}

export function usePoAStream(config: PoAConfig): PoAState {
  const { address }            = useAccount()
  const { signTypedDataAsync } = useSignTypedData()

  const [accrued,    setAccrued]    = useState(0)
  const [isActive,   setIsActive]   = useState(false)
  const [isVisible,  setIsVisible]  = useState(false)
  const [ghostVault, setGhostVault] = useState<GhostVaultEntry | null>(null)

  // Mutable refs avoid stale closures in setInterval callbacks
  const accruedRef = useRef(0)
  const activeRef  = useRef(false)
  const nonceRef   = useRef(0)
  const signingRef = useRef(false)
  const addrRef    = useRef(address)
  const cfgRef     = useRef(config)
  const tickRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const sigTickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { addrRef.current = address }, [address])
  useEffect(() => { cfgRef.current  = config  }, [config])

  // Hydrate ghost vault on wallet connect / address change
  useEffect(() => {
    if (!address) return
    const e = readGhostVault(config.contentId, address)
    if (!e) return
    const amt = Number(e.amountRaw) / 1_000_000
    accruedRef.current = amt
    setAccrued(amt)
    nonceRef.current = Number(e.nonce) + 1
    setGhostVault(e)
  }, [address, config.contentId])

  // Sign the current cumulative accrued amount and flush to ghost vault
  const doSign = useCallback(async () => {
    const addr = addrRef.current
    const cfg  = cfgRef.current
    if (!addr || signingRef.current) return
    const amtUsdc = Math.min(accruedRef.current, cfg.sessionCap)
    if (amtUsdc <= 0) return
    signingRef.current = true
    try {
      const amountRaw = BigInt(Math.round(amtUsdc * 1_000_000))
      const nonce     = BigInt(nonceRef.current)
      const deadline  = BigInt(Math.floor(Date.now() / 1000) + 7_200) // 2hr validity

      const sig = await signTypedDataAsync({
        domain:      POA_DOMAIN,
        types:       POA_TYPES,
        primaryType: 'SessionIntent',
        message: {
          viewer:    addr,
          creator:   cfg.creator,
          contentId: toBytes32(cfg.contentId),
          amount:    amountRaw,
          nonce,
          deadline,
        },
      })

      const entry: GhostVaultEntry = {
        sig,
        amountRaw: amountRaw.toString(),
        nonce:     nonce.toString(),
        deadline:  deadline.toString(),
        viewer:    addr,
        creator:   cfg.creator,
        contentId: cfg.contentId,
        ts:        Date.now(),
      }
      writeGhostVault(entry)
      setGhostVault(entry)
      nonceRef.current += 1
    } catch { /* user rejected or tab lost focus — ghost vault unchanged */ }
    finally { signingRef.current = false }
  }, [signTypedDataAsync])

  function clearTickers() {
    if (tickRef.current)    { clearInterval(tickRef.current);    tickRef.current    = null }
    if (sigTickRef.current) { clearInterval(sigTickRef.current); sigTickRef.current = null }
  }

  const sessionStop = useCallback(() => {
    clearTickers()
    activeRef.current = false
    setIsActive(false)
    void doSign() // checkpoint: persist whatever accrued before stop
  }, [doSign])

  const sessionStart = useCallback(async () => {
    if (activeRef.current || !addrRef.current) return
    if (accruedRef.current >= cfgRef.current.sessionCap) return

    // Open session with an initial signature so creator has a valid sig immediately
    await doSign()

    activeRef.current = true
    setIsActive(true)

    // 1-second drip ticker
    tickRef.current = setInterval(() => {
      const cfg = cfgRef.current
      if (accruedRef.current >= cfg.sessionCap) {
        clearTickers()
        activeRef.current = false
        setIsActive(false)
        void doSign()
        return
      }
      accruedRef.current += cfg.dripRate
      setAccrued(accruedRef.current)
    }, 1_000)

    // Periodic re-sign to keep ghost vault fresh
    const ms = (cfgRef.current.signInterval ?? 30) * 1_000
    sigTickRef.current = setInterval(() => void doSign(), ms)
  }, [doSign])

  // Auto-pause when the viewer switches browser tabs
  useEffect(() => {
    const onHide = () => { if (document.hidden && activeRef.current) sessionStop() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [sessionStop])

  useEffect(() => () => clearTickers(), [])

  return {
    accrued,
    isActive,
    isVisible,
    capHit:     accrued >= config.sessionCap,
    ghostVault,
    sessionStart,
    sessionStop,
    forceSign:  doSign,
    setVisible: setIsVisible,
  }
}
