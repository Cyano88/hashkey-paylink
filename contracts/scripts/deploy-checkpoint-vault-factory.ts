import { ethers, network } from 'hardhat'

const USDC_ARC = '0x3600000000000000000000000000000000000000'

async function main() {
  const [deployer] = await ethers.getSigners()
  const rawBal = await ethers.provider.getBalance(deployer.address)
  const dispBal = ethers.formatUnits(rawBal, 18)

  console.log('------------------------------------------------')
  console.log(`Network:  ${network.name} (chainId ${network.config.chainId})`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Balance:  ${dispBal} USDC native gas`)
  console.log(`USDC:     ${USDC_ARC}`)
  console.log(`Relayer:  ${deployer.address}`)
  console.log('------------------------------------------------\n')

  if (rawBal === 0n) throw new Error('Deployer has no Arc native USDC. Fund the wallet first.')

  console.log('Deploying CheckpointVaultFactory...')
  const Factory = await ethers.getContractFactory('CheckpointVaultFactory')
  const factory = await Factory.deploy(USDC_ARC, deployer.address)
  await factory.waitForDeployment()

  const addr = await factory.getAddress()
  console.log(`\nCheckpointVaultFactory: ${addr}`)

  await new Promise(resolve => setTimeout(resolve, 3_000))
  try {
    const token = await (factory as any).token()
    const relayer = await (factory as any).relayer()
    console.log('\nSanity check:')
    console.log(`  token()   = ${token}`)
    console.log(`  relayer() = ${relayer}`)
  } catch {
    console.log('(sanity check skipped)')
  }

  console.log('\nSet these on Render:')
  console.log(`CHECKPOINT_FACTORY_ADDRESS=${addr}`)
  console.log(`VITE_CHECKPOINT_FACTORY_ADDRESS=${addr}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
