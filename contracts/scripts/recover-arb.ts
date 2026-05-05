/**
 * Recover USDT0 sent to a Base PaymentRouter address on Arbitrum.
 *
 * The factory on Base was deployed at nonce=0. Since the main deployer has
 * nonce=3 on Arbitrum, this script uses a FRESH wallet (nonce=0) to deploy
 * the factory at the identical address, then deploys the router and sweeps.
 *
 * Setup
 * ─────
 * 1. Generate a fresh EOA (never used on Arbitrum):
 *      node -e "const {ethers}=require('ethers'); const w=ethers.Wallet.createRandom(); console.log('PK:', w.privateKey, 'Addr:', w.address)"
 * 2. Send ~0.005 ETH (Arbitrum) to that address for gas — roughly $0.02.
 * 3. Add to contracts/.env:
 *      ARB_RECOVERY_KEY=<private key without 0x>
 * 4. Run:
 *      npx hardhat run scripts/recover-arb.ts --network arbitrum
 */

import { ethers } from 'hardhat'
import * as dotenv from 'dotenv'
dotenv.config()

// ── Config ────────────────────────────────────────────────────────────────────
const FACTORY_ADDRESS = '0x9439D7f770B2AEBAD9d0D05f2C713F0dB6b812ba'
const TREASURY        = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'
const RECIPIENT       = '0x7ba3a3ea4b874ae1ce7d337b331fcc3db76c60fc'
const ROUTER_ADDRESS  = '0x7fCe8085739c398f6Ba0E7D743855212C0B53b02'
const USDT0_ARB       = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9'

// ── ABIs ──────────────────────────────────────────────────────────────────────
const FACTORY_ABI = [
  'function deployRouter(address recipient) returns (address)',
  'function getRouterAddress(address recipient) view returns (address)',
]
const ROUTER_ABI = ['function sweep(address token) external']
const ERC20_ABI  = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

async function main() {
  const provider = ethers.provider

  // ── Pick signer: prefer ARB_RECOVERY_KEY (fresh wallet, nonce=0) ──────────
  let signer: ethers.Signer
  const recoveryKey = process.env.ARB_RECOVERY_KEY
  if (recoveryKey) {
    signer = new ethers.Wallet(`0x${recoveryKey.replace(/^0x/, '')}`, provider)
  } else {
    ;[signer] = await ethers.getSigners()
  }

  const signerAddr = await signer.getAddress()
  const nonce      = await provider.getTransactionCount(signerAddr)
  const balance    = await provider.getBalance(signerAddr)

  console.log('══════════════════════════════════════════════════')
  console.log('HashKey PayLink — Arbitrum USDT0 Recovery')
  console.log('══════════════════════════════════════════════════')
  console.log(`Signer:        ${signerAddr}`)
  console.log(`Nonce:         ${nonce}`)
  console.log(`ETH balance:   ${ethers.formatEther(balance)} ETH`)
  console.log(`Recipient:     ${RECIPIENT}`)
  console.log(`Router:        ${ROUTER_ADDRESS}`)

  // ── Pre-flight: verify nonce will produce correct factory address ──────────
  const predictedFactory = ethers.getCreateAddress({ from: signerAddr, nonce })
  if (predictedFactory.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) {
    console.error('\n❌  Nonce mismatch!')
    console.error(`   Signer nonce ${nonce} → factory would be at ${predictedFactory}`)
    console.error(`   Expected factory at                          ${FACTORY_ADDRESS}`)
    console.error('\n   This signer has already transacted on Arbitrum.')
    console.error('   You need a fresh wallet (nonce=0). Steps:')
    console.error('   1. node -e "const {ethers}=require(\'ethers\'); const w=ethers.Wallet.createRandom(); console.log(\'PK:\', w.privateKey, \'\\nAddr:\', w.address)"')
    console.error('   2. Send ~0.005 ARB ETH to that address')
    console.error('   3. Add ARB_RECOVERY_KEY=<key> to contracts/.env')
    console.error('   4. Re-run this script')
    process.exitCode = 1
    return
  }
  console.log(`Factory nonce: ${nonce} ✅  (will land at ${FACTORY_ADDRESS})`)

  // ── Step 0: confirm USDT0 is at the router ────────────────────────────────
  const usdt0 = new ethers.Contract(USDT0_ARB, ERC20_ABI, provider)
  const [symbol, decimals, tokenBalance] = await Promise.all([
    usdt0.symbol(),
    usdt0.decimals(),
    usdt0.balanceOf(ROUTER_ADDRESS),
  ])
  console.log(`\n${symbol} at router: ${ethers.formatUnits(tokenBalance, decimals)}`)
  if (tokenBalance === 0n) {
    console.log('Nothing to recover — balance is zero.')
    return
  }

  if (balance < ethers.parseEther('0.001')) {
    console.error(`\n❌  Insufficient gas: ${ethers.formatEther(balance)} ETH. Send at least 0.001 ETH to ${signerAddr}`)
    process.exitCode = 1
    return
  }

  // ── Step 1: deploy factory on Arbitrum ────────────────────────────────────
  const factoryCode = await provider.getCode(FACTORY_ADDRESS)
  if (factoryCode === '0x') {
    console.log('\nStep 1: Deploying factory on Arbitrum…')
    const Factory = await ethers.getContractFactory('PaymentRouterFactory', signer)
    const factory = await Factory.deploy(TREASURY)
    await factory.waitForDeployment()
    const deployed = await factory.getAddress()
    console.log(`Factory deployed ✅  ${deployed}`)
  } else {
    console.log('\nStep 1: Factory already on Arbitrum ✅')
  }

  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer)

  // ── Step 2: verify predicted router matches ───────────────────────────────
  const predicted = await factory.getRouterAddress(RECIPIENT)
  if (predicted.toLowerCase() !== ROUTER_ADDRESS.toLowerCase()) {
    throw new Error(
      `Predicted router ${predicted} ≠ expected ${ROUTER_ADDRESS}.\n` +
      `Wrong RECIPIENT — check the RouterDeployed event on Basescan.`
    )
  }
  console.log(`Step 2: Router address verified ✅  ${predicted}`)

  // ── Step 3: deploy router on Arbitrum ─────────────────────────────────────
  const routerCode = await provider.getCode(ROUTER_ADDRESS)
  if (routerCode === '0x') {
    console.log('Step 3: Deploying router on Arbitrum…')
    const tx = await factory.deployRouter(RECIPIENT)
    await tx.wait()
    console.log(`Router deployed ✅  tx: ${tx.hash}`)
  } else {
    console.log('Step 3: Router already deployed ✅')
  }

  // ── Step 4: sweep USDT0 → recipient + treasury ────────────────────────────
  console.log(`\nStep 4: Sweeping ${ethers.formatUnits(tokenBalance, decimals)} ${symbol}…`)
  const router = new ethers.Contract(ROUTER_ADDRESS, ROUTER_ABI, signer)
  const tx = await router.sweep(USDT0_ARB)
  await tx.wait()
  console.log(`Sweep complete ✅  tx: ${tx.hash}`)

  const [recipientBal, treasuryBal] = await Promise.all([
    usdt0.balanceOf(RECIPIENT),
    usdt0.balanceOf(TREASURY),
  ])
  console.log(`\nRecipient receives: ${ethers.formatUnits(recipientBal, decimals)} ${symbol}`)
  console.log(`Treasury fee:       ${ethers.formatUnits(treasuryBal, decimals)} ${symbol}`)
  console.log('\nRecovery complete ✅')
  console.log('══════════════════════════════════════════════════')
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
