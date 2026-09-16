import { Connection, PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '../solana-token.js'

export type PocketBridgeNetwork = 'base' | 'arbitrum' | 'arc' | 'solana'

export const CCTP_DOMAIN: Record<PocketBridgeNetwork, number> = {
  base: 6,
  arbitrum: 3,
  solana: 5,
  arc: 26,
}

export const CCTP_TOKEN_MESSENGER_V2 = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'
export const CCTP_FORWARD_HOOK = '0x636374702d666f72776172640000000000000000000000000000000000000000'
export const SOLANA_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')

export function parseUsdcAmount(value: string) {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,6})?)?$/)
  if (!match) throw new Error('Enter a valid USDC amount with up to 6 decimals.')
  const units = BigInt(match[1]) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'))
  if (units <= 0n) throw new Error('Enter an amount to bridge.')
  return units
}

function decimalRateParts(value: unknown) {
  const text = String(value ?? '0')
  const match = text.match(/^(\d+)(?:\.(\d+))?$/)
  if (!match) throw new Error('Circle returned an invalid protocol fee.')
  const decimals = match[2]?.length ?? 0
  return { numerator: BigInt(`${match[1]}${match[2] ?? ''}`), denominator: 10_000n * 10n ** BigInt(decimals) }
}

export async function readCctpForwardQuote(source: PocketBridgeNetwork, destination: PocketBridgeNetwork, transferUnits: bigint, includeRecipientSetup = false) {
  if (source === destination) throw new Error('Choose a different destination network.')
  const query = new URLSearchParams({ forward: 'true' })
  if (destination === 'solana' && includeRecipientSetup) query.set('includeRecipientSetup', 'true')
  const response = await fetch(`https://iris-api.circle.com/v2/burn/USDC/fees/${CCTP_DOMAIN[source]}/${CCTP_DOMAIN[destination]}?${query}`)
  const rows = await response.json().catch(() => []) as Array<{ finalityThreshold?: number; minimumFee?: number | string; forwardFee?: { med?: number | string } }>
  if (!response.ok) throw new Error('Circle could not quote this bridge route right now.')
  const fast = rows.find(row => Number(row.finalityThreshold) === (source === 'arc' ? 2000 : 1000)) ?? rows.find(row => Number(row.finalityThreshold) === 2000)
  if (!fast || ![1000, 2000].includes(Number(fast.finalityThreshold))) throw new Error('Circle did not return a supported finality threshold.')
  const forwardFee = BigInt(String(fast?.forwardFee?.med ?? ''))
  const rate = decimalRateParts(fast?.minimumFee ?? 0)
  if (forwardFee < 0n || rate.numerator >= rate.denominator) throw new Error('Circle returned an invalid fee.')
  const divisor = rate.denominator - rate.numerator
  const totalUnits = ((transferUnits + forwardFee) * rate.denominator + divisor - 1n) / divisor
  const maxFeeUnits = totalUnits - transferUnits
  const protocolFee = maxFeeUnits - forwardFee
  return {
    transferUnits,
    forwardFeeUnits: forwardFee,
    protocolFeeUnits: protocolFee,
    maxFeeUnits,
    totalUnits: transferUnits + maxFeeUnits,
    finalityThreshold: Number(fast.finalityThreshold),
  }
}

export async function solanaRecipient(walletAddress: string) {
  const wallet = new PublicKey(walletAddress)
  const ata = await getAssociatedTokenAddress(SOLANA_USDC_MINT, wallet, true)
  const connection = new Connection(process.env.SOLANA_RPC_URL?.trim() || 'https://api.mainnet-beta.solana.com', 'confirmed')
  const exists = Boolean(await connection.getAccountInfo(ata, 'confirmed').catch(() => null))
  return { wallet, ata, needsSetup: !exists }
}

export function cctpMintRecipient(destination: PocketBridgeNetwork, walletAddress: string) {
  if (destination === 'solana') return walletAddress
  return `0x${walletAddress.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`
}

export function cctpForwardHookForSolana(wallet: PublicKey, needsSetup: boolean) {
  if (!needsSetup) return CCTP_FORWARD_HOOK
  const magic = Buffer.alloc(24)
  magic.write('cctp-forward', 'utf8')
  const version = Buffer.alloc(4)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(33)
  return `0x${Buffer.concat([magic, version, length, Buffer.from([1]), Buffer.from(wallet.toBytes())]).toString('hex')}`
}

export function formatUsdcUnits(units: bigint) {
  const whole = units / 1_000_000n
  const fraction = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}
