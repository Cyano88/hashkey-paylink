import { ethers } from 'ethers'
import { createArchiveLookupCache } from './archive-lookup-cache.js'

const OG_RPC       = (process.env.OG_RPC_URL ?? process.env.OG_EVM_RPC_URL ?? process.env.ZG_RPC_URL ?? 'https://evmrpc.0g.ai').trim()
const ARCHIVE_ADDR = '0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'
const FROM_BLOCK   = parseInt(process.env.OG_FROM_BLOCK ?? '32498000', 10)

const ARCHIVE_ABI = [
  'event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)',
]

const VERIFY_TIMEOUT_MS = Math.min(30_000, Math.max(5_000, Number(process.env.HELPER_VERIFY_TIMEOUT_MS) || 15_000))
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), VERIFY_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function readArchive(eventId: string, payer: string) {
  const provider = new ethers.JsonRpcProvider(OG_RPC)
  try {
    const contract = new ethers.Contract(ARCHIVE_ADDR, ARCHIVE_ABI, provider)
    const latest   = await withTimeout(provider.getBlockNumber(), '0G payment verification')

    const events = await withTimeout(contract.queryFilter(
      contract.filters.PaymentArchived(eventId),
      FROM_BLOCK,
      latest,
    ), '0G payment proof lookup')

    const match = events.find(
      e => 'args' in e && (e.args[3] as string).toLowerCase() === payer.toLowerCase(),
    )

    if (!match || !('args' in match)) return null

    return {
      payment: {
        eventId,
        payer:  match.args[3] as string,
        chain:  match.args[2] as string,
        amount: match.args[4] as string,
        ts:     Number(match.args[5]),
      },
      proof: {
        ogTxHash:   match.transactionHash,
        ogExplorer: `https://chainscan.0g.ai/tx/${match.transactionHash}`,
        rootHash:   match.args[1] as string,
        contract:   ARCHIVE_ADDR,
        network:    '0G Mainnet (Chain ID 16661)',
      },
    }
  } catch (error) {
    // Upstream errors can include credential-bearing RPC URLs.
    const timedOut = error instanceof Error && /timed out/i.test(error.message)
    throw new Error(timedOut ? 'Archive lookup timed out' : 'Archive lookup unavailable')
  } finally { provider.destroy() }
}

// Archive-event evidence only; does not authenticate a payer or verify settlement.
export const lookupLegacyArchive = createArchiveLookupCache(readArchive)
