/**
 * Starknet Direct Send — ghost address computation.
 *
 * Derives a deterministic OpenZeppelin Account address from a (linkId, recipientStark)
 * pair using Pedersen hashing and the STARK curve. The address is "counterfactual" —
 * it is valid on Starknet Mainnet before the account is ever deployed, so USDC can be
 * sent there from any source (CEX, cold wallet, browser wallet) in advance.
 *
 * Deployment convention (matches OZ Account standard):
 *   salt        = publicKey
 *   classHash   = OZ_ACCOUNT_CLASS_HASH
 *   calldata    = [publicKey]
 *   deployer    = 0x0  (account self-deployment)
 */

import { hash, ec, num } from 'starknet'

// ec.starkCurve.pedersen is the two-element Pedersen hash in starknet.js v6
// hash.calculateContractAddressFromHash computes the contract address from salt+class+calldata+deployer

/** OZ Account v0.8.1 Sierra class hash — declared on Starknet Mainnet. */
export const OZ_ACCOUNT_CLASS_HASH =
  '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f'

export interface StarkGhostResult {
  /** 0x-prefixed STARK private key (keep secret — used by relayer to sweep). */
  privateKey: string
  /** 0x-prefixed STARK public key. */
  publicKey:  string
  /** 0x-prefixed Starknet contract address (the ghost address). */
  address:    string
}

/**
 * Computes a deterministic ghost OZ Account address for a (linkId, recipientStark) pair.
 * Both frontend (display) and backend relay (deploy + sweep) call the same function
 * to guarantee they compute the identical address.
 */
export function computeStarkGhostAddress(
  linkId:        string,
  recipientStark: string,
): StarkGhostResult {
  // 1. Deterministic seed — Pedersen(linkId, recipientStark) via starkCurve
  const seed      = ec.starkCurve.pedersen(linkId, recipientStark)
  // 2. Grind ensures the key is in the valid STARK curve scalar range
  const privateKey = ec.starkCurve.grindKey(seed)
  // 3. Derive the STARK public key from the private key
  const publicKey  = ec.starkCurve.getStarkKey(privateKey)

  // 4. Compute the OZ Account address using the standard OZ deployment convention
  const rawAddress = hash.calculateContractAddressFromHash(
    publicKey,           // salt = publicKey (OZ convention)
    OZ_ACCOUNT_CLASS_HASH,
    [publicKey],         // constructor calldata = [publicKey]
    '0x0',               // deployer = 0 (no deployer for account deployment)
  )

  return {
    privateKey,
    publicKey,
    address: num.toHex(rawAddress),
  }
}
