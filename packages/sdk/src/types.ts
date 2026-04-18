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

export interface PayLinkButtonProps {
  /** EVM recipient address (Base, HashKey, Arc) — 0x + 40 hex chars */
  recipientEVM?: string
  /** Starknet recipient address — 0x + exactly 64 hex chars */
  recipientStark?: string
  /** Payment amount e.g. "10" for 10 USDC */
  amount: string
  /** Optional memo stored on-chain in tx input data */
  memo?: string
  /** Platform fee in basis points. Default: 50 (0.5%). Set 0 to disable. */
  platformFeeBps?: number
  /** Called after on-chain confirmation */
  onPaymentSuccess?: (params: PaymentSuccessParams) => void
  /** Called on wallet rejection or tx failure */
  onPaymentError?: (error: Error) => void
  /** Custom button label */
  label?: string
  /**
   * true (default) = hosted checkout opens in new tab — zero config.
   * false = inline widget — requires WagmiProvider + StarknetProvider in host app.
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
