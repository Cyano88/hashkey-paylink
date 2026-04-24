/**
 * POST /api/recover-starknet
 *
 * Recovery endpoint — sweeps ALL USDC (Circle + Legacy) from a ghost address
 * to a specified recovery wallet using the STRK relayer + SNIP-9 v2.
 *
 * Body: { linkId, recipientStark, recoveryTo }
 *   linkId         — the payment link ID used when the ghost was created
 *   recipientStark — the Starknet address entered by the payer
 *   recoveryTo     — wallet to receive all recovered funds (your own wallet)
 *
 * Does NOT take a platform fee or gas reimbursement — sends 100% to recoveryTo.
 */

import type { Request, Response } from 'express'
import { typedData as starkTypedData, hash, ec, num, RpcProvider, Signer, constants } from 'starknet'

const DEFAULT_RPC_URL    = 'https://rpc.starknet.lava.build'
const DEFAULT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'
const STARK_P     = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')
const UDC_ADDRESS = '0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf'

const USDC_CIRCLE = '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8'
const USDC_LEGACY = '0x033068f6539f8e6e6b131e6b2b814e6c34a5224bc66947c47dab9dfee93b35fb'

const V3_BOUNDS = {
  l1_gas:      { max_amount: '0x40',     max_price_per_unit: '0x10000000000000' },
  l1_data_gas: { max_amount: '0x400',    max_price_per_unit: '0x10000000000'    },
  l2_gas:      { max_amount: '0x3D0900', max_price_per_unit: '0x174876e800'     },
}

function safeBigInt(v: unknown): bigint {
  if (v === undefined || v === null) return 0n
  try { return BigInt(v as string | number | bigint) } catch { return 0n }
}

function toU256(n: bigint): [string, string] {
  return [
    num.toHex(n & BigInt('0xffffffffffffffffffffffffffffffff')),
    num.toHex(n >> 128n),
  ]
}

function deriveGhost(linkId: string, recipientStark: string, classHash: string) {
  const linkIdFelt = num.toHex(BigInt(linkId) % STARK_P)
  const recipFelt  = num.toHex(BigInt(recipientStark) % STARK_P)
  const seed       = hash.computePedersenHash(linkIdFelt, recipFelt)
  const privKey    = ec.starkCurve.grindKey(seed)
  const pubKey     = ec.starkCurve.getStarkKey(privKey)
  const rawAddr    = hash.calculateContractAddressFromHash(pubKey, classHash, [pubKey], '0x0')
  return { privKey, pubKey, address: num.toHex(rawAddr) }
}

async function getRelayerNonce(rpcUrl: string, addr: string): Promise<bigint> {
  const r = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'starknet_getNonce', params: ['latest', addr] }),
    signal: AbortSignal.timeout(10_000),
  })
  const d = await r.json() as { result?: string; error?: unknown }
  if (d.error) throw new Error(`getNonce: ${JSON.stringify(d.error).slice(0, 120)}`)
  return safeBigInt(d.result ?? '0x0')
}

async function rawInvokeV3(
  rpcUrl: string, signer: Signer, senderAddress: string,
  calls: Array<{ contractAddress: string; entrypoint: string; calldata: string[] }>,
  nonce: string,
): Promise<string> {
  const calldata: string[] = [num.toHex(BigInt(calls.length))]
  for (const c of calls) {
    calldata.push(c.contractAddress)
    calldata.push(hash.getSelectorFromName(c.entrypoint))
    calldata.push(num.toHex(BigInt(c.calldata.length)))
    calldata.push(...c.calldata)
  }
  const rawSig = await signer.signTransaction(calls, {
    walletAddress: senderAddress, chainId: constants.StarknetChainId.SN_MAIN,
    nonce, version: constants.TRANSACTION_VERSION.V3,
    resourceBounds: V3_BOUNDS, tip: '0x0',
    paymasterData: [], accountDeploymentData: [],
    nonceDataAvailabilityMode: 'L1', feeDataAvailabilityMode: 'L1',
  } as Parameters<typeof signer.signTransaction>[1])
  const sigHex = Array.isArray(rawSig)
    ? (rawSig as unknown[]).map(s => num.toHex(safeBigInt(s)))
    : [num.toHex(safeBigInt((rawSig as any).r)), num.toHex(safeBigInt((rawSig as any).s))]
  const rpcRes = await fetch(rpcUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 10, method: 'starknet_addInvokeTransaction',
      params: {
        invoke_transaction: {
          type: 'INVOKE', version: '0x3', sender_address: senderAddress,
          calldata, nonce, resource_bounds: V3_BOUNDS,
          tip: '0x0', paymaster_data: [], account_deployment_data: [],
          nonce_data_availability_mode: 'L1', fee_data_availability_mode: 'L1',
          signature: sigHex,
        },
      },
    }),
    signal: AbortSignal.timeout(20_000),
  })
  const d = await rpcRes.json() as { result?: { transaction_hash: string }; error?: unknown }
  if (d.error) throw new Error(JSON.stringify(d.error).slice(0, 300))
  const tx = d.result?.transaction_hash
  if (!tx) throw new Error('No transaction_hash in V3 INVOKE response')
  return tx
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const rpcUrl    = process.env.STARKNET_RPC_URL             ?? DEFAULT_RPC_URL
  const classHash = process.env.STARKNET_OZ_CLASS_HASH       ?? DEFAULT_CLASS_HASH
  const relayerPrivKeyRaw = process.env.STARKNET_RELAYER_PRIVATE_KEY
  const relayerAddr       = process.env.STARKNET_RELAYER_ADDRESS

  if (!relayerPrivKeyRaw || !relayerAddr)
    return res.status(500).json({ ok: false, error: 'STARKNET_RELAYER_PRIVATE_KEY / STARKNET_RELAYER_ADDRESS not set' })

  const { linkId, recipientStark, recoveryTo } = (req.body ?? {}) as Record<string, string>
  if (!linkId || !recipientStark || !recoveryTo)
    return res.status(400).json({ ok: false, error: 'linkId, recipientStark, recoveryTo required' })

  const relayerPrivKey = relayerPrivKeyRaw.startsWith('0x') ? relayerPrivKeyRaw : '0x' + relayerPrivKeyRaw
  const { privKey: ghostPrivKey, pubKey, address: ghostAddr } = deriveGhost(linkId, recipientStark, classHash)

  console.log(`[recover] ghost=${ghostAddr} recoveryTo=${recoveryTo}`)

  const provider = new RpcProvider({ nodeUrl: rpcUrl, blockIdentifier: 'latest' })

  // ── Check balances ────────────────────────────────────────────────────────
  async function balanceOf(token: string): Promise<bigint> {
    try {
      const r = await provider.callContract(
        { contractAddress: token, entrypoint: 'balanceOf', calldata: [ghostAddr] }, 'latest',
      )
      return safeBigInt(r[0] ?? '0x0')
    } catch { return 0n }
  }

  const circleBalance = await balanceOf(USDC_CIRCLE)
  const legacyBalance = await balanceOf(USDC_LEGACY)
  console.log(`[recover] circle=${circleBalance}µ legacy=${legacyBalance}µ`)

  if (circleBalance === 0n && legacyBalance === 0n)
    return res.status(400).json({ ok: false, error: 'No USDC (Circle or Legacy) found at ghost address' })

  // ── Build transfer calls — send 100% to recoveryTo, no fee deduction ──────
  const oeCalls: Array<{ To: string; Selector: string; Calldata: string[] }> = []

  if (circleBalance > 0n) {
    const [lo, hi] = toU256(circleBalance)
    oeCalls.push({ To: USDC_CIRCLE, Selector: 'transfer', Calldata: [recoveryTo, lo, hi] })
  }
  if (legacyBalance > 0n) {
    const [lo, hi] = toU256(legacyBalance)
    oeCalls.push({ To: USDC_LEGACY, Selector: 'transfer', Calldata: [recoveryTo, lo, hi] })
  }

  // ── Deploy ghost if needed ────────────────────────────────────────────────
  const isDeployed = (await provider.getClassAt(ghostAddr, 'latest').catch(() => null)) != null
  console.log(`[recover] ghost deployed=${isDeployed}`)

  const relayerSigner = new Signer(relayerPrivKey)
  let relayerNonce = await getRelayerNonce(rpcUrl, relayerAddr)
  console.log(`[recover] relayer nonce=${num.toHex(relayerNonce)}`)

  if (!isDeployed) {
    try {
      const deployTx = await rawInvokeV3(rpcUrl, relayerSigner, relayerAddr, [{
        contractAddress: UDC_ADDRESS, entrypoint: 'deployContract',
        calldata: [classHash, pubKey, '0x0', '0x1', pubKey],
      }], num.toHex(relayerNonce))
      console.log(`[recover] ghost deploy tx=${deployTx}`)
      await provider.waitForTransaction(deployTx, { retryInterval: 2000 })
      console.log('[recover] ghost deployed')
      relayerNonce += 1n
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return res.status(502).json({ ok: false, error: `Ghost deploy failed: ${msg.slice(0, 200)}` })
    }
  }

  // ── Build SNIP-9 v2 OutsideExecution ─────────────────────────────────────
  const oeNonce  = num.toHex(BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)))
  const oeBefore = Math.floor(Date.now() / 1000) + 3600

  const oeTypedData = {
    types: {
      StarknetDomain: [
        { name: 'name', type: 'shortstring' }, { name: 'version', type: 'shortstring' },
        { name: 'chainId', type: 'shortstring' }, { name: 'revision', type: 'shortstring' },
      ],
      OutsideExecution: [
        { name: 'Caller', type: 'ContractAddress' }, { name: 'Nonce', type: 'felt' },
        { name: 'Execute After', type: 'u128' }, { name: 'Execute Before', type: 'u128' },
        { name: 'Calls', type: 'Call*' },
      ],
      Call: [
        { name: 'To', type: 'ContractAddress' }, { name: 'Selector', type: 'selector' },
        { name: 'Calldata', type: 'felt*' },
      ],
    },
    primaryType: 'OutsideExecution' as const,
    domain: { name: 'Account.execute_from_outside', version: '2', chainId: '0x534e5f4d41494e', revision: '1' },
    message: {
      Caller: relayerAddr, Nonce: oeNonce,
      'Execute After': 0, 'Execute Before': oeBefore,
      Calls: oeCalls,
    },
  }

  let oeSignature: [string, string]
  try {
    const msgHash = starkTypedData.getMessageHash(
      oeTypedData as Parameters<typeof starkTypedData.getMessageHash>[0], ghostAddr,
    )
    const sig = ec.starkCurve.sign(msgHash, ghostPrivKey)
    oeSignature = [num.toHex(sig.r), num.toHex(sig.s)]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return res.status(500).json({ ok: false, error: `SNIP-9 sign failed: ${msg.slice(0, 200)}` })
  }

  // ── Encode execute_from_outside_v2 calldata ───────────────────────────────
  const encodedCalls: string[] = []
  for (const call of oeCalls) {
    encodedCalls.push(call.To)
    encodedCalls.push(hash.getSelectorFromName(call.Selector))
    encodedCalls.push(num.toHex(BigInt(call.Calldata.length)))
    encodedCalls.push(...call.Calldata)
  }
  const outsideExecCalldata = [
    relayerAddr, oeNonce,
    num.toHex(0n), num.toHex(BigInt(oeBefore)),
    num.toHex(BigInt(oeCalls.length)),
    ...encodedCalls,
    num.toHex(BigInt(oeSignature.length)),
    ...oeSignature,
  ]

  // ── Execute via relayer ───────────────────────────────────────────────────
  try {
    const sweepTx = await rawInvokeV3(rpcUrl, relayerSigner, relayerAddr, [{
      contractAddress: ghostAddr,
      entrypoint:      'execute_from_outside_v2',
      calldata:        outsideExecCalldata,
    }], num.toHex(relayerNonce))

    console.log(`[recover] swept circle=${circleBalance}µ legacy=${legacyBalance}µ → ${recoveryTo} tx=${sweepTx}`)
    return res.json({
      ok: true, txHash: sweepTx,
      recovered: {
        circleUsdc: circleBalance.toString() + 'µ',
        legacyUsdc: legacyBalance.toString() + 'µ',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[recover] execute failed:', msg)
    return res.status(502).json({ ok: false, error: `Recovery failed: ${msg.slice(0, 200)}` })
  }
}
