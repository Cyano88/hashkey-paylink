/**
 * deploy-factory-viem.ts
 * Deploy StreamVaultFactory using viem directly (bypasses hardhat timeout issues).
 *
 * npx tsx scripts/deploy-factory-viem.ts
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbi,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config()

const arc = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const USDC_ARC  = '0x3600000000000000000000000000000000000000' as const
const TREASURY  = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753' as const

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY ?? process.env.RELAYER_PRIVATE_KEY_ARC
  if (!rawKey) throw new Error('Missing DEPLOYER_PRIVATE_KEY or RELAYER_PRIVATE_KEY_ARC')

  const account = privateKeyToAccount(`0x${rawKey.replace(/^0x/, '')}` as `0x${string}`)
  const rpcUrl  = 'https://rpc.testnet.arc.network'

  const publicClient = createPublicClient({ chain: arc, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: arc, transport: http(rpcUrl) })

  const balance = await publicClient.getBalance({ address: account.address })
  const nonce   = await publicClient.getTransactionCount({ address: account.address })

  console.log('─────────────────────────────────────────────────')
  console.log(`Deployer:  ${account.address}`)
  console.log(`Balance:   ${Number(balance) / 1e18} USDC (native gas)`)
  console.log(`Nonce:     ${nonce}`)
  console.log(`USDC:      ${USDC_ARC}`)
  console.log(`Treasury:  ${TREASURY}`)
  console.log('─────────────────────────────────────────────────\n')

  if (balance === 0n) throw new Error('Deployer has no Arc native USDC. Fund the wallet first.')

  // Load artifact
  const artifactPath = path.join(__dirname, '../artifacts/contracts/StreamVaultFactory.sol/StreamVaultFactory.json')
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  const bytecode  = artifact.bytecode as `0x${string}`
  const abi       = artifact.abi

  console.log('Deploying StreamVaultFactory…')

  // Encode constructor args: (address _usdc, address _treasury, address _relayer)
  const { encodeAbiParameters, parseAbiParameters } = await import('viem')
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters('address, address, address'),
    [USDC_ARC, TREASURY, account.address]  // relayer = deployer
  )

  const deployData = `${bytecode}${constructorArgs.slice(2)}` as `0x${string}`

  const txHash = await walletClient.sendTransaction({
    to:   null,   // contract deployment
    data: deployData,
    gas:  2_000_000n,
  })
  console.log(`Tx submitted: ${txHash}`)
  console.log('Waiting for confirmation…')

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 120_000 })

  if (receipt.status !== 'success') {
    throw new Error(`Deployment transaction reverted! Hash: ${txHash}`)
  }

  const addr = receipt.contractAddress!
  console.log(`\nStreamVaultFactory: ${addr}`)

  // Sanity read-back
  const factoryAbi = parseAbi([
    'function usdc() view returns (address)',
    'function relayer() view returns (address)',
  ])
  const [usdc, relayer] = await Promise.all([
    publicClient.readContract({ address: addr, abi: factoryAbi, functionName: 'usdc' }),
    publicClient.readContract({ address: addr, abi: factoryAbi, functionName: 'relayer' }),
  ])
  console.log(`\nSanity check:`)
  console.log(`  usdc()    = ${usdc}`)
  console.log(`  relayer() = ${relayer}`)

  console.log('\n═════════════════════════════════════════════════')
  console.log('✓  Set these environment variables on Render:')
  console.log(`\n   STREAM_FACTORY_ADDRESS=${addr}`)
  console.log(`   VITE_STREAM_FACTORY_ADDRESS=${addr}`)
  console.log('═════════════════════════════════════════════════\n')
}

main().catch(e => { console.error(e); process.exitCode = 1 })
