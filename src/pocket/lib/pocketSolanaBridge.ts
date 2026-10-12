import {parseUnits} from 'viem'
import {readPocketBridgeQuote} from '../api/pocketBridgeClient'
import { pocketBridgeNetworkLabel } from './pocketBridgeNetworks'
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
  maxTotalUnits?: bigint
  quoteToken?: string
  onBeforeSubmit?: () => void
  session: PocketSolanaEmailSession
  destination: Exclude<PocketBridgeNetwork, 'solana'>
  destinationAddress: string
  amount: string
  accessToken: string
}) {
  let quoteToken=input.quoteToken
  if(!quoteToken&&input.maxTotalUnits!==undefined){
    const quote=await readPocketBridgeQuote({accessToken:input.accessToken,source:'solana',destination:input.destination,amount:input.amount})
    if(parseUnits(quote.total,6)>input.maxTotalUnits||quote.destinationAddress.toLowerCase()!==input.destinationAddress.toLowerCase())throw new Error('Bridge fees changed. Review the updated amount.')
    quoteToken=quote.quoteToken
  }
  if(!quoteToken)throw new Error('Review the updated bridge amount.')
  const prepareResponse = await fetch(POCKET_API.solanaCctpPrepare, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteToken,
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
    bridge: { quoteToken, destination: input.destination, destinationAddress: input.destinationAddress, amount: input.amount, accessToken: input.accessToken },
    rawTransaction: prepared.transaction,
    memo: `Circle Pocket bridge ${input.amount} USDC from Solana to ${pocketBridgeNetworkLabel(input.destination)}`,
  })
  input.onBeforeSubmit?.()
  const submitResponse = await fetch(POCKET_API.solanaCctpSubmit, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      transaction: signedTransaction,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
      quoteToken,
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
