/**
 * /api/relay-starknet
 *
 * Starknet Direct Send relay — AVNU Paymaster edition.
 * Fully gas-free: no STRK pre-funding, no relayer wallet required.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *  1. Re-derive the ghost OZ Account address from (linkId, recipientStark).
 *  2. Confirm USDC has arrived at the ghost address (via Starknet RPC).
 *  3. Call AVNU /paymaster/v1/build:
 *       • Includes OZ Account deployment params (class hash, salt, calldata)
 *         so AVNU deploys the ghost account atomically if needed.
 *       • Includes our USDC split calls (recipient 99.5% + treasury 0.5%).
 *       • AVNU embeds its own gas-fee transfer into the signed call bundle
 *         and charges USDC from the ghost account's balance.
 *       • Returns a SNIP-9 v2 OutsideExecution typed-data blob to sign.
 *  4. Compute the typed-data message hash, sign with the ghost's STARK
 *     private key (ec.starkCurve.sign — compatible with OZ Account v0.8.1
 *     is_valid_signature which expects [r, s]).
 *  5. POST to AVNU /paymaster/v1/execute with {requestId, signature}.
 *     AVNU broadcasts the transaction and returns the tx hash.
 *
 * ── Required env vars ─────────────────────────────────────────────────────────
 *  STARKNET_RPC_URL         Starknet RPC for balance check (default: Blast public)
 *  AVNU_API_KEY             Optional — AVNU API key for higher rate limits
 *  STARKNET_OZ_CLASS_HASH   Optional — override OZ Account v0.8.1 class hash
 *
 * No STRK wallet needed. Gas is sponsored by AVNU and reimbursed in USDC
 * from the ghost account's own balance.
 */

import type { Request, Response } from 'express'
import { typedData as starkTypedData, hash, ec, CallData, num, RpcProvider } from 'starknet'

// ─── Constants ────────────────────────────────────────────────────────────────

const AVNU_BASE = 'https://starknet.api.avnu.fi'

const DEFAULT_RPC_URL    = 'https://starknet-mainnet.public.blastapi.io'
/** OZ Account v0.8.1 Sierra class hash — declared on Starknet Mainnet */
const DEFAULT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

/** USDC on Starknet Mainnet — matches CHAIN_META.starknet.tokenAddress */
const USDC_STARKNET  = '0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb'
/** Platform treasury — receives 0.5 % fee */
const STARK_TREASURY = '0x0483AB5539B281c08777F1C8337Beeba05c2610feDcbA191B989E35eDc2767C3'

const FEE_BPS = 50n  // 0.5 %

/**
 * Maximum USDC (6 decimals) AVNU may charge for gas.
 * Passed as maxGasTokenAmount in the build request.
 * Actual fee is much lower (~$0.001–$0.05); the cap prevents over-billing.
 * We reserve this from the balance before computing the recipient payout.
 */
const MAX_GAS_USDC = 100_000n  // 0.10 USDC ceiling

// ─── Ghost address derivation ────────────────────────────────────────────────

/**
 * Re-derives the ghost OZ Account address using the same deterministic math
 * as starknet-ghost.ts on the frontend. Must match exactly.
 *
 * Convention (OZ Account standard):
 *   salt = publicKey, deployer = 0x0, calldata = [publicKey]
 */
/** Starknet field prime — inputs must be < P for Pedersen to accept them. */
const STARK_P = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')

function deriveGhost(linkId: string, recipientStark: string, classHash: string) {
  // Reduce inputs to valid felt252 range — linkId is 32-byte EVM hex (can exceed P)
  const linkIdFelt = num.toHex(BigInt(linkId) % STARK_P)
  const recipFelt  = num.toHex(BigInt(recipientStark) % STARK_P)
  const seed     = hash.computePedersenHash(linkIdFelt, recipFelt)
  const privKey  = ec.starkCurve.grindKey(seed)
  const pubKey   = ec.starkCurve.getStarkKey(privKey)
  const calldata = CallData.compile({ publicKey: pubKey })
  const rawAddr  = hash.calculateContractAddressFromHash(pubKey, classHash, calldata, '0x0')
  return { privKey, pubKey, address: num.toHex(rawAddr) }
}

// ─── AVNU Paymaster helpers ──────────────────────────────────────────────────

/** AVNU call shape expected by the paymaster /build endpoint */
interface AvnuCall {
  contractAddress: string
  entrypoint:      string
  calldata:        string[]  // hex felts
}

/** Shape returned by AVNU /paymaster/v1/build */
interface AvnuBuildResponse {
  requestId:      string
  typedData:      Record<string, unknown>  // SNIP-9 v2 OutsideExecution typed data
  gasTokenAmount: string  // USDC micro-units AVNU will charge
}

/** Shape returned by AVNU /paymaster/v1/execute */
interface AvnuExecuteResponse {
  transactionHash?: string
  transaction_hash?: string  // some API versions use snake_case
}

function avnuHeaders(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) h['x-api-key'] = apiKey
  return h
}

/** Convert a bigint amount to the [low_hex, high_hex] pair Cairo u256 expects */
function toU256Calldata(amount: bigint): [string, string] {
  const low  = amount & BigInt('0xffffffffffffffffffffffffffffffff')
  const high = amount >> 128n
  return [num.toHex(low), num.toHex(high)]
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const rpcUrl    = process.env.STARKNET_RPC_URL    ?? DEFAULT_RPC_URL
  const classHash = process.env.STARKNET_OZ_CLASS_HASH ?? DEFAULT_CLASS_HASH
  const avnuKey   = process.env.AVNU_API_KEY  // optional

  // ── Input validation ────────────────────────────────────────────────────────
  const { linkId, recipientStark } = (req.body ?? {}) as Record<string, string>

  if (!linkId || !/^0x[0-9a-fA-F]{64}$/.test(linkId)) {
    return res.status(400).json({ ok: false, error: 'linkId must be a 0x-prefixed 32-byte hex string' })
  }
  if (!recipientStark || !/^0x[0-9a-fA-F]{1,64}$/.test(recipientStark)) {
    return res.status(400).json({ ok: false, error: 'recipientStark must be a valid Starknet address' })
  }

  // ── Derive ghost address ─────────────────────────────────────────────────
  const { privKey: ghostPrivKey, pubKey, address: ghostAddr } =
    deriveGhost(linkId, recipientStark, classHash)

  // ── Confirm USDC balance ─────────────────────────────────────────────────
  let balance: bigint
  try {
    const provider = new RpcProvider({ nodeUrl: rpcUrl })
    const result   = await provider.callContract({
      contractAddress: USDC_STARKNET,
      entrypoint:      'balanceOf',
      calldata:        [ghostAddr],
    })
    // balanceOf returns Uint256 [low, high]; USDC amounts always fit in low
    balance = BigInt(result[0] ?? '0x0')
  } catch (err) {
    console.error('[relay-starknet] balanceOf failed:', err)
    return res.status(500).json({ ok: false, error: 'Failed to read USDC balance from Starknet' })
  }

  if (balance === 0n) {
    return res.status(400).json({ ok: false, error: 'No USDC found at ghost address yet' })
  }
  if (balance <= MAX_GAS_USDC) {
    return res.status(400).json({
      ok:    false,
      error: `Balance ${balance} µUSDC is too low to cover the max gas reserve (${MAX_GAS_USDC} µUSDC = 0.10 USDC)`,
    })
  }

  // ── Compute payout split ─────────────────────────────────────────────────
  // Reserve MAX_GAS_USDC for AVNU gas. AVNU will include its actual fee
  // (≤ MAX_GAS_USDC) as the first call in the signed bundle. Any unspent
  // gas reserve remains in the ghost address (acceptable for a one-time vault).
  const spendable    = balance - MAX_GAS_USDC
  const platformFee  = spendable * FEE_BPS / 10_000n
  const payout       = spendable - platformFee

  // ── Build AVNU paymaster transaction ────────────────────────────────────
  const [payoutLow,  payoutHigh ] = toU256Calldata(payout)
  const [feeLow,     feeHigh    ] = toU256Calldata(platformFee)

  const calls: AvnuCall[] = [
    {
      contractAddress: USDC_STARKNET,
      entrypoint:      'transfer',
      calldata:        [recipientStark, payoutLow, payoutHigh],
    },
    {
      contractAddress: USDC_STARKNET,
      entrypoint:      'transfer',
      calldata:        [STARK_TREASURY, feeLow, feeHigh],
    },
  ]

  let buildData: AvnuBuildResponse
  try {
    const buildRes = await fetch(`${AVNU_BASE}/paymaster/v1/build`, {
      method:  'POST',
      headers: avnuHeaders(avnuKey),
      body:    JSON.stringify({
        userAddress:      ghostAddr,
        calls,
        gasTokenAddress:  USDC_STARKNET,
        maxGasTokenAmount: MAX_GAS_USDC.toString(),
        // ── Account deployment parameters ──────────────────────────────────
        // AVNU deploys the ghost OZ account atomically when these are present.
        // If the account is already deployed, AVNU ignores these fields.
        accountClassHash:             classHash,
        accountAddressSalt:           pubKey,     // OZ convention: salt = pubKey
        accountConstructorCalldata:   [pubKey],   // OZ Account constructor: [publicKey]
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!buildRes.ok) {
      const errBody = await buildRes.text().catch(() => '')
      console.error('[relay-starknet] AVNU build failed:', buildRes.status, errBody)
      return res.status(502).json({
        ok:    false,
        error: `AVNU build failed (${buildRes.status}): ${errBody.slice(0, 200)}`,
      })
    }

    buildData = (await buildRes.json()) as AvnuBuildResponse
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-starknet] AVNU build error:', msg)
    return res.status(502).json({ ok: false, error: `AVNU build error: ${msg.slice(0, 200)}` })
  }

  const { requestId, typedData: avnuTypedData, gasTokenAmount } = buildData
  if (!requestId || !avnuTypedData) {
    return res.status(502).json({ ok: false, error: 'AVNU build response missing requestId or typedData' })
  }

  // ── Sign the SNIP-9 OutsideExecution typed data ──────────────────────────
  // starknet.js getMessageHash computes:
  //   hash = pedersen(domain_separator, message_hash)
  // as per SNIP-9 v2 / SNIP-12 revised spec.
  //
  // OZ Account v0.8.1 is_valid_signature expects exactly [r, s] (2 felts)
  // and verifies via check_ecdsa_signature(hash, public_key, r, s).
  let signature: [string, string]
  try {
    const msgHash = starkTypedData.getMessageHash(
      avnuTypedData as Parameters<typeof starkTypedData.getMessageHash>[0],
      ghostAddr,
    )
    const sig = ec.starkCurve.sign(msgHash, ghostPrivKey)
    signature = [num.toHex(sig.r), num.toHex(sig.s)]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-starknet] signing failed:', msg)
    return res.status(500).json({ ok: false, error: `Signing failed: ${msg.slice(0, 200)}` })
  }

  // ── Execute via AVNU ─────────────────────────────────────────────────────
  let txHash: string
  try {
    const execRes = await fetch(`${AVNU_BASE}/paymaster/v1/execute`, {
      method:  'POST',
      headers: avnuHeaders(avnuKey),
      body:    JSON.stringify({ requestId, signature }),
      signal:  AbortSignal.timeout(20_000),
    })

    if (!execRes.ok) {
      const errBody = await execRes.text().catch(() => '')
      console.error('[relay-starknet] AVNU execute failed:', execRes.status, errBody)
      return res.status(502).json({
        ok:    false,
        error: `AVNU execute failed (${execRes.status}): ${errBody.slice(0, 200)}`,
      })
    }

    const execData = (await execRes.json()) as AvnuExecuteResponse
    // AVNU returns camelCase or snake_case depending on API version
    txHash = execData.transactionHash ?? execData.transaction_hash ?? ''

    if (!txHash) {
      return res.status(502).json({ ok: false, error: 'AVNU execute returned no transaction hash' })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-starknet] AVNU execute error:', msg)
    return res.status(502).json({ ok: false, error: `AVNU execute error: ${msg.slice(0, 200)}` })
  }

  console.log(
    `[relay-starknet] swept ${payout}µUSDC → ${recipientStark}, ` +
    `${platformFee}µUSDC → treasury, ${gasTokenAmount}µUSDC → AVNU gas. tx=${txHash}`,
  )

  return res.status(200).json({ ok: true, txHash })
}
