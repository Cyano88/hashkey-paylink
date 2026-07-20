export const POCKET_NETWORKS = ['base', 'arbitrum', 'arc', 'solana'] as const
export type PocketNetwork = typeof POCKET_NETWORKS[number]

export const POCKET_ACCESS_LEVELS = ['public', 'guest', 'authenticated'] as const
export type PocketAccessLevel = typeof POCKET_ACCESS_LEVELS[number]

export const POCKET_MUTATION_STATUSES = ['requires_confirmation', 'processing', 'completed', 'failed'] as const
export type PocketMutationStatus = typeof POCKET_MUTATION_STATUSES[number]

export const POCKET_ERROR_CODES = [
  'AUTH_REQUIRED',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
  'RESOURCE_NOT_FOUND',
  'DUPLICATE_REQUEST',
  'VERSION_CONFLICT',
  'CONFIRMATION_REQUIRED',
  'CONFIRMATION_EXPIRED',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  'ACTION_FAILED',
  'INTERNAL_ERROR',
] as const
export type PocketErrorCode = typeof POCKET_ERROR_CODES[number]

export type PocketApiError = {
  code: PocketErrorCode
  message: string
  retryable: boolean
  field?: string
}

export type PocketMutationResult<T> = {
  ok: boolean
  requestId: string
  idempotencyKey: string
  status: PocketMutationStatus
  data?: T
  error?: PocketApiError
}

export type PocketProfileUpsertRequest = {
  firstName: string
  lastName: string
  email: string
  expectedUpdatedAt?: string
}

export type PocketProfileUpsertData = {
  profile: {
    firstName: string
    lastName: string
    email: string
    updatedAt: string
  }
  unchanged: boolean
}

export type PocketWalletLinkRecord = {
  network: PocketNetwork
  wallet: {
    id: string
    address: string
    blockchain: string
  }
  updatedAt: number
}

export type PocketWalletLinkMutationRequest = {
  action: 'link'
  network: PocketNetwork
  circleUserToken: string
  wallet: PocketWalletLinkRecord['wallet']
  expectedUpdatedAt?: number
} | {
  action: 'unlink'
  network: PocketNetwork
  expectedUpdatedAt?: number
}

export type PocketWalletLinkMutationData = {
  link: PocketWalletLinkRecord | null
  unchanged: boolean
}

export type PocketWalletsReadData = {
  wallets: Partial<Record<PocketNetwork, PocketWalletLinkRecord>>
}

export type PocketBalanceRow = {
  key: PocketNetwork
  label: string
  balance: number
  status: 'ok' | 'error'
  error?: string
}

export type PocketBalancesReadData = {
  total: number
  rows: PocketBalanceRow[]
}

export type PocketRecipientBalanceReadData = {
  network: 'solana'
  balance: string
}

export type PocketX402SnapshotData = {
  found: boolean
  walletAddress?: string
  connected: boolean
  network: 'base' | 'arc'
  walletBalance?: string
  walletBalanceChecked: boolean
  walletBalanceError?: string
  gatewayBalance?: string
  gatewayBalanceChecked: boolean
  gatewayBalanceError?: string
  updatedAt?: number
}

export type PocketX402WalletChoice = {
  address: string
  balance?: string
  balanceError?: string
}

export type PocketX402ConnectionData = {
  status: 'otp_sent' | 'connected'
  network: 'base' | 'arc'
  walletAddress?: string
  message?: string
}

export type PocketX402ActivationRequest = {
  network: 'base' | 'arc'
  amount: string
}

export type PocketX402ActivationData = {
  activationStatus: 'available' | 'pending'
  amount: string
  network: 'base' | 'arc'
  walletAddress: string
  gatewayBalance: string
  startingGatewayBalance?: string
  targetGatewayBalance?: string
  replayed: boolean
}

export type PocketActivityRow = {
  eventId: string
  txHash: string
  chain: string
  payer: string
  memo: string
  amount: string
  ts: number
  source?: string
  merchantId?: string
  contextLabel?: string
  settlementType?: string
  amountNgn?: string
  paycrestStatus?: string
  activityLabel?: string
  providerReference?: string
  supportReference?: string
  billToken?: string
  refundAction?: 'claim' | 'check'
  refundTxHash?: string
}

export type PocketActivityReadData = {
  payments: PocketActivityRow[]
}

export type PocketPosCreateRequest = {
  payout_preference: 'INSTANT_FIAT' | 'KEEP_CRYPTO'
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
  display_name: string
  supported_networks: PocketNetwork[]
  circle_smart_wallet_address?: string
  solana_wallet_address?: string
  bank_name?: string
  bank_code?: string
  account_number?: string
  account_name?: string
  use_saved_bank?: boolean
}

export type PocketPosMerchant = {
  merchant_id: string
  display_name: string
  country: 'NG'
  payout_preference: 'INSTANT_FIAT' | 'KEEP_CRYPTO'
  settlement_enabled: boolean
  kyc_status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'RESTRICTED'
  circle_smart_wallet_address: string
  solana_wallet_address?: string
  supported_networks: PocketNetwork[]
  bank_configured: boolean
  fx_rate_ngn_per_usdc: string
  fx_source: string
}

export type PocketPosCreateData = {
  merchant: PocketPosMerchant
  replayed: boolean
}

export type PocketBankReceiveCreateRequest = {
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
  display_name: string
  amount: string
  flexible_amount: boolean
  bank_name?: string
  bank_code?: string
  account_number?: string
  account_name?: string
  use_saved_bank?: boolean
  client_origin: string
}

export type PocketBankReceiveLink = {
  payment_url: string
  dashboard_url: string
  merchant_id: string
  intent_id?: string
  amount_ngn?: string
  estimated_amount_usdc: string
  fx_rate_ngn_per_usdc?: string
  fx_source: string
  bank_name: string
  bank_last4: string
  bank_account_name: string
}

export type PocketBankReceiveCreateData = {
  link: PocketBankReceiveLink
  replayed: boolean
}

export type PocketBankInstitution = {
  code: string
  name: string
  type?: string
}

export type PocketBankInstitutionsData = {
  institutions: PocketBankInstitution[]
}

export type PocketBankVerifyRequest = {
  bank_code: string
  bank_name: string
  account_number: string
}

export type PocketBankVerifyData = {
  account_name: string
  bank_code: string
}

export type PocketBankSendCreateRequest = {
  owner_email?: string
  owner_first_name?: string
  owner_last_name?: string
  display_name: string
  amount: string
  flexible_amount: boolean
  network: 'base' | 'polygon'
  destination_address: string
  client_origin: string
}

export type PocketBankSendLink = {
  payment_url: string
  dashboard_url: string
  link_id: string
  amount_ngn?: string
  flexible_amount: boolean
  destination_network: 'base' | 'polygon'
  destination_address: string
}

export type PocketBankSendCreateData = {
  link: PocketBankSendLink
  replayed: boolean
}

export type PocketSolanaTransferPrepareRequest = {
  recipient: string
  amount: string
}

export type PocketSolanaTransferPrepareData = {
  transaction: string
  lastValidBlockHeight: number
}

export type PocketSolanaTransferSubmitRequest = {
  transaction: string
  lastValidBlockHeight: number
}

export type PocketSolanaTransferSubmitData = {
  txHash: string
  status: 'confirmed' | 'processed' | 'submitted'
  warning?: string
}

export type PocketAgentAction = {
  id: string
  label: string
  href?: string
  style?: 'primary' | 'secondary' | 'danger'
}

export type PocketAgentConfirmation = {
  id: string
  summary: string
  expiresAt: string
}

export type CirclePocketAgentRequest = {
  threadId: string
  message: string
  identityToken?: string
  locale?: string
  draft?: Record<string, unknown>
  confirmationId?: string
}

export type CirclePocketAgentResponse = {
  answer: string
  intent: string
  draft?: Record<string, unknown>
  missingFields?: string[]
  confirmation?: PocketAgentConfirmation
  card?: Record<string, unknown>
  actions?: PocketAgentAction[]
  proof?: Record<string, unknown>
}

export const POCKET_API = {
  session: '/api/pocket/session',
  profile: '/api/pocket/profile',
  wallets: '/api/pocket/wallets',
  walletLink: '/api/pocket/wallets/link',
  balances: '/api/pocket/balances',
  fxQuote: '/api/pocket/fx-quote',
  recipientBalance: '/api/pocket/balances/recipient',
  transferPrepare: '/api/pocket/transfers/prepare',
  transferSubmit: '/api/pocket/transfers/submit',
  paylinks: '/api/pocket/paylinks',
  bankReceive: '/api/pocket/bank-receive',
  bankInstitutions: '/api/pocket/bank-receive/institutions',
  bankVerify: '/api/pocket/bank-receive/verify',
  bankSend: '/api/pocket/bank-send',
  bankWithdraw: '/api/pocket/bank-withdraw',
  evmTransferStatus: '/api/pocket/transfers/evm-status',
  pos: '/api/pocket/pos',
  billsQuote: '/api/pocket/bills/quote',
  billsCatalog: '/api/pocket/bills/catalog',
  billsVerify: '/api/pocket/bills/verify',
  billsPay: '/api/pocket/bills/pay',
  billsRefund: '/api/pocket/bills/refund',
  activity: '/api/pocket/activity',
  bridge: '/api/pocket/bridge',
  solanaRpc: '/api/pocket/solana-rpc',
  x402: '/api/pocket/x402',
  x402Connect: '/api/pocket/x402/connect',
  x402Activate: '/api/pocket/x402/activate',
  marketplace: '/api/pocket/marketplace',
  agentAsk: '/api/pocket/agent/ask',
  agentConfirm: '/api/pocket/agent/confirm',
} as const

const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9:_-]{16,128}$/
const THREAD_ID_PATTERN = /^[a-zA-Z0-9:_-]{1,160}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, max: number) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max
}

export function isPocketIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value)
}

export function isPocketProfileUpsertRequest(value: unknown): value is PocketProfileUpsertRequest {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.firstName, 64) || !isNonEmptyString(value.lastName, 64)) return false
  if (!isNonEmptyString(value.email, 320) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email as string)) return false
  return value.expectedUpdatedAt === undefined
    || (isNonEmptyString(value.expectedUpdatedAt, 80) && Number.isFinite(Date.parse(value.expectedUpdatedAt as string)))
}

function isOptionalPocketVersion(value: unknown) {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
}

export function isPocketWalletLinkMutationRequest(value: unknown): value is PocketWalletLinkMutationRequest {
  if (!isRecord(value)) return false
  if (!POCKET_NETWORKS.includes(value.network as PocketNetwork)) return false
  if (!isOptionalPocketVersion(value.expectedUpdatedAt)) return false
  if (value.action === 'unlink') return true
  if (value.action !== 'link') return false
  if (!isNonEmptyString(value.circleUserToken, 8_000) || !isRecord(value.wallet)) return false
  return isNonEmptyString(value.wallet.id, 256)
    && isNonEmptyString(value.wallet.address, 128)
    && isNonEmptyString(value.wallet.blockchain, 64)
}

export function isPocketWalletLinkMutationData(value: unknown): value is PocketWalletLinkMutationData {
  if (!isRecord(value) || typeof value.unchanged !== 'boolean') return false
  if (value.link === null) return true
  return isPocketWalletLinkRecord(value.link)
}

export function isPocketWalletLinkRecord(value: unknown): value is PocketWalletLinkRecord {
  if (!isRecord(value) || !POCKET_NETWORKS.includes(value.network as PocketNetwork)) return false
  if (!isRecord(value.wallet)) return false
  return isNonEmptyString(value.wallet.id, 256)
    && isNonEmptyString(value.wallet.address, 128)
    && isNonEmptyString(value.wallet.blockchain, 64)
    && typeof value.updatedAt === 'number'
    && Number.isSafeInteger(value.updatedAt)
    && value.updatedAt >= 0
}

export function isPocketWalletsReadData(value: unknown): value is PocketWalletsReadData {
  if (!isRecord(value) || !isRecord(value.wallets)) return false
  return Object.entries(value.wallets).every(([network, wallet]) => (
    POCKET_NETWORKS.includes(network as PocketNetwork)
    && isPocketWalletLinkRecord(wallet)
    && wallet.network === network
  ))
}

export function isPocketBalancesReadData(value: unknown): value is PocketBalancesReadData {
  if (!isRecord(value) || !Array.isArray(value.rows)) return false
  if (typeof value.total !== 'number' || !Number.isFinite(value.total) || value.total < 0) return false
  if (value.rows.length !== POCKET_NETWORKS.length) return false
  const validRows = value.rows.every((row, index) => {
    if (!isRecord(row) || row.key !== POCKET_NETWORKS[index]) return false
    if (!isNonEmptyString(row.label, 64)) return false
    if (typeof row.balance !== 'number' || !Number.isFinite(row.balance) || row.balance < 0) return false
    if (row.status !== 'ok' && row.status !== 'error') return false
    if (row.error !== undefined && !isNonEmptyString(row.error, 500)) return false
    return row.status === 'error' || row.error === undefined
  })
  if (!validRows) return false
  // Arc is currently a testnet wallet. Keep its balance visible in the network
  // breakdown, but never include test funds in the spendable mainnet total.
  const calculatedTotal = value.rows.reduce((sum, row) => (
    (row as Record<string, unknown>).key === 'arc'
      ? sum
      : sum + Number((row as Record<string, unknown>).balance)
  ), 0)
  return Math.abs(calculatedTotal - value.total) < 1e-9
}

export function isPocketRecipientBalanceReadData(value: unknown): value is PocketRecipientBalanceReadData {
  if (!isRecord(value) || value.network !== 'solana' || typeof value.balance !== 'string') return false
  return /^\d+$/.test(value.balance)
}

export function isPocketX402SnapshotData(value: unknown): value is PocketX402SnapshotData {
  if (!isRecord(value)) return false
  if (typeof value.found !== 'boolean' || typeof value.connected !== 'boolean') return false
  if (value.network !== 'base' && value.network !== 'arc') return false
  if (typeof value.walletBalanceChecked !== 'boolean' || typeof value.gatewayBalanceChecked !== 'boolean') return false
  if (!isOptionalBoundedString(value.walletAddress, 128)) return false
  if (!isOptionalBoundedString(value.walletBalance, 80) || !isOptionalBoundedString(value.gatewayBalance, 80)) return false
  if (!isOptionalBoundedString(value.walletBalanceError, 500) || !isOptionalBoundedString(value.gatewayBalanceError, 500)) return false
  if (value.updatedAt !== undefined && (!Number.isSafeInteger(value.updatedAt) || Number(value.updatedAt) < 0)) return false
  return value.found || value.walletAddress === undefined
}

export function isPocketX402ConnectionData(value: unknown): value is PocketX402ConnectionData {
  if (!isRecord(value)) return false
  if (value.status !== 'otp_sent' && value.status !== 'connected') return false
  if (value.network !== 'base' && value.network !== 'arc') return false
  if (!isOptionalBoundedString(value.walletAddress, 128) || !isOptionalBoundedString(value.message, 500)) return false
  if (value.status === 'connected') return isNonEmptyString(value.walletAddress, 128)
  return value.walletAddress === undefined
}

export function isPocketX402ActivationRequest(value: unknown): value is PocketX402ActivationRequest {
  if (!isRecord(value) || (value.network !== 'base' && value.network !== 'arc')) return false
  if (typeof value.amount !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(value.amount)) return false
  const amount = Number(value.amount)
  return Number.isFinite(amount) && amount >= 0.5 && amount <= 5
}

export function isPocketX402ActivationData(value: unknown): value is PocketX402ActivationData {
  if (!isRecord(value) || (value.activationStatus !== 'available' && value.activationStatus !== 'pending')) return false
  if (value.network !== 'base' && value.network !== 'arc') return false
  if (typeof value.amount !== 'string' || !/^\d+(?:\.\d{1,6})?$/.test(value.amount)) return false
  if (!isNonEmptyString(value.walletAddress, 128) || typeof value.gatewayBalance !== 'string') return false
  if (!/^\d+(?:\.\d+)?$/.test(value.gatewayBalance) || typeof value.replayed !== 'boolean') return false
  if (value.startingGatewayBalance !== undefined && (typeof value.startingGatewayBalance !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.startingGatewayBalance))) return false
  if (value.targetGatewayBalance !== undefined && (typeof value.targetGatewayBalance !== 'string' || !/^\d+(?:\.\d+)?$/.test(value.targetGatewayBalance))) return false
  return true
}

function isOptionalBoundedString(value: unknown, max: number) {
  return value === undefined || (typeof value === 'string' && value.length <= max)
}

export function isPocketActivityRow(value: unknown): value is PocketActivityRow {
  if (!isRecord(value)) return false
  return isNonEmptyString(value.eventId, 256)
    && isNonEmptyString(value.txHash, 256)
    && isNonEmptyString(value.chain, 64)
    && isNonEmptyString(value.payer, 320)
    && isNonEmptyString(value.memo, 500)
    && isNonEmptyString(value.amount, 80)
    && typeof value.ts === 'number'
    && Number.isFinite(value.ts)
    && value.ts >= 0
    && isOptionalBoundedString(value.source, 80)
    && isOptionalBoundedString(value.merchantId, 256)
    && isOptionalBoundedString(value.contextLabel, 500)
    && isOptionalBoundedString(value.settlementType, 80)
    && isOptionalBoundedString(value.amountNgn, 80)
    && isOptionalBoundedString(value.paycrestStatus, 80)
    && isOptionalBoundedString(value.activityLabel, 80)
    && isOptionalBoundedString(value.providerReference, 160)
    && isOptionalBoundedString(value.supportReference, 160)
    && isOptionalBoundedString(value.billToken, 4000)
    && (value.refundAction === undefined || value.refundAction === 'claim' || value.refundAction === 'check')
    && (value.refundTxHash === undefined || (typeof value.refundTxHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value.refundTxHash)))
}

export function isPocketActivityReadData(value: unknown): value is PocketActivityReadData {
  return isRecord(value) && Array.isArray(value.payments) && value.payments.every(isPocketActivityRow)
}

export function isPocketPosCreateRequest(value: unknown): value is PocketPosCreateRequest {
  if (!isRecord(value)) return false
  if (value.payout_preference !== 'INSTANT_FIAT' && value.payout_preference !== 'KEEP_CRYPTO') return false
  if (!isNonEmptyString(value.display_name, 90)) return false
  if (!Array.isArray(value.supported_networks) || value.supported_networks.length < 1) return false
  if (new Set(value.supported_networks).size !== value.supported_networks.length) return false
  if (!value.supported_networks.every(network => POCKET_NETWORKS.includes(network as PocketNetwork))) return false
  if (!isOptionalBoundedString(value.owner_email, 320)) return false
  if (!isOptionalBoundedString(value.owner_first_name, 90) || !isOptionalBoundedString(value.owner_last_name, 90)) return false
  if (!isOptionalBoundedString(value.circle_smart_wallet_address, 128)) return false
  if (!isOptionalBoundedString(value.solana_wallet_address, 128)) return false
  if (!isOptionalBoundedString(value.bank_name, 90) || !isOptionalBoundedString(value.bank_code, 90)) return false
  if (!isOptionalBoundedString(value.account_number, 32) || !isOptionalBoundedString(value.account_name, 90)) return false
  return value.use_saved_bank === undefined || typeof value.use_saved_bank === 'boolean'
}

export function isPocketPosMerchant(value: unknown): value is PocketPosMerchant {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.merchant_id, 256) || !isNonEmptyString(value.display_name, 90)) return false
  if (value.country !== 'NG') return false
  if (value.payout_preference !== 'INSTANT_FIAT' && value.payout_preference !== 'KEEP_CRYPTO') return false
  if (typeof value.settlement_enabled !== 'boolean' || typeof value.bank_configured !== 'boolean') return false
  if (!['UNVERIFIED', 'PENDING', 'VERIFIED', 'RESTRICTED'].includes(String(value.kyc_status))) return false
  if (typeof value.circle_smart_wallet_address !== 'string' || value.circle_smart_wallet_address.length > 128) return false
  if (!isOptionalBoundedString(value.solana_wallet_address, 128)) return false
  if (!Array.isArray(value.supported_networks) || value.supported_networks.length < 1) return false
  if (!value.supported_networks.every(network => POCKET_NETWORKS.includes(network as PocketNetwork))) return false
  return isNonEmptyString(value.fx_rate_ngn_per_usdc, 80) && isNonEmptyString(value.fx_source, 90)
}

export function isPocketPosCreateData(value: unknown): value is PocketPosCreateData {
  return isRecord(value) && isPocketPosMerchant(value.merchant) && typeof value.replayed === 'boolean'
}

export function isPocketBankReceiveCreateRequest(value: unknown): value is PocketBankReceiveCreateRequest {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.display_name, 90)) return false
  if (typeof value.amount !== 'string' || value.amount.length > 80) return false
  if (typeof value.flexible_amount !== 'boolean') return false
  if (!value.flexible_amount && !/^\d+(?:\.\d{1,6})?$/.test(value.amount.replace(/,/g, '').trim())) return false
  if (!isNonEmptyString(value.client_origin, 2_000)) return false
  if (!isOptionalBoundedString(value.owner_email, 320)) return false
  if (!isOptionalBoundedString(value.owner_first_name, 90) || !isOptionalBoundedString(value.owner_last_name, 90)) return false
  if (!isOptionalBoundedString(value.bank_name, 90) || !isOptionalBoundedString(value.bank_code, 90)) return false
  if (!isOptionalBoundedString(value.account_number, 32) || !isOptionalBoundedString(value.account_name, 90)) return false
  return value.use_saved_bank === undefined || typeof value.use_saved_bank === 'boolean'
}

export function isPocketBankReceiveLink(value: unknown): value is PocketBankReceiveLink {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.payment_url, 2_000) || !isNonEmptyString(value.dashboard_url, 2_000)) return false
  if (!isNonEmptyString(value.merchant_id, 256)) return false
  if (!isOptionalBoundedString(value.intent_id, 256) || !isOptionalBoundedString(value.amount_ngn, 80)) return false
  if (typeof value.estimated_amount_usdc !== 'string' || value.estimated_amount_usdc.length > 80) return false
  if (!isOptionalBoundedString(value.fx_rate_ngn_per_usdc, 80) || !isNonEmptyString(value.fx_source, 90)) return false
  return isNonEmptyString(value.bank_name, 90)
    && typeof value.bank_last4 === 'string'
    && /^\d{4}$/.test(value.bank_last4)
    && isNonEmptyString(value.bank_account_name, 90)
}

export function isPocketBankReceiveCreateData(value: unknown): value is PocketBankReceiveCreateData {
  return isRecord(value) && isPocketBankReceiveLink(value.link) && typeof value.replayed === 'boolean'
}

export function isPocketBankInstitution(value: unknown): value is PocketBankInstitution {
  return isRecord(value)
    && isNonEmptyString(value.code, 90)
    && isNonEmptyString(value.name, 160)
    && isOptionalBoundedString(value.type, 90)
}

export function isPocketBankInstitutionsData(value: unknown): value is PocketBankInstitutionsData {
  return isRecord(value) && Array.isArray(value.institutions) && value.institutions.every(isPocketBankInstitution)
}

export function isPocketBankVerifyRequest(value: unknown): value is PocketBankVerifyRequest {
  if (!isRecord(value)) return false
  return isNonEmptyString(value.bank_code, 90)
    && typeof value.bank_name === 'string'
    && value.bank_name.length <= 160
    && typeof value.account_number === 'string'
    && /^\d{10}$/.test(value.account_number.replace(/\D/g, '').slice(0, 10))
}

export function isPocketBankVerifyData(value: unknown): value is PocketBankVerifyData {
  return isRecord(value)
    && isNonEmptyString(value.account_name, 160)
    && isNonEmptyString(value.bank_code, 90)
}

export function isPocketBankSendCreateRequest(value: unknown): value is PocketBankSendCreateRequest {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.display_name, 90)) return false
  if (typeof value.amount !== 'string' || value.amount.length > 80) return false
  if (typeof value.flexible_amount !== 'boolean') return false
  if (!value.flexible_amount && !/^\d+(?:\.\d{1,6})?$/.test(value.amount.replace(/,/g, '').trim())) return false
  if (value.network !== 'base' && value.network !== 'polygon') return false
  if (!/^0x[a-fA-F0-9]{40}$/.test(String(value.destination_address))) return false
  if (!isNonEmptyString(value.client_origin, 2_000)) return false
  if (!isOptionalBoundedString(value.owner_email, 320)) return false
  return isOptionalBoundedString(value.owner_first_name, 90) && isOptionalBoundedString(value.owner_last_name, 90)
}

export function isPocketBankSendLink(value: unknown): value is PocketBankSendLink {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.payment_url, 2_000) || !isNonEmptyString(value.dashboard_url, 2_000)) return false
  if (!isNonEmptyString(value.link_id, 256)) return false
  if (!isOptionalBoundedString(value.amount_ngn, 80) || typeof value.flexible_amount !== 'boolean') return false
  if (value.destination_network !== 'base' && value.destination_network !== 'polygon') return false
  return /^0x[a-fA-F0-9]{40}$/.test(String(value.destination_address))
}

export function isPocketBankSendCreateData(value: unknown): value is PocketBankSendCreateData {
  return isRecord(value) && isPocketBankSendLink(value.link) && typeof value.replayed === 'boolean'
}

export function isPocketSolanaTransferPrepareRequest(value: unknown): value is PocketSolanaTransferPrepareRequest {
  if (!isRecord(value)) return false
  return isNonEmptyString(value.recipient, 128)
    && isNonEmptyString(value.amount, 80)
    && /^\d+(?:\.\d{1,6})?$/.test(value.amount.trim())
}

export function isPocketSolanaTransferPrepareData(value: unknown): value is PocketSolanaTransferPrepareData {
  return isRecord(value)
    && isNonEmptyString(value.transaction, 16_384)
    && typeof value.lastValidBlockHeight === 'number'
    && Number.isSafeInteger(value.lastValidBlockHeight)
    && value.lastValidBlockHeight > 0
}

export function isPocketSolanaTransferSubmitRequest(value: unknown): value is PocketSolanaTransferSubmitRequest {
  return isPocketSolanaTransferPrepareData(value)
}

export function isPocketSolanaTransferSubmitData(value: unknown): value is PocketSolanaTransferSubmitData {
  if (!isRecord(value) || !isNonEmptyString(value.txHash, 256)) return false
  if (value.status !== 'confirmed' && value.status !== 'processed' && value.status !== 'submitted') return false
  return isOptionalBoundedString(value.warning, 500)
}

export function createPocketIdempotencyKey(action: string, entropy?: string) {
  const prefix = action.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'action'
  const generatedEntropy = entropy?.trim() || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const cleanEntropy = generatedEntropy.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80)
  const key = `pocket:${prefix}:${cleanEntropy}`
  if (!isPocketIdempotencyKey(key)) throw new Error('Could not create a valid Circle Pocket idempotency key.')
  return key
}

export function isPocketApiError(value: unknown): value is PocketApiError {
  if (!isRecord(value)) return false
  return POCKET_ERROR_CODES.includes(value.code as PocketErrorCode)
    && isNonEmptyString(value.message, 500)
    && typeof value.retryable === 'boolean'
    && (value.field === undefined || isNonEmptyString(value.field, 80))
}

export function isPocketMutationResult<T = unknown>(value: unknown): value is PocketMutationResult<T> {
  if (!isRecord(value)) return false
  if (typeof value.ok !== 'boolean') return false
  if (!isNonEmptyString(value.requestId, 160)) return false
  if (!isPocketIdempotencyKey(value.idempotencyKey)) return false
  if (!POCKET_MUTATION_STATUSES.includes(value.status as PocketMutationStatus)) return false
  if (value.ok) return value.status !== 'failed' && value.error === undefined
  return value.status === 'failed' && isPocketApiError(value.error)
}

export function isCirclePocketAgentRequest(value: unknown): value is CirclePocketAgentRequest {
  if (!isRecord(value)) return false
  if (typeof value.threadId !== 'string' || !THREAD_ID_PATTERN.test(value.threadId)) return false
  if (!isNonEmptyString(value.message, 4_000)) return false
  if (value.identityToken !== undefined && !isNonEmptyString(value.identityToken, 8_000)) return false
  if (value.locale !== undefined && !isNonEmptyString(value.locale, 32)) return false
  if (value.draft !== undefined && !isRecord(value.draft)) return false
  if (value.confirmationId !== undefined && !isNonEmptyString(value.confirmationId, 160)) return false
  return true
}

export function isCirclePocketAgentResponse(value: unknown): value is CirclePocketAgentResponse {
  if (!isRecord(value)) return false
  if (!isNonEmptyString(value.answer, 8_000) || !isNonEmptyString(value.intent, 120)) return false
  if (value.draft !== undefined && !isRecord(value.draft)) return false
  if (value.card !== undefined && !isRecord(value.card)) return false
  if (value.proof !== undefined && !isRecord(value.proof)) return false
  if (value.missingFields !== undefined && (!Array.isArray(value.missingFields) || !value.missingFields.every(field => isNonEmptyString(field, 80)))) return false
  if (value.confirmation !== undefined) {
    if (!isRecord(value.confirmation)) return false
    if (!isNonEmptyString(value.confirmation.id, 160) || !isNonEmptyString(value.confirmation.summary, 1_000)) return false
    if (!isNonEmptyString(value.confirmation.expiresAt, 80) || !Number.isFinite(Date.parse(value.confirmation.expiresAt as string))) return false
  }
  if (value.actions !== undefined) {
    if (!Array.isArray(value.actions)) return false
    if (!value.actions.every(action => (
      isRecord(action)
      && isNonEmptyString(action.id, 80)
      && isNonEmptyString(action.label, 120)
      && (action.href === undefined || isNonEmptyString(action.href, 2_000))
      && (action.style === undefined || ['primary', 'secondary', 'danger'].includes(String(action.style)))
    ))) return false
  }
  return true
}
