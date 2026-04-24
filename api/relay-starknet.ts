/**
 * /api/relay-starknet
 *
 * Starknet Direct Send relay — AVNU Paymaster sponsored mode.
 * AVNU submits the Starknet transaction and pays gas from pre-funded STRK
 * credits on the API key. No relayer wallet required on our side.
 *
 * ── Flow ──────────────────────────────────────────────────────────────────────
 *  1. Re-derive ghost OZ Account address from (linkId, recipientStark).
 *  2. Confirm USDC arrived — checks both Circle USDC and legacy StarkGate USDC.
 *  3. POST /paymaster/v1/build-typed-data (no gasTokenAddress = sponsored mode).
 *       deploymentData included if ghost not yet deployed.
 *       AVNU returns SNIP-9 v2 OutsideExecution typed data + requestId.
 *  4. Sign the typed-data hash with the ghost STARK private key.
 *  5. POST /paymaster/v1/execute → AVNU broadcasts tx, returns txHash.
 *
 * ── Required env vars ─────────────────────────────────────────────────────────
 *  AVNU_API_KEY              AVNU API key with STRK credits (avnu.fi dashboard)
 *  STARKNET_RPC_URL          Optional — Starknet RPC (default: Lava public)
 *  STARKNET_OZ_CLASS_HASH    Optional — override OZ Account v0.8.1 class hash
 */

import type { Request, Response } from 'express'
import { typedData as starkTypedData, hash, ec, CallData, num, RpcProvider, Signer, constants } from 'starknet'

// ─── Constants ────────────────────────────────────────────────────────────────

const AVNU_BASE        = 'https://starknet.api.avnu.fi'
const DEFAULT_RPC_URL  = 'https://rpc.starknet.lava.build'
const DEFAULT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

/** Circle native USDC — the ONLY token used in the Direct Send flow */
const USDC_NEW = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'
/** Legacy StarkGate USDC — detected only to surface a helpful error */
const USDC_OLD = '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'

const STARK_TREASURY = '0x0483AB5539B281c08777F1C8337Beeba05c2610feDcbA191B989E35eDc2767C3'

const FEE_BPS             = 50n
const MAX_GAS_REIMB_USDC  = 50_000n  // 0.05 USDC gas reimb ceiling (generous for AVNU gasless)
const MIN_BALANCE         = 20_000n  // 0.02 USDC minimum
const UDC_ADDRESS         = '0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf'

const STARK_P = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')

// ─── BigInt guard ─────────────────────────────────────────────────────────────
/** Converts any value to bigint, returning 0n instead of throwing on undefined/null. */
function safeBigInt(v: unknown): bigint {
  if (v === undefined || v === null) return 0n
  try { return BigInt(v as string | number | bigint) } catch { return 0n }
}

// ─── Raw V3 INVOKE helpers ────────────────────────────────────────────────────
// Bypass Account.execute entirely — starknet.js v6.24.x ignores resourceBounds
// and falls back to V1 (max_fee) even when resourceBounds is provided.

async function getRelayerNonce(rpcUrl: string, addr: string): Promise<string> {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'starknet_getNonce',
      params: [{ block_number: 'latest' }, addr],
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const d = await r.json() as { result?: string; error?: unknown }
  if (d.error) throw new Error(`getNonce failed: ${JSON.stringify(d.error).slice(0, 100)}`)
  return d.result ?? '0x0'
}

type V3Bounds = {
  l1_gas:      { max_amount: string; max_price_per_unit: string }
  l1_data_gas: { max_amount: string; max_price_per_unit: string }
  l2_gas:      { max_amount: string; max_price_per_unit: string }
}

async function rawInvokeV3(
  rpcUrl:        string,
  signer:        Signer,
  senderAddress: string,
  calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>,
  nonce:         string,
  resourceBounds: V3Bounds,
): Promise<string> {
  // Cairo 1 multicall encoding for __execute__
  const calldata: string[] = [num.toHex(BigInt(calls.length))]
  for (const c of calls) {
    calldata.push(c.contractAddress)
    calldata.push(hash.getSelectorFromName(c.entrypoint))
    calldata.push(num.toHex(BigInt(c.calldata.length)))
    calldata.push(...c.calldata)
  }

  // Signer computes V3 Poseidon hash over the same calldata encoding and signs it
  const rawSig = await signer.signTransaction(calls, {
    walletAddress:              senderAddress,
    chainId:                    constants.StarknetChainId.SN_MAIN,
    nonce,
    version:                    constants.TRANSACTION_VERSION.V3,
    resourceBounds,
    tip:                        '0x0',
    paymasterData:              [],
    accountDeploymentData:      [],
    nonceDataAvailabilityMode:  'L1',
    feeDataAvailabilityMode:    'L1',
  } as Parameters<typeof signer.signTransaction>[1])

  const sigHex = Array.isArray(rawSig)
    ? (rawSig as unknown[]).map(s => num.toHex(safeBigInt(s)))
    : [num.toHex(safeBigInt((rawSig as any).r)), num.toHex(safeBigInt((rawSig as any).s))]

  const rpcRes = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 10,
      method: 'starknet_addInvokeTransaction',
      params: {
        invoke_transaction: {
          type:                         'INVOKE',
          version:                      '0x3',
          sender_address:               senderAddress,
          calldata,
          nonce,
          resource_bounds:              resourceBounds,
          tip:                          '0x0',
          paymaster_data:               [],
          account_deployment_data:      [],
          nonce_data_availability_mode: 'L1',
          fee_data_availability_mode:   'L1',
          signature:                    sigHex,
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  })

  const rpcData = await rpcRes.json() as { result?: { transaction_hash: string }; error?: unknown }
  if (rpcData.error) throw new Error(JSON.stringify(rpcData.error).slice(0, 300))
  const txHash = rpcData.result?.transaction_hash
  if (!txHash) throw new Error('No transaction_hash in V3 INVOKE response')
  return txHash
}

// ─── Gas reimbursement ────────────────────────────────────────────────────────

async function getStrkPriceUsd(): Promise<number> {
  try {
    const res  = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=starknet&vs_currencies=usd',
      { signal: AbortSignal.timeout(3_000) },
    )
    const data = await res.json() as { starknet?: { usd?: number } }
    return data?.starknet?.usd ?? 0.20
  } catch {
    return 0.20
  }
}

async function calcGasReimbUsdc(): Promise<bigint> {
  try {
    const strkUsd   = await getStrkPriceUsd()
    const microUsdc = BigInt(Math.ceil(0.01 * strkUsd * 1_000_000))
    return microUsdc > MAX_GAS_REIMB_USDC ? MAX_GAS_REIMB_USDC : microUsdc
  } catch {
    return MAX_GAS_REIMB_USDC
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

function toU256Calldata(amount: bigint): [string, string] {
  return [
    num.toHex(amount & BigInt('0xffffffffffffffffffffffffffffffff')),
    num.toHex(amount >> 128n),
  ]
}

interface AvnuCall { contractAddress: string; entrypoint: string; calldata: string[] }
interface AvnuBuildResponse { requestId: string; typedData: Record<string, unknown>; gasTokenAmount?: string }
interface AvnuExecuteResponse { transactionHash?: string; transaction_hash?: string }

function avnuHeaders(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) {
    h['x-paymaster-api-key'] = apiKey  // correct AVNU paymaster header
    h['x-api-key']           = apiKey  // fallback alias
    h['api-key']             = apiKey  // fallback alias
  }
  return h
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const rpcUrl    = process.env.STARKNET_RPC_URL       ?? DEFAULT_RPC_URL
  const classHash = process.env.STARKNET_OZ_CLASS_HASH ?? DEFAULT_CLASS_HASH
  const avnuKey   = process.env.AVNU_API_KEY

  console.log(`[relay-starknet] avnuKey=${avnuKey ? avnuKey.slice(0, 8) + '…' : 'NOT SET (will try public mode)'}`)

  // ── Input validation ──────────────────────────────────────────────────────
  const { linkId, recipientStark } = (req.body ?? {}) as Record<string, string>
  if (!linkId || !/^0x[0-9a-fA-F]{64}$/.test(linkId))
    return res.status(400).json({ ok: false, error: 'linkId must be 0x-prefixed 32-byte hex' })
  if (!recipientStark || !/^0x[0-9a-fA-F]{1,64}$/.test(recipientStark))
    return res.status(400).json({ ok: false, error: 'recipientStark must be a valid Starknet address' })

  // ── Derive ghost address ──────────────────────────────────────────────────
  const { privKey: ghostPrivKey, pubKey, address: ghostAddr } =
    deriveGhost(linkId, recipientStark, classHash)

  const provider = new RpcProvider({ nodeUrl: rpcUrl, blockIdentifier: 'latest' })

  // ── Circle USDC balance ───────────────────────────────────────────────────
  let balance = 0n
  try {
    const r = await provider.callContract(
      { contractAddress: USDC_NEW, entrypoint: 'balanceOf', calldata: [ghostAddr] }, 'latest',
    )
    balance = BigInt(r[0] ?? '0x0')
    console.log(`[relay-starknet] Circle USDC balance=${balance}µ at ${ghostAddr}`)
  } catch { /* rpc hiccup */ }

  if (balance === 0n) {
    // Check if legacy USDC (0x0330…) was mistakenly sent — give a clear UI hint
    try {
      const r = await provider.callContract(
        { contractAddress: USDC_OLD, entrypoint: 'balanceOf', calldata: [ghostAddr] }, 'latest',
      )
      const legacyBal = BigInt(r[0] ?? '0x0')
      if (legacyBal > 0n) {
        console.warn(`[relay-starknet] legacy USDC ${legacyBal}µ found — Circle USDC required`)
        return res.status(400).json({
          ok:   false,
          code: 'LEGACY_USDC',
          error: `Legacy StarkGate USDC detected (${legacyBal} µUSDC). Please send Circle USDC (0x053c91…) to this same address.`,
        })
      }
    } catch { /* ignore */ }
    return res.status(400).json({ ok: false, error: 'No Circle USDC found at ghost address yet' })
  }

  if (balance < MIN_BALANCE)
    return res.status(400).json({ ok: false, error: `Balance ${balance} µUSDC too low` })

  console.log(`[relay-starknet] ghost=${ghostAddr} balance=${balance}µ token=${USDC_NEW.slice(0,10)}… recipient=${recipientStark}`)

  // ── Gas reimbursement + payout split ──────────────────────────────────────
  const gasReimbUsdc = await calcGasReimbUsdc().catch(() => MAX_GAS_REIMB_USDC)
  const spendable    = balance - gasReimbUsdc
  const platformFee  = spendable * FEE_BPS / 10_000n
  const payout       = spendable - platformFee

  console.log(`[relay-starknet] payout=${payout}µ fee=${platformFee}µ gasReim=${gasReimbUsdc}µ`)

  const [payoutLow, payoutHigh] = toU256Calldata(payout)
  const [feeLow,    feeHigh   ] = toU256Calldata(platformFee)
  const [gasLow,    gasHigh   ] = toU256Calldata(gasReimbUsdc)

  // ── Deployment check ──────────────────────────────────────────────────────
  const isDeployed = (await provider.getClassAt(ghostAddr, 'latest').catch(() => null)) != null
  console.log(`[relay-starknet] ghost deployed=${isDeployed}`)

  // ── AVNU build-typed-data ─────────────────────────────────────────────────
  const calls: AvnuCall[] = [
    { contractAddress: USDC_NEW, entrypoint: 'transfer', calldata: [recipientStark, payoutLow, payoutHigh] },
    { contractAddress: USDC_NEW, entrypoint: 'transfer', calldata: [STARK_TREASURY,  feeLow,    feeHigh   ] },
    { contractAddress: USDC_NEW, entrypoint: 'transfer', calldata: [STARK_TREASURY,  gasLow,    gasHigh   ] },
  ]

  const buildBody: Record<string, unknown> = {
    userAddress: ghostAddr,
    calls,
    // No gasTokenAddress = sponsored mode: AVNU pays gas from API key STRK credits
  }
  if (!isDeployed) {
    buildBody.deploymentData = {
      classHash,
      salt:     pubKey,
      unique:   false,
      calldata: [pubKey],
    }
  }

  // ── AVNU build — three strategies in order ────────────────────────────────
  // 1. Sponsored with API key (x-paymaster-api-key header, no gasToken)
  // 2. No API key (AVNU public/free tier)
  // 3. Gasless — ghost pays gas in Circle USDC (0x053c91); best for new deposits
  // Gasless body: always use Circle USDC as gas token regardless of which
  // USDC variant the ghost holds — AVNU only accepts the new Circle USDC.
  const gaslessBody = {
    ...buildBody,
    gasTokenAddress:   USDC_NEW,
    maxGasTokenAmount: MAX_GAS_REIMB_USDC.toString(),
  }

  const buildAttempts = [
    { label: 'sponsored+key',   body: buildBody,   headers: avnuHeaders(avnuKey) },
    { label: 'sponsored+nokey', body: buildBody,   headers: avnuHeaders()        },
    { label: 'gasless+USDC',    body: gaslessBody, headers: avnuHeaders(avnuKey) },
    { label: 'gasless+nokey',   body: gaslessBody, headers: avnuHeaders()        },
  ]

  let buildData: AvnuBuildResponse | null = null
  let lastError = ''

  for (const attempt of buildAttempts) {
    try {
      const res = await fetch(`${AVNU_BASE}/paymaster/v1/build-typed-data`, {
        method:  'POST',
        headers: attempt.headers,
        body:    JSON.stringify(attempt.body),
        signal:  AbortSignal.timeout(15_000),
      })
      const text = await res.text()
      console.log(`[relay-starknet] AVNU build [${attempt.label}] status=${res.status}`)
      if (res.ok) {
        buildData = JSON.parse(text) as AvnuBuildResponse
        console.log(`[relay-starknet] AVNU build ok requestId=${buildData.requestId} via ${attempt.label}`)
        break
      }
      lastError = `(${res.status}) ${text.slice(0, 200)}`
      console.warn(`[relay-starknet] AVNU build [${attempt.label}] failed: ${lastError}`)
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.warn(`[relay-starknet] AVNU build [${attempt.label}] error: ${lastError}`)
    }
  }

  if (!buildData) {
    // ── Nuclear fallback: STRK-funded relayer via SNIP-9 v2 OutsideExecution ──
    // AVNU rejected all 4 strategies. Use the relayer's STRK balance to pay gas
    // while still deducting gasReimbUsdc from the ghost vault — user sees it as gasless.
    console.log('[relay-starknet] nuclear: all AVNU strategies failed, using STRK relayer')

    const relayerPrivKeyRaw = process.env.STARKNET_RELAYER_PRIVATE_KEY
    const relayerAddr       = process.env.STARKNET_RELAYER_ADDRESS
    if (!relayerPrivKeyRaw || !relayerAddr) {
      return res.status(502).json({ ok: false, error: `AVNU failed all attempts. Last: ${lastError}` })
    }
    const relayerPrivKey = relayerPrivKeyRaw.startsWith('0x') ? relayerPrivKeyRaw : '0x' + relayerPrivKeyRaw

    const V3_BOUNDS: V3Bounds = {
      l1_gas:      { max_amount: '0x40',     max_price_per_unit: '0x10000000000000' },
      l1_data_gas: { max_amount: '0x400',    max_price_per_unit: '0x10000000000'    },
      l2_gas:      { max_amount: '0x3D0900', max_price_per_unit: '0x174876e800'     },
    }

    const relayerSigner = new Signer(relayerPrivKey)

    // Deploy ghost via UDC if not yet on-chain
    if (!isDeployed) {
      try {
        console.log('[relay-starknet] nuclear: deploying ghost via UDC...')
        const deployNonce = await getRelayerNonce(rpcUrl, relayerAddr)
        const deployTx = await rawInvokeV3(rpcUrl, relayerSigner, relayerAddr, [{
          contractAddress: UDC_ADDRESS,
          entrypoint:      'deployContract',
          calldata:        [classHash, pubKey, '0x0', '0x1', pubKey],
        }], deployNonce, V3_BOUNDS)
        console.log(`[relay-starknet] nuclear: ghost deploy tx=${deployTx}`)
        await provider.waitForTransaction(deployTx, { retryInterval: 2000 })
        console.log('[relay-starknet] nuclear: ghost deployed')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[relay-starknet] nuclear: ghost deploy failed:', msg)
        return res.status(502).json({ ok: false, error: `Ghost deploy failed: ${msg.slice(0, 200)}` })
      }
    }

    // Build SNIP-9 v2 OutsideExecution typed data
    const oeNonce  = num.toHex(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)))
    const oeAfter  = 0
    const oeBefore = Math.floor(Date.now() / 1000) + 3600

    const oeCalls = [
      { To: USDC_NEW, Selector: 'transfer', Calldata: [recipientStark, payoutLow, payoutHigh] },
      { To: USDC_NEW, Selector: 'transfer', Calldata: [STARK_TREASURY,  feeLow,    feeHigh   ] },
      { To: USDC_NEW, Selector: 'transfer', Calldata: [STARK_TREASURY,  gasLow,    gasHigh   ] },
    ]

    const oeTypedData = {
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
        chainId:  '0x534e5f4d41494e', // SN_MAIN
        revision: '1',
      },
      message: {
        Caller:           relayerAddr,
        Nonce:            oeNonce,
        'Execute After':  oeAfter,
        'Execute Before': oeBefore,
        Calls:            oeCalls,
      },
    }

    // Sign OutsideExecution hash with ghost private key
    let oeSignature: [string, string]
    try {
      const msgHash = starkTypedData.getMessageHash(
        oeTypedData as Parameters<typeof starkTypedData.getMessageHash>[0],
        ghostAddr,
      )
      const sig = ec.starkCurve.sign(msgHash, ghostPrivKey)
      oeSignature = [num.toHex(sig.r), num.toHex(sig.s)]
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return res.status(500).json({ ok: false, error: `SNIP-9 signing failed: ${msg.slice(0, 200)}` })
    }

    // Encode execute_from_outside_v2 calldata flat array
    const encodedCalls: string[] = []
    for (const call of oeCalls) {
      encodedCalls.push(call.To)
      encodedCalls.push(hash.getSelectorFromName(call.Selector))
      encodedCalls.push(num.toHex(BigInt(call.Calldata.length)))
      encodedCalls.push(...call.Calldata)
    }
    const outsideExecCalldata = [
      relayerAddr,
      oeNonce,
      num.toHex(BigInt(oeAfter)),
      num.toHex(BigInt(oeBefore)),
      num.toHex(BigInt(oeCalls.length)),
      ...encodedCalls,
      num.toHex(BigInt(oeSignature.length)),
      ...oeSignature,
    ]

    try {
      const sweepNonce = await getRelayerNonce(rpcUrl, relayerAddr)
      const sweepTx = await rawInvokeV3(rpcUrl, relayerSigner, relayerAddr, [{
        contractAddress: ghostAddr,
        entrypoint:      'execute_from_outside_v2',
        calldata:        outsideExecCalldata,
      }], sweepNonce, V3_BOUNDS)
      console.log(`[relay-starknet] nuclear: swept ${payout}µ→recipient ${platformFee}µ→fee tx=${sweepTx}`)
      return res.status(200).json({ ok: true, txHash: sweepTx })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[relay-starknet] nuclear: execute failed:', msg)
      return res.status(502).json({ ok: false, error: `Nuclear relay failed: ${msg.slice(0, 200)}` })
    }
  }

  if (!buildData.requestId || !buildData.typedData) {
    return res.status(502).json({ ok: false, error: 'AVNU build missing requestId or typedData' })
  }

  // ── Sign SNIP-9 typed data with ghost private key ─────────────────────────
  let signature: [string, string]
  try {
    const msgHash = starkTypedData.getMessageHash(
      buildData.typedData as Parameters<typeof starkTypedData.getMessageHash>[0],
      ghostAddr,
    )
    const sig = ec.starkCurve.sign(msgHash, ghostPrivKey)
    signature = [num.toHex(sig.r), num.toHex(sig.s)]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ ok: false, error: `Signing failed: ${msg.slice(0, 200)}` })
  }

  // ── Execute via AVNU ──────────────────────────────────────────────────────
  let txHash: string
  try {
    const execRes = await fetch(`${AVNU_BASE}/paymaster/v1/execute`, {
      method:  'POST',
      headers: avnuHeaders(avnuKey),
      body:    JSON.stringify({ requestId: buildData.requestId, signature }),
      signal:  AbortSignal.timeout(20_000),
    })
    if (!execRes.ok) {
      const errBody = await execRes.text().catch(() => '')
      console.error('[relay-starknet] AVNU execute failed:', execRes.status, errBody)
      return res.status(502).json({ ok: false, error: `AVNU execute failed (${execRes.status}): ${errBody.slice(0, 300)}` })
    }
    const execData = (await execRes.json()) as AvnuExecuteResponse
    txHash = execData.transactionHash ?? execData.transaction_hash ?? ''
    if (!txHash) return res.status(502).json({ ok: false, error: 'AVNU execute returned no txHash' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(502).json({ ok: false, error: `AVNU execute error: ${msg.slice(0, 200)}` })
  }

  console.log(`[relay-starknet] swept ${payout}µ→recipient ${platformFee}µ→fee ${gasReimbUsdc}µ→gasReim tx=${txHash}`)
  return res.status(200).json({ ok: true, txHash })
}
