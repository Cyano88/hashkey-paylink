/**
 * Deploy PayLinkFactoryV2 + PaymentRouterFactory via Nick's Method.
 *
 * Why Nick's Method
 * ─────────────────
 * Regular CREATE binds a contract address to one wallet's nonce on one chain.
 * Nick's Method uses the CREATE2 singleton at 0x4e59...4956C (present on every
 * EVM chain) so any contract deployed with the same salt + initcode lands at
 * the IDENTICAL address on Base, Arc, HashKey, Arbitrum, Optimism, etc.
 *
 * Why this matters for PayLink
 * ────────────────────────────
 * Ghost vault addresses are derived as:
 *   vault = keccak256(0xff + factory_address + salt + keccak256(vault_initcode))
 *
 * If factory_address is the same on every chain, vault addresses are too.
 * Wrong-chain recoveries become trivial: deploy factory + vault on that chain,
 * call sweep — done.
 *
 * Two-step deployment (PayLinkFactoryV2 only)
 * ────────────────────────────────────────────
 * The factory constructor no longer takes a token address. USDC is configured
 * after deployment via setUSDC() — this is what makes the constructor bytecode
 * chain-agnostic and the factory address universal.
 *
 *   Step 1: Deploy via Nick's Method  → same address on all chains
 *   Step 2: Call setUSDC(chain_usdc)  → chain-specific token, set once
 *
 * Usage
 * ─────
 *   npx hardhat run scripts/deploy-factory-deterministic.ts --network base
 *   npx hardhat run scripts/deploy-factory-deterministic.ts --network arc
 *   npx hardhat run scripts/deploy-factory-deterministic.ts --network hashkey
 *
 * The factory addresses printed will be IDENTICAL on every chain.
 * Update VITE_FACTORY_V2, VITE_FACTORY_V2_ARC on Render to the same value.
 */

import { ethers, network } from 'hardhat'

// ── Nick's Method singleton ────────────────────────────────────────────────────
const NICK_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C'

// ── Chain-agnostic config (same on all chains) ─────────────────────────────────
const TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

// ── Chain-specific token addresses ───────────────────────────────────────────
const USDC_PER_CHAIN: Record<string, string> = {
  base:    '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  arc:     '0x3600000000000000000000000000000000000000',
  hashkey: '',   // HashKey uses native HSK — leave blank; set manually if needed
  arbitrum:'0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9',
}

// ── Fixed salts ────────────────────────────────────────────────────────────────
const SALT_V2     = ethers.id('hashkey-paylink-factory-v2-universal')
const SALT_ROUTER = ethers.id('hashkey-paylink-router-factory-v1')

async function deployViaNick(
  signer:   ethers.Signer,
  salt:     string,
  initcode: string,
): Promise<string> {
  const deployData = ethers.concat([salt, initcode])
  const tx = await signer.sendTransaction({ to: NICK_FACTORY, data: deployData })
  await tx.wait()
  return ethers.getCreate2Address(NICK_FACTORY, salt, ethers.keccak256(initcode))
}

async function main() {
  const [deployer] = await ethers.getSigners()
  const provider   = ethers.provider
  const chainName  = network.name
  const chainUsdc  = USDC_PER_CHAIN[chainName] ?? ''

  console.log('══════════════════════════════════════════════════════')
  console.log('HashKey PayLink — Deterministic Factory Deployment')
  console.log('══════════════════════════════════════════════════════')
  console.log(`Network:   ${chainName}`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Treasury:  ${TREASURY}`)
  console.log(`USDC:      ${chainUsdc || '(not configured — call setUSDC manually)'}`)
  console.log()

  // ── Verify Nick's factory exists ───────────────────────────────────────────
  if ((await provider.getCode(NICK_FACTORY)) === '0x') {
    console.error(`❌  Nick's factory not found on ${chainName}.`)
    process.exitCode = 1; return
  }
  console.log(`Nick's factory: ✅`)

  // ══ 1. PayLinkFactoryV2 ══════════════════════════════════════════════════════
  console.log('\n── PayLinkFactoryV2 ──────────────────────────────────')

  const V2Factory  = await ethers.getContractFactory('PayLinkFactoryV2')
  const v2Initcode = ethers.concat([
    V2Factory.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'address'],
      [TREASURY, deployer.address, deployer.address],  // treasury, relayer, owner
    ),
  ])
  const v2Address = ethers.getCreate2Address(NICK_FACTORY, SALT_V2, ethers.keccak256(v2Initcode))
  console.log(`Predicted:  ${v2Address}`)

  const v2Code = await provider.getCode(v2Address)
  if (v2Code !== '0x') {
    console.log('Already deployed ✅')
  } else {
    console.log('Deploying…')
    await deployViaNick(deployer, SALT_V2, v2Initcode)
    console.log(`Deployed ✅`)
  }

  // Step 2: configure USDC if not yet set
  const v2 = new ethers.Contract(v2Address, [
    'function USDC() view returns (address)',
    'function setUSDC(address) external',
    'function relayer() view returns (address)',
    'function setRelayer(address) external',
  ], deployer)

  const currentUsdc = await v2.USDC()
  if (currentUsdc === ethers.ZeroAddress) {
    if (!chainUsdc) {
      console.log('⚠️  No USDC address for this chain — call setUSDC() manually.')
    } else {
      console.log(`Configuring USDC: ${chainUsdc}`)
      const tx = await v2.setUSDC(chainUsdc)
      await tx.wait()
      console.log(`USDC set ✅`)
    }
  } else {
    console.log(`USDC already set: ${currentUsdc} ✅`)
  }

  // ══ 2. PaymentRouterFactory ══════════════════════════════════════════════════
  console.log('\n── PaymentRouterFactory ──────────────────────────────')

  const RouterFactory  = await ethers.getContractFactory('PaymentRouterFactory')
  const routerInitcode = ethers.concat([
    RouterFactory.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(['address'], [TREASURY]),
  ])
  const routerAddress = ethers.getCreate2Address(NICK_FACTORY, SALT_ROUTER, ethers.keccak256(routerInitcode))
  console.log(`Predicted:  ${routerAddress}`)

  const routerCode = await provider.getCode(routerAddress)
  if (routerCode !== '0x') {
    console.log('Already deployed ✅')
  } else {
    console.log('Deploying…')
    await deployViaNick(deployer, SALT_ROUTER, routerInitcode)
    console.log(`Deployed ✅`)
  }

  // ══ Summary ══════════════════════════════════════════════════════════════════
  console.log('\n══════════════════════════════════════════════════════')
  console.log('Update these on Render (same values on every chain):')
  console.log(`  VITE_FACTORY_V2         = ${v2Address}`)
  console.log(`  VITE_FACTORY_V2_ARC     = ${v2Address}`)
  console.log(`  PAYLINK_FACTORY_V2_ARC  = ${v2Address}`)
  console.log(`  ROUTER_FACTORY          = ${routerAddress}`)
  console.log()
  console.log('Run on every chain you support:')
  console.log('  --network base | arc | hashkey | arbitrum')
  console.log('Addresses will be identical on each.')
  console.log('══════════════════════════════════════════════════════')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
