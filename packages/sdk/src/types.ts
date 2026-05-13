import type { ChainKey } from './chains'

export interface PaymentSuccessParams {
  txHash: string
  chain: ChainKey
  amount: string
  asset: string
  recipientAddress: string
  platformFee: string
  timestamp: number
}

export interface PayLinkUrlOptions {
  /** Hosted checkout origin. Defaults to https://hashpaylink.com. */
  baseUrl?: string
  /** Preferred checkout network for single-chain links. */
  network?: ChainKey
  /** EVM recipient address for Base, Arbitrum, Arc, or HashKey. */
  recipientEVM?: string
  /** Solana recipient address. */
  recipientSolana?: string
  /** Starknet recipient address. */
  recipientStark?: string
  /** Fixed payment amount in USDC unless network is hashkey native HSK. */
  amount?: string
  /** Let payer enter amount at checkout. */
  flexibleAmount?: boolean
  /** Optional payment memo or invoice label. */
  memo?: string
  /** Enable multi-chain checkout when more than one recipient type is supplied. */
  multiChain?: boolean
  /** Optional event/dashboard identifier for multi-payer links. */
  eventId?: string
  /** Preserve source attribution, for example "telegram" or a partner id. */
  source?: string
  /** Initial checkout mode. Wallet is the production default; direct shows send-via-address. */
  mode?: 'wallet' | 'direct'
}

export interface PayLinkButtonProps extends PayLinkUrlOptions {
  /** Platform fee in basis points. Default: 20 (0.2%). */
  platformFeeBps?: number
  /** Called by host apps that separately observe payment success. */
  onPaymentSuccess?: (params: PaymentSuccessParams) => void
  /** Called by host apps that separately observe payment errors. */
  onPaymentError?: (error: Error) => void
  /** Custom button label. */
  label?: string
  /**
   * true (default) renders a compact hosted-checkout link.
   * false renders a small checkout card that still opens hosted checkout.
   */
  hosted?: boolean
}

export interface UsePayLinkReturn {
  chain: ChainKey
  setChain: (c: ChainKey) => void
  pay: () => void
  feeAmount: number
  recipientAmount: number
  isPending: boolean
  isConfirming: boolean
  isConfirmed: boolean
  txHash: string | null
  error: string | null
}
