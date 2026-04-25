import { ethers, network } from 'hardhat'

// ── Arc Testnet addresses ─────────────────────────────────────────────────────
// USDC: native precompile (symbol=USDC, decimals=6 for amounts, 18 for gas)
const USDC_ARC   = '0x3600000000000000000000000000000000000000'
const TREASURY   = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

async function main() {
  const [deployer] = await ethers.getSigners()
  const rawBal     = await ethers.provider.getBalance(deployer.address)
  const dispBal    = ethers.formatUnits(rawBal, 18)

  console.log('─────────────────────────────────────────────────')
  console.log(`Network:   ${network.name} (chainId ${network.config.chainId})`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Balance:   ${dispBal} USDC (native gas)`)
  console.log(`USDC:      ${USDC_ARC}`)
  console.log(`Treasury:  ${TREASURY}`)
  console.log(`Relayer:   ${deployer.address}  (deployer = relayer)`)
  console.log('─────────────────────────────────────────────────\n')

  if (rawBal === 0n) {
    throw new Error('Deployer has no Arc native USDC. Fund the wallet first.')
  }

  console.log('Deploying StreamVaultFactory…')
  const Factory = await ethers.getContractFactory('StreamVaultFactory')
  const factory = await Factory.deploy(USDC_ARC, TREASURY, deployer.address)
  await factory.waitForDeployment()

  const addr = await factory.getAddress()
  console.log(`\nStreamVaultFactory: ${addr}`)

  // Quick sanity check
  await new Promise(r => setTimeout(r, 3_000))
  try {
    const usdc    = await (factory as any).usdc()
    const relayer = await (factory as any).relayer()
    console.log(`\nSanity check:`)
    console.log(`  usdc()    = ${usdc}`)
    console.log(`  relayer() = ${relayer}`)
  } catch { console.log('(sanity check skipped)') }

  console.log('\n═════════════════════════════════════════════════')
  console.log('✓  Set these environment variables on Render:')
  console.log(`\n   STREAM_FACTORY_ADDRESS=${addr}`)
  console.log(`   VITE_STREAM_FACTORY_ADDRESS=${addr}`)
  console.log('\n   (RELAYER_PRIVATE_KEY_ARC is already set from InstantPay)')
  console.log('═════════════════════════════════════════════════\n')
}

main().catch(e => { console.error(e); process.exitCode = 1 })
