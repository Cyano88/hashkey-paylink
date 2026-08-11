import { signCircleSolanaTransaction } from '../../lib/circleSolanaEmailWallet'
import type { PocketSolanaEmailSession } from '../controllers/usePocketWalletController'
import type { PocketBridgeNetwork } from '../api/pocketBridgeClient'
import { POCKET_API } from './pocketSchemas'

export function pocketBridgeApiErrorMessage(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object') {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message.trim()
  }
  return fallback
}

export async function bridgeCircleSolanaWallet(input: {
  session: PocketSolanaEmailSession
  destination: Exclude<PocketBridgeNetwork, 'solana'>
  destinationAddress: string
  amount: string
  accessToken: string
}) {
  const prepareResponse = await fetch(POCKET_API.solanaCctpPrepare, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      destination: input.destination,
      destinationAddress: input.destinationAddress,
      amount: input.amount,
    }),
  })
  const prepared = await prepareResponse.json() as {
    ok?: boolean
    transaction?: string
    lastValidBlockHeight?: number
    error?: string | { message?: string }
  }
  if (!prepareResponse.ok || !prepared.ok || !prepared.transaction || !Number.isSafeInteger(prepared.lastValidBlockHeight)) {
    throw new Error(pocketBridgeApiErrorMessage(prepared.error, 'Hash PayLink could not prepare the sponsored Solana bridge.'))
  }

  const signedTransaction = await signCircleSolanaTransaction({
    session: input.session,
    rawTransaction: prepared.transaction,
    memo: `Circle Pocket bridge ${input.amount} USDC from Solana to ${input.destination === 'base' ? 'Base' : 'Arbitrum'}`,
  })
  const submitResponse = await fetch(POCKET_API.solanaCctpSubmit, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      transaction: signedTransaction,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
      destination: input.destination,
      destinationAddress: input.destinationAddress,
      amount: input.amount,
    }),
  })
  const submitted = await submitResponse.json() as { ok?: boolean; txHash?: string; error?: string | { message?: string } }
  if (!submitResponse.ok || !submitted.ok || !submitted.txHash) {
    throw new Error(pocketBridgeApiErrorMessage(submitted.error, 'Hash PayLink could not submit the sponsored Solana bridge.'))
  }
  return submitted.txHash
}
