import {
  encodeTransfer,
  toCircleSmartAccount,
  toModularTransport,
  toPasskeyTransport,
  toWebAuthnCredential,
  WebAuthnMode,
} from '@circle-fin/modular-wallets-core'
import { createPublicClient, erc20Abi, parseUnits, type Address, type Hex } from 'viem'
import { createBundlerClient, toWebAuthnAccount } from 'viem/account-abstraction'
import { arbitrum, base } from 'viem/chains'
import type { ChainKey } from './chains'
import { CHAIN_META, EVM_TREASURY, PLATFORM_FEE_BPS } from './chains'

type CirclePasskeyChain = Extract<ChainKey, 'base' | 'arbitrum'>

type SendCirclePasskeyPaymentParams = {
  chain: ChainKey
  email: string
  recipient: Address
  amount: string
}

type CirclePasskeyPaymentResult =
  | { status: 'sent'; txHash: Hex; userOpHash: Hex; smartAccount: Address }
  | { status: 'failed'; reason: string; smartAccount?: Address }

const CLIENT_KEY = import.meta.env.VITE_CLIENT_KEY as string | undefined
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL as string | undefined

function isCirclePasskeyChain(chain: ChainKey): chain is CirclePasskeyChain {
  return chain === 'base' || chain === 'arbitrum'
}

function viemChainFor(chain: CirclePasskeyChain) {
  return chain === 'base' ? base : arbitrum
}

function circleChainSlug(chain: CirclePasskeyChain) {
  return chain === 'base' ? 'base' : 'arbitrum'
}

function normalizeCircleClientUrl() {
  return (CLIENT_URL ?? '').replace(/\/+$/, '')
}

function getCircleClientConfig(chain: ChainKey) {
  if (!isCirclePasskeyChain(chain)) return null
  const clientUrl = normalizeCircleClientUrl()
  if (!CLIENT_KEY || !clientUrl) return null
  return {
    chain,
    clientKey: CLIENT_KEY,
    clientUrl,
    chainUrl: `${clientUrl}/${circleChainSlug(chain)}`,
  }
}

async function getCredential(email: string) {
  const clientUrl = normalizeCircleClientUrl()
  if (!CLIENT_KEY || !clientUrl) throw new Error('Circle wallet is not configured.')

  const transport = toPasskeyTransport(clientUrl, CLIENT_KEY)
  try {
    return await toWebAuthnCredential({
      transport,
      mode: WebAuthnMode.Login,
      credentialId: email,
    })
  } catch {
    return toWebAuthnCredential({
      transport,
      mode: WebAuthnMode.Register,
      username: email,
    })
  }
}

function friendlyCircleError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('not configured')) return msg
  if (lower.includes('credential') || lower.includes('passkey')) return 'Passkey login was not completed.'
  if (lower.includes('insufficient')) return 'Insufficient USDC in the Circle smart wallet.'
  if (lower.includes('user rejected') || lower.includes('notallowederror') || lower.includes('cancel')) {
    return 'Passkey confirmation was cancelled.'
  }
  return msg.slice(0, 160) || 'Circle wallet payment failed.'
}

export function canUseCirclePasskeyPayments(chain: ChainKey) {
  return !!getCircleClientConfig(chain)
}

export async function sendCirclePasskeyPayment({
  chain,
  email,
  recipient,
  amount,
}: SendCirclePasskeyPaymentParams): Promise<CirclePasskeyPaymentResult> {
  const config = getCircleClientConfig(chain)
  if (!config) return { status: 'failed', reason: 'Circle wallet is not configured for this chain.' }

  try {
    const meta = CHAIN_META[config.chain]
    const totalUnits = parseUnits(amount || '0', meta.decimals)
    const feeUnits = totalUnits * BigInt(PLATFORM_FEE_BPS) / 10_000n
    const recipientUnits = totalUnits - feeUnits
    if (totalUnits <= 0n || recipientUnits <= 0n) return { status: 'failed', reason: 'Enter a valid amount.' }

    const credential = await getCredential(email.trim())
    const transport = toModularTransport(config.chainUrl, config.clientKey)
    const client = createPublicClient({
      chain: viemChainFor(config.chain),
      transport,
    })
    const account = await toCircleSmartAccount({
      client,
      owner: toWebAuthnAccount({ credential }),
      name: `hash-paylink-${email.trim().toLowerCase()}`,
    })
    const smartAccount = account.address as Address
    const balance = await client.readContract({
      address: meta.tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [smartAccount],
    })
    if (balance < totalUnits) {
      return {
        status: 'failed',
        reason: `Insufficient USDC in Circle wallet ${smartAccount}.`,
        smartAccount,
      }
    }

    const bundlerClient = createBundlerClient({
      account,
      chain: viemChainFor(config.chain),
      transport,
    })
    const userOpHash = await bundlerClient.sendUserOperation({
      account,
      calls: [
        encodeTransfer(recipient, meta.tokenAddress, recipientUnits),
        encodeTransfer(EVM_TREASURY, meta.tokenAddress, feeUnits),
      ],
      paymaster: true,
    })
    const { receipt } = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash })
    return {
      status: 'sent',
      txHash: receipt.transactionHash,
      userOpHash,
      smartAccount,
    }
  } catch (err) {
    return { status: 'failed', reason: friendlyCircleError(err) }
  }
}
