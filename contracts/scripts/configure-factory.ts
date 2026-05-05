/**
 * Post-deployment configuration for the deterministic PayLinkFactoryV2.
 *
 * Run this AFTER deploy-factory-deterministic.ts if:
 *  a) The production relayer wallet differs from the deployer wallet, OR
 *  b) You need to verify the factory is correctly configured.
 *
 * Usage:
 *   FACTORY=0x<address> PRODUCTION_RELAYER=0x<relayer> \
 *   npx hardhat run scripts/configure-factory.ts --network base
 *
 * Or set them in .env:
 *   DETERMINISTIC_FACTORY=0x<address>
 *   PRODUCTION_RELAYER=0x<relayer>
 */

import { ethers, network } from 'hardhat'

const FACTORY_ABI = [
  'function USDC() view returns (address)',
  'function TREASURY() view returns (address)',
  'function relayer() view returns (address)',
  'function owner() view returns (address)',
  'function setRelayer(address) external',
  'function setUSDC(address) external',
]

async function main() {
  const [deployer] = await ethers.getSigners()

  const factoryAddr      = process.env.DETERMINISTIC_FACTORY ?? ''
  const productionRelayer = process.env.PRODUCTION_RELAYER   ?? ''

  if (!factoryAddr || !ethers.isAddress(factoryAddr)) {
    throw new Error('Set DETERMINISTIC_FACTORY=0x<address> in env')
  }

  console.log('══════════════════════════════════════════════════')
  console.log(`Network:  ${network.name}`)
  console.log(`Factory:  ${factoryAddr}`)
  console.log(`Deployer: ${deployer.address}`)
  console.log()

  const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, deployer)

  const [usdc, treasury, currentRelayer, owner] = await Promise.all([
    factory.USDC(),
    factory.TREASURY(),
    factory.relayer(),
    factory.owner(),
  ])

  console.log(`USDC:            ${usdc     || '⚠️  NOT SET'}`)
  console.log(`TREASURY:        ${treasury}`)
  console.log(`Current relayer: ${currentRelayer}`)
  console.log(`Owner:           ${owner}`)
  console.log()

  if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
    console.log('⚠️  Deployer is not the owner — cannot make changes.')
    return
  }

  // Rotate relayer if a production relayer is specified and differs
  if (productionRelayer && ethers.isAddress(productionRelayer)) {
    if (currentRelayer.toLowerCase() === productionRelayer.toLowerCase()) {
      console.log(`Relayer already set to production wallet ✅`)
    } else {
      console.log(`Rotating relayer → ${productionRelayer}`)
      const tx = await factory.setRelayer(productionRelayer)
      await tx.wait()
      console.log(`Relayer updated ✅  tx: ${tx.hash}`)
    }
  } else {
    console.log(`No PRODUCTION_RELAYER set — relayer stays as: ${currentRelayer}`)
  }

  console.log()
  console.log('Factory is ready ✅')
  console.log('══════════════════════════════════════════════════')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
