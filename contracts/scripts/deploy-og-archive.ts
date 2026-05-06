/**
 * Deploy PayLinkArchive to 0G Mainnet (Chain ID 16661).
 *
 * Usage:
 *   npx hardhat run scripts/deploy-og-archive.ts --network og
 *
 * After deploy, set these on Render:
 *   OG_ARCHIVE_ADDRESS = <deployed address>
 *   OG_STORAGE_KEY     = <deployer private key — must hold OG tokens>
 */

import { ethers, network } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()
  const balance    = await ethers.provider.getBalance(deployer.address)

  console.log('══════════════════════════════════════════════════')
  console.log('Hash PayLink — PayLinkArchive Deployment')
  console.log('══════════════════════════════════════════════════')
  console.log(`Network:   ${network.name} (Chain ID ${network.config.chainId})`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Balance:   ${ethers.formatEther(balance)} OG`)

  if (balance === 0n) {
    console.error('\n❌  Wallet has no OG tokens. Fund it at https://faucet.0g.ai or bridge.')
    process.exitCode = 1
    return
  }

  console.log('\nDeploying PayLinkArchive…')
  const Factory  = await ethers.getContractFactory('PayLinkArchive')
  const contract = await Factory.deploy()
  await contract.waitForDeployment()
  const address = await contract.getAddress()

  console.log(`Deployed ✅  ${address}`)
  console.log(`Explorer:   https://chainscan.0g.ai/address/${address}`)
  console.log('\n══════════════════════════════════════════════════')
  console.log('Add to Render environment:')
  console.log(`  OG_ARCHIVE_ADDRESS = ${address}`)
  console.log(`  OG_STORAGE_KEY     = <your OG wallet private key>`)
  console.log('══════════════════════════════════════════════════')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
