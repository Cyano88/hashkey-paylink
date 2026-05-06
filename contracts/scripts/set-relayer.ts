import { ethers, network } from 'hardhat'

const FACTORY_V2   = '0xe06b00Be7AFc23db6aA9e809F478E9A1AE3074D1'
const NEW_RELAYER  = '0x51080f31a21bedafe50180944606044c12ea88e4'

const ABI = ['function setRelayer(address _relayer) external']

async function main() {
  const [owner] = await ethers.getSigners()
  const balance  = await ethers.provider.getBalance(owner.address)

  console.log('─────────────────────────────────────────────')
  console.log(`Network:      ${network.name}`)
  console.log(`Owner:        ${owner.address}`)
  console.log(`Balance:      ${ethers.formatEther(balance)} ETH`)
  console.log(`Factory:      ${FACTORY_V2}`)
  console.log(`New relayer:  ${NEW_RELAYER}`)
  console.log('─────────────────────────────────────────────\n')

  if (balance === 0n) throw new Error('Owner wallet has no ETH — top up before running.')

  const factory = new ethers.Contract(FACTORY_V2, ABI, owner)
  console.log('Calling setRelayer…')
  const tx = await factory.setRelayer(NEW_RELAYER)
  console.log(`Tx sent: ${tx.hash}`)
  await tx.wait()
  console.log('✅  Relayer updated successfully.')
  console.log(`\nVerify on Basescan: https://basescan.org/tx/${tx.hash}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
