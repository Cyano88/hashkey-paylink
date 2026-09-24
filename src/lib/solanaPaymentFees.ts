import type { CirclePaymentFeeQuote } from './circleEvmEmailWallet'
import type { SolanaEmailSession } from './circleSolanaEmailWallet'
import { POCKET_API } from '../pocket/lib/pocketSchemas'

export async function readSolanaPaymentQuote(from: string, to: string, amount: string): Promise<CirclePaymentFeeQuote> {
  const response = await fetch('/api/solana-build-tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from, to, amount, quoteOnly: true }) })
  const data = await response.json()
  if (!response.ok || !data.ok || !data.quote || !data.token) throw new Error(data.error || 'Solana fee quote is unavailable.')
  return data
}
export async function readSolanaRelayStatus(txHash: string, accessToken: string, lastValidBlockHeight?: number) {
  const response = await fetch(POCKET_API.solanaRpc, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignatureStatuses', params: [[txHash], { searchTransactionHistory: true }] }) })
  const data = await response.json()
  if (!response.ok || data.error) throw new Error('Solana confirmation is temporarily unavailable.')
  const status = data.result?.value?.[0]
  if (status?.err) throw new Error('Solana payment failed on-chain.')
  if (status === null && Number.isSafeInteger(lastValidBlockHeight)) {
    const heightResponse = await fetch(POCKET_API.solanaRpc, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + accessToken }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'getBlockHeight', params: [{ commitment: 'finalized' }] }) })
    const height = await heightResponse.json()
    if (heightResponse.ok && !height.error && Number.isSafeInteger(height.result) && height.result > lastValidBlockHeight!) throw new Error('Solana payment expired without confirmation. No new payment was sent. Review and try again.')
  }
  return status?.confirmationStatus === 'confirmed' || status?.confirmationStatus === 'finalized'
}
// Persist the signed transaction before broadcast. Retrying this operation
// resubmits the same bytes and signature, never a second payment.
export async function sendQuotedSolanaPayment(input: {
  session: SolanaEmailSession; recipient: string; amount: string; feeQuoteToken: string; accessToken: string
  onChallenge?: (value: { challengeId: string; transactionId: string }) => void
}) {
  const key = `pocket:solana-relay:pending:${input.session.wallet.address}`
  const fingerprint = `${input.session.wallet.address}:${input.recipient}:${input.amount}`
  type Pending = { fingerprint: string; tx: string; txHash: string; lastValidBlockHeight: number }
  const saved = localStorage.getItem(key)
  let pending: Pending | null = saved ? JSON.parse(saved) : null
  const check = async (saved: Pending) => {
    try { return await readSolanaRelayStatus(saved.txHash, input.accessToken, saved.lastValidBlockHeight) }
    catch (error) {
      if (error instanceof Error && /failed on-chain|expired without confirmation/.test(error.message)) { localStorage.removeItem(key); throw error }
      return false
    }
  }
  if (pending && pending.fingerprint !== fingerprint) {
    if (!await check(pending)) throw new Error('A previous Solana payment needs confirmation before another send.')
    localStorage.removeItem(key)
    pending = null
  }
  if (!pending) {
    const response = await fetch('/api/solana-build-tx', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ from: input.session.wallet.address, to: input.recipient, amount: input.amount, feeQuoteToken: input.feeQuoteToken }) })
    const data = await response.json()
    if (!response.ok || !data.ok || !data.tx || !Number.isSafeInteger(data.lastValidBlockHeight)) throw new Error(data.error || 'Solana payment could not be prepared.')
    const { signCircleSolanaTransaction } = await import('./circleSolanaEmailWallet')
    const signed = await signCircleSolanaTransaction({ session: input.session, rawTransaction: data.tx, memo: `Send ${input.amount} USDC` })
    const { Transaction } = await import('@solana/web3.js')
    const { default: bs58 } = await import('bs58')
    const decode = (value: string) => { try { return Transaction.from(Uint8Array.from(atob(value), c => c.charCodeAt(0))) } catch { return Transaction.from(bs58.decode(value)) } }
    const transaction = decode(signed), original = decode(data.tx)
    if (!transaction.verifySignatures(true) || !transaction.signature || !transaction.serializeMessage().equals(original.serializeMessage())) throw new Error('The approved Solana transaction does not match the payment.')
    pending = { fingerprint, tx: signed, txHash: bs58.encode(transaction.signature), lastValidBlockHeight: data.lastValidBlockHeight }
    localStorage.setItem(key, JSON.stringify(pending))
  }
  const identifiers = { challengeId: `relay:${pending.txHash}`, transactionId: `relay:${pending.txHash}` }
  input.onChallenge?.(identifiers)
  if (await check(pending)) {
    localStorage.removeItem(key)
    return { ...identifiers, state: 'confirmed' as const, txHash: pending.txHash }
  }
  // A timeout can happen after broadcast: retain the original signed bytes.
  await fetch('/api/solana-relay', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx: pending.tx, lastValidBlockHeight: pending.lastValidBlockHeight }) }).catch(() => null)
  const confirmed = await check(pending)
  if (confirmed) localStorage.removeItem(key)
  return { ...identifiers, state: confirmed ? 'confirmed' as const : 'submitted' as const, txHash: confirmed ? pending.txHash : '' }
}
export function clearConfirmedSolanaRelay(walletAddress: string, txHash: string) {
  const key = `pocket:solana-relay:pending:${walletAddress}`
  const saved = localStorage.getItem(key)
  if (saved && JSON.parse(saved).txHash === txHash) localStorage.removeItem(key)
}
