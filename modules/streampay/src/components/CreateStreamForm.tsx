import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import {
  useAccount, useChainId, useSwitchChain,
  useReadContract, useWriteContract, usePublicClient,
} from 'wagmi'
import { isAddress, parseAbi, parseEventLogs } from 'viem'
import { Mail, RefreshCw, X as XIcon } from 'lucide-react'
import { STREAM_VAULT_ABI, STREAM_VAULT_FACTORY_ABI } from '../lib/streamVaultAbi'
import { formatUsdcFull } from './TriStateBar'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  sendCircleArcStream,
  signCircleArcStreamCancel,
  type CircleEvmEmailSession,
} from '../../../../src/lib/circleEvmEmailWallet'
import { EVM_TREASURY } from '../../../../src/lib/chains'
import { PRIVY_AUTH_ENABLED } from '../../../../src/lib/authMode'
import { resolvePrivyCircleLink, savePrivyCircleLink } from '../../../../src/lib/privyCircleLink'

const ARC_CHAIN_ID = 5042002
const ARC_USDC     = '0x3600000000000000000000000000000000000000' as const
const ARC_EXPLORER = 'https://testnet.arcscan.app'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

const DURATIONS = [
  { label: '1 hr',    secs: 3_600n },
  { label: '8 hrs',   secs: 28_800n },
  { label: '24 hrs',  secs: 86_400n },
  { label: '7 days',  secs: 604_800n },
  { label: '30 days', secs: 2_592_000n },
]

type Step = 'form' | 'funding' | 'creating' | 'success'
type StreamTab = 'running' | 'new'
type RecentStream = {
  url: string
  recipient: string
  amount: string
  reason: string
  createdAt: number
}
type OnchainStream = {
  vault: `0x${string}`
  sender: `0x${string}`
  recipient: `0x${string}`
  totalAmount: string
  startTime: string
  endTime: string
  alreadyWithdrawn: string
  claimable: string
  cancelled: boolean
  active: boolean
}

function readPrefill() {
  const params = new URLSearchParams(window.location.search)
  const path = window.location.pathname.toLowerCase()
  const isAgenticPath = path.startsWith('/agentic')
  const rawDuration = (params.get('duration') ?? '').trim().toLowerCase()
  const amount = (params.get('amount') ?? (isAgenticPath ? '5' : '')).trim()
  const recipient = (params.get('recipient') ?? (isAgenticPath ? EVM_TREASURY : '')).trim()
  const rawRecipientEmail = (params.get('recipientEmail') ?? params.get('email') ?? '').trim()
  const recipientEmail = isEmail(rawRecipientEmail) ? cleanEmail(rawRecipientEmail) : ''
  const rawReportEmail = (params.get('reportEmail') ?? '').trim()
  const reportEmail = isEmail(rawReportEmail) ? cleanEmail(rawReportEmail) : ''
  const mode = (params.get('mode') ?? (isAgenticPath ? 'agentic-streaming' : '')).trim().toLowerCase()
  const service = (params.get('service') ?? (isAgenticPath ? 'polymarket-lp' : '')).trim().toLowerCase()
  const agentSlug = (params.get('agent') ?? params.get('agentSlug') ?? 'hashpaylink-agent').trim().toLowerCase()
  const amountPerDay = (params.get('amountPerDay') ?? '').trim()
  const reason = (params.get('reason') ?? (isAgenticPath ? 'Agentic LP Research: Best Polymarket LP reward markets' : '')).trim()
  const source = (params.get('src') ?? '').trim().toLowerCase()
  const wallet = (params.get('wallet') ?? '').trim().toLowerCase()
  const preferCircle = wallet !== 'connected' || source === 'telegram' || wallet === 'circle' || wallet === 'smart'
  let durationPreset: bigint | null = null
  let customDays = ''

  const match = rawDuration.match(/^(\d+)([dhw])$/)
  if (match) {
    const value = BigInt(match[1])
    const unit = match[2]
    const seconds = unit === 'h'
      ? value * 3_600n
      : unit === 'w'
        ? value * 7n * 86_400n
        : value * 86_400n
    durationPreset = DURATIONS.find(item => item.secs === seconds)?.secs ?? null
    if (!durationPreset) customDays = (Number(seconds) / 86_400).toString()
  }

  return { amount, recipient, recipientEmail, reportEmail, mode, service, agentSlug, amountPerDay, reason, duration: rawDuration, durationPreset, customDays, preferCircle }
}

function parseUsdc(val: string): bigint {
  const n = parseFloat(val)
  if (!isFinite(n) || n <= 0) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase()
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value))
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
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function formatWalletUsdc(value: bigint) {
  if (value === 0n) return '0'
  const full = formatUsdcFull(value)
  return full.includes('.') ? full.replace(/\.?0+$/, '') : full
}

function genSalt(): `0x${string}` {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return `0x${[...arr].map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const RECENT_STREAMS_KEY = 'streampay:recent-streams'

function loadRecentStreams(recipient: string): RecentStream[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_STREAMS_KEY) ?? '[]') as RecentStream[]
    return parsed
      .filter(item => item && item.url && item.recipient?.toLowerCase() === recipient.toLowerCase())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5)
  } catch {
    return []
  }
}

function saveRecentStream(stream: RecentStream) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_STREAMS_KEY) ?? '[]') as RecentStream[]
    const next = [stream, ...parsed.filter(item => item.url !== stream.url)].slice(0, 12)
    window.localStorage.setItem(RECENT_STREAMS_KEY, JSON.stringify(next))
  } catch {
    // Recent streams are a convenience only.
  }
}

function buildStreamLink(
  vault: `0x${string}`,
  reason: string,
  circleMode = false,
  recipientEmail = '',
  agentic?: { mode: string; service: string; reportEmail: string; agentSlug: string; amountPerDay: string },
  senderManage = false,
): string {
  const { hostname, origin } = window.location
  const isDedicatedHost =
    hostname === 'streampay.xyz' ||
    hostname.endsWith('.streampay.xyz') ||
    hostname.includes('streampay')
  const p = new URLSearchParams()
  if (!isDedicatedHost) p.set('app', 'streampay')
  if (circleMode) {
    p.set('src', 'telegram')
    p.set('wallet', 'circle')
  }
  if (isEmail(recipientEmail)) p.set('recipientEmail', cleanEmail(recipientEmail))
  if (agentic?.mode) p.set('mode', agentic.mode)
  if (agentic?.service) p.set('service', agentic.service)
  if (agentic?.reportEmail && isEmail(agentic.reportEmail)) p.set('reportEmail', cleanEmail(agentic.reportEmail))
  if (agentic?.agentSlug) p.set('agent', agentic.agentSlug)
  if (agentic?.amountPerDay) p.set('amountPerDay', agentic.amountPerDay)
  if (senderManage) p.set('manage', 'sender')
  if (reason.trim())    p.set('reason', reason.trim())
  const qs = p.toString()
  return `${origin}/stream/${vault}${qs ? `?${qs}` : ''}`
}

export function CreateStreamForm() {
  const [prefill] = useState(readPrefill)
  const { authenticated: privyAuthenticated, user: privyUser, login: loginPrivy, getAccessToken } = usePrivy()
  const privyEmail = cleanEmail(emailFromPrivyUser(privyUser))
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId                = useChainId()
  const { switchChain }        = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const publicClient           = usePublicClient({ chainId: ARC_CHAIN_ID })

  const isOnArc     = chainId === ARC_CHAIN_ID
  const factoryAddr = (import.meta.env.VITE_STREAM_FACTORY_ADDRESS ?? '') as `0x${string}`

  const [recipient,      setRecipient]      = useState(prefill.recipient)
  const [amount,         setAmount]         = useState(prefill.amount)
  const [durationPreset, setDurationPreset] = useState<bigint | null>(prefill.durationPreset)
  const [customDays,     setCustomDays]     = useState(prefill.customDays)
  const [reason,         setReason]         = useState(prefill.reason)
  const [salt] = useState<`0x${string}`>(genSalt)

  const [step,         setStep]         = useState<Step>('form')
  const [activeTab,    setActiveTab]    = useState<StreamTab>('new')
  const [statusMsg,    setStatusMsg]    = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [streamLink,   setStreamLink]   = useState<string | null>(null)
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [circleEmail,      setCircleEmail]      = useState('')
  const [circleSession,    setCircleSession]    = useState<CircleEvmEmailSession | null>(null)
  const [circleBalance,    setCircleBalance]    = useState<bigint | null>(null)
  const [circleBalanceRefreshing, setCircleBalanceRefreshing] = useState(false)
  const [circleCopied,     setCircleCopied]     = useState(false)
  const [linkedCircleAddress, setLinkedCircleAddress] = useState('')
  const [privyCircleLinkLoading, setPrivyCircleLinkLoading] = useState(false)
  const [privyCircleLinkError, setPrivyCircleLinkError] = useState<string | null>(null)
  const [recipientInviteLink, setRecipientInviteLink] = useState<string | null>(null)
  const [recipientInviteStatus, setRecipientInviteStatus] = useState('')
  const [recipientInviteError, setRecipientInviteError] = useState<string | null>(null)
  const [recipientInviteSending, setRecipientInviteSending] = useState(false)
  const [recipientReadyChecking, setRecipientReadyChecking] = useState(false)
  const [recipientInviteCopied, setRecipientInviteCopied] = useState(false)
  const [streamRecipientEmail, setStreamRecipientEmail] = useState(prefill.recipientEmail)
  const [streamEmailSending, setStreamEmailSending] = useState(false)
  const [streamEmailStatus, setStreamEmailStatus] = useState('')
  const [streamEmailError, setStreamEmailError] = useState<string | null>(null)
  const [reportEmail, setReportEmail] = useState(prefill.reportEmail)
  const [agenticStatus, setAgenticStatus] = useState('')
  const [agenticError, setAgenticError] = useState<string | null>(null)
  const [useCircleWallet] = useState(true)
  const [recentStreams, setRecentStreams] = useState<RecentStream[]>(() => loadRecentStreams(prefill.recipient))
  const [onchainStreams, setOnchainStreams] = useState<OnchainStream[]>([])
  const [onchainStreamsLoading, setOnchainStreamsLoading] = useState(false)
  const [onchainStreamsError, setOnchainStreamsError] = useState<string | null>(null)
  const [endingVault, setEndingVault] = useState('')

  const recipientEmail = cleanEmail(recipient)
  const recipientEmailMode = !isAddress(recipient) && isEmail(recipient)
  const recipientValid = isAddress(recipient)
  const amountBn       = parseUsdc(amount)
  const amountValid    = amountBn > 0n
  const durationSecs   = durationPreset
    ?? (customDays ? BigInt(Math.round(parseFloat(customDays) * 86400)) : 0n)
  const durationValid  = durationSecs > 0n
  const isAgenticStreaming = prefill.mode === 'agentic-streaming'
  const agenticService = prefill.service || 'polymarket-lp'
  const agenticReportEmailValid = !isAgenticStreaming || isEmail(reportEmail)
  const isFormValid    = recipientValid && amountValid && durationValid && agenticReportEmailValid
                         && isConnected && isOnArc && !!factoryAddr
  const circleConfigured = canUseCircleEvmEmailWallet('arc')
  const circleAvailable = useCircleWallet && circleConfigured
  const recipientLocked = circleAvailable && !!prefill.recipient
  const circleReady = recipientValid && amountValid && durationValid && !!factoryAddr && agenticReportEmailValid
  const circleNeedsFunds = circleBalance !== null && amountValid && circleBalance < amountBn

  const { data: usdcBalance } = useReadContract({
    address:      ARC_USDC,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [connectedAddr ?? '0x0000000000000000000000000000000000000000'],
    query:        { enabled: !!connectedAddr && isOnArc, refetchInterval: 10_000 },
  })
  const insufficientFunds = usdcBalance !== undefined && amountValid && usdcBalance < amountBn

  const isWorking   = step === 'funding' || step === 'creating'
  const deployReady = isFormValid && !isWorking && !insufficientFunds
  const streamPayPrivyReady = !PRIVY_AUTH_ENABLED || privyAuthenticated
  const circleActionReady = circleAvailable && circleConfigured && circleReady && !isWorking && !circleNeedsFunds
  const agenticLinkParams = isAgenticStreaming ? {
    mode: 'agentic-streaming',
    service: agenticService,
    reportEmail,
    agentSlug: prefill.agentSlug || 'hashpaylink-agent',
    amountPerDay: prefill.amountPerDay || '',
  } : undefined

  function rememberStream(streamUrl: string) {
    const stream = {
      url: streamUrl,
      recipient,
      amount: `${formatUsdcFull(amountBn)} USDC`,
      reason,
      createdAt: Date.now(),
    }
    saveRecentStream(stream)
    setRecentStreams(loadRecentStreams(recipient))
  }

  async function refreshCircleBalance(walletAddress = circleSession?.wallet.address) {
    if (!walletAddress || !publicClient) return null
    setCircleBalanceRefreshing(true)
    try {
      const balance = await publicClient.readContract({
        address: ARC_USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [walletAddress],
      }) as bigint
      setCircleBalance(balance)
      return balance
    } finally {
      setCircleBalanceRefreshing(false)
    }
  }

  async function waitForPredictedVault(vaultAddress: `0x${string}`) {
    if (!publicClient) return false
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const bytecode = await publicClient.getBytecode({ address: vaultAddress }).catch(() => undefined)
      if (bytecode && bytecode !== '0x') return true
      await sleep(2_500)
    }
    return false
  }

  async function registerAgenticSubscription(vault: `0x${string}`, streamUrl: string, senderWallet?: `0x${string}`) {
    if (!isAgenticStreaming) return
    setAgenticStatus('')
    setAgenticError(null)
    try {
      const res = await fetch('/api/agentic-streaming-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service: agenticService,
          vault,
          streamUrl,
          agentSlug: prefill.agentSlug || 'hashpaylink-agent',
          agentWallet: recipient,
          senderWallet,
          reportEmail,
          amountPerDay: prefill.amountPerDay || '',
          totalAmount: amount,
          duration: prefill.duration || `${Number(durationSecs) / 86_400}d`,
          reason,
          source: 'streampay-telegram',
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not register Agentic Streaming.')
      setAgenticStatus('Registered. 0G proof appears in Agent activity after archive.')
    } catch (err) {
      setAgenticError(err instanceof Error ? err.message.slice(0, 180) : 'Could not register Agentic Streaming.')
    }
  }

  async function rememberPrivyCircleSession(session: CircleEvmEmailSession, email = circleEmail || privyEmail) {
    if (!PRIVY_AUTH_ENABLED || !privyAuthenticated) return
    try {
      const token = await getAccessToken()
      if (!token) return
      await savePrivyCircleLink({
        accessToken: token,
        chain: 'arc',
        purpose: 'payment',
        email: cleanEmail(email),
        wallet: {
          id: session.wallet.id,
          address: session.wallet.address,
          blockchain: session.wallet.blockchain,
        },
      })
      setLinkedCircleAddress(session.wallet.address)
      setPrivyCircleLinkError(null)
    } catch (err) {
      setPrivyCircleLinkError(err instanceof Error ? err.message.slice(0, 160) : 'Circle wallet connected, but the saved link was not updated.')
    }
  }

  useEffect(() => {
    if (!circleAvailable || !PRIVY_AUTH_ENABLED) return
    if (privyEmail) setCircleEmail(current => current || privyEmail)
  }, [circleAvailable, privyEmail])

  useEffect(() => {
    if (!circleAvailable || !PRIVY_AUTH_ENABLED || !privyAuthenticated) return
    let cancelled = false

    async function restorePrivyCircleLink() {
      setPrivyCircleLinkLoading(true)
      setPrivyCircleLinkError(null)
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Privy session is not ready yet.')
        const data = await resolvePrivyCircleLink({
          accessToken: token,
          chain: 'arc',
          purpose: 'payment',
        })
        if (cancelled) return
        if (data.email) setCircleEmail(current => current || data.email || privyEmail)
        if (data.link?.circleWalletAddress) setLinkedCircleAddress(data.link.circleWalletAddress)
      } catch (err) {
        if (!cancelled) {
          console.warn('[StreamPay] Privy Circle wallet link restore failed', err)
          setPrivyCircleLinkError(null)
        }
      } finally {
        if (!cancelled) setPrivyCircleLinkLoading(false)
      }
    }

    void restorePrivyCircleLink()
    return () => {
      cancelled = true
    }
  }, [circleAvailable, privyAuthenticated, privyEmail, getAccessToken])

  useEffect(() => {
    if (!circleSession?.wallet.address || !publicClient || isWorking) return
    const walletAddress = circleSession.wallet.address
    const first = window.setTimeout(() => {
      void refreshCircleBalance(walletAddress)
    }, 2_000)
    const interval = window.setInterval(() => {
      void refreshCircleBalance(walletAddress)
    }, 8_000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(interval)
    }
  }, [circleSession?.wallet.address, publicClient, isWorking])

  useEffect(() => {
    setRecipientInviteLink(null)
    setRecipientInviteStatus('')
    setRecipientInviteError(null)
    setRecipientInviteCopied(false)
    if (recipientEmailMode) setStreamRecipientEmail(recipientEmail)
  }, [recipientEmail])

  useEffect(() => {
    if (!circleAvailable || activeTab !== 'running' || !recipientValid) return
    if (!circleSession?.wallet.address) {
      setOnchainStreams([])
      setOnchainStreamsLoading(false)
      setOnchainStreamsError(null)
      return
    }
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30_000)
    const query = new URLSearchParams({ recipient })
    query.set('sender', circleSession.wallet.address)
    setOnchainStreamsLoading(true)
    setOnchainStreamsError(null)
    fetch(`/api/stream-history?${query.toString()}`, { signal: controller.signal })
      .then(async res => {
        const data = await res.json().catch(() => ({})) as { ok?: boolean; streams?: OnchainStream[]; error?: string }
        if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not load streams')
        setOnchainStreams(data.streams ?? [])
      })
      .catch(err => {
        if ((err as Error).name === 'AbortError') {
          setOnchainStreamsError('Could not load streams from Arc. Try again in a moment.')
          return
        }
        setOnchainStreamsError(err instanceof Error ? err.message : 'Could not load streams')
      })
      .finally(() => {
        window.clearTimeout(timeout)
        setOnchainStreamsLoading(false)
      })
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [activeTab, circleAvailable, recipient, recipientValid, circleSession?.wallet.address])

  async function handleDeploy() {
    if (!deployReady || !connectedAddr || !publicClient) return
    setError(null)
    const startTime = BigInt(Math.floor(Date.now() / 1000) + 120)
    const endTime   = startTime + durationSecs
    try {
      const predicted = await publicClient.readContract({
        address: factoryAddr, abi: STREAM_VAULT_FACTORY_ABI,
        functionName: 'getVaultAddress',
        args: [connectedAddr, recipient as `0x${string}`, amountBn, startTime, endTime, salt],
      }) as `0x${string}`

      setStep('funding'); setStatusMsg('Sign to fund vault…')
      const fundTx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'transfer', args: [predicted, amountBn], gas: 100_000n,
      })
      setStatusMsg('Confirming on Arc…')
      await publicClient.waitForTransactionReceipt({ hash: fundTx })

      setStep('creating'); setStatusMsg('Sign to deploy vault…')
      const deployTx = await writeContractAsync({
        address: factoryAddr, abi: STREAM_VAULT_FACTORY_ABI,
        functionName: 'createStream',
        args: [recipient as `0x${string}`, amountBn, startTime, endTime, salt],
        gas: 2_000_000n,
      })
      setDeployTxHash(deployTx); setStatusMsg('Deploying on Arc…')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx })

      const logs  = parseEventLogs({ abi: STREAM_VAULT_FACTORY_ABI, logs: receipt.logs })
      const event = logs.find(l => l.eventName === 'StreamCreated')
      const vault = (event?.args as { vault?: `0x${string}` })?.vault
      if (!vault) throw new Error('Could not extract vault address from receipt.')

      const nextStreamLink = buildStreamLink(vault, reason, false, '', agenticLinkParams)
      setStreamLink(nextStreamLink)
      rememberStream(nextStreamLink)
      await registerAgenticSubscription(vault, nextStreamLink, connectedAddr)
      setStep('success'); setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 180)); setStep('form')
    }
  }

  async function handleCircleDeploy() {
    if (!circleActionReady || !publicClient) return
    if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
      loginPrivy()
      return
    }
    const email = cleanEmail(PRIVY_AUTH_ENABLED ? privyEmail : circleEmail)
    if (!email && !circleSession) {
      setError(PRIVY_AUTH_ENABLED ? 'Sign in with a Privy email account to use Circle Smart Wallet.' : 'Enter your email to continue with Circle Smart Wallet.')
      return
    }

    setError(null)
    const startTime = BigInt(Math.floor(Date.now() / 1000) + 120)
    const endTime   = startTime + durationSecs
    try {
      setStep('funding')
      setStatusMsg(circleSession ? 'Preparing Circle Smart Wallet...' : 'Opening Circle Smart Wallet...')
      const session = circleSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)
      void rememberPrivyCircleSession(session, email)

      const balance = await refreshCircleBalance(session.wallet.address)
      if (balance !== null && balance < amountBn) {
        setStep('form')
        setStatusMsg('')
        return
      }

      const predicted = await publicClient.readContract({
        address: factoryAddr, abi: STREAM_VAULT_FACTORY_ABI,
        functionName: 'getVaultAddress',
        args: [session.wallet.address, recipient as `0x${string}`, amountBn, startTime, endTime, salt],
      }) as `0x${string}`

      setStep('creating')
      setStatusMsg('Confirm stream in Circle Smart Wallet...')
      const txHash = await sendCircleArcStream({
        session,
        factoryAddress: factoryAddr,
        recipient: recipient as `0x${string}`,
        amountUnits: amountBn.toString(),
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        salt,
        predictedVault: predicted,
      })
      if (!txHash) {
        setStatusMsg('Waiting for Arc stream confirmation...')
        const deployed = await waitForPredictedVault(predicted)
        if (!deployed) {
          throw new Error('Circle submitted the stream, but Arc confirmation is still pending. Refresh this page in a minute and check the stream link again.')
        }
        const nextStreamLink = buildStreamLink(predicted, reason, true, streamRecipientEmail, agenticLinkParams)
        setStreamLink(nextStreamLink)
        rememberStream(nextStreamLink)
        await registerAgenticSubscription(predicted, nextStreamLink, session.wallet.address)
        void refreshCircleBalance(session.wallet.address)
        setStep('success')
        setStatusMsg('')
        return
      }

      setDeployTxHash(txHash)
      setStatusMsg('Deploying on Arc...')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      const logs  = parseEventLogs({ abi: STREAM_VAULT_FACTORY_ABI, logs: receipt.logs })
      const event = logs.find(l => l.eventName === 'StreamCreated')
      const vault = (event?.args as { vault?: `0x${string}` })?.vault
      if (!vault) throw new Error('Could not extract vault address from receipt.')

      const nextStreamLink = buildStreamLink(vault, reason, true, streamRecipientEmail, agenticLinkParams)
      setStreamLink(nextStreamLink)
      rememberStream(nextStreamLink)
      await registerAgenticSubscription(vault, nextStreamLink, session.wallet.address)
      void refreshCircleBalance(session.wallet.address)
      setStep('success')
      setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('cancel') || msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 180))
      setStep('form')
      setStatusMsg('')
    }
  }

  function handleCopy() {
    if (!streamLink) return
    navigator.clipboard.writeText(streamLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  async function handleCopyCircleWallet() {
    if (!circleSession?.wallet.address) return
    await navigator.clipboard.writeText(circleSession.wallet.address)
    setCircleCopied(true)
    setTimeout(() => setCircleCopied(false), 3000)
  }

  async function handleCircleConnectOnly() {
    if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
      loginPrivy()
      return
    }
    const email = cleanEmail(PRIVY_AUTH_ENABLED ? privyEmail : circleEmail)
    if (!email) {
      setOnchainStreamsError(PRIVY_AUTH_ENABLED ? 'Sign in with a Privy email account to continue.' : 'Enter the sender email.')
      return
    }
    setOnchainStreamsError(null)
    setOnchainStreamsLoading(true)
    try {
      const session = await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)
      void rememberPrivyCircleSession(session, email)
      void refreshCircleBalance(session.wallet.address)
    } catch (err) {
      setOnchainStreamsError(err instanceof Error ? err.message.slice(0, 180) : 'Could not connect Circle Smart Wallet.')
    } finally {
      setOnchainStreamsLoading(false)
    }
  }

  async function handleEndRunningStream(stream: OnchainStream) {
    if (!publicClient) return
    setOnchainStreamsError(null)
    setEndingVault(stream.vault)
    try {
      if (PRIVY_AUTH_ENABLED && !privyAuthenticated) {
        loginPrivy()
        return
      }
      const email = cleanEmail(PRIVY_AUTH_ENABLED ? privyEmail : circleEmail)
      const session = circleSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)
      void rememberPrivyCircleSession(session, email)
      if (session.wallet.address.toLowerCase() !== stream.sender.toLowerCase()) {
        throw new Error('Use the sender email for this stream.')
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600)
      const nonce = await publicClient.readContract({
        address: stream.vault,
        abi: STREAM_VAULT_ABI,
        functionName: 'nonces',
        args: [session.wallet.address],
      }) as bigint
      const sig = await signCircleArcStreamCancel({
        session,
        vaultAddress: stream.vault,
        nonce: nonce.toString(),
        deadline: deadline.toString(),
      })
      const res = await fetch('/api/relay-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          vaultAddress: stream.vault,
          sig,
          nonce: nonce.toString(),
          deadline: deadline.toString(),
        }),
      })
      const data = await res.json() as { ok?: boolean; txHash?: `0x${string}`; error?: string }
      if (!res.ok || !data.ok || !data.txHash) throw new Error(data.error ?? 'Could not end stream.')
      await publicClient.waitForTransactionReceipt({ hash: data.txHash })
      setOnchainStreams(current => current.map(item =>
        item.vault.toLowerCase() === stream.vault.toLowerCase()
          ? { ...item, active: false, cancelled: true }
          : item
      ))
    } catch (err) {
      setOnchainStreamsError(err instanceof Error ? err.message.slice(0, 180) : 'Could not end stream.')
    } finally {
      setEndingVault('')
    }
  }

  async function handleSendRecipientInvite() {
    if (!recipientEmailMode || !amountValid || !durationValid) return
    setRecipientInviteSending(true)
    setRecipientInviteError(null)
    setRecipientInviteStatus('')
    try {
      const durationLabel = durationPreset
        ? DURATIONS.find(item => item.secs === durationPreset)?.label ?? `${Number(durationSecs) / 86_400} days`
        : `${customDays || Number(durationSecs) / 86_400} days`
      const res = await fetch('/api/stream-recipient-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: recipientEmail,
          amount: `${formatUsdcFull(amountBn)} USDC`,
          duration: durationLabel,
          reason,
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; setupUrl?: string; error?: string }
      if (!res.ok || !data.ok || !data.setupUrl) throw new Error(data.error ?? 'Could not send recipient invite.')
      setRecipientInviteLink(data.setupUrl)
      setRecipientInviteStatus(`Invite sent to ${recipientEmail}.`)
    } catch (err) {
      setRecipientInviteError(err instanceof Error ? err.message.slice(0, 180) : 'Could not send recipient invite.')
    } finally {
      setRecipientInviteSending(false)
    }
  }

  async function handleCheckRecipientReady() {
    if (!recipientEmailMode) return
    setRecipientReadyChecking(true)
    setRecipientInviteError(null)
    try {
      const res = await fetch(`/api/circle-recipient-wallet?email=${encodeURIComponent(recipientEmail)}`)
      const data = await res.json().catch(() => ({})) as { ok?: boolean; found?: boolean; walletAddress?: string; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not check recipient wallet.')
      if (!data.found || !data.walletAddress) {
        setRecipientInviteStatus('Recipient wallet is not ready yet.')
        return
      }
      setRecipient(data.walletAddress)
      setRecipientInviteStatus('Recipient wallet ready. StreamPay can now deploy to this wallet.')
    } catch (err) {
      setRecipientInviteError(err instanceof Error ? err.message.slice(0, 180) : 'Could not check recipient wallet.')
    } finally {
      setRecipientReadyChecking(false)
    }
  }

  async function handleCopyRecipientInvite() {
    if (!recipientInviteLink) return
    await navigator.clipboard.writeText(recipientInviteLink)
    setRecipientInviteCopied(true)
    setTimeout(() => setRecipientInviteCopied(false), 2500)
  }

  async function handleEmailStreamLink() {
    if (!streamLink || !streamRecipientEmail) return
    setStreamEmailSending(true)
    setStreamEmailStatus('')
    setStreamEmailError(null)
    try {
      const durationLabel = durationPreset
        ? DURATIONS.find(item => item.secs === durationPreset)?.label ?? `${Number(durationSecs) / 86_400} days`
        : `${customDays || Number(durationSecs) / 86_400} days`
      const res = await fetch('/api/stream-recipient-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: streamRecipientEmail,
          amount: `${formatUsdcFull(amountBn)} USDC`,
          duration: durationLabel,
          reason,
          streamUrl: streamLink,
        }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not email stream link.')
      setStreamEmailStatus(`Claim link emailed to ${streamRecipientEmail}.`)
    } catch (err) {
      setStreamEmailError(err instanceof Error ? err.message.slice(0, 180) : 'Could not email stream link.')
    } finally {
      setStreamEmailSending(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success' && streamLink) {
    return (
      <div className="w-full max-w-[480px] mx-auto mt-12">
        <div className="space-y-6">

          {/* Page title */}
          <div className="text-center space-y-1.5">
            <h1 className="text-[26px] sm:text-[30px] font-bold tracking-tight text-gray-900 dark:text-gray-100">
              {isAgenticStreaming ? <>Agentic<span style={{ color: '#3b82f6' }}> Streaming</span></> : <>Pay<span style={{ color: '#3b82f6' }}>roll</span></>}
            </h1>
            <p className="text-[13px] text-gray-400">
              {isAgenticStreaming ? 'Stream USDC to Hash PayLink Agent for daily Polymarket LP research' : 'Stream payment in USDC to anyone on Arc'}
            </p>
          </div>

          {/* Success card */}
          <div className="bg-white dark:bg-[#111216] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm px-5 py-7 sm:px-7 sm:py-8 text-center space-y-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-50 border border-gray-200">
              <svg className="h-6 w-6 text-gray-700" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div className="space-y-1.5">
              <p className="text-[17px] font-bold text-gray-900 dark:text-gray-100">Stream Deployed</p>
              {reason && (
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{reason}</p>
              )}
              <p className="text-[13px] text-gray-500 dark:text-gray-400">
                {formatUsdcFull(amountBn)} USDC streaming to{' '}
                <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">
                  {recipient.slice(0, 6)}…{recipient.slice(-4)}
                </span>
              </p>
              {isAgenticStreaming && (
                <p className="text-[12px] text-gray-400">
                  Report email saved as <span className="font-semibold text-gray-600 dark:text-gray-300">{reportEmail}</span>
                </p>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 dark:bg-white/5 border-2 border-gray-200 dark:border-white/10 p-4 text-left space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Share Stream Link</p>
              <p className="break-all font-mono text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{streamLink}</p>
              <div className="space-y-2">
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition-all min-h-[48px]"
                  style={copied
                    ? { background: '#f9fafb', color: '#374151', border: '2px solid #e5e7eb' }
                    : { background: '#111827', color: '#ffffff', border: '2px solid #111827' }}
                >
                  {copied
                    ? <><CheckIcon />LINK COPIED</>
                    : 'Copy Link'}
                </button>
                <a
                  href={streamLink}
                  className="w-full flex items-center justify-center rounded-xl border-2 border-gray-200 dark:border-white/10 py-3 text-[13px] font-semibold text-gray-700 dark:text-gray-200 transition-colors hover:bg-gray-50 dark:hover:bg-white/5 min-h-[48px]"
                >
                  View Stream
                </a>
                {streamRecipientEmail && (
                  <button
                    type="button"
                    onClick={handleEmailStreamLink}
                    disabled={streamEmailSending}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] py-2.5 text-[12px] font-semibold text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {streamEmailSending ? 'Sending...' : streamEmailStatus ? 'Email sent' : 'Email recipient'}
                  </button>
                )}
              </div>
              {streamEmailStatus && <p className="text-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{streamEmailStatus}</p>}
              {streamEmailError && <p className="text-center text-[11px] font-semibold text-red-500 dark:text-red-400">{streamEmailError}</p>}
              {agenticStatus && <p className="text-center text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">{agenticStatus}</p>}
              {agenticError && <p className="text-center text-[11px] font-semibold text-red-500 dark:text-red-400">{agenticError}</p>}
            </div>

            {deployTxHash && (
              <a
                href={`${ARC_EXPLORER}/tx/${deployTxHash}`}
                target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                <ExtLinkIcon />
                View on Arcscan
              </a>
            )}

            <HashPayLinkBadge />
          </div>
        </div>
      </div>
    )
  }

  // ── Status hint ───────────────────────────────────────────────────────────
  const hint = (() => {
    if (isWorking) return step === 'funding' ? 'Step 1 of 2 — funding vault' : 'Step 2 of 2 — deploying stream'
    if (isAgenticStreaming && !agenticReportEmailValid) return 'Enter the email that should receive daily LP research'
    if (isAgenticStreaming) return 'Circle Smart Wallet streams Arc USDC to Hash PayLink Agent'
    if (circleAvailable) return 'Circle Smart Wallet signs and deploys the Arc stream with email'
    if (!isConnected) return 'Connect your wallet in the header above to continue'
    if (!isOnArc) return null
    if (insufficientFunds) return null
    if (recipientEmailMode) return 'Send recipient invite, then check readiness before deploying'
    if (!recipientValid && recipient) return null
    if (!recipientValid) return 'Enter a recipient address or email to continue'
    if (!amountValid) return 'Enter an amount to continue'
    if (!durationValid) return 'Select a stream duration to continue'
    return '2 wallet signatures required — fund vault, then deploy'
  })()

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="w-full max-w-[520px] mx-auto mt-8 sm:mt-10">
      <div className="space-y-8">

        {/* ── Page title (Rule 4: aligned to same 480px) ── */}
        <div className="text-center space-y-2">
          <h1 className="text-[25px] sm:text-[30px] font-bold tracking-tight text-gray-900 dark:text-gray-100">
            {isAgenticStreaming ? <>Agentic<span style={{ color: '#3b82f6' }}> Streaming</span></> : <>Pay<span style={{ color: '#3b82f6' }}>roll</span></>}
          </h1>
          <p className="mx-auto max-w-[420px] text-[13px] leading-relaxed text-gray-400">
            {isAgenticStreaming ? 'Stream USDC to Hash PayLink Agent for daily Polymarket LP research. Marketplace coming soon.' : 'Stream payment in USDC to anyone on Arc'}
          </p>
        </div>

        {circleConfigured && (
          <div className="mx-auto flex w-full max-w-[380px] items-center justify-center rounded-full border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111216] px-3 py-2 shadow-sm">
            <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">Secure email sign-in · Circle wallet on Arc</span>
          </div>
        )}

        {circleAvailable && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 p-1">
              {([
                ['new', 'New stream'],
                ['running', 'Running streams'],
              ] as const).map(([key, label]) => {
                const active = activeTab === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={[
                      'rounded-lg px-3 py-2 text-[12px] font-bold transition-colors',
                      active
                        ? 'bg-white dark:bg-[#15151a] text-gray-900 dark:text-gray-100 shadow-sm'
                        : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {activeTab === 'running' && (
              <div className="bg-white dark:bg-[#111216] rounded-2xl border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
                <div className="p-5 sm:p-7 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StaticStreamMark />
                      <div>
                        <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100">Running streams</p>
                        <p className="text-[11px] text-gray-400">Loaded from StreamPay on-chain events</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-gray-400">Arc</span>
                  </div>

                  {!circleSession ? (
                    <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3">
                      <div>
                        <p className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Continue with Privy</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">Your Privy email unlocks the mapped Circle wallet for stream management.</p>
                      </div>
                      {PRIVY_AUTH_ENABLED && privyAuthenticated && (
                        <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-4 py-3">
                          <p className="truncate text-[12px] font-semibold text-gray-700 dark:text-gray-200">{privyEmail || 'Privy account connected'}</p>
                          {linkedCircleAddress && (
                            <p className="mt-1 font-mono text-[11px] text-gray-400">{shortAddress(linkedCircleAddress)}</p>
                          )}
                        </div>
                      )}
                      {!PRIVY_AUTH_ENABLED && (
                        <input
                          type="email"
                          name="streampay-running-sender-email"
                          autoComplete="email"
                          placeholder="Sender wallet email"
                          value={circleEmail}
                          onChange={e => setCircleEmail(e.target.value)}
                          disabled={onchainStreamsLoading}
                          className="w-full rounded-xl border-2 border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-4 py-3 text-[13px] text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-300 transition-colors disabled:opacity-50 min-h-[46px]"
                        />
                      )}
                      <button
                        type="button"
                        onClick={handleCircleConnectOnly}
                        disabled={onchainStreamsLoading}
                        className="w-full rounded-xl bg-gray-900 py-3 text-[13px] font-bold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {onchainStreamsLoading ? 'Connecting...' : privyAuthenticated || !PRIVY_AUTH_ENABLED ? 'Open Circle wallet' : 'Sign in'}
                      </button>
                      {onchainStreamsError && (
                        <p className="text-center text-[11px] font-semibold text-red-500 dark:text-red-400">{onchainStreamsError}</p>
                      )}
                    </div>
                  ) : onchainStreamsLoading ? (
                    <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/70 dark:bg-white/5 px-4 py-5 text-center">
                      <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-300">Checking Arc streams...</p>
                    </div>
                  ) : onchainStreamsError ? (
                    <div className="rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-4 py-4 text-center space-y-2">
                      <p className="text-[12px] font-semibold text-red-500 dark:text-red-300">{onchainStreamsError}</p>
                      {recentStreams.length > 0 && (
                        <p className="text-[11px] text-gray-400">{recentStreams.length} browser-saved stream{recentStreams.length === 1 ? '' : 's'} available as fallback.</p>
                      )}
                    </div>
                  ) : onchainStreams.length > 0 ? (
                    <div className="space-y-2">
                      {onchainStreams.map(stream => {
                        const streamUrl = buildStreamLink(stream.vault, reason, true, streamRecipientEmail, agenticLinkParams)
                        const endMs = Number(BigInt(stream.endTime)) * 1000
                        const status = stream.cancelled ? 'Cancelled' : stream.active ? 'Live' : 'Complete'
                        const isEnding = endingVault.toLowerCase() === stream.vault.toLowerCase()
                        return (
                        <div
                          key={stream.vault}
                          className="flex items-center gap-2 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/70 dark:bg-white/5 px-3 py-3"
                        >
                          <a href={streamUrl} className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-bold text-gray-700 dark:text-gray-200">{reason || 'Arc USDC stream'}</span>
                            <span className="block text-[11px] text-gray-400">{formatUsdcFull(BigInt(stream.totalAmount))} USDC · {Number.isFinite(endMs) ? new Date(endMs).toLocaleDateString() : shortAddress(stream.vault)}</span>
                          </a>
                          <span className={`shrink-0 text-[11px] font-semibold ${stream.active ? 'text-emerald-500' : 'text-gray-400'}`}>{status}</span>
                          {stream.active && (
                            <button
                              type="button"
                              onClick={() => handleEndRunningStream(stream)}
                              disabled={!!endingVault}
                              className="shrink-0 rounded-lg border border-red-100 dark:border-red-900/40 bg-white dark:bg-[#15151a] px-2.5 py-1.5 text-[11px] font-semibold text-red-500 dark:text-red-300 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isEnding ? 'Ending' : 'End'}
                            </button>
                          )}
                        </div>
                      )})}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50/70 dark:bg-white/5 px-4 py-5 text-center space-y-2">
                      <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-300">No on-chain streams found for this recipient.</p>
                      <p className="text-[11px] text-gray-400">Create a stream, then it can be found from any browser.</p>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => setActiveTab('new')}
                    className="w-full rounded-xl bg-gray-900 py-3 text-[13px] font-bold text-white transition-transform active:scale-[0.98]"
                  >
                    New stream
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Vault Card + How It Works ── */}
        <div className={circleAvailable && activeTab === 'running' ? 'hidden' : 'space-y-4'}>
          {/* Vault Card */}
          <div className="bg-white dark:bg-[#111216] rounded-[24px] border border-gray-100 dark:border-white/10 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-7 space-y-6">

              {isAgenticStreaming && (
                <div className="rounded-[20px] border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100">Polymarket LP desk</p>
                      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                        Daily LP research delivered by Hash PayLink Agent.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {prefill.amountPerDay || '0.01'} USDC/day
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Delivery email</span>
                    <input
                      type="email"
                      name="streampay-agentic-report-email"
                      autoComplete="off"
                      value={reportEmail}
                      onChange={e => setReportEmail(e.target.value.trim())}
                      disabled={isWorking}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-4 py-3 text-[13px] text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-gray-400 transition-colors disabled:opacity-50 min-h-[46px]"
                    />
                    {!agenticReportEmailValid && (
                      <p className="text-[11px] font-semibold text-red-500">Add a valid email for daily LP research.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Recipient Address capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <StaticStreamMark />
                    <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Recipient</span>
                  </div>
                  <span className="text-[11px] text-gray-400">Arc Network</span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    name="streampay-recipient"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    placeholder="0x address or recipient@email.com"
                    value={recipient}
                    onChange={e => setRecipient(e.target.value.trim())}
                    readOnly={recipientLocked}
                    spellCheck={false}
                    disabled={isWorking}
                    className={[
                      'w-full rounded-xl border-2 px-4 py-3 text-[13px] font-mono min-h-[48px]',
                      'placeholder:text-gray-300 dark:placeholder:text-gray-600 placeholder:font-sans focus:outline-none transition-colors text-gray-800 dark:text-gray-100',
                      'disabled:opacity-50 disabled:cursor-not-allowed read-only:cursor-default',
                      recipient && !recipientValid && !recipientEmailMode
                        ? 'border-red-200 bg-red-50/30'
                        : recipientValid || recipientEmailMode
                        ? 'border-blue-200 bg-blue-50/20'
                        : 'border-gray-200 dark:border-white/10 dark:bg-[#15151a] focus:border-gray-400',
                    ].join(' ')}
                  />
                  {recipientEmailMode && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-600">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                        Email
                      </span>
                    </div>
                  )}
                </div>

                {recipientValid && (
                  <p className="text-[11px] text-blue-500 flex items-center gap-1">
                    <CheckIcon small />
                    Address valid
                  </p>
                )}
                {recipientEmailMode && (
                  <div className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3">
                    <div>
                      <p className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Recipient wallet setup needed</p>
                      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                        Send an invite so {recipientEmail} can prepare a Circle wallet. After they finish, check readiness and deploy the stream.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleSendRecipientInvite}
                        disabled={!amountValid || !durationValid || recipientInviteSending || isWorking}
                        className="rounded-xl bg-gray-900 px-3 py-2.5 text-[12px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {recipientInviteSending ? 'Sending...' : 'Email invite'}
                      </button>
                      <button
                        type="button"
                        onClick={handleCheckRecipientReady}
                        disabled={recipientReadyChecking || isWorking}
                        className="rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-3 py-2.5 text-[12px] font-bold text-gray-700 dark:text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {recipientReadyChecking ? 'Checking...' : 'Check ready'}
                      </button>
                    </div>
                    {recipientInviteLink && (
                      <button
                        type="button"
                        onClick={handleCopyRecipientInvite}
                        className="w-full rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-3 py-2 text-[11px] font-semibold text-blue-600 dark:text-blue-300"
                      >
                        {recipientInviteCopied ? 'Setup link copied' : 'Copy setup link'}
                      </button>
                    )}
                    {recipientInviteStatus && <p className="text-[11px] font-semibold text-emerald-600">{recipientInviteStatus}</p>}
                    {recipientInviteError && <p className="text-[11px] font-semibold text-red-500">{recipientInviteError}</p>}
                  </div>
                )}
                {recipient && !recipientValid && !recipientEmailMode && (
                  <p className="text-[11px] text-red-400">Enter a valid EVM address or recipient email</p>
                )}
              </div>

              {/* ── Amount capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ChainIcon />
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Amount</span>
                </div>
                <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] transition-colors focus-within:border-gray-400">
                  <input
                    type="number"
                    placeholder="0.0"
                    min="0" step="any"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    disabled={isWorking}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[14px] font-semibold text-gray-900 dark:text-gray-100 focus:outline-none disabled:opacity-50 placeholder:text-gray-300 dark:placeholder:text-gray-600 placeholder:font-normal min-h-[48px]"
                  />
                  <div className="flex items-center px-4 border-l-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 shrink-0">
                    <span className="text-[12px] font-bold text-gray-500 select-none">USDC</span>
                  </div>
                </div>
                {isConnected && isOnArc && usdcBalance !== undefined ? (
                  <p className="text-[11px] text-gray-400">
                    Balance:{' '}
                    <span className={`font-semibold ${insufficientFunds ? 'text-red-500' : 'text-gray-600'}`}>
                      {formatUsdcFull(usdcBalance)} USDC
                    </span>
                    {insufficientFunds && <span className="ml-1.5 font-semibold text-red-500">— insufficient</span>}
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-400">USDC on Arc Network</p>
                )}
              </div>

              {/* ── Duration capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <ClockIcon />
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Duration</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DURATIONS.map(d => {
                    const active = durationPreset === d.secs
                    return (
                      <button
                        key={d.label}
                        type="button"
                        disabled={isWorking}
                        onClick={() => { setDurationPreset(d.secs); setCustomDays('') }}
                        className="rounded-xl border-2 px-3.5 py-2.5 text-[12px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                        style={active
                          ? { background: '#111827', borderColor: '#111827', color: '#ffffff' }
                          : { background: '#ffffff', borderColor: '#e5e7eb', color: '#4b5563' }}
                      >
                        {d.label}
                      </button>
                    )
                  })}
                </div>
                <div className="flex overflow-hidden rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] transition-colors focus-within:border-gray-400">
                  <input
                    type="number"
                    placeholder="Custom days"
                    min="0.1" step="0.1"
                    value={customDays}
                    disabled={isWorking}
                    onChange={e => { setCustomDays(e.target.value); setDurationPreset(null) }}
                    className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[13px] text-gray-900 dark:text-gray-100 focus:outline-none disabled:opacity-50 placeholder:text-gray-300 dark:placeholder:text-gray-600 min-h-[48px]"
                  />
                  <div className="flex items-center px-4 border-l-2 border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 shrink-0">
                    <span className="text-[12px] font-bold text-gray-500 select-none">DAYS</span>
                  </div>
                </div>
              </div>

              {/* ── Memo capsule ── */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <TagIcon />
                  <span className="text-[13px] font-semibold text-gray-700 dark:text-gray-200">Memo</span>
                  <span className="text-[11px] text-gray-400">optional · stored on-chain</span>
                </div>
                <input
                  type="text"
                  placeholder="e.g., April Salary, Freelance Gig…"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  disabled={isWorking}
                  maxLength={80}
                  className="w-full rounded-xl border-2 border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-4 py-3 text-[13px] text-gray-900 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-gray-400 transition-colors disabled:opacity-50 min-h-[48px]"
                />
              </div>

              {/* ── CTA ── */}
              <div className="space-y-2.5 pt-1">
                {circleAvailable && (
                  <div className="rounded-[20px] border border-gray-100 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100">
                          {streamPayPrivyReady ? 'Ready to start' : 'Secure sign-in'}
                        </p>
                        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                          {streamPayPrivyReady
                            ? 'Circle opens a protected Arc wallet session to start this stream.'
                            : 'Sign in with email, then Circle opens your Arc wallet session.'}
                        </p>
                      </div>
                    </div>

                    {!circleSession && PRIVY_AUTH_ENABLED && privyAuthenticated && (
                      <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-4 py-3">
                        <p className="truncate text-[12px] font-semibold text-gray-700 dark:text-gray-200">{privyEmail || 'Privy account connected'}</p>
                        <p className="mt-1 text-[11px] text-gray-400">
                          {privyCircleLinkLoading
                            ? 'Checking saved Circle wallet...'
                            : linkedCircleAddress
                              ? `Circle wallet ${shortAddress(linkedCircleAddress)}`
                              : 'Circle wallet will be mapped after first confirmation'}
                        </p>
                      </div>
                    )}

                    {!circleSession && !PRIVY_AUTH_ENABLED && (
                      <input
                        type="email"
                        name="streampay-sender-email"
                        autoComplete="email"
                        placeholder="email@example.com"
                        value={circleEmail}
                        onChange={e => setCircleEmail(e.target.value)}
                        disabled={isWorking}
                        className="w-full rounded-xl border-2 border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-4 py-3 text-[13px] text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-300 transition-colors disabled:opacity-50 min-h-[46px]"
                      />
                    )}

                    {circleSession && (
                      <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-3 py-2.5 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Smart wallet</p>
                            <p className="truncate font-mono text-[11px] text-gray-600 dark:text-gray-300">
                              {circleSession.wallet.address.slice(0, 8)}...{circleSession.wallet.address.slice(-6)}
                            </p>
                      </div>
                          <button
                            type="button"
                            onClick={handleCopyCircleWallet}
                            className="shrink-0 rounded-lg border border-gray-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300"
                          >
                            {circleCopied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className={`min-w-0 text-[11px] font-semibold ${circleNeedsFunds ? 'text-red-500' : 'text-gray-500'}`}>
                            Balance: {circleBalance === null ? 'checking...' : `${formatWalletUsdc(circleBalance)} USDC`}
                            {circleNeedsFunds ? ' - fund wallet first' : ''}
                          </p>
                          <button
                            type="button"
                            onClick={() => refreshCircleBalance()}
                            disabled={circleBalanceRefreshing || isWorking}
                            aria-label="Refresh Circle wallet balance"
                            title="Refresh balance"
                            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-200"
                          >
                            <RefreshCw className={`h-3 w-3 ${circleBalanceRefreshing ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={circleActionReady ? handleCircleDeploy : undefined}
                      disabled={!circleActionReady}
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold transition-all active:scale-[0.98] min-h-[52px]"
                      style={circleActionReady
                        ? { background: '#111827', color: '#ffffff', cursor: 'pointer' }
                        : { background: '#e5e7eb', color: '#9ca3af', cursor: 'not-allowed' }}
                    >
                      {isWorking
                        ? <><Spinner /><span className="text-[13px] font-medium">{statusMsg}</span></>
                        : streamPayPrivyReady ? (isAgenticStreaming ? 'Start agentic stream' : 'Start StreamPay') : 'Continue securely'}
                    </button>
                    {privyCircleLinkError && (
                      <p className="text-center text-[11px] font-semibold text-amber-600 dark:text-amber-300">{privyCircleLinkError}</p>
                    )}
                    <div className="flex justify-center">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-3 py-1">
                        <img src="/brand/circle-logo.jpeg" alt="" className="h-3 w-3 rounded-full object-cover" />
                        <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">Powered by Circle</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Wrong network — replace primary button */}
                {isConnected && !isOnArc && (
                  <button
                    onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-semibold transition-colors active:scale-[0.98] min-h-[52px]"
                    style={{ background: '#111827', color: '#ffffff' }}
                  >
                    Switch to Arc Network
                  </button>
                )}

                {/* START STREAMING — always visible, state reflects readiness */}
                {(!circleAvailable && (!isConnected || isOnArc)) && (
                  <button
                    onClick={deployReady ? handleDeploy : undefined}
                    disabled={!deployReady}
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[14px] font-bold tracking-widest transition-all active:scale-[0.98] min-h-[52px]"
                    style={deployReady
                      ? { background: '#111827', color: '#ffffff', cursor: 'pointer' }
                      : { background: '#f3f4f6', color: '#9ca3af', cursor: 'not-allowed' }}
                  >
                    {isWorking
                      ? <><Spinner /><span className="text-[13px] font-medium tracking-normal">{statusMsg}</span></>
                      : circleAvailable ? 'Use Connected Wallet Instead' : 'START STREAMING'}
                  </button>
                )}

                {insufficientFunds && !isWorking && !circleNeedsFunds && (
                  <p className="text-center text-[12px] font-semibold text-red-500">
                    Insufficient USDC — fund your Arc wallet first
                  </p>
                )}
                {hint && !insufficientFunds && !circleNeedsFunds && (
                  <p className="text-center text-[12px] text-gray-400">{hint}</p>
                )}
                {error && (
                  <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-center text-[12px] text-red-500">
                    {error}
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* ── How It Works ── */}
          <div className="space-y-3 pt-1">
            <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
              How It Works
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {([
                { n: '1', title: 'Fund vault',    desc: 'USDC is pre-loaded into a ghost vault' },
                { n: '2', title: 'Stream begins', desc: 'Funds unlock linearly to the recipient' },
                { n: '3', title: 'Claim anytime', desc: 'Recipient withdraws gaslessly on Arc' },
              ] as const).map(s => (
                <div key={s.n} className="rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#111216] p-3 sm:p-4 text-center shadow-sm space-y-1.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-[11px] font-semibold text-gray-500">
                    {s.n}
                  </span>
                  <p className="text-[11px] sm:text-[12px] font-bold text-gray-800 dark:text-gray-100">{s.title}</p>
                  <p className="text-[10px] sm:text-[11px] leading-snug text-gray-400">{s.desc}</p>
                </div>
              ))}
            </div>

            {/* ── Footer links ── */}
            <div className="border-t border-gray-100 dark:border-white/10 pt-4 flex items-center justify-center gap-8">
              <a
                href="mailto:support@hashpaylink.com"
                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <Mail className="h-3.5 w-3.5" />
                support@hashpaylink.com
              </a>
              <a
                href="https://x.com/Streampay_"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                <XIcon className="h-3.5 w-3.5" />
                @Streampay_
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Shared badge ──────────────────────────────────────────────────────────────
export function HashPayLinkBadge() {
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-3 py-1">
        <img src="/hash-logo.png" alt="#" className="h-3 w-3 opacity-50" />
        <span className="text-[10px] font-semibold text-gray-400">Powered by Hash PayLink</span>
      </span>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function StaticStreamMark() {
  return (
    <span className="relative inline-flex h-3 w-7 overflow-hidden rounded-full bg-emerald-100/80 dark:bg-emerald-950/40" aria-label="Stream ready">
      <span className="absolute left-1 top-1/2 h-0.5 w-5 -translate-y-1/2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.35)]" />
    </span>
  )
}

function CheckIcon({ small }: { small?: boolean }) {
  return (
    <svg className={`${small ? 'h-3 w-3' : 'h-4 w-4'} shrink-0`} fill="none" viewBox="0 0 24 24"
      stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function ChainIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg className="h-3.5 w-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  )
}

function StreamIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" />
    </svg>
  )
}

function ExtLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
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

// StreamIcon used in _unused_ legacy; keeping for potential future use
export { StreamIcon }
