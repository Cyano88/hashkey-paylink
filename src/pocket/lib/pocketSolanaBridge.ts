import type {CircleEvmBridgeReservation} from '../../lib/circleEvmEmailWallet'
import {signedSolanaReference} from './pocketSignedSolanaReference'
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
  idempotencyKey: string
  onBeforePrepare?: () => void
  onReservation?: (state:CircleEvmBridgeReservation) => void
  maxTotalUnits?: bigint
  quoteToken?: string
  onBeforeSubmit?: (txHash:string) => void
  session: PocketSolanaEmailSession
  destination: Exclude<PocketBridgeNetwork, 'solana'>
  destinationAddress: string
  amount: string
  accessToken: string
}) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.idempotencyKey))throw Error('A saved bridge reference is required.')
  let quoteToken=input.quoteToken
  if(!quoteToken&&input.maxTotalUnits!==undefined){
    const quote=await readPocketBridgeQuote({accessToken:input.accessToken,source:'solana',destination:input.destination,amount:input.amount})
    if(parseUnits(quote.total,6)>input.maxTotalUnits||quote.destinationAddress.toLowerCase()!==input.destinationAddress.toLowerCase())throw new Error('Bridge fees changed. Review the updated amount.')
    quoteToken=quote.quoteToken
  }
  if(!quoteToken)throw new Error('Review the updated bridge amount.')
  input.onBeforePrepare?.()
  const prepareResponse = await fetch(POCKET_API.solanaCctpPrepare, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteToken, idempotencyKey:input.idempotencyKey, reservationVersion:1,
      destination: input.destination,
      destinationAddress: input.destinationAddress,
      amount: input.amount,
    }),
  })
  const prepared = await prepareResponse.json() as CircleEvmBridgeReservation & {
    ok?: boolean
    transaction?: string
    lastValidBlockHeight?: number
    error?: string | { message?: string }
  }
  if (!prepareResponse.ok || !prepared.ok || !prepared.transaction || !Number.isSafeInteger(prepared.lastValidBlockHeight)) {
    throw new Error(pocketBridgeApiErrorMessage(prepared.error, 'Hash PayLink could not prepare the sponsored Solana bridge.'))
  }

  if(prepared.managed){
    input.onReservation?.(prepared)
    if(prepared.status!=='started'||prepared.txHash)throw Error('This bridge is already saved. Check Activity before retrying.')
  }
  const signedTransaction = await signCircleSolanaTransaction({
    session: input.session,
    bridge: { idempotencyKey:input.idempotencyKey, reservationVersion:1, quoteToken, destination: input.destination, destinationAddress: input.destinationAddress, amount: input.amount, accessToken: input.accessToken },
    rawTransaction: prepared.transaction,
    memo: `Circle Pocket bridge ${input.amount} USDC from Solana to ${pocketBridgeNetworkLabel(input.destination)}`,
  })
  const expectedHash=signedSolanaReference(signedTransaction)
  input.onBeforeSubmit?.(expectedHash)
  const submitResponse = await fetch(POCKET_API.solanaCctpSubmit, {
    method: 'POST',
    headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      transaction: signedTransaction,
      lastValidBlockHeight: prepared.lastValidBlockHeight,
      quoteToken, idempotencyKey:input.idempotencyKey, reservationVersion:1,
      destination: input.destination,
      destinationAddress: input.destinationAddress,
      amount: input.amount,
    }),
  })
  const submitted = await submitResponse.json() as CircleEvmBridgeReservation & { ok?: boolean; txHash?: string; error?: string | { message?: string } }
  if (!submitResponse.ok || !submitted.ok || !submitted.txHash) {
    throw new Error(pocketBridgeApiErrorMessage(submitted.error, 'Hash PayLink could not submit the sponsored Solana bridge.'))
  }
  if(submitted.txHash!==expectedHash)throw new Error('Bridge transaction reference did not match the signed transaction.')
  if(prepared.managed&&!submitted.managed)throw Error('Bridge recovery is temporarily unavailable.')
  if(submitted.managed)input.onReservation?.(submitted)
  return submitted.txHash
}

/** Read-only recovery; never signs, prepares, or relays a retry. */
export async function readSolanaBridgeReservation(idempotencyKey:string,accessToken:string):Promise<CircleEvmBridgeReservation>{
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey))return {managed:false}
 const response=await fetch(POCKET_API.solanaCctpSubmit,{method:'POST',headers:{authorization:'Bearer '+accessToken,'content-type':'application/json'},body:JSON.stringify({action:'recover',idempotencyKey,reservationVersion:1})})
 const state=await response.json()
 if(!response.ok||state.ok!==true||typeof state.managed!=='boolean')throw Error(pocketBridgeApiErrorMessage(state.error,'Bridge recovery is temporarily unavailable.'))
 return state
}
