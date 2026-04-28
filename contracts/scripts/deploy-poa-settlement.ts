import { ethers, network } from 'hardhat'

async function main() {
  const [deployer] = await ethers.getSigners()
  const rawBal     = await ethers.provider.getBalance(deployer.address)
  const dispBal    = ethers.formatUnits(rawBal, 18)

  console.log('─────────────────────────────────────────────────')
  console.log(`Network:   ${network.name} (chainId ${network.config.chainId})`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Balance:   ${dispBal} USDC (native gas)`)
  console.log('─────────────────────────────────────────────────\n')

  if (rawBal === 0n) {
    throw new Error('Deployer has no Arc native USDC. Fund the wallet first.')
  }

  console.log('Deploying PoASettlement…')
  const Factory = await ethers.getContractFactory('PoASettlement')
  const contract = await Factory.deploy()
  await contract.waitForDeployment()

  const addr = await contract.getAddress()
  console.log(`\nPoASettlement: ${addr}`)

  // Sanity check: read back DOMAIN_SEPARATOR
  await new Promise(r => setTimeout(r, 3_000))
  try {
    const ds = await (contract as any).DOMAIN_SEPARATOR()
    console.log(`\nDOMAIN_SEPARATOR: ${ds}`)
  } catch { console.log('(domain separator check skipped)') }

  console.log('\n═════════════════════════════════════════════════')
  console.log('Set these on Render (Environment Variables):')
  console.log(`\n   ARC_POA_CONTRACT=${addr}`)
  console.log(`   VITE_POA_CONTRACT=${addr}`)
  console.log('\nThen redeploy or push any commit to trigger auto-deploy.')
  console.log('═════════════════════════════════════════════════\n')
}

main().catch(e => { console.error(e); process.exitCode = 1 })
