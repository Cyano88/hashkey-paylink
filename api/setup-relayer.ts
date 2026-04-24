/**
 * GET /api/setup-starknet-relayer
 *
 * One-time endpoint that deploys the relayer OZ Account using a raw
 * starknet_addDeployAccountTransaction RPC call — bypasses starknet.js
 * fee estimation which breaks on v3 transactions in v6.24.x.
 *
 * Hit this once from the browser after setting env vars in Render.
 * Idempotent: returns ok=true immediately if already deployed.
 */

import type { Request, Response } from 'express'
import { ec, num, hash, CallData, constants } from 'starknet'

const DEFAULT_RPC_URL    = 'https://rpc.starknet.lava.build'
const DEFAULT_CLASS_HASH = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

export default async function handler(req: Request, res: Response) {
  const rpcUrl         = process.env.STARKNET_RPC_URL             ?? DEFAULT_RPC_URL
  const classHash      = process.env.STARKNET_OZ_CLASS_HASH       ?? DEFAULT_CLASS_HASH
  const rawKey         = process.env.STARKNET_RELAYER_PRIVATE_KEY ?? ''
  const relayerPrivKey = rawKey.startsWith('0x') ? rawKey : '0x' + rawKey
  const relayerAddr    = process.env.STARKNET_RELAYER_ADDRESS

  if (!relayerPrivKey || relayerPrivKey === '0x' || !relayerAddr) {
    return res.status(500).json({ ok: false, error: 'STARKNET_RELAYER_PRIVATE_KEY and STARKNET_RELAYER_ADDRESS must be set' })
  }

  // ── Check if already deployed ─────────────────────────────────────────────
  const checkRes = await fetch(rpcUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'starknet_getClassAt',
      params: [{ block_number: 'latest' }, relayerAddr],
    }),
  })
  const checkData = await checkRes.json() as { result?: unknown; error?: { code: number } }
  if (checkData.result && !checkData.error) {
    return res.json({ ok: true, message: 'Relayer already deployed', address: relayerAddr })
  }

  // ── Derive public key ─────────────────────────────────────────────────────
  const pubKey = ec.starkCurve.getStarkKey(relayerPrivKey)
  const constructorCalldata = [pubKey]

  // ── Build DEPLOY_ACCOUNT v3 transaction ───────────────────────────────────
  const resourceBounds = {
    l1_gas: { max_amount: '0x800',     max_price_per_unit: '0x174876e800' },
    l2_gas: { max_amount: '0x5f5e100', max_price_per_unit: '0x2540be400'  },
  }

  // Compute the transaction hash for DEPLOY_ACCOUNT v3.
  // starknet.js v6 exposes calculateDeployAccountTransactionHash for v1.
  // For v3 we use the low-level POSEIDON-based hash via the library's
  // transaction module if available, otherwise fall back to v1-hash signing
  // and hope the RPC accepts it (some nodes are lenient about version tags).
  let txHash: string
  try {
    // Try v3 path via the Account signer details
    const { RpcProvider, Account } = await import('starknet')
    const provider = new RpcProvider({ nodeUrl: rpcUrl, blockIdentifier: 'latest' })
    const tempAccount = new Account(provider, relayerAddr, relayerPrivKey)

    // signDeployAccountTransaction computes the correct hash and signs it
    const sig = await tempAccount.signDeployAccountTransaction({
      classHash,
      contractAddress:      relayerAddr,
      addressSalt:          pubKey,
      constructorCalldata,
      version:              constants.TRANSACTION_VERSION.V3,
      chainId:              constants.StarknetChainId.SN_MAIN,
      nonce:                '0x0',
      resourceBounds,
      tip:                  '0x0',
      paymasterData:        [],
      nonceDataAvailabilityMode: 'L1',
      feeDataAvailabilityMode:   'L1',
    } as Parameters<typeof tempAccount.signDeployAccountTransaction>[0])

    // sig is [r, s] as hex or bigint
    const sigHex = Array.isArray(sig)
      ? (sig as (string | bigint)[]).map(s => num.toHex(BigInt(s)))
      : [num.toHex((sig as { r: bigint; s: bigint }).r), num.toHex((sig as { r: bigint; s: bigint }).s)]

    console.log(`[setup-relayer] signed DEPLOY_ACCOUNT v3 sig=${sigHex[0].slice(0,10)}…`)

    // Submit raw RPC call — bypasses starknet.js fee estimation entirely
    const deployRes = await fetch(rpcUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 2,
        method: 'starknet_addDeployAccountTransaction',
        params: [{
          deploy_account_transaction: {
            type:                      'DEPLOY_ACCOUNT',
            version:                   '0x3',
            class_hash:                classHash,
            contract_address_salt:     pubKey,
            constructor_calldata:      constructorCalldata,
            nonce:                     '0x0',
            resource_bounds:           resourceBounds,
            tip:                       '0x0',
            paymaster_data:            [],
            fee_data_availability_mode: 'L1',
            nonce_data_availability_mode: 'L1',
            signature:                 sigHex,
          },
        }],
      }),
    })

    const deployData = await deployRes.json() as { result?: { transaction_hash: string }; error?: unknown }
    if (deployData.error) {
      console.error('[setup-relayer] RPC error:', JSON.stringify(deployData.error))
      return res.status(502).json({ ok: false, error: deployData.error })
    }

    txHash = deployData.result?.transaction_hash ?? 'unknown'
    console.log(`[setup-relayer] DEPLOY_ACCOUNT submitted tx=${txHash}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[setup-relayer] failed:', msg)
    return res.status(500).json({ ok: false, error: msg.slice(0, 300) })
  }

  return res.json({
    ok:      true,
    message: 'DEPLOY_ACCOUNT transaction submitted — wait ~2 min for confirmation, then retry payment',
    txHash,
    address: relayerAddr,
  })
}
