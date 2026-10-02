type Provider = { request(args: { method: string; params?: unknown[] }): Promise<unknown> }
type Storage = Pick<globalThis.Storage, 'setItem' | 'removeItem'>
type Transaction = { chainId: '0xc4'; from: string; to: string; data: string; value: string }

// Only explicit wallet/RPC refusals establish that this request was not sent.
// Disconnects, timeouts and generic RPC failures remain uncertain.
export function reviewerRefusalCode(error: unknown): number | undefined {
  let current = error
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth++) {
    const item = current as { code?: unknown; cause?: unknown; data?: { originalError?: unknown } }
    const code = Number(item.code)
    if ([4001, 4100, 4200, -32601, -32602].includes(code)) return code
    current = item.cause ?? item.data?.originalError
  }
}

export async function submitReviewerTransaction({ provider, transaction, storage, key, onState }: {
  provider: Provider; transaction: Transaction; storage: Storage; key: string;
  onState(value: string): void;
}): Promise<string> {
  const balance = await provider.request({ method: 'eth_getBalance', params: [transaction.from, 'latest'] })
  if (typeof balance !== 'string' || !/^0x[0-9a-f]+$/i.test(balance)) throw Error('The reviewer wallet balance could not be verified. No transaction was requested.')
  const insufficientGas = 'Not enough OKB on X Layer for network fees. Add OKB to this reviewer wallet, then review execution again. Both decision approvals remain saved. No transaction was requested.'
  if (BigInt(balance) === 0n) throw Error(insufficientGas)
  // Estimate before recording a possible send. A failed estimate never broadcasts.
  let gas: unknown
  try { gas = await provider.request({ method: 'eth_estimateGas', params: [transaction] }) }
  catch (error) {
    if (/insufficient (funds|balance)|not enough (funds|balance)/i.test(error instanceof Error ? error.message : String((error as {message?:unknown})?.message || ''))) throw Error(insufficientGas)
    throw Error('The wallet could not estimate execution on X Layer. Check the selected account and connection. No transaction was requested.')
  }
  const gasPrice = await provider.request({ method: 'eth_gasPrice' })
  if (typeof gas !== 'string' || !/^0x[0-9a-f]+$/i.test(gas) || typeof gasPrice !== 'string' || !/^0x[0-9a-f]+$/i.test(gasPrice)) throw Error('Network fees could not be verified. No transaction was requested.')
  if (BigInt(balance) < BigInt(gas) * BigInt(gasPrice)) throw Error(insufficientGas)
  const chain = await provider.request({ method: 'eth_chainId' })
  const accounts = await provider.request({ method: 'eth_accounts' })
  if (Number(chain) !== 196 || !Array.isArray(accounts) || !accounts.some(a => typeof a === 'string' && a.toLowerCase() === transaction.from.toLowerCase())) {
    throw Error('Select the executing reviewer account on X Layer again. No transaction was requested.')
  }
  try { storage.setItem(key, 'pending') }
  catch { throw Error('Unable to save transaction recovery state. No transaction was requested.') }
  onState('pending')
  let hash: unknown
  try {
    hash = await provider.request({ method: 'eth_sendTransaction', params: [transaction] })
  } catch (error) {
    const code = reviewerRefusalCode(error)
    if (code !== undefined) {
      try { storage.removeItem(key) }
      catch { throw Error('The wallet refused this request, but its recovery marker could not be cleared. No automatic retry was sent.') }
      onState('')
      throw Error(code === 4001
        ? 'Wallet request cancelled. No transaction was sent by this request.'
        : `The wallet refused the execution request (code ${code}). Reconnect the reviewer wallet on X Layer before reviewing execution again.`)
    }
    throw Error('The wallet did not return a transaction hash. Submission is unconfirmed; check wallet activity before any retry. Your two decision approvals are still saved.')
  }
  if (typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) {
    throw Error('The wallet returned no valid transaction hash. Check wallet activity before any retry.')
  }
  onState(hash)
  try { storage.setItem(key, hash) }
  catch { throw Error(`Transaction submitted: ${hash}. Save this hash; browser recovery storage is unavailable. Do not resend.`) }
  return hash
}
