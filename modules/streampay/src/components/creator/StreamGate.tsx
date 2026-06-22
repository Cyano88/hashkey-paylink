import { useCallback, useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { useSearchParams }    from 'react-router-dom'
import { useAccount, useChainId, useSwitchChain, useWriteContract } from 'wagmi'
import { useQuery }           from '@tanstack/react-query'
import { createPublicClient, http, defineChain, parseAbi } from 'viem'
import { usePoAStream }       from '../../hooks/usePoAStream'
import { usePasskey }         from '../../hooks/usePasskey'
import { PRIVY_AUTH_ENABLED } from '../../../../../src/lib/authMode'
import { resolvePrivyCircleLink } from '../../../../../src/lib/privyCircleLink'

// ── Arc standalone client ─────────────────────────────────────────────────────
const arcClient = createPublicClient({
  chain: defineChain({
    id:             5042002,
    name:           'Arc Testnet',
    nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
    rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
  }),
  transport: http('https://rpc.testnet.arc.network'),
})

const ARC_CHAIN_ID = 5042002
const ARC_USDC     = '0x3600000000000000000000000000000000000000' as const
const POA_CONTRACT = (import.meta.env.VITE_POA_CONTRACT ?? '') as `0x${string}`

const ERC20_ABI = parseAbi([
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

type FetchedContent = { type: 'text' | 'url'; content: string }
type ContentState   = 'idle' | 'loading' | 'ready' | 'error'
type AgentProfile = {
  slug: string
  name: string
  purpose?: string
  walletAddress?: string
}
type AgentWalletStatus = {
  ok?: boolean
  found?: boolean
  connected?: boolean
  walletAddress?: string
  gatewayBalance?: string
  gatewayBalanceError?: string
}
type AgentOption = AgentProfile & {
  connected?: boolean
  gatewayBalance?: string
  gatewayBalanceError?: string
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase()
}

function emailFromPrivyUser(user: unknown) {
  if (!user || typeof user !== 'object') return ''
  const record = user as Record<string, unknown>
  const directEmail = record.email
  if (directEmail && typeof directEmail === 'object') {
    const address = (directEmail as Record<string, unknown>).address
    if (typeof address === 'string') return address
  }
  for (const key of ['google', 'apple']) {
    const provider = record[key]
    if (provider && typeof provider === 'object') {
      const email = (provider as Record<string, unknown>).email
      if (typeof email === 'string') return email
    }
  }
  return ''
}

function shortAddress(value: string) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : ''
}

function cleanAgentSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

function agentSlugFromCircleWalletId(value?: string) {
  const match = String(value ?? '').match(/^agent:([a-z0-9-]+):/i)
  return cleanAgentSlug(match?.[1] ?? '')
}

function formatUsdc(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function mergeAgentOptions(existing: AgentOption[], next: AgentOption) {
  const slug = cleanAgentSlug(next.slug)
  if (!slug) return existing
  const current = existing.find(item => item.slug === slug)
  if (!current) return [...existing, { ...next, slug }]
  return existing.map(item => item.slug === slug ? { ...item, ...next, slug } : item)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StreamGate() {
  const [params] = useSearchParams()

  const contentId = params.get('id')   ?? ''
  const creator   = (params.get('cr')  ?? '') as `0x${string}`
  const initialAgentSlug = cleanAgentSlug(params.get('agent') ?? params.get('agentSlug') ?? '')
  const rateRaw   = parseInt(params.get('r')   ?? '1000',   10)
  const capRaw    = parseInt(params.get('cap') ?? '100000', 10)
  const title     = params.get('t')    ?? ''
  const paymentMode = params.get('pay') === 'x402' ? 'x402' : 'poa'

  const dripRate   = rateRaw  / 1_000_000
  const sessionCap = capRaw   / 1_000_000

  const { address, isConnected }  = useAccount()
  const chainId                   = useChainId()
  const { switchChain }           = useSwitchChain()
  const { writeContractAsync }    = useWriteContract()
  const isOnArc = chainId === ARC_CHAIN_ID
  const {
    authenticated: privyAuthenticated,
    user: privyUser,
    login: loginPrivy,
    getAccessToken,
  } = usePrivy()
  const privyEmail = cleanEmail(emailFromPrivyUser(privyUser))

  const passkey = usePasskey()
  const poa     = usePoAStream({ contentId, creator, dripRate, sessionCap })
  const { sessionStart, sessionStop, setVisible, forceSign } = poa
  const [ending,  setEnding]  = useState(false)
  const [ended,   setEnded]   = useState(false)
  const [agentSlug, setAgentSlug] = useState(initialAgentSlug)
  const [agentOptions, setAgentOptions] = useState<AgentOption[]>([])
  const [agentOptionsLoading, setAgentOptionsLoading] = useState(false)
  const [agentOptionsError, setAgentOptionsError] = useState<string | null>(null)
  const [circleNotice, setCircleNotice] = useState<string | null>(null)

  async function handleEndSession() {
    setEnding(true)
    try {
      await forceSign() // one wallet popup — signs the total accrued amount
      sessionStop()
      setEnded(true)
    } finally {
      setEnding(false)
    }
  }

  // ── USDC allowance ────────────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useQuery<bigint>({
    queryKey: ['poa_allowance', address, POA_CONTRACT],
    queryFn:  async () => {
      if (!address || !POA_CONTRACT) return 0n
      return await arcClient.readContract({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'allowance', args: [address, POA_CONTRACT],
      }) as bigint
    },
    enabled:         !!address && !!POA_CONTRACT && isOnArc,
    staleTime:       10_000,
    refetchInterval: 15_000,
  })

  const isApproved = !!allowance && allowance >= BigInt(capRaw)

  // ── USDC approve() ────────────────────────────────────────────────────────
  const [approving,      setApproving]      = useState(false)
  const [approveTx,      setApproveTx]      = useState<`0x${string}` | null>(null)
  const [approveError,   setApproveError]   = useState<string | null>(null)
  const [approvePending, setApprovePending] = useState(false)
  const safeAgentSlug = cleanAgentSlug(agentSlug)

  function selectedAgentSetupUrl() {
    const slug = safeAgentSlug || 'hashpaylink-agent'
    const currentPath = `${window.location.pathname}${window.location.search}`
    const params = new URLSearchParams({ profile: 'agent', agent: slug, src: 'creator', returnTo: currentPath })
    return `/agent?${params.toString()}`
  }

  useEffect(() => {
    if (paymentMode !== 'x402') return
    let cancelled = false

    async function hydrateAgentOptions() {
      setAgentOptionsLoading(true)
      setAgentOptionsError(null)
      let options: AgentOption[] = []

      async function addBySlug(slug: string, fallback?: Partial<AgentOption>) {
        const cleanSlug = cleanAgentSlug(slug)
        if (!cleanSlug) return
        let option: AgentOption = {
          slug: cleanSlug,
          name: fallback?.name || cleanSlug,
          purpose: fallback?.purpose,
          walletAddress: fallback?.walletAddress,
        }
        try {
          const profileRes = await fetch(`/api/agent-profile?agent=${encodeURIComponent(cleanSlug)}`)
          const profileData = await profileRes.json().catch(() => ({})) as { ok?: boolean; agent?: AgentProfile }
          if (profileRes.ok && profileData.ok && profileData.agent) {
            option = { ...option, ...profileData.agent }
          }
        } catch {
          // Status lookup below still gives enough information to let the user reconnect.
        }
        try {
          const statusRes = await fetch(`/api/agent-wallet?agent=${encodeURIComponent(cleanSlug)}&x402=1`)
          const status = await statusRes.json().catch(() => ({})) as AgentWalletStatus
          if (statusRes.ok && status.ok !== false) {
            option = {
              ...option,
              walletAddress: status.walletAddress || option.walletAddress,
              connected: Boolean(status.connected),
              gatewayBalance: status.gatewayBalance,
              gatewayBalanceError: status.gatewayBalanceError,
            }
          }
        } catch {
          option = { ...option, connected: false }
        }
        options = mergeAgentOptions(options, option)
      }

      try {
        if (initialAgentSlug) await addBySlug(initialAgentSlug)

        if (PRIVY_AUTH_ENABLED && privyAuthenticated) {
          const token = await getAccessToken()
          if (token) {
            try {
              const linked = await resolvePrivyCircleLink({ accessToken: token, chain: 'arc', purpose: 'agent' })
              const linkedSlug = agentSlugFromCircleWalletId(linked.link?.circleWalletId)
              if (linkedSlug) {
                await addBySlug(linkedSlug, {
                  walletAddress: linked.link?.circleWalletAddress,
                  name: linkedSlug,
                  purpose: 'Linked through Privy email',
                })
              }
            } catch {
              // Missing Privy server config should not block manual agent selection.
            }
          }

          if (privyEmail) {
            try {
              const res = await fetch(`/api/agent-profile?owner=${encodeURIComponent(privyEmail)}`)
              const data = await res.json().catch(() => ({})) as { ok?: boolean; agents?: AgentProfile[] }
              if (res.ok && data.ok && Array.isArray(data.agents)) {
                for (const agent of data.agents) await addBySlug(agent.slug, agent)
              }
            } catch {
              // Older Telegram-owned profiles may not be keyed by email yet.
            }
          }
        }

        if (!cancelled) {
          setAgentOptions(options)
          if (!safeAgentSlug && options.length === 1) setAgentSlug(options[0].slug)
        }
      } catch (err) {
        if (!cancelled) setAgentOptionsError(err instanceof Error ? err.message.slice(0, 140) : 'Could not load saved agents.')
      } finally {
        if (!cancelled) setAgentOptionsLoading(false)
      }
    }

    void hydrateAgentOptions()
    return () => { cancelled = true }
  }, [paymentMode, initialAgentSlug, privyAuthenticated, privyEmail, getAccessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove() {
    if (!POA_CONTRACT || !isConnected || !isOnArc) return
    setApproving(true); setApproveError(null)
    try {
      const tx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'approve',
        args: [POA_CONTRACT, BigInt(capRaw)],
        gas: 100_000n,
      })
      setApproveTx(tx); setApprovePending(true)
      pollApproval(tx)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!/rejected|denied/i.test(msg)) setApproveError(msg.slice(0, 140))
    } finally { setApproving(false) }
  }

  const pollApproval = useCallback((hash: `0x${string}`, attempts = 0) => {
    if (attempts > 40) {
      setApprovePending(false)
      setApproveError('Approval not confirmed after 2 min — check Arcscan')
      return
    }
    setTimeout(async () => {
      try {
        const receipt = await arcClient.getTransactionReceipt({ hash })
        if (receipt?.status === 'success') {
          setApprovePending(false); setApproveTx(null); refetchAllowance()
        } else if (receipt?.status === 'reverted') {
          setApprovePending(false); setApproveError('Approval transaction reverted')
        } else { pollApproval(hash, attempts + 1) }
      } catch { pollApproval(hash, attempts + 1) }
    }, 3_000)
  }, [refetchAllowance])

  // ── Content fetch (after full auth) ──────────────────────────────────────
  const [contentState,  setContentState]  = useState<ContentState>('idle')
  const [fetchedContent, setFetchedContent] = useState<FetchedContent | null>(null)
  const [contentError,  setContentError]  = useState<string | null>(null)
  const [gatewayPaying, setGatewayPaying] = useState(false)
  const [gatewayTx, setGatewayTx] = useState<string | null>(null)

  const legacyFullyAuthorised = isConnected && isOnArc && passkey.registered && isApproved
  const fullyAuthorised = paymentMode === 'x402' ? contentState === 'ready' : legacyFullyAuthorised

  async function unlockWithAgentX402() {
    if (gatewayPaying) return
    if (!safeAgentSlug) {
      setContentError('Enter the agent wallet name that has x402 balance.')
      setContentState('error')
      return
    }
    setGatewayPaying(true)
    setContentError(null)
    setContentState('loading')
    try {
      const res = await fetch('/api/creator-unlock-x402', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId, agentSlug: safeAgentSlug }),
      })
      const data = await res.json() as {
        ok: boolean
        type?: string
        content?: string
        payment?: { transaction?: string } | null
        walletAddress?: string
        error?: string
        code?: string
      }
      if (!data.ok || !data.type || !data.content) throw new Error(data.error ?? 'Could not unlock content')
      setFetchedContent({ type: data.type as 'text' | 'url', content: data.content })
      setGatewayTx(data.payment?.transaction ?? null)
      setContentState('ready')
      setCircleNotice(data.walletAddress ? `Paid by ${shortAddress(data.walletAddress)}` : 'Paid with Agent x402 balance')
    } catch (err) {
      setContentError(err instanceof Error ? err.message.slice(0, 180) : 'Gateway payment failed.')
      setContentState('error')
    } finally {
      setGatewayPaying(false)
    }
  }

  async function handlePrimaryGatewayPay() {
    setCircleNotice(null)
    if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
      loginPrivy()
      return
    }
    await unlockWithAgentX402()
  }

  useEffect(() => {
    if (paymentMode === 'x402' || !legacyFullyAuthorised || !address || !contentId || contentState !== 'idle') return
    setContentState('loading')
    fetch(`/api/get-content?id=${encodeURIComponent(contentId)}&viewer=${address}`)
      .then(r => r.json())
      .then((data: { ok: boolean; type?: string; content?: string; error?: string }) => {
        if (data.ok && data.type && data.content) {
          setFetchedContent({ type: data.type as 'text' | 'url', content: data.content })
          setContentState('ready')
        } else {
          setContentError(data.error ?? 'Could not retrieve content')
          setContentState('error')
        }
      })
      .catch(() => { setContentError('Server error — please try again'); setContentState('error') })
  }, [paymentMode, legacyFullyAuthorised, address, contentId, contentState])

  // ── IntersectionObserver: drip only when content is visible + ready ───────
  // Drip starts AFTER content is fetched and visible — not on auth alone.
  const contentRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = contentRef.current
    if (paymentMode === 'x402' || !el || !fullyAuthorised || contentState !== 'ready') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting && entry.intersectionRatio >= 0.5
        setVisible(visible)
        if (visible) sessionStart()
        else sessionStop()
      },
      { threshold: [0, 0.5, 1.0] },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [paymentMode, fullyAuthorised, contentState, sessionStart, sessionStop, setVisible])

  // Final checkpoint on unmount
  useEffect(() => () => sessionStop(), [sessionStop])

  // ── Auth step tracking ────────────────────────────────────────────────────
  const currentStep = paymentMode === 'x402'
    ? (!privyAuthenticated ? 0 : contentState === 'loading' ? 2 : contentState === 'ready' ? 3 : 1)
    : (!isConnected ? 0 : !isOnArc ? 1 : !passkey.registered ? 2 : 3)

  const progressPct = Math.min((poa.accrued / sessionCap) * 100, 100)

  if (!contentId || !creator) {
    return (
      <div className="w-full max-w-[480px] mx-auto mt-12 text-center text-[13px] text-gray-400 py-12">
        Invalid gate link — missing content parameters.
      </div>
    )
  }

  return (
    <div className="w-full max-w-[560px] mx-auto mt-6 px-3 sm:mt-8 sm:px-0 space-y-4">

      {/* ── Content card ── */}
      <div ref={contentRef} className="relative overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">

        {/* Blurred placeholder shown behind the auth overlay */}
        {!fullyAuthorised && paymentMode !== 'x402' && <ContentPlaceholder title={title} />}

        {/* ── Auth steps overlay ── */}
        {!fullyAuthorised && (
          <OverlayShell dripRate={dripRate} sessionCap={sessionCap} paymentMode={paymentMode}>

            {paymentMode === 'x402' ? (
              <div className="w-full space-y-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm">
                  <div className="flex items-start justify-between gap-3 border-b border-gray-100 pb-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-[13px] font-bold text-gray-900">
                        {privyAuthenticated ? 'Ready to unlock' : 'Sign in to continue'}
                      </p>
                      <p className="truncate text-[12px] text-gray-500">
                        {PRIVY_AUTH_ENABLED
                          ? privyAuthenticated
                            ? privyEmail || 'Wallet connected'
                            : 'Email or wallet through Privy'
                          : 'Use a funded agent wallet'}
                      </p>
                      <p className="font-mono text-[11px] text-blue-600">
                        {safeAgentSlug || 'No agent selected'}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-bold text-blue-600 ring-1 ring-blue-100">
                      x402
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {agentOptions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                          Saved agents
                        </p>
                        {agentOptions.map(agent => {
                          const active = safeAgentSlug === agent.slug
                          const ready = Boolean(agent.connected)
                          return (
                            <button
                              key={agent.slug}
                              type="button"
                              onClick={() => {
                                setAgentSlug(agent.slug)
                                setContentError(null)
                                if (contentState === 'error') setContentState('idle')
                              }}
                              className={[
                                'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-all',
                                active
                                  ? 'border-blue-200 bg-blue-50/80'
                                  : 'border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white',
                              ].join(' ')}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[12px] font-bold text-gray-900">
                                  {agent.name || agent.slug}
                                </span>
                                <span className="mt-0.5 block truncate font-mono text-[11px] text-gray-500">
                                  {agent.walletAddress ? shortAddress(agent.walletAddress) : agent.slug}
                                </span>
                              </span>
                              <span className={[
                                'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold',
                                ready ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100',
                              ].join(' ')}>
                                {ready ? 'Ready' : 'Reconnect'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {agentOptionsLoading && (
                      <p className="text-center text-[11px] text-gray-400">Loading saved agents...</p>
                    )}
                    {agentOptionsError && (
                      <p className="text-center text-[11px] text-amber-600">{agentOptionsError}</p>
                    )}
                  </div>
                  <label className="mt-3 block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                      Agent name
                    </span>
                    <input
                      type="text"
                      value={agentSlug}
                      onChange={event => setAgentSlug(cleanAgentSlug(event.target.value))}
                      placeholder="hashpaylink-agent"
                      className="w-full rounded-xl border border-blue-100 bg-white px-3 py-3 font-mono text-[14px] text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-300"
                    />
                  </label>
                </div>
                <button
                  onClick={handlePrimaryGatewayPay}
                  disabled={gatewayPaying || (privyAuthenticated && !safeAgentSlug)}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: '#111827' }}
                >
                  {gatewayPaying
                    ? <><Spinner />Paying...</>
                    : PRIVY_AUTH_ENABLED && !privyAuthenticated
                    ? 'Continue'
                    : 'Pay with Agent x402'}
                </button>
                {contentState === 'error' && /agent wallet session|reconnect|not enabled/i.test(contentError ?? '') && (
                  <button
                    type="button"
                    onClick={() => window.open(selectedAgentSetupUrl(), '_blank', 'noopener,noreferrer')}
                    className="w-full text-center text-[11px] font-semibold text-blue-600 underline underline-offset-2"
                  >
                    Reconnect selected agent
                  </button>
                )}
                {circleNotice && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-center text-[12px] font-medium text-emerald-700">
                    {circleNotice}
                  </div>
                )}
                {contentState === 'error' && contentError && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-center text-[12px] font-medium text-red-600">
                    {contentError}
                  </div>
                )}
                {privyAuthenticated && !safeAgentSlug && (
                  <p className="text-center text-[11px] text-gray-400">
                    Select a saved agent, or enter the agent name you funded for x402.
                  </p>
                )}
              </div>
            ) : (
              <>
                {!isConnected && (
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-5 py-3 text-center text-[12px] text-gray-500">
                    Connect your wallet in the header above
                  </div>
                )}

                {isConnected && !isOnArc && (
                  <button
                    onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                    className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                    style={{ background: '#111827' }}
                  >
                    Switch to Arc Network
                  </button>
                )}
              </>
            )}

            {paymentMode === 'poa' && isConnected && isOnArc && !passkey.registered && (
              <>
                <button
                  onClick={() => void passkey.register()}
                  disabled={passkey.registering}
                  className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                  style={{ background: '#111827' }}
                >
                  {passkey.registering
                    ? <><Spinner />Authorizing…</>
                    : <><FingerprintIcon />Authorize via Passkey</>}
                </button>
                {passkey.error && (
                  <p className="text-[11px] text-red-500 text-center max-w-[260px]">{passkey.error}</p>
                )}
              </>
            )}

            {paymentMode === 'poa' && isConnected && isOnArc && passkey.registered && !isApproved && (
              <>
                {!POA_CONTRACT ? (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-center text-[12px] text-amber-700">
                    Contract not configured — set VITE_POA_CONTRACT on Render
                  </div>
                ) : approvePending ? (
                  <div className="space-y-2 w-full max-w-[260px]">
                    <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-3 text-[13px] text-gray-500">
                      <Spinner />Approval pending on Arc…
                    </div>
                    {approveTx && (
                      <button
                        type="button"
                        onClick={() => window.open(`https://testnet.arcscan.app/tx/${approveTx}`, '_blank', 'noopener,noreferrer')}
                        className="flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                      >
                        <ExtLinkIcon />Track on Arcscan
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="text-center space-y-1 max-w-[260px]">
                      <p className="text-[13px] font-semibold text-gray-800">Set Spending Limit</p>
                      <p className="text-[12px] text-gray-500">
                        Approve up to{' '}
                        <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span>
                        {' '}for this session.
                      </p>
                    </div>
                    <button
                      onClick={handleApprove}
                      disabled={approving}
                      className="flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[13px] font-semibold text-white min-h-[48px] transition-all active:scale-[0.98]"
                      style={{ background: '#111827' }}
                    >
                      {approving ? <><Spinner />Confirm in wallet…</> : 'Approve USDC Spending'}
                    </button>
                    {approveError && (
                      <p className="text-[11px] text-red-500 text-center max-w-[260px]">{approveError}</p>
                    )}
                  </>
                )}
              </>
            )}

            <StepDots current={currentStep} />
          </OverlayShell>
        )}

        {/* ── Content loading ── */}
        {fullyAuthorised && contentState === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-16 text-gray-400">
            <Spinner />
            <span className="text-[13px]">Unlocking content…</span>
          </div>
        )}

        {/* ── Native text content — reader view ── */}
        {fullyAuthorised && contentState === 'ready' && fetchedContent?.type === 'text' && (
          <div className="p-6 space-y-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Unlocked Content</p>
            {title && (
              <h2 className="text-[18px] font-bold text-gray-900 leading-snug">{title}</h2>
            )}
            <div className="max-h-[480px] overflow-y-auto pr-1">
              <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-wrap">
                {fetchedContent.content}
              </p>
            </div>
          </div>
        )}

        {/* ── Private URL — reveal button ── */}
        {fullyAuthorised && contentState === 'ready' && fetchedContent?.type === 'url' && (
          <div className="p-6 space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100">
              <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            {title && <p className="text-[15px] font-bold text-gray-900">{title}</p>}
            <p className="text-[12px] text-gray-500">Your private link is ready</p>
            <button
              onClick={() => window.open(fetchedContent.content, '_blank', 'noopener,noreferrer')}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-semibold text-white transition-all active:scale-[0.98]"
              style={{ background: '#111827' }}
            >
              Access Content →
            </button>
          </div>
        )}

        {/* ── Content error ── */}
        {fullyAuthorised && contentState === 'error' && (
          <div className="p-6 text-center space-y-3">
            <p className="text-[13px] text-red-500">{contentError}</p>
            <button
              onClick={() => setContentState('idle')}
              className="text-[12px] font-semibold text-gray-500 underline underline-offset-2 hover:text-gray-800 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── ViewerHUD — drip meter ── */}
        {paymentMode === 'poa' && fullyAuthorised && contentState === 'ready' && !ended && (
          <div className="border-t border-gray-100 bg-gray-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {poa.isActive && !poa.isPaused
                  ? <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                  : poa.isPaused
                  ? <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  : <span className="h-1.5 w-1.5 rounded-full bg-gray-300" />}
                <span className="text-[11px] font-semibold text-gray-500">
                  {poa.isPaused  ? 'Idle — move to resume'
                   : poa.isActive ? 'Session Active'
                   : poa.capHit  ? 'Session Complete'
                   :               'Session Paused'}
                </span>
              </div>
              <span className="font-mono text-[12px] font-semibold text-gray-700">
                ${poa.accrued.toFixed(6)}{' '}
                <span className="text-gray-400 font-normal">/ ${sessionCap.toFixed(2)}</span>
              </span>
            </div>

            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width:      `${progressPct}%`,
                  background: progressPct >= 100 ? '#6b7280' : '#3b82f6',
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[10px] text-gray-400">
                Sign once when done reading to confirm payment
              </p>
              <button
                onClick={handleEndSession}
                disabled={ending || poa.accrued === 0}
                className="text-[10px] font-semibold transition-colors disabled:opacity-40"
                style={{ color: ending ? '#9ca3af' : '#111827' }}
              >
                {ending ? 'Signing…' : 'End Session'}
              </button>
            </div>
          </div>
        )}

        {/* ── Session ended confirmation ── */}
        {paymentMode === 'poa' && fullyAuthorised && ended && (
          <div className="border-t border-gray-100 bg-emerald-50/60 px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              <span className="text-[11px] font-semibold text-emerald-700">
                Payment signed — ${poa.accrued.toFixed(6)} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-emerald-600">
                The creator can now settle your payment on Arc.
              </p>
              <button
                onClick={() => setEnded(false)}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
              >
                Read again
              </button>
            </div>
          </div>
        )}

        {paymentMode === 'x402' && fullyAuthorised && gatewayTx && (
          <div className="border-t border-gray-100 bg-emerald-50/60 px-4 py-3">
            <button
              type="button"
              onClick={() => window.open(`https://testnet.arcscan.app/tx/${gatewayTx}`, '_blank', 'noopener,noreferrer')}
              className="flex w-full items-center justify-center gap-1.5 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              <CheckIcon />Circle Gateway paid - {gatewayTx.slice(0, 8)}...{gatewayTx.slice(-6)}
            </button>
          </div>
        )}
      </div>

      {/* ── Creator / rate strip ── */}
      <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Creator</p>
          <p className="font-mono text-[12px] text-gray-600">
            {creator ? `${creator.slice(0, 6)}…${creator.slice(-4)}` : '—'}
          </p>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            {paymentMode === 'x402' ? 'Access Price' : 'Drip Rate'}
          </p>
          <p className="text-[12px] font-semibold text-gray-700">
            {paymentMode === 'x402' ? `${formatUsdc(sessionCap)} USDC` : `$${dripRate.toFixed(4)}/sec`}
          </p>
        </div>
      </div>

    </div>
  )
}

// ── Shared overlay shell ──────────────────────────────────────────────────────

function OverlayShell({
  dripRate, sessionCap, paymentMode, children,
}: {
  dripRate: number
  sessionCap: number
  paymentMode: 'x402' | 'poa'
  children: React.ReactNode
}) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center space-y-4',
        paymentMode === 'x402'
          ? 'relative min-h-[520px] p-5 sm:p-7'
          : 'absolute inset-0 p-6',
      ].join(' ')}
      style={paymentMode === 'x402'
        ? { background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92))' }
        : { background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(3px)' }}
    >
      <div className="text-center space-y-1.5">
        <p className="text-[17px] font-bold text-gray-900">Content Locked</p>
        {paymentMode === 'x402' && (
          <p className="text-[13px] text-gray-500 max-w-[320px]">
            Pay <span className="font-semibold">{formatUsdc(sessionCap)} USDC</span> to unlock this creator content.
          </p>
        )}
        <p className={paymentMode === 'x402' ? 'hidden' : 'text-[12px] text-gray-500 max-w-[260px]'}>
          Pay <span className="font-semibold">${dripRate.toFixed(4)}/sec</span>
          {' '}— max <span className="font-semibold">${sessionCap.toFixed(2)} USDC</span>
        </p>
      </div>
      {children}
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
        {paymentMode === 'x402' ? 'Powered by Circle Gateway on Arc' : 'Powered by Arc Network'}
      </div>
    </div>
  )
}

// Placeholder so the overlay has something to blur over while loading
function ContentPlaceholder({ title }: { title: string }) {
  return (
    <div className="p-6 space-y-3 select-none" style={{ filter: 'blur(5px) brightness(0.9)', pointerEvents: 'none' }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-500">Gated Content</p>
      <h2 className="text-[18px] font-bold text-gray-900 leading-snug">{title || 'Premium Content'}</h2>
      <div className="space-y-2 pt-1">
        {[90, 75, 55, 80, 65].map(w => (
          <div key={w} className="h-2.5 rounded-full bg-gray-100" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2, 3].map(i => (
        <span key={i} className="h-1.5 rounded-full transition-all"
          style={{ width: i === current ? 16 : 6, background: i <= current ? '#111827' : '#e5e7eb' }} />
      ))}
    </div>
  )
}

function FingerprintIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a7.464 7.464 0 01-1.15 3.993m1.989 3.559A11.209 11.209 0 008.25 10.5a3.75 3.75 0 117.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 01-3.6 9.75m6.633-4.596a18.666 18.666 0 01-2.485 5.33" />
    </svg>
  )
}

function ExtLinkIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
