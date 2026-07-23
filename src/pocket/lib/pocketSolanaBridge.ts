import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js'
import { signCircleSolanaTransaction } from '../../lib/circleSolanaEmailWallet'
import type { PocketSolanaEmailSession } from '../controllers/usePocketWalletController'
import type { PocketBridgeNetwork } from '../api/pocketBridgeClient'
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

function findSourceHash(value: unknown): string | null {
  if (typeof value === 'string' && (/^0x[a-fA-F0-9]{64}$/.test(value) || /^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(value))) return value
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  for (const key of ['burnTxHash', 'txHash', 'transactionHash', 'signature']) {
    const found = findSourceHash(record[key])
    if (found) return found
  }
  for (const nested of Object.values(record)) {
    const found = findSourceHash(nested)
    if (found) return found
  }
  return null
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
    return versioned ? VersionedTransaction.deserialize(bytes) : Transaction.from(bytes)
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
  const kit = new BridgeKit()
  let sourceTxHash = ''
  kit.on('burn', payload => {
    sourceTxHash = findSourceHash(payload) ?? sourceTxHash
  })
  const result = await kit.bridge({
    from: { adapter, chain: 'Solana' },
    to: { chain: input.destination === 'base' ? 'Base' : 'Arbitrum', recipientAddress: input.destinationAddress, useForwarder: true },
    amount: input.amount,
    token: 'USDC',
  })
  sourceTxHash ||= findSourceHash(result) ?? ''
  if (!sourceTxHash) throw new Error('Circle completed the bridge request but did not return the source transaction.')
  return sourceTxHash
}
