import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { isAddress, encodeFunctionData, parseUnits } from 'viem'
import type { ChainKey } from './chains'

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Truncate a 0x address: 0x1234...5678 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

/** Format an HSK amount for display (legacy — kept for backwards compat) */
export function formatHSK(amount: string | number): string {
  return formatAmount(amount, 18)
}

/** Format any token amount for display (handles both 6-decimal USDC and 18-decimal HSK) */
export function formatAmount(amount: string | number, decimals = 18): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num) || num === 0) return '0'
  if (num < 0.000001) return num.toExponential(4)
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals <= 6 ? 6 : 8,
  })
}

/** Encode an ERC-20 transfer call with optional memo appended to calldata.
 *  The memo bytes are appended AFTER the standard ABI-encoded transfer args —
 *  they are stored on-chain in the transaction input data but ignored by the
 *  ERC-20 contract (which reads only the first 68 bytes for transfer). */
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function' as const,
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable' as const,
  },
]

export function encodeErc20Transfer(
  recipient: `0x${string}`,
  amount: string,
  decimals: number,
  memo?: string,
): `0x${string}` {
  const base = encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [recipient, parseUnits(amount, decimals)],
  })
  if (!memo?.trim()) return base
  // Append UTF-8 memo bytes (stored on-chain, ignored by contract)
  return `${base}${memoToHex(memo.trim()).slice(2)}` as `0x${string}`
}

/** Encode a UTF-8 string as 0x-prefixed hex for transaction data field */
export function memoToHex(memo: string): `0x${string}` {
  const bytes = new TextEncoder().encode(memo)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `0x${hex}`
}

/** Validate a recipient address for a given chain */
export function isValidRecipient(addr: string, chain: ChainKey): boolean {
  if (!addr) return false
  return isAddress(addr)
}

/** Copy text to clipboard with a graceful fallback */
export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}
