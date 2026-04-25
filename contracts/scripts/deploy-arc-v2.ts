import { ethers, network } from 'hardhat'

// ── Arc Testnet addresses ─────────────────────────────────────────────────────
// USDC on Arc: native precompile at 0x3600...0000 (symbol=USDC, decimals=6)
// Ref: https://docs.arc.network/arc/references/contract-addresses
const USDC_ARC    = '0x3600000000000000000000000000000000000000'
const EVM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

async function main() {
  const [deployer] = await ethers.getSigners()
  // Native balance (Arc uses USDC with 18 decimal places for gas accounting)
  const rawBal  = await ethers.provider.getBalance(deployer.address)
  const dispBal = ethers.formatUnits(rawBal, 18)

  console.log('─────────────────────────────────────────────')
  console.log(`Network:   ${network.name} (chainId ${network.config.chainId})`)
  console.log(`Deployer:  ${deployer.address}`)
  console.log(`Balance:   ${dispBal} USDC (native gas)`)
  console.log(`USDC ERC-20: ${USDC_ARC}`)
  console.log(`Treasury:  ${EVM_TREASURY}`)
  console.log(`Relayer:   ${deployer.address}  (deployer wallet)`)
  console.log('─────────────────────────────────────────────\n')

  if (rawBal === 0n) throw new Error('Deployer has no Arc native USDC — fund the wallet first.')

  console.log('Deploying PayLinkFactoryV2 on Arc testnet…')
  const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
  const factory = await Factory.deploy(USDC_ARC, EVM_TREASURY, deployer.address)
  await factory.waitForDeployment()

  const addr = await factory.getAddress()
  console.log(`PayLinkFactoryV2: ${addr}\n`)

  // Sanity check
  await new Promise(r => setTimeout(r, 3000))
  try {
    const testLinkId = ethers.randomBytes(32)
    const vault = await factory.getVaultAddress(testLinkId, deployer.address)
    console.log(`Sample vault: ${vault}`)
  } catch { console.log('(vault prediction skipped)') }

  console.log('\n═════════════════════════════════════════════')
  console.log('Set these on Render:')
  console.log(`  VITE_FACTORY_V2_ARC=${addr}`)
  console.log(`  PAYLINK_FACTORY_V2_ARC=${addr}`)
  console.log('═════════════════════════════════════════════')
}

main().catch(e => { console.error(e); process.exitCode = 1 })
