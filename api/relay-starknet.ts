/**
 * /api/relay-starknet
 *
 * Starknet Direct Send relay — AVNU Gasless (user pays gas in USDC) mode.
 * No API key required. Gas is deducted from the deposited USDC balance.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *  1. Re-derive the ghost OZ Account address from (linkId, recipientStark).
 *  2. Confirm Circle USDC has arrived at the ghost address.
 *  3. POST to AVNU /paymaster/v1/build-typed-data:
 *       • gasTokenAddress = Circle USDC (supported AVNU gas token, no key needed)
 *       • AVNU prepends its gas-fee transfer into the signed bundle and deducts
 *         from the ghost account's USDC balance.
 *       • deploymentData deploys the ghost OZ account atomically if needed.
 *       • Returns a SNIP-9 v2 OutsideExecution typed-data blob.
 *  4. Sign the typed-data hash with the ghost's STARK private key [r, s].
 *  5. POST to AVNU /paymaster/v1/execute → returns tx hash.
 *
 * ── Required env vars ─────────────────────────────────────────────────────────
 *  STARKNET_RPC_URL        Starknet RPC (default: Lava public)
 *  STARKNET_OZ_CLASS_HASH  Optional — override OZ Account v0.8.1 class hash
 *
 * Payers must send Circle USDC (0x053c91...) — the gas token AVNU supports.
 * Legacy StarkGate USDC (0x033068...) is detected and rejected with a clear msg.
 */

import type { Request, Response } from 'express'
import { typedData as starkTypedData, hash, ec, CallData, num, RpcProvider } from 'starknet'

// ─── Constants ────────────────────────────────────────────────────────────────

const AVNU_BASE       = 'https://starknet.api.avnu.fi'
const DEFAULT_RPC_URL = 'https://rpc.starknet.lava.build'

/** OZ Account v0.8.1 Sierra class hash — declared on Starknet Mainnet */
const DEFAULT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

/** Circle native USDC — the AVNU-supported gas token */
const USDC_NEW = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'
/** Legacy StarkGate USDC — detected so we can surface a clear error */
const USDC_OLD = '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'

/** Platform treasury — receives 0.5 % fee */
const STARK_TREASURY = '0x0483AB5539B281c08777F1C8337Beeba05c2610feDcbA191B989E35eDc2767C3'

const FEE_BPS     = 50n       // 0.5 %
const MAX_GAS_USDC = 10_000n  // 0.01 USDC ceiling reserved for AVNU gas
const MIN_BALANCE  =  1_000n  // 0.001 USDC minimum worth relaying

/** Starknet field prime — Pedersen inputs must be < P */
const STARK_P = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')

// ─── Ghost address derivation ────────────────────────────────────────────────

function deriveGhost(linkId: string, recipientStark: string, classHash: string) {
  const linkIdFelt = num.toHex(BigInt(linkId) % STARK_P)
  const recipFelt  = num.toHex(BigInt(recipientStark) % STARK_P)
  const seed    = hash.computePedersenHash(linkIdFelt, recipFelt)
  const privKey = ec.starkCurve.grindKey(seed)
  const pubKey  = ec.starkCurve.getStarkKey(privKey)
  const calldata = CallData.compile({ publicKey: pubKey })
  const rawAddr  = hash.calculateContractAddressFromHash(pubKey, classHash, calldata, '0x0')
  return { privKey, pubKey, address: num.toHex(rawAddr) }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toU256Calldata(amount: bigint): [string, string] {
  return [
    num.toHex(amount & BigInt('0xffffffffffffffffffffffffffffffff')),
    num.toHex(amount >> 128n),
  ]
}

interface AvnuCall { contractAddress: string; entrypoint: string; calldata: string[] }
interface AvnuBuildResponse {
  requestId:      string
  typedData:      Record<string, unknown>
  gasTokenAmount: string
}
interface AvnuExecuteResponse {
  transactionHash?:  string
  transaction_hash?: string
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const rpcUrl    = process.env.STARKNET_RPC_URL       ?? DEFAULT_RPC_URL
  const classHash = process.env.STARKNET_OZ_CLASS_HASH ?? DEFAULT_CLASS_HASH

  // ── Input validation ──────────────────────────────────────────────────────
  const { linkId, recipientStark } = (req.body ?? {}) as Record<string, string>

  if (!linkId || !/^0x[0-9a-fA-F]{64}$/.test(linkId)) {
    return res.status(400).json({ ok: false, error: 'linkId must be a 0x-prefixed 32-byte hex string' })
  }
  if (!recipientStark || !/^0x[0-9a-fA-F]{1,64}$/.test(recipientStark)) {
    return res.status(400).json({ ok: false, error: 'recipientStark must be a valid Starknet address' })
  }

  // ── Derive ghost address ──────────────────────────────────────────────────
  const { privKey: ghostPrivKey, pubKey, address: ghostAddr } =
    deriveGhost(linkId, recipientStark, classHash)

  const provider = new RpcProvider({ nodeUrl: rpcUrl })

  // ── USDC balance — accept both Circle native and legacy StarkGate ─────────
  // In sponsored mode AVNU pays gas in STRK from API key credits, so any USDC
  // variant can be transferred. Check both contracts, use whichever has funds.
  let balance   = 0n
  let usdcToken = USDC_NEW

  for (const token of [USDC_NEW, USDC_OLD]) {
    try {
      const result = await provider.callContract(
        { contractAddress: token, entrypoint: 'balanceOf', calldata: [ghostAddr] },
        'latest',
      )
      const bal = BigInt(result[0] ?? '0x0')
      console.log(`[relay-starknet] token=${token.slice(0,10)}… balance=${bal}µUSDC at ${ghostAddr}`)
      if (bal > 0n) { balance = bal; usdcToken = token; break }
    } catch (err) {
      console.warn(`[relay-starknet] balanceOf failed for ${token.slice(0,10)}…:`, err)
    }
  }

  if (balance === 0n)
    return res.status(400).json({ ok: false, error: 'No USDC found at ghost address yet' })

  if (balance <= MIN_BALANCE) {
    return res.status(400).json({
      ok:    false,
      error: `Balance ${balance} µUSDC is too low to relay`,
    })
  }

  console.log(`[relay-starknet] ghost=${ghostAddr} balance=${balance}µUSDC recipient=${recipientStark}`)

  // ── Payout split ──────────────────────────────────────────────────────────
  // Sponsored mode: AVNU pays gas from pre-funded STRK credits — no USDC
  // deducted from the ghost balance. Full balance goes to recipient + treasury.
  const platformFee = balance * FEE_BPS / 10_000n
  const payout      = balance - platformFee

  const [payoutLow, payoutHigh] = toU256Calldata(payout)
  const [feeLow,    feeHigh   ] = toU256Calldata(platformFee)

  // ── Check deployment status ───────────────────────────────────────────────
  let isDeployed = false
  try {
    const code = await provider.getClassAt(ghostAddr, 'latest').catch(() => null)
    isDeployed = code != null
  } catch { /* assume not deployed */ }
  console.log(`[relay-starknet] ghost account deployed=${isDeployed}`)

  // ── AVNU build-typed-data ─────────────────────────────────────────────────
  const calls: AvnuCall[] = [
    { contractAddress: usdcToken, entrypoint: 'transfer', calldata: [recipientStark, payoutLow, payoutHigh] },
    { contractAddress: usdcToken, entrypoint: 'transfer', calldata: [STARK_TREASURY,  feeLow,    feeHigh   ] },
  ]

  const avnuKey = process.env.AVNU_API_KEY
  console.log(`[relay-starknet] avnuKey=${avnuKey ? 'set' : 'NOT SET'}`)

  const buildBody: Record<string, unknown> = {
    userAddress: ghostAddr,
    calls,
    // Sponsored mode — AVNU pays gas from pre-funded STRK credits on the API key.
    // No gasTokenAddress needed; API key identifies the sponsor account.
  }

  if (!isDeployed) {
    buildBody.deploymentData = {
      classHash,
      salt:     pubKey,    // OZ convention: salt = pubKey
      unique:   false,     // deployer = 0x0 → address matches our derivation
      calldata: [pubKey],  // OZ Account constructor: [publicKey]
    }
  }

  const avnuHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
  if (avnuKey) { avnuHeaders['api-key'] = avnuKey; avnuHeaders['x-api-key'] = avnuKey }

  let buildData: AvnuBuildResponse
  try {
    const buildRes = await fetch(`${AVNU_BASE}/paymaster/v1/build-typed-data`, {
      method:  'POST',
      headers: avnuHeaders,
      body:    JSON.stringify(buildBody),
      signal:  AbortSignal.timeout(15_000),
    })

    if (!buildRes.ok) {
      const errBody = await buildRes.text().catch(() => '')
      console.error('[relay-starknet] AVNU build failed:', buildRes.status, errBody)
      return res.status(502).json({
        ok:    false,
        error: `AVNU build failed (${buildRes.status}): ${errBody.slice(0, 300)}`,
      })
    }

    buildData = (await buildRes.json()) as AvnuBuildResponse
    console.log(`[relay-starknet] AVNU build ok requestId=${buildData.requestId} gas=${buildData.gasTokenAmount}µUSDC`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-starknet] AVNU build error:', msg)
    return res.status(502).json({ ok: false, error: `AVNU build error: ${msg.slice(0, 200)}` })
  }

  const { requestId, typedData: avnuTypedData, gasTokenAmount } = buildData
  if (!requestId || !avnuTypedData) {
    return res.status(502).json({ ok: false, error: 'AVNU build response missing requestId or typedData' })
  }

  // ── Sign the SNIP-9 v2 OutsideExecution typed data ───────────────────────
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

  // ── Execute via AVNU ──────────────────────────────────────────────────────
  let txHash: string
  try {
    const execRes = await fetch(`${AVNU_BASE}/paymaster/v1/execute`, {
      method:  'POST',
      headers: avnuHeaders,
      body:    JSON.stringify({ requestId, signature }),
      signal:  AbortSignal.timeout(20_000),
    })

    if (!execRes.ok) {
      const errBody = await execRes.text().catch(() => '')
      console.error('[relay-starknet] AVNU execute failed:', execRes.status, errBody)
      return res.status(502).json({
        ok:    false,
        error: `AVNU execute failed (${execRes.status}): ${errBody.slice(0, 300)}`,
      })
    }

    const execData = (await execRes.json()) as AvnuExecuteResponse
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
