/**
 * Starknet Direct Send — ghost address computation.
 *
 * Derives a deterministic OpenZeppelin Account address from a (linkId, recipientStark)
 * pair. The address is "counterfactual" — valid on Starknet before the account is ever
 * deployed, so USDC can be sent there from any source in advance.
 *
 * Deployment convention (matches OZ Account standard):
 *   salt      = publicKey
 *   classHash = OZ_ACCOUNT_CLASS_HASH
 *   calldata  = [publicKey]
 *   deployer  = 0x0
 */

import { hash, ec, num } from 'starknet'

/**
 * Starknet field prime — all Pedersen inputs must be strictly less than this.
 * P = 2^251 + 17·2^192 + 1
 */
const STARK_P = BigInt('0x800000000000011000000000000000000000000000000000000000000000001')

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
 * Identical logic runs on both the frontend and the relay backend so the address always
 * matches.
 *
 * linkId is a 32-byte EVM-style random hex (256 bits) which can exceed the Starknet
 * field prime. We reduce both inputs mod P before hashing so the Pedersen validation
 * never throws.
 */
export function computeStarkGhostAddress(
  linkId:         string,
  recipientStark: string,
): StarkGhostResult {
  // 1. Reduce inputs to valid felt252 range before Pedersen (P = Starknet field prime)
  const linkIdFelt = num.toHex(BigInt(linkId) % STARK_P)
  const recipFelt  = num.toHex(BigInt(recipientStark) % STARK_P)

  // 2. Deterministic seed — Pedersen(linkIdFelt, recipFelt)
  const seed = hash.computePedersenHash(linkIdFelt, recipFelt)

  // 3. Grind ensures the result is in the valid STARK curve scalar range
  const privateKey = ec.starkCurve.grindKey(seed)

  // 4. Derive the STARK public key
  const publicKey = ec.starkCurve.getStarkKey(privateKey)

  // 5. OZ Account address — standard convention: salt = publicKey, deployer = 0
  const rawAddress = hash.calculateContractAddressFromHash(
    publicKey,
    OZ_ACCOUNT_CLASS_HASH,
    [publicKey],
    '0x0',
  )

  return {
    privateKey,
    publicKey,
    address: num.toHex(rawAddress),
  }
}
