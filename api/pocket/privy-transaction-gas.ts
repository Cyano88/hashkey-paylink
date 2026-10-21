import type {Hex} from 'viem'

export type PrivyGasBinding = {transactionId: string; walletId: string; chainId: 56 | 196; hash: Hex}
const unavailable = (): never => {throw Error('Transaction gas billing is still being verified.')}
/** Bind billed credits to a single provider transaction and chain. Wallet-wide
 * gas_spend totals must not be compared against one chain's reimbursement. */
export function privyTransactionGasMicros(tx: unknown, binding: PrivyGasBinding): bigint | null {
 const t = tx as Record<string, any>
 if (!binding || ![56,196].includes(binding.chainId) || !/^[a-zA-Z0-9_-]{10,128}$/.test(binding.transactionId) || !/^[a-zA-Z0-9]{10,64}$/.test(binding.walletId) || !/^0x[0-9a-f]{64}$/i.test(binding.hash)) return unavailable()
 if (!t || t.id !== binding.transactionId || t.wallet_id !== binding.walletId || t.caip2 !== 'eip155:' + binding.chainId || typeof t.transaction_hash !== 'string' || t.transaction_hash.toLowerCase() !== binding.hash.toLowerCase() || t.sponsored !== true) return unavailable()
 if (t.gas_credits_charged == null) return null
 const cost = t.gas_credits_charged
 if (cost.currency !== 'usd' || typeof cost.value !== 'string' || !/^(0|[1-9]\d{0,12})(?:\.\d{1,24})?$/.test(cost.value)) return unavailable()
 const [whole, fraction = ''] = cost.value.split('.')
 const micros = BigInt(whole) * 1000000n + BigInt((fraction + '000000').slice(0,6)) + (/[1-9]/.test(fraction.slice(6)) ? 1n : 0n)
 if (micros > BigInt(Number.MAX_SAFE_INTEGER)) return unavailable()
 return micros
}
export async function sumPrivyTransactionGas(bindings: PrivyGasBinding[], read: (id: string) => Promise<unknown>) {
 const ids = new Set<string>(), hashes = new Set<string>()
 for (const b of bindings) {
  const hash = b.chainId + ':' + b.hash.toLowerCase()
  if (ids.has(b.transactionId) || hashes.has(hash)) return unavailable()
  ids.add(b.transactionId); hashes.add(hash)
 }
 let sum = 0n
 for (let offset = 0; offset < bindings.length; offset += 8) {
  const costs = await Promise.all(bindings.slice(offset,offset+8).map(async b => privyTransactionGasMicros(await read(b.transactionId), b)))
  if (costs.some(c => c === null)) return unavailable()
  sum += costs.reduce<bigint>((a,c) => a + c!, 0n)
 }
 return sum
}
