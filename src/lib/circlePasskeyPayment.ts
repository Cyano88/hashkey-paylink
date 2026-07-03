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
import { getSponsoredGasRecoveryUnits } from './gasRecovery'

type CirclePasskeyChain = Extract<ChainKey, 'base' | 'arbitrum'>

type SendCirclePasskeyPaymentParams = {
  chain: ChainKey
  email: string
  recipient: Address
  amount: string
  feeMode?: 'net' | 'gross'
  feeBps?: number
}

type CirclePasskeyPaymentResult =
  | { status: 'sent'; txHash: Hex; userOpHash: Hex; smartAccount: Address }
  | { status: 'failed'; reason: string; smartAccount?: Address }

type CirclePasskeyWalletResult =
  | { status: 'ready'; smartAccount: Address }
  | { status: 'failed'; reason: string }

const CLIENT_KEY = import.meta.env.VITE_CLIENT_KEY as string | undefined
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL as string | undefined
const CREDENTIAL_PREFIX = 'hashpaylink_circle_credential'
const WALLET_NAME_PREFIX = 'hashpaylink_circle_wallet_name'

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

function credentialStorageKey(email: string) {
  const host = typeof window === 'undefined' ? 'server' : window.location.hostname
  return `${CREDENTIAL_PREFIX}:${host}:${email.trim().toLowerCase()}`
}

function walletNameStorageKey(email: string) {
  const host = typeof window === 'undefined' ? 'server' : window.location.hostname
  return `${WALLET_NAME_PREFIX}:${host}:${email.trim().toLowerCase()}`
}

function legacyWalletName(email: string) {
  return `hash-paylink-${email.trim().toLowerCase()}`
}

function evmWalletName(email: string) {
  return `hash-paylink-evm-${email.trim().toLowerCase()}`
}

function evmUsername(email: string) {
  return `hashpaylink-evm-${email.trim().toLowerCase()}`
}

function getStoredCredentialId(email: string) {
  try {
    return window.localStorage.getItem(credentialStorageKey(email))
  } catch {
    return null
  }
}

function getStoredWalletName(email: string) {
  try {
    return window.localStorage.getItem(walletNameStorageKey(email))
  } catch {
    return null
  }
}

function setStoredCredential(email: string, credentialId: string, walletName: string) {
  try {
    window.localStorage.setItem(credentialStorageKey(email), credentialId)
    window.localStorage.setItem(walletNameStorageKey(email), walletName)
  } catch {
    // localStorage can be unavailable in private/browser-restricted contexts.
  }
}

function clearStoredCredentialId(email: string) {
  try {
    window.localStorage.removeItem(credentialStorageKey(email))
    window.localStorage.removeItem(walletNameStorageKey(email))
  } catch {
    // Ignore storage cleanup failures; the next registration can still proceed.
  }
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
  if (!CLIENT_KEY || !clientUrl) throw new Error('Smart wallet is not configured.')

  const transport = toPasskeyTransport(clientUrl, CLIENT_KEY)
  const normalizedEmail = email.trim().toLowerCase()
  const legacyName = legacyWalletName(normalizedEmail)
  const scopedName = evmWalletName(normalizedEmail)
  const storedCredentialId = getStoredCredentialId(email)
  if (storedCredentialId) {
    try {
      const credential = await toWebAuthnCredential({
        transport,
        mode: WebAuthnMode.Login,
        credentialId: storedCredentialId,
      })
      return { credential, walletName: getStoredWalletName(email) ?? legacyName }
    } catch {
      clearStoredCredentialId(email)
    }
  }

  try {
    const credential = await toWebAuthnCredential({
      transport,
      mode: WebAuthnMode.Login,
    })
    setStoredCredential(email, credential.id, getStoredWalletName(email) ?? legacyName)
    return { credential, walletName: getStoredWalletName(email) ?? legacyName }
  } catch {
    // No discoverable passkey on this device/browser. Fall through to first-time registration.
  }

  try {
    const credential = await toWebAuthnCredential({
      transport,
      mode: WebAuthnMode.Register,
      username: evmUsername(normalizedEmail),
    })
    setStoredCredential(email, credential.id, scopedName)
    return { credential, walletName: scopedName }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.toLowerCase().includes('username is duplicated')) {
      throw new Error('This email already has a Smart wallet. Use the same device/passkey you created it with, or use a different email.')
    }
    throw err
  }
}

function friendlyCircleError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('not configured')) return msg
  if (lower.includes('default policy') || lower.includes('policy is not found')) {
    return 'Smart wallet gas sponsorship is not enabled yet. In Circle Console, create and enable a mainnet Gas Station policy for Modular Wallets, add a payment method, then redeploy.'
  }
  if (lower.includes('entity config')) {
    return 'Circle Modular Wallet is not configured for this domain. In Circle Console, make the Client Key allowed domain exactly match the Passkey domain, then redeploy.'
  }
  if (lower.includes('username is duplicated')) return 'This email already has a Smart wallet. Use the same device/passkey you created it with, or use a different email.'
  if (lower.includes('credential') || lower.includes('passkey')) return 'Passkey setup was not completed. Use a browser/device with passkeys enabled, or create the passkey on this device first.'
  if (lower.includes('insufficient')) return 'Add USDC to Smart wallet to continue.'
  if (lower.includes('user rejected') || lower.includes('notallowederror') || lower.includes('cancel')) {
    return 'Passkey confirmation was cancelled.'
  }
  return msg.slice(0, 160) || 'Smart wallet payment failed.'
}

export function canUseCirclePasskeyPayments(chain: ChainKey) {
  return !!getCircleClientConfig(chain)
}

async function getCircleSmartAccount(chain: ChainKey, email: string) {
  const config = getCircleClientConfig(chain)
  if (!config) throw new Error('Smart wallet is not configured for this chain.')
  const { credential, walletName } = await getCredential(email.trim())
  const transport = toModularTransport(config.chainUrl, config.clientKey)
  const client = createPublicClient({
    chain: viemChainFor(config.chain),
    transport,
  })
  const account = await toCircleSmartAccount({
    client,
    owner: toWebAuthnAccount({ credential }),
    name: walletName,
  })
  return {
    account,
    smartAccount: account.address as Address,
    transport,
    chain: config.chain,
  }
}

export async function prepareCirclePasskeyWallet(chain: ChainKey, email: string): Promise<CirclePasskeyWalletResult> {
  try {
    const { smartAccount } = await getCircleSmartAccount(chain, email)
    return { status: 'ready', smartAccount }
  } catch (err) {
    return { status: 'failed', reason: friendlyCircleError(err) }
  }
}

export async function sendCirclePasskeyPayment({
  chain,
  email,
  recipient,
  amount,
  feeMode,
  feeBps = PLATFORM_FEE_BPS,
}: SendCirclePasskeyPaymentParams): Promise<CirclePasskeyPaymentResult> {
  const config = getCircleClientConfig(chain)
  if (!config) return { status: 'failed', reason: 'Smart wallet is not configured for this chain.' }

  try {
    const meta = CHAIN_META[config.chain]
    const totalUnits = parseUnits(amount || '0', meta.decimals)
    const feeUnits = totalUnits * BigInt(feeBps) / 10_000n
    const gasRecoveryUnits = feeBps === 0 ? 0n : getSponsoredGasRecoveryUnits(config.chain, totalUnits, feeUnits, meta.decimals)
    const treasuryUnits = feeUnits + gasRecoveryUnits
    const grossFees = feeMode === 'gross'
    const recipientUnits = grossFees ? totalUnits : totalUnits - treasuryUnits
    const requiredUnits = grossFees ? totalUnits + treasuryUnits : totalUnits
    if (totalUnits <= 0n || recipientUnits <= 0n) return { status: 'failed', reason: 'Enter a valid amount.' }

    const { account, smartAccount, transport } = await getCircleSmartAccount(chain, email)
    const client = createPublicClient({
      chain: viemChainFor(config.chain),
      transport,
    })
    const balance = await client.readContract({
      address: meta.tokenAddress,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [smartAccount],
    })
    if (balance < requiredUnits) {
      return {
        status: 'failed',
        reason: 'Add USDC to Smart wallet to continue.',
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
        encodeTransfer(EVM_TREASURY, meta.tokenAddress, treasuryUnits),
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
