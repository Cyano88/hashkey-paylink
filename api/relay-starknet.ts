/**
 * /api/relay-starknet
 *
 * Starknet Direct Send relay — STRK-funded relayer, self-sustaining gas model.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *  1. Re-derive ghost OZ Account address from (linkId, recipientStark).
 *  2. Confirm USDC arrived — checks both Circle USDC and legacy StarkGate USDC.
 *  3. Calculate gas reimbursement in USDC (STRK price × estimated gas units),
 *     capped at MAX_GAS_REIMB_USDC. Deducted from the deposited USDC balance
 *     and sent to treasury — treasury accumulates USDC to swap → STRK and top
 *     up the relayer wallet, so it never runs dry.
 *  4. Build SNIP-9 v2 OutsideExecution signed by the ghost private key:
 *       • transfer spendable × 99.5 % → recipient
 *       • transfer spendable × 0.5 %  → treasury (platform fee)
 *       • transfer gasReimbUsdc        → treasury (gas reimbursement)
 *  5. Relayer wallet submits ONE multicall (pays STRK gas):
 *       a. UDC deployContract — deploys ghost OZ account if not yet on-chain
 *       b. ghost.execute_from_outside_v2 — executes the three transfers above
 *
 * ── Required env vars ─────────────────────────────────────────────────────────
 *  STARKNET_RELAYER_PRIVATE_KEY  Private key of a STRK-funded Starknet wallet
 *  STARKNET_RELAYER_ADDRESS      Address of that wallet
 *  STARKNET_RPC_URL              Optional — Starknet RPC (default: Lava public)
 *  STARKNET_OZ_CLASS_HASH        Optional — override OZ Account v0.8.1 class hash
 */

import type { Request, Response } from 'express'
import {
  typedData as starkTypedData,
  hash, ec, CallData, num, RpcProvider, Account,
} from 'starknet'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RPC_URL    = 'https://rpc.starknet.lava.build'
const DEFAULT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

/** Universal Deployer Contract — canonical on Starknet Mainnet */
const UDC_ADDRESS = '0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf'

const USDC_NEW = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'
const USDC_OLD = '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'

const STARK_TREASURY = '0x0483AB5539B281c08777F1C8337Beeba05c2610feDcbA191B989E35eDc2767C3'

const FEE_BPS = 50n  // 0.5 %

/**
 * Conservative STRK gas estimate for deploy + execute_from_outside_v2.
 * Actual cost is ~0.001–0.005 STRK; we use 0.01 STRK as a safe ceiling.
 */
const ESTIMATED_GAS_STRK  = 0.01          // STRK units
const FALLBACK_STRK_USD   = 0.20          // USD/STRK fallback
const MAX_GAS_REIMB_USDC  = 10_000n       // 0.01 USDC hard ceiling
const MIN_BALANCE         = 20_000n       // 0.02 USDC minimum (covers gas reimb + fee)

const STARK_P = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')

// ─── Gas reimbursement ────────────────────────────────────────────────────────

async function getStrkPriceUsd(): Promise<number> {
  try {
    const res  = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=starknet&vs_currencies=usd',
      { signal: AbortSignal.timeout(3_000) },
    )
    const data = await res.json() as { starknet?: { usd?: number } }
    const price = data?.starknet?.usd
    return price && price > 0 ? price : FALLBACK_STRK_USD
  } catch {
    return FALLBACK_STRK_USD
  }
}

/**
 * Returns gas reimbursement in µUSDC (6 decimals).
 * Formula: estimatedGasStrk × strkUsd × 1_000_000, capped at MAX_GAS_REIMB_USDC.
 */
async function calcGasReimbUsdc(): Promise<bigint> {
  try {
    const strkUsd   = await getStrkPriceUsd()
    const usdCost   = ESTIMATED_GAS_STRK * strkUsd
    const microUsdc = BigInt(Math.ceil(usdCost * 1_000_000))
    return microUsdc > MAX_GAS_REIMB_USDC ? MAX_GAS_REIMB_USDC : microUsdc
  } catch {
    return MAX_GAS_REIMB_USDC  // safe fallback
  }
}

// ─── Ghost address derivation ─────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toU256Calldata(amount: bigint): [string, string] {
  return [
    num.toHex(amount & BigInt('0xffffffffffffffffffffffffffffffff')),
    num.toHex(amount >> 128n),
  ]
}

function randomFelt(): string {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return '0x' + Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
}

// ─── SNIP-9 v2 OutsideExecution ───────────────────────────────────────────────

interface OutsideCall { To: string; Selector: string; Calldata: string[] }

function buildOutsideExecution(callerAddr: string, executeBefore: bigint, calls: OutsideCall[]) {
  const nonce = randomFelt()

  const typedDataBlob = {
    types: {
      StarknetDomain: [
        { name: 'name',     type: 'shortstring' },
        { name: 'version',  type: 'shortstring' },
        { name: 'chainId',  type: 'shortstring' },
        { name: 'revision', type: 'shortstring' },
      ],
      OutsideExecution: [
        { name: 'Caller',         type: 'ContractAddress' },
        { name: 'Nonce',          type: 'felt'            },
        { name: 'Execute After',  type: 'u128'            },
        { name: 'Execute Before', type: 'u128'            },
        { name: 'Calls',          type: 'Call*'           },
      ],
      Call: [
        { name: 'To',       type: 'ContractAddress' },
        { name: 'Selector', type: 'selector'        },
        { name: 'Calldata', type: 'felt*'           },
      ],
    },
    primaryType: 'OutsideExecution' as const,
    domain: {
      name:     'Account.execute_from_outside',
      version:  '2',
      chainId:  'SN_MAIN',
      revision: '1',
    },
    message: {
      Caller:           callerAddr,
      Nonce:            nonce,
      'Execute After':  '0x0',
      'Execute Before': num.toHex(executeBefore),
      Calls:            calls,
    },
  }

  // Flat calldata for execute_from_outside_v2(OutsideExecution, Span<felt252>)
  const baseCalldata: string[] = [
    callerAddr,
    nonce,
    '0x0',
    num.toHex(executeBefore),
    num.toHex(BigInt(calls.length)),
    ...calls.flatMap(c => [
      c.To,
      c.Selector,
      num.toHex(BigInt(c.Calldata.length)),
      ...c.Calldata,
    ]),
  ]

  return { typedDataBlob, baseCalldata }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const rpcUrl         = process.env.STARKNET_RPC_URL             ?? DEFAULT_RPC_URL
  const classHash      = process.env.STARKNET_OZ_CLASS_HASH       ?? DEFAULT_CLASS_HASH
  const relayerPrivKey = process.env.STARKNET_RELAYER_PRIVATE_KEY
  const relayerAddr    = process.env.STARKNET_RELAYER_ADDRESS

  console.log(`[relay-starknet] relayer=${relayerAddr ? relayerAddr.slice(0, 12) + '…' : 'NOT SET'}`)

  if (!relayerPrivKey || !relayerAddr) {
    return res.status(500).json({
      ok: false,
      error: 'Set STARKNET_RELAYER_PRIVATE_KEY + STARKNET_RELAYER_ADDRESS in Render env vars',
    })
  }

  // ── Input validation ───────────────────────────────────────────────────────
  const { linkId, recipientStark } = (req.body ?? {}) as Record<string, string>
  if (!linkId || !/^0x[0-9a-fA-F]{64}$/.test(linkId))
    return res.status(400).json({ ok: false, error: 'linkId must be 0x-prefixed 32-byte hex' })
  if (!recipientStark || !/^0x[0-9a-fA-F]{1,64}$/.test(recipientStark))
    return res.status(400).json({ ok: false, error: 'recipientStark must be a valid Starknet address' })

  // ── Derive ghost address ───────────────────────────────────────────────────
  const { privKey: ghostPrivKey, pubKey, address: ghostAddr } =
    deriveGhost(linkId, recipientStark, classHash)

  const provider = new RpcProvider({ nodeUrl: rpcUrl })

  // ── USDC balance — try Circle native then legacy StarkGate ────────────────
  let balance   = 0n
  let usdcToken = USDC_NEW

  for (const token of [USDC_NEW, USDC_OLD]) {
    try {
      const r = await provider.callContract(
        { contractAddress: token, entrypoint: 'balanceOf', calldata: [ghostAddr] },
        'latest',
      )
      const bal = BigInt(r[0] ?? '0x0')
      console.log(`[relay-starknet] ${token.slice(0, 10)}… balance=${bal}µ at ${ghostAddr}`)
      if (bal > 0n) { balance = bal; usdcToken = token; break }
    } catch { /* try next */ }
  }

  if (balance === 0n)
    return res.status(400).json({ ok: false, error: 'No USDC found at ghost address yet' })
  if (balance < MIN_BALANCE)
    return res.status(400).json({ ok: false, error: `Balance ${balance} µUSDC too low to relay` })

  console.log(`[relay-starknet] ghost=${ghostAddr} balance=${balance}µ token=${usdcToken.slice(0,10)}… recipient=${recipientStark}`)

  // ── Gas reimbursement — same self-sustaining model as Base relay ──────────
  // gasReimbUsdc = ESTIMATED_GAS_STRK × STRK/USD price → converted to µUSDC.
  // Sent to treasury which swaps USDC→STRK to top up relayer wallet.
  let gasReimbUsdc: bigint
  try {
    gasReimbUsdc = await calcGasReimbUsdc()
  } catch {
    gasReimbUsdc = MAX_GAS_REIMB_USDC
  }

  // ── Payout split ───────────────────────────────────────────────────────────
  // spendable = balance after gas reimbursement
  // recipient gets 99.5 % of spendable; treasury gets 0.5 % fee + gas reimb
  const spendable   = balance - gasReimbUsdc
  const platformFee = spendable * FEE_BPS / 10_000n
  const payout      = spendable - platformFee

  console.log(`[relay-starknet] payout=${payout}µ fee=${platformFee}µ gasReim=${gasReimbUsdc}µ`)

  const [payoutLow,  payoutHigh ] = toU256Calldata(payout)
  const [feeLow,     feeHigh    ] = toU256Calldata(platformFee)
  const [gasLow,     gasHigh    ] = toU256Calldata(gasReimbUsdc)

  // ── Deployment check ───────────────────────────────────────────────────────
  let isDeployed = false
  try {
    isDeployed = (await provider.getClassAt(ghostAddr, 'latest').catch(() => null)) != null
  } catch { /* assume not deployed */ }
  console.log(`[relay-starknet] deployed=${isDeployed}`)

  // ── Build SNIP-9 v2 OutsideExecution ──────────────────────────────────────
  const executeBefore = BigInt(Math.floor(Date.now() / 1000) + 3600)

  const outsideCalls: OutsideCall[] = [
    // 1. Main payout to recipient
    { To: usdcToken, Selector: hash.getSelectorFromName('transfer'), Calldata: [recipientStark, payoutLow, payoutHigh] },
    // 2. Platform fee to treasury
    { To: usdcToken, Selector: hash.getSelectorFromName('transfer'), Calldata: [STARK_TREASURY, feeLow, feeHigh] },
    // 3. Gas reimbursement to treasury (treasury swaps USDC→STRK to top up relayer)
    { To: usdcToken, Selector: hash.getSelectorFromName('transfer'), Calldata: [STARK_TREASURY, gasLow, gasHigh] },
  ]

  const { typedDataBlob, baseCalldata } = buildOutsideExecution(
    relayerAddr, executeBefore, outsideCalls,
  )

  // ── Sign with ghost private key ────────────────────────────────────────────
  let signature: [string, string]
  try {
    const msgHash = starkTypedData.getMessageHash(
      typedDataBlob as Parameters<typeof starkTypedData.getMessageHash>[0],
      ghostAddr,
    )
    const sig = ec.starkCurve.sign(msgHash, ghostPrivKey)
    signature = [num.toHex(sig.r), num.toHex(sig.s)]
    console.log(`[relay-starknet] signed OutsideExecution`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-starknet] signing failed:', msg)
    return res.status(500).json({ ok: false, error: `Signing failed: ${msg.slice(0, 200)}` })
  }

  const executeCalldata: string[] = [
    ...baseCalldata,
    num.toHex(BigInt(signature.length)),
    ...signature,
  ]

  // ── Relayer multicall: [deploy if needed] + execute_from_outside_v2 ───────
  const relayerCalls = []

  if (!isDeployed) {
    console.log(`[relay-starknet] adding UDC deploy call`)
    relayerCalls.push({
      contractAddress: UDC_ADDRESS,
      entrypoint:      'deployContract',
      calldata: [
        classHash,  // class_hash
        pubKey,     // salt = pubKey  (OZ convention)
        '0x0',      // unique = false → deployer = 0x0
        '0x1',      // constructor calldata length = 1
        pubKey,     // calldata[0] = publicKey
      ],
    })
  }

  relayerCalls.push({
    contractAddress: ghostAddr,
    entrypoint:      'execute_from_outside_v2',
    calldata:        executeCalldata,
  })

  // ── Submit from relayer (pays STRK gas) ────────────────────────────────────
  let txHash: string
  try {
    const relayer = new Account(provider, relayerAddr, relayerPrivKey)
    const { transaction_hash } = await relayer.execute(relayerCalls)
    txHash = transaction_hash
    console.log(`[relay-starknet] submitted tx=${txHash}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[relay-starknet] relayer execute failed:', msg)
    return res.status(502).json({ ok: false, error: `Relay failed: ${msg.slice(0, 300)}` })
  }

  console.log(
    `[relay-starknet] swept ${payout}µ→recipient, ${platformFee}µ→fee, ` +
    `${gasReimbUsdc}µ→gas reimb. tx=${txHash}`,
  )
  return res.status(200).json({ ok: true, txHash })
}
