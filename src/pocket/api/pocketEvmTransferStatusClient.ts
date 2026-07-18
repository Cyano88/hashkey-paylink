import type { Address } from 'viem'
import { POCKET_API } from '../lib/pocketSchemas'

export async function readPocketEvmTransferStatus({
  accessToken,
  chain,
  txHash,
  recipient,
  amount,
  fetcher = fetch,
}: {
  accessToken: string
  chain: 'base' | 'arbitrum' | 'arc'
  txHash: `0x${string}`
  recipient: Address
  amount: string
  fetcher?: typeof fetch
}) {
  const response = await fetcher(POCKET_API.evmTransferStatus, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ chain, tx_hash: txHash, recipient, amount }),
  })
  const data = await response.json().catch(() => undefined) as { ok?: boolean; status?: string; error?: string } | undefined
  if (!response.ok && response.status !== 202) throw new Error(data?.error || 'Could not verify withdrawal yet.')
  if (data?.ok !== true || (data.status !== 'confirmed' && data.status !== 'pending')) throw new Error('Withdrawal status response was invalid.')
  return data.status
}
