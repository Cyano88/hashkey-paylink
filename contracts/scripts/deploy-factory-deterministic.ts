/**
 * Deploy PaymentRouterFactory via Nick's Method (CREATE2 singleton factory).
 *
 * Why
 * ───
 * A regular CREATE deployment binds the factory address to one wallet's nonce
 * on one specific chain. If funds are sent to a router address on the wrong chain,
 * recovery is impossible because the factory can't be recreated at that address.
 *
 * Nick's Method fixes this: the CREATE2 singleton factory at
 * 0x4e59b44847b379578588920cA78FbF26c0B4956C is deployed on every EVM chain.
 * Sending it `salt + initcode` deploys your contract to a fully deterministic
 * address that is IDENTICAL on Base, Arbitrum, Optimism, Polygon, BSC — every chain.
 *
 * Recovery workflow after this deploy
 * ────────────────────────────────────
 * 1. Funds arrive at a router address on the wrong chain.
 * 2. Run this script on that chain (same salt + same treasury = same factory address).
 * 3. Call factory.deployRouter(recipient) → router lands at the same address.
 * 4. Call router.sweep(token) → funds route to recipient + treasury.
 *
 * Usage
 * ─────
 *   npx hardhat run scripts/deploy-factory-deterministic.ts --network base
 *   npx hardhat run scripts/deploy-factory-deterministic.ts --network arbitrum
 *   npx hardhat run scripts/deploy-factory-deterministic.ts --network hashkey
 *   (any network in hardhat.config.ts)
 *
 * The factory address printed will be IDENTICAL on every chain you run this on.
 * Save it — it replaces the old ROUTER_FACTORY in src/lib/router.ts for new links.
 */

import { ethers, network } from 'hardhat'

// ── Constants ─────────────────────────────────────────────────────────────────
// Nick's Method: deterministic CREATE2 factory, same address on all EVM chains.
const NICK_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C'

// Fixed salt — changing this produces a different factory address.
// keccak256("hashkey-paylink-factory-v2")
const SALT = ethers.id('hashkey-paylink-factory-v2')

// Treasury address — baked into every router's bytecode; must stay constant.
const TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

async function main() {
  const [deployer] = await ethers.getSigners()
  const provider   = ethers.provider

  console.log('══════════════════════════════════════════════════')
  console.log('HashKey PayLink — Deterministic Factory Deploy')
  console.log('══════════════════════════════════════════════════')
  console.log(`Network:    ${network.name}`)
  console.log(`Deployer:   ${deployer.address}`)
  console.log(`Salt:       ${SALT}`)
  console.log(`Treasury:   ${TREASURY}`)

  // ── Check Nick's factory exists on this chain ─────────────────────────────
  const nickCode = await provider.getCode(NICK_FACTORY)
  if (nickCode === '0x') {
    console.error(`\n❌  Nick's factory not found on ${network.name}.`)
    console.error('   Most major EVM chains have it. Check: https://github.com/Arachnid/deterministic-deployment-proxy')
    process.exitCode = 1
    return
  }
  console.log(`Nick's factory: found ✅`)

  // ── Build initcode (constructor bytecode + encoded args) ──────────────────
  const Factory  = await ethers.getContractFactory('PaymentRouterFactory')
  const initcode = ethers.concat([
    Factory.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(['address'], [TREASURY]),
  ])

  // ── Compute deterministic address ─────────────────────────────────────────
  const factoryAddr = ethers.getCreate2Address(
    NICK_FACTORY,
    SALT,
    ethers.keccak256(initcode),
  )
  console.log(`\nFactory address (all chains): ${factoryAddr}`)

  // ── Check if already deployed ─────────────────────────────────────────────
  const existing = await provider.getCode(factoryAddr)
  if (existing !== '0x') {
    console.log('Already deployed on this chain ✅')
    console.log('\n──────────────────────────────────────────────────')
    console.log('Update src/lib/router.ts:')
    console.log(`  ROUTER_FACTORY_V2 = '${factoryAddr}'`)
    console.log('──────────────────────────────────────────────────')
    return
  }

  // ── Deploy via Nick's factory ─────────────────────────────────────────────
  console.log('\nDeploying…')
  const deployData = ethers.concat([SALT, initcode])

  const tx = await deployer.sendTransaction({
    to:   NICK_FACTORY,
    data: deployData,
  })
  console.log(`Tx submitted: ${tx.hash}`)
  const receipt = await tx.wait()

  if (!receipt || receipt.status !== 1) {
    throw new Error('Deployment transaction reverted.')
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  const deployedCode = await provider.getCode(factoryAddr)
  if (deployedCode === '0x') throw new Error('Contract not found at predicted address after deployment.')

  // Sanity: read treasury from deployed contract
  const factory  = new ethers.Contract(factoryAddr, ['function treasury() view returns (address)'], provider)
  const treasury = await factory.treasury()

  console.log(`\nDeployed ✅  ${factoryAddr}`)
  console.log(`Treasury:   ${treasury}`)
  console.log(`Gas used:   ${receipt.gasUsed.toString()}`)

  console.log('\n══════════════════════════════════════════════════')
  console.log('Update src/lib/router.ts with the new address:')
  console.log(`  ROUTER_FACTORY_V2 = '${factoryAddr}'`)
  console.log('\nRe-run on every chain you support:')
  console.log('  --network base | hashkey | arbitrum | optimism | polygon')
  console.log('The address will be identical on each.')
  console.log('══════════════════════════════════════════════════')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
