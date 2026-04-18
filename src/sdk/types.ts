import type { ChainKey } from '../lib/chains'

// ─── Payment success payload — passed to onPaymentSuccess ────────────────────
export interface PaymentSuccessParams {
  txHash: string
  chain: ChainKey
  amount: string
  asset: string
  recipientAddress: string
  platformFee: string
  timestamp: number
}

// ─── PayLinkButton props ─────────────────────────────────────────────────────
export interface PayLinkButtonProps {
  /** EVM recipient address (Base, HashKey, Arc) — 0x + 40 hex chars */
  recipientEVM?: string
  /** Starknet recipient address — 0x + 64 hex chars */
  recipientStark?: string
  /** Payment amount (e.g. "10" for 10 USDC) */
  amount: string
  /** Optional memo stored on-chain */
  memo?: string
  /**
   * Platform fee in basis points.
   * Defaults to 50 (0.5%). Set to 0 to disable.
   * Full collection requires deploying the FeeRouter contract.
   */
  platformFeeBps?: number
  /** Fired after successful on-chain confirmation */
  onPaymentSuccess?: (params: PaymentSuccessParams) => void
  /** Fired on wallet rejection or tx failure */
  onPaymentError?: (error: Error) => void
  /** Override button label */
  label?: string
  /** Open in hosted checkout tab instead of inline widget */
  hosted?: boolean
}

// ─── Hook return type ────────────────────────────────────────────────────────
export interface UsePayLinkReturn {
  /** Currently selected chain */
  chain: ChainKey
  setChain: (c: ChainKey) => void
  /** Initiate payment on the selected chain */
  pay: () => void
  /** Platform fee amount in asset units */
  feeAmount: number
  /** Amount recipient receives after fee */
  recipientAmount: number
  isPending: boolean
  isConfirming: boolean
  isConfirmed: boolean
  txHash: string | null
  error: string | null
}
