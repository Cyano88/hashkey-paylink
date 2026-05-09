import { ethers, network } from 'hardhat'

// ── Config ────────────────────────────────────────────────────────────────────
// USDC on Base Mainnet (Circle canonical)
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

// Treasury: cold wallet that receives 0.2% platform fee + gas reimbursement
const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

async function main() {
  const [deployer] = await ethers.getSigners()
  const balance    = await ethers.provider.getBalance(deployer.address)

  // Relayer = deployer wallet (signs relay() calls, pays gas)
  // Treasury = cold wallet ending ...53 (receives fees)
  const TREASURY = EVM_TREASURY
  const RELAYER  = deployer.address

  console.log('─────────────────────────────────────────────')
  console.log(`Network:   ${network.name} (chainId ${network.config.chainId})`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Balance:   ${ethers.formatEther(balance)} ETH`)
  console.log(`USDC:      ${USDC_BASE}`)
  console.log(`Treasury:  ${TREASURY}  (deployer wallet)`)
  console.log(`Relayer:   ${RELAYER}   (deployer wallet)`)
  console.log('─────────────────────────────────────────────\n')

  if (balance === 0n) {
    throw new Error('Deployer has no ETH — top up the wallet before deploying.')
  }

  // ── Deploy PayLinkFactoryV2 ───────────────────────────────────────────────
  console.log('Deploying PayLinkFactoryV2…')
  const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
  const factory = await Factory.deploy(TREASURY, RELAYER, deployer.address)
  await factory.waitForDeployment()

  const factoryAddress = await factory.getAddress()
  console.log(`✅  PayLinkFactoryV2: ${factoryAddress}\n`)

  console.log(`Configuring USDC: ${USDC_BASE}`)
  const tx = await factory.setUSDC(USDC_BASE)
  await tx.wait()
  console.log(`✅  USDC set: ${USDC_BASE}\n`)

  // ── Sanity check: vault address prediction ────────────────────────────────
  await new Promise(r => setTimeout(r, 4000))
  try {
    const testLinkId = ethers.randomBytes(32)
    const vault = await factory.getVaultAddress(testLinkId, deployer.address)
    console.log(`Sample vault address: ${vault}`)
    console.log('(Computed off-chain — no gas, no deploy needed until relay() is called)\n')
  } catch {
    console.log('(Vault prediction skipped)\n')
  }

  // ── Environment variable instructions ────────────────────────────────────
  console.log('═════════════════════════════════════════════')
  console.log('Add the following to your Vercel environment variables:')
  console.log(`  PAYLINK_FACTORY_V2=${factoryAddress}`)
  console.log(`  VITE_FACTORY_V2=${factoryAddress}`)
  console.log(`  RELAYER_PRIVATE_KEY=<your deployer private key>`)
  console.log(`  PRIVATE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/KgWG_lzGfTgnnrtFL0Yws`)
  console.log(`  VITE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/ALSFqIARRLtU5cbbOv420`)
  console.log('═════════════════════════════════════════════')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
