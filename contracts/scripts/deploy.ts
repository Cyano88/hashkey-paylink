import { ethers, network } from 'hardhat'

// ── Treasury address (receives the 0.5% fee on every payment) ────────────────
const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

async function main() {
  const [deployer] = await ethers.getSigners()
  const balance    = await ethers.provider.getBalance(deployer.address)

  console.log('─────────────────────────────────────────────')
  console.log(`Network:   ${network.name} (chainId ${network.config.chainId})`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Balance:   ${ethers.formatEther(balance)} native`)
  console.log('─────────────────────────────────────────────\n')

  // ── Deploy PaymentRouterFactory ──────────────────────────────────────────
  console.log('Deploying PaymentRouterFactory…')
  const Factory = await ethers.getContractFactory('PaymentRouterFactory')
  const factory = await Factory.deploy(EVM_TREASURY)
  await factory.waitForDeployment()

  const factoryAddress = await factory.getAddress()
  console.log(`✅  PaymentRouterFactory: ${factoryAddress}\n`)

  // ── Sanity check — predict a sample router ───────────────────────────────
  const sampleRouter = await factory.getRouterAddress(deployer.address)
  console.log(`Sample router for deployer: ${sampleRouter}`)
  console.log('(Not yet deployed — call deployRouter(recipient) to activate)\n')

  // ── Instructions ─────────────────────────────────────────────────────────
  console.log('═════════════════════════════════════════════')
  console.log('Next step: update src/lib/router.ts')
  console.log(`  ${network.name}: '${factoryAddress}',`)
  console.log('Then re-run: vercel --prod --yes')
  console.log('═════════════════════════════════════════════')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
