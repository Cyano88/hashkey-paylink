import { PublicKey } from '@solana/web3.js'
import { CCTP_DOMAIN, SOLANA_USDC_MINT, parseUsdcAmount, formatUsdcUnits, type PocketBridgeNetwork } from './cctp.js'
import { getAssociatedTokenAddress } from '../solana-token.js'

export const TOKENS: Record<PocketBridgeNetwork, string> = {
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  polygon: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arbitrum: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  arc: '0x3600000000000000000000000000000000000000',
  solana: SOLANA_USDC_MINT.toBase58(),
}
export type Expected = { source: PocketBridgeNetwork; destination: PocketBridgeNetwork; sourceAddress: string; destinationAddress: string; amount: string; txHash: string; destinationTxHash?:string }
function fail(message: string, status = 403): never { throw Object.assign(new Error(message), { status }) }
/** Provider fields are only a candidate: callers still verify owned wallets,
 * full message binding and the canonical destination transaction. */
export function bridgeCompletionClaim(raw:unknown){
 if(typeof raw!=='string'||!/^0x(?:[0-9a-f]{2})+$/i.test(raw)||raw.length<754||raw.length>20000)fail('Bridge completion evidence is pending.',409)
 const bytes=Buffer.from(raw.slice(2),'hex'),domain=bytes.readUInt32BE(8)
 const destination=(Object.entries(CCTP_DOMAIN) as Array<[PocketBridgeNetwork,number]>).find(([,value])=>value===domain)?.[0]
 if(!destination)fail('Bridge destination is unsupported.',409)
 const burn=BigInt('0x'+bytes.subarray(216,248).toString('hex')),fee=BigInt('0x'+bytes.subarray(280,312).toString('hex'))
 if(burn<=fee)fail('Bridge amount is invalid.',409)
 const amount=formatUsdcUnits(burn-fee);parseUsdcAmount(amount)
 return {destination,amount}
}
function addressBytes(network: PocketBridgeNetwork, address: string) {
  if (network === 'solana') return Buffer.from(new PublicKey(address).toBytes())
  if (!/^0x[0-9a-f]{40}$/i.test(address)) fail('Invalid linked bridge wallet.')
  return Buffer.from(address.slice(2).padStart(64, '0'), 'hex')
}
export async function validatePocketBridgeMessage(raw: unknown, expected: Expected) {
  if (typeof raw !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(raw) || raw.length > 20_000) fail('Circle has not published this bridge message yet.', 409)
  // CCTP V2: 148-byte header followed by BurnMessageV2.
  // https://developers.circle.com/cctp/references/technical-guide
  const data = Buffer.from(raw.slice(2), 'hex')
  if (data.length < 376 || data.readUInt32BE(0) !== 1 || data.readUInt32BE(148) !== 1) fail('Unsupported Circle bridge message.', 409)
  if (data.readUInt32BE(4) !== CCTP_DOMAIN[expected.source] || data.readUInt32BE(8) !== CCTP_DOMAIN[expected.destination]) fail('Bridge networks do not match the source transaction.')
  if (!data.subarray(152, 184).equals(addressBytes(expected.source, TOKENS[expected.source]))) fail('This transaction did not bridge native USDC.')
  if (!data.subarray(248, 280).equals(addressBytes(expected.source, expected.sourceAddress))) fail('This bridge was not sent from your linked wallet.')
  const recipient = expected.destination === 'solana'
    ? Buffer.from((await getAssociatedTokenAddress(SOLANA_USDC_MINT, new PublicKey(expected.destinationAddress), true)).toBytes())
    : addressBytes(expected.destination, expected.destinationAddress)
  if (!data.subarray(184, 216).equals(recipient)) fail('This bridge does not arrive in your linked wallet.')
  const burned = BigInt('0x' + data.subarray(216, 248).toString('hex'))
  const maxFee = BigInt('0x' + data.subarray(280, 312).toString('hex'))
  if (burned <= maxFee || burned - maxFee !== parseUsdcAmount(expected.amount)) fail('Bridge amount does not match the source transaction.')
}
export async function verifyPocketBridgeRecord(expected: Expected, fetcher: typeof fetch = fetch) {
  if (expected.source === expected.destination) fail('Choose different bridge networks.', 400)
  if (!(expected.source === 'solana' ? /^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(expected.txHash) : /^0x[0-9a-f]{64}$/i.test(expected.txHash))) fail('Invalid bridge transaction hash.', 400)
  const response = await fetcher(`https://iris-api.circle.com/v2/messages/${CCTP_DOMAIN[expected.source]}?transactionHash=${encodeURIComponent(expected.txHash)}`, { signal: AbortSignal.timeout(15_000) })
  if (!response.ok) fail('Circle bridge proof is not available yet.', response.status === 404 ? 409 : 503)
  const data = await response.json() as { messages?: Array<{ message?: unknown; status?: string }> }
  const messages = data.messages ?? []
  if (!Array.isArray(messages)||messages.length !== 1 || messages[0].status !== 'complete') fail('Waiting for Circle to confirm the source bridge.', 409)
  await validatePocketBridgeMessage(messages[0].message, expected)
  if(expected.destinationTxHash!==undefined)await (await import('./circle-bridge-destination-proof.js')).readCircleBridgeDestination(expected,messages[0].message as string,expected.destinationTxHash)
}
