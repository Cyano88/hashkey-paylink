/**
 * GET /api/setup-starknet-relayer
 *
 * Deploys the OZ Account relayer via a raw V3 starknet_addDeployAccountTransaction.
 *
 * starknet.js v6.24.x bug: signDeployAccountTransaction computes a V1 Pedersen hash
 * even when version=V3, producing an invalid signature. We bypass it by computing
 * the Starknet SNIP-8 V3 Poseidon hash manually and signing with ec.starkCurve.sign.
 *
 * Hit once after funding STARKNET_RELAYER_ADDRESS with STRK. Idempotent.
 */

import type { Request, Response } from 'express'
import { ec, num, hash, constants } from 'starknet'

const DEFAULT_RPC_URL    = 'https://rpc.starknet.lava.build'
const DEFAULT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

const RESOURCE_BOUNDS = {
  l1_gas:      { max_amount: '0x40',     max_price_per_unit: '0x10000000000000' },
  l1_data_gas: { max_amount: '0x400',    max_price_per_unit: '0x10000000000'    },
  l2_gas:      { max_amount: '0x3D0900', max_price_per_unit: '0x174876e800'     },
}

// Pack (name_felt || max_amount || max_price) into one felt for the Poseidon fee hash.
// Layout: name at bits 192+, max_amount at bits 128-191, max_price at bits 0-127.
function encodeResourceBound(nameFelt: bigint, maxAmount: bigint, maxPrice: bigint): bigint {
  return (nameFelt << 192n) | (maxAmount << 128n) | maxPrice
}

// Starknet SNIP-8: V3 DEPLOY_ACCOUNT Poseidon hash.
// Bypasses starknet.js v6.24.x which incorrectly uses V1 Pedersen here.
function computeDeployAccountV3Hash(
  contractAddress: string,
  classHash: string,
  constructorCalldata: string[],
  salt: string,
): string {
  // Wrapper: computePoseidonHashOnElements returns hex — convert to bigint for nesting
  const ph = (elems: bigint[]): bigint =>
    BigInt(hash.computePoseidonHashOnElements(elems))

  // ASCII felt encodings for resource bound names
  const L1_GAS_NAME  = 0x4c315f474153n      // "L1_GAS"
  const L1_DATA_NAME = 0x4c315f44415441n    // "L1_DATA"
  const L2_GAS_NAME  = 0x4c325f474153n      // "L2_GAS"

  const feeHash = ph([
    0n,   // tip
    encodeResourceBound(L1_GAS_NAME,  BigInt(RESOURCE_BOUNDS.l1_gas.max_amount),      BigInt(RESOURCE_BOUNDS.l1_gas.max_price_per_unit)),
    encodeResourceBound(L1_DATA_NAME, BigInt(RESOURCE_BOUNDS.l1_data_gas.max_amount), BigInt(RESOURCE_BOUNDS.l1_data_gas.max_price_per_unit)),
    encodeResourceBound(L2_GAS_NAME,  BigInt(RESOURCE_BOUNDS.l2_gas.max_amount),      BigInt(RESOURCE_BOUNDS.l2_gas.max_price_per_unit)),
  ])

  const paymasterHash = ph([])          // empty paymaster data
  const daHash        = ph([0n, 0n])    // nonce_da=L1=0, fee_da=L1=0
  const calldataHash  = ph(constructorCalldata.map(v => BigInt(v)))

  const txHash = ph([
    BigInt('0x6465706c6f795f6163636f756e74'),  // "deploy_account"
    3n,                                          // version
    BigInt(contractAddress),
    feeHash,
    paymasterHash,
    BigInt(constants.StarknetChainId.SN_MAIN),
    0n,                                          // nonce (always 0 for new account)
    daHash,
    calldataHash,
    BigInt(classHash),
    BigInt(salt),                                // pub_key used as salt
  ])

  return num.toHex(txHash)
}

export default async function handler(req: Request, res: Response) {
  const rpcUrl      = process.env.STARKNET_RPC_URL             ?? DEFAULT_RPC_URL
  const classHash   = process.env.STARKNET_OZ_CLASS_HASH       ?? DEFAULT_CLASS_HASH
  const rawKey      = process.env.STARKNET_RELAYER_PRIVATE_KEY ?? ''
  const relayerAddr = process.env.STARKNET_RELAYER_ADDRESS

  const privKey = rawKey.startsWith('0x') ? rawKey : '0x' + rawKey

  if (!privKey || privKey === '0x' || !relayerAddr) {
    return res.status(500).json({
      ok: false, error: 'STARKNET_RELAYER_PRIVATE_KEY and STARKNET_RELAYER_ADDRESS must be set',
    })
  }

  // ── Already deployed? ─────────────────────────────────────────────────────
  // Lava requires block_id as a plain string tag, not { block_number: 'latest' }
  const checkRes = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'starknet_getClassAt',
      params: ['latest', relayerAddr],
    }),
  })
  const checkData = await checkRes.json() as { result?: unknown; error?: unknown }
  if (checkData.result && !checkData.error) {
    return res.json({ ok: true, message: 'Relayer already deployed', address: relayerAddr })
  }

  // ── Derive public key and calldata ────────────────────────────────────────
  // Use [pubKey] directly — CallData.compile returns a decimal string (75 chars)
  // which Lava RPC rejects; the RPC expects 0x-prefixed hex.
  const pubKey = ec.starkCurve.getStarkKey(privKey)
  const constructorCalldata = [pubKey]   // hex string — matches what RPC expects
  console.log(`[setup-relayer] pubKey=${pubKey} addr=${relayerAddr}`)

  // ── Compute V3 hash and sign ──────────────────────────────────────────────
  let txHash: string
  let sigHex: string[]
  try {
    txHash = computeDeployAccountV3Hash(relayerAddr, classHash, constructorCalldata, pubKey)
    console.log(`[setup-relayer] V3 hash=${txHash}`)
    const sig = ec.starkCurve.sign(txHash, privKey)
    sigHex = [num.toHex(sig.r), num.toHex(sig.s)]
    console.log(`[setup-relayer] sig r=${sigHex[0].slice(0, 12)}…`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[setup-relayer] hash/sign error:', msg)
    return res.status(500).json({ ok: false, error: `Hash/sign failed: ${msg.slice(0, 200)}` })
  }

  // ── Submit raw V3 DEPLOY_ACCOUNT ──────────────────────────────────────────
  const deployRes = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 2,
      method: 'starknet_addDeployAccountTransaction',
      params: {
        deploy_account_transaction: {
          type:                         'DEPLOY_ACCOUNT',
          version:                      '0x3',
          class_hash:                   classHash,
          contract_address_salt:        pubKey,
          constructor_calldata:         constructorCalldata,
          nonce:                        '0x0',
          resource_bounds:              RESOURCE_BOUNDS,
          tip:                          '0x0',
          paymaster_data:               [],
          fee_data_availability_mode:   'L1',
          nonce_data_availability_mode: 'L1',
          signature:                    sigHex,
        },
      },
    }),
  })

  const deployData = await deployRes.json() as { result?: { transaction_hash: string }; error?: unknown }
  if (deployData.error) {
    console.error('[setup-relayer] RPC error:', JSON.stringify(deployData.error))
    return res.status(502).json({ ok: false, error: deployData.error })
  }

  const resultTx = deployData.result?.transaction_hash ?? 'unknown'
  console.log(`[setup-relayer] submitted tx=${resultTx}`)

  return res.json({
    ok:      true,
    message: 'DEPLOY_ACCOUNT submitted — wait ~2 min, then retry the payment',
    txHash:  resultTx,
    address: relayerAddr,
  })
}
