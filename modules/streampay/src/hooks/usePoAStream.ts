import { useCallback, useEffect, useRef, useState } from 'react'
import { useAccount, useSignTypedData } from 'wagmi'

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

export type GhostVaultEntry = {
  sig:       string
  amountRaw: string
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

// Push latest vault to server so creators can settle from any device
function pushVaultToServer(entry: GhostVaultEntry) {
  fetch('/api/register-vault', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(entry),
  }).catch(() => {}) // fire-and-forget — localStorage is the source of truth
}

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
  dripRate:      number   // USDC / second (e.g. 0.001)
  sessionCap:    number   // max USDC this session (e.g. 0.10)
  signInterval?: number   // seconds between re-signs (default 120)
  idleTimeout?:  number   // ms of inactivity before drip pauses (default 30_000)
}

export type PoAState = {
  accrued:      number
  isActive:     boolean
  isVisible:    boolean
  isPaused:     boolean   // true when session is active but viewer is idle
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
  const [isPaused,   setIsPaused]   = useState(false)
  const [ghostVault, setGhostVault] = useState<GhostVaultEntry | null>(null)

  const accruedRef      = useRef(0)
  const activeRef       = useRef(false)
  const isPausedRef     = useRef(false)
  const nonceRef        = useRef(0)
  const signingRef      = useRef(false)
  const lastActivityRef = useRef(Date.now())
  const addrRef         = useRef(address)
  const cfgRef          = useRef(config)
  const tickRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const sigTickRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { addrRef.current = address }, [address])
  useEffect(() => { cfgRef.current  = config  }, [config])

  // Hydrate from localStorage on wallet connect
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

  // Activity listeners — update lastActivityRef; auto-resume if paused
  useEffect(() => {
    const events = ['mousemove', 'scroll', 'keydown', 'touchstart', 'click'] as const
    function onActivity() {
      lastActivityRef.current = Date.now()
      // Resume drip if it was paused by idle timeout
      if (isPausedRef.current && activeRef.current) {
        isPausedRef.current = false
        setIsPaused(false)
      }
    }
    events.forEach(e => window.addEventListener(e, onActivity, { passive: true }))
    return () => events.forEach(e => window.removeEventListener(e, onActivity))
  }, [])

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
      const deadline  = BigInt(Math.floor(Date.now() / 1000) + 7_200)

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
      pushVaultToServer(entry)  // cross-device: push to server after every sign
      setGhostVault(entry)
      nonceRef.current += 1
    } catch { /* user rejected */ }
    finally { signingRef.current = false }
  }, [signTypedDataAsync])

  function clearTickers() {
    if (tickRef.current)    { clearInterval(tickRef.current);    tickRef.current    = null }
    if (sigTickRef.current) { clearInterval(sigTickRef.current); sigTickRef.current = null }
  }

  const sessionStop = useCallback(() => {
    clearTickers()
    activeRef.current  = false
    isPausedRef.current = false
    setIsActive(false)
    setIsPaused(false)
    // No doSign here — scroll in/out of view must never open the wallet
  }, [])

  const sessionStart = useCallback(async () => {
    if (activeRef.current || !addrRef.current) return
    if (accruedRef.current >= cfgRef.current.sessionCap) return

    lastActivityRef.current = Date.now() // reset idle clock on session open
    isPausedRef.current = false
    setIsPaused(false)

    await doSign()

    activeRef.current = true
    setIsActive(true)

    // 1-second drip ticker — checks idle timeout before incrementing
    tickRef.current = setInterval(() => {
      const cfg      = cfgRef.current
      const idleMs   = cfg.idleTimeout ?? 30_000
      const isIdle   = Date.now() - lastActivityRef.current > idleMs

      if (isIdle) {
        if (!isPausedRef.current) {
          isPausedRef.current = true
          setIsPaused(true)
          void doSign() // checkpoint when going idle
        }
        return // don't drip while idle
      }

      // Viewer returned from idle — clear pause flag
      if (isPausedRef.current) {
        isPausedRef.current = false
        setIsPaused(false)
      }

      if (accruedRef.current >= cfg.sessionCap) {
        accruedRef.current = cfg.sessionCap
        setAccrued(cfg.sessionCap)
        clearTickers()
        activeRef.current = false
        setIsActive(false)
        void doSign()
        return
      }
      accruedRef.current += cfg.dripRate
      setAccrued(accruedRef.current)
    }, 1_000)

    const ms = (cfgRef.current.signInterval ?? 120) * 1_000
    sigTickRef.current = setInterval(() => void doSign(), ms)
  }, [doSign])

  useEffect(() => () => clearTickers(), [])

  return {
    accrued,
    isActive,
    isVisible,
    isPaused,
    capHit:     accrued >= config.sessionCap,
    ghostVault,
    sessionStart,
    sessionStop,
    forceSign:  doSign,
    setVisible: setIsVisible,
  }
}
