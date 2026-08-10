import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { signCircleSolanaTransaction } from '../../lib/circleSolanaEmailWallet'
import type { PocketSolanaEmailSession } from '../controllers/usePocketWalletController'
import type { PocketBridgeNetwork } from '../api/pocketBridgeClient'
import { findPocketBridgeSourceHash } from './pocketBridgeHash'
import { POCKET_API } from './pocketSchemas'

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary)
}

function base64ToBytes(value: string) {
  const binary = window.atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

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
  const [{ BridgeKit }, { createSolanaAdapterFromProvider }] = await Promise.all([
    import('@circle-fin/bridge-kit'),
    import('@circle-fin/adapter-solana'),
  ])
  const connection = new Connection(new URL(POCKET_API.solanaRpc, window.location.origin).toString(), {
    commitment: 'confirmed',
    httpHeaders: { authorization: `Bearer ${input.accessToken}` },
  })
  const publicKey = new PublicKey(input.session.wallet.address)
  let signedSourceTxHash = ''
  const signOne = async (transaction: unknown) => {
    const versioned = transaction instanceof VersionedTransaction
    if (!versioned && !(transaction instanceof Transaction)) throw new Error('Circle Bridge Kit returned an unsupported Solana transaction.')
    const raw = versioned
      ? transaction.serialize()
      : transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
    const signed = await signCircleSolanaTransaction({
      session: input.session,
      rawTransaction: bytesToBase64(raw),
      memo: `Circle Pocket bridge ${input.amount} USDC from Solana to ${input.destination === 'base' ? 'Base' : 'Arbitrum'}`,
    })
    const bytes = base64ToBytes(signed)
    const signedTransaction = versioned ? VersionedTransaction.deserialize(bytes) : Transaction.from(bytes)
    const signature = signedTransaction instanceof VersionedTransaction
      ? signedTransaction.signatures[0]
      : signedTransaction.signatures.find(item => item.publicKey.equals(publicKey))?.signature
    if (signature?.some(byte => byte !== 0)) signedSourceTxHash = bs58.encode(signature)
    return signedTransaction
  }
  const provider = {
    isConnected: true,
    publicKey,
    connect: async () => ({ publicKey }),
    disconnect: async () => undefined,
    signTransaction: signOne,
    signAllTransactions: async (transactions: unknown[]) => {
      const signed = []
      for (const transaction of transactions) signed.push(await signOne(transaction))
      return signed
    },
  }
  const adapter = await createSolanaAdapterFromProvider({ provider, connection })
  const nativePrepare = adapter.prepare.bind(adapter)
  adapter.prepare = (async (params, context) => {
    if (!params.instructions?.length || params.serializedTransaction) {
      return nativePrepare(params, context)
    }
    return {
      type: 'solana' as const,
      estimate: async () => ({ gas: 0n, gasPrice: 0n, fee: '0' }),
      execute: async () => {
        const { blockhash } = await connection.getLatestBlockhash('confirmed')
        const unsigned = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash }).add(...params.instructions!)
        const prepareResponse = await fetch(POCKET_API.solanaCctpPrepare, {
          method: 'POST',
          headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            transaction: bytesToBase64(unsigned.serialize({ requireAllSignatures: false, verifySignatures: false })),
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
        const sponsored = Transaction.from(base64ToBytes(prepared.transaction))
        if (params.signers?.length) sponsored.partialSign(...params.signers)
        const signed = await signOne(sponsored)
        if (!(signed instanceof Transaction)) throw new Error('Circle returned an unsupported sponsored Solana transaction.')
        const submitResponse = await fetch(POCKET_API.solanaCctpSubmit, {
          method: 'POST',
          headers: { authorization: `Bearer ${input.accessToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            transaction: bytesToBase64(signed.serialize()),
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
        signedSourceTxHash = submitted.txHash
        return submitted.txHash
      },
    }
  }) as typeof adapter.prepare
  const kit = new BridgeKit()
  let sourceTxHash = ''
  kit.on('burn', payload => {
    sourceTxHash = findPocketBridgeSourceHash(payload) ?? sourceTxHash
  })
  const result = await kit.bridge({
    from: { adapter, chain: 'Solana' },
    to: { chain: input.destination === 'base' ? 'Base' : 'Arbitrum', recipientAddress: input.destinationAddress, useForwarder: true },
    amount: input.amount,
    token: 'USDC',
  })
  sourceTxHash ||= findPocketBridgeSourceHash(result) ?? ''
  if (!sourceTxHash && signedSourceTxHash) {
    const status = await connection.getSignatureStatus(signedSourceTxHash, { searchTransactionHistory: true }).catch(() => null)
    if (status?.value && !status.value.err) sourceTxHash = signedSourceTxHash
    if (status?.value?.err) throw new Error('The Solana source transaction failed before USDC could move.')
  }
  if (!sourceTxHash) {
    const failed = result.steps.find(step => step.state === 'error')
    if (failed) throw new Error(failed.errorMessage || `Circle bridge failed during ${failed.name}.`)
    throw new Error('Circle returned the bridge request without a verifiable source transaction. Check Activity before retrying.')
  }
  return sourceTxHash
}
