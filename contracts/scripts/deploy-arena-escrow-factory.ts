import { ethers, network } from 'hardhat'

const USDC_ARC = process.env.USDC_ARC ?? '0x3600000000000000000000000000000000000000'
const TREASURY = process.env.TREASURY_ADDRESS ?? '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'

async function main() {
  const [deployer] = await ethers.getSigners()
  const relayer = deployer.address
  const rawBal = await ethers.provider.getBalance(deployer.address)

  console.log('Deploying StreamPay Arena escrow factory')
  console.log(`Network:  ${network.name} (${network.config.chainId})`)
  console.log(`Deployer: ${deployer.address}`)
  console.log(`Balance:  ${ethers.formatUnits(rawBal, 18)} native`)
  console.log(`USDC:     ${USDC_ARC}`)
  console.log(`Treasury: ${TREASURY}`)
  console.log(`Relayer:  ${relayer}`)

  if (rawBal === 0n) {
    throw new Error('Deployer has no native gas balance. Fund the wallet first.')
  }

  const Factory = await ethers.getContractFactory('ArenaRoomEscrowFactory')
  const factory = await Factory.deploy(USDC_ARC, TREASURY, relayer)
  await factory.waitForDeployment()

  const address = await factory.getAddress()
  console.log(`\nArenaRoomEscrowFactory: ${address}`)
  console.log('\nSet these Render environment variables:')
  console.log(`ARENA_ESCROW_FACTORY_ADDRESS=${address}`)
  console.log(`VITE_ARENA_ESCROW_FACTORY_ADDRESS=${address}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
