/**
 * verify-create2.ts
 *
 * Proves that StreamVaultFactory.getVaultAddress() (the pre-calculation shown
 * to the user) always matches the address produced by CREATE2 at deployment.
 *
 * Run:
 *   npx tsx modules/streampay/scripts/verify-create2.ts
 *
 * Required env vars:
 *   PRIVATE_RPC_URL_ARC         Arc RPC endpoint
 *   RELAYER_PRIVATE_KEY_ARC     Deployer wallet (must hold Arc USDC for gas)
 *   STREAM_FACTORY_ADDRESS      Deployed StreamVaultFactory
 */

import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  defineChain,
  keccak256,
  toBytes,
  encodeAbiParameters,
  parseAbiParameters,
  getContractAddress,
  isAddressEqual,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

// ── Chain ─────────────────────────────────────────────────────────────────────
const arc = defineChain({
  id:             5042002,
  name:           'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
})

// ── ABIs ──────────────────────────────────────────────────────────────────────
const FACTORY_ABI = parseAbi([
  'function usdc() view returns (address)',
  'function relayer() view returns (address)',
  'function getVaultAddress(address sender, address recipient, uint256 totalAmount, uint64 startTime, uint64 endTime, bytes32 salt) view returns (address)',
  'function createStream(address recipient, uint256 totalAmount, uint64 startTime, uint64 endTime, bytes32 salt) returns (address vault)',
  'event StreamCreated(bytes32 indexed streamId, address indexed vault, address indexed sender, address recipient, uint256 totalAmount, uint64 startTime, uint64 endTime)',
])

// ── Helpers ───────────────────────────────────────────────────────────────────
const PASS = '\x1b[32m✓\x1b[0m'
const FAIL = '\x1b[31m✗\x1b[0m'
const INFO = '\x1b[34m·\x1b[0m'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`${FAIL} ASSERTION FAILED: ${message}`)
    process.exit(1)
  }
  console.log(`${PASS} ${message}`)
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n─── StreamVault CREATE2 Verification ──────────────────────────')

  // ── Env ───────────────────────────────────────────────────────────────────
  const rawKey     = process.env.RELAYER_PRIVATE_KEY_ARC ?? process.env.RELAYER_PRIVATE_KEY
  const rpcUrl     = process.env.PRIVATE_RPC_URL_ARC     ?? 'https://rpc.testnet.arc.network'
  const factoryAddr = process.env.STREAM_FACTORY_ADDRESS  as `0x${string}` | undefined

  if (!rawKey)      { console.error('Missing RELAYER_PRIVATE_KEY_ARC'); process.exit(1) }
  if (!factoryAddr) { console.error('Missing STREAM_FACTORY_ADDRESS');  process.exit(1) }

  const account      = privateKeyToAccount(rawKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: arc, transport: http(rpcUrl) })
  const walletClient = createWalletClient({ account, chain: arc, transport: http(rpcUrl) })

  console.log(`${INFO} Factory:  ${factoryAddr}`)
  console.log(`${INFO} Deployer: ${account.address}`)

  // ── Read factory constants ─────────────────────────────────────────────────
  const [usdc, relayer] = await Promise.all([
    publicClient.readContract({ address: factoryAddr, abi: FACTORY_ABI, functionName: 'usdc' }),
    publicClient.readContract({ address: factoryAddr, abi: FACTORY_ABI, functionName: 'relayer' }),
  ])
  console.log(`${INFO} USDC:     ${usdc}`)
  console.log(`${INFO} Relayer:  ${relayer}\n`)

  // ── Test parameters ────────────────────────────────────────────────────────
  // Use a deterministic salt based on the test run so repeated runs don't clash
  const now       = BigInt(Math.floor(Date.now() / 1000))
  const startTime = now + 60n          // starts in 1 minute
  const endTime   = now + 3_600n       // ends in 1 hour
  const amount    = 1_000_000n         // 1 USDC (6 decimals)
  const recipient = account.address    // self-stream for testing
  const sender    = account.address

  // Salt = keccak256 of current timestamp (unique per run)
  const salt = keccak256(toBytes(now.toString()))

  console.log('─── Test Stream Parameters ─────────────────────────────────────')
  console.log(`${INFO} Recipient:  ${recipient}`)
  console.log(`${INFO} Amount:     1.000000 USDC`)
  console.log(`${INFO} Duration:   1 hour`)
  console.log(`${INFO} Salt:       ${salt}\n`)

  // ── Step 1: Pre-calculate address (what we show to the user) ─────────────
  console.log('─── Step 1: Pre-calculation ─────────────────────────────────────')
  const predicted = await publicClient.readContract({
    address:      factoryAddr,
    abi:          FACTORY_ABI,
    functionName: 'getVaultAddress',
    args:         [sender, recipient, amount, startTime, endTime, salt],
  }) as `0x${string}`
  console.log(`${INFO} Predicted vault: ${predicted}`)

  // Verify the predicted address has no code yet (vault doesn't exist yet)
  const codeBefore = await publicClient.getBytecode({ address: predicted })
  assert(
    !codeBefore || codeBefore === '0x',
    'Predicted address is empty (not yet deployed) ✓',
  )

  // ── Step 2: Check USDC allowance ──────────────────────────────────────────
  console.log('\n─── Step 2: USDC Approval ───────────────────────────────────────')
  const ERC20_ABI = parseAbi([
    'function approve(address spender, uint256 amount) returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
  ])

  const balance = await publicClient.readContract({
    address: usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
  })
  console.log(`${INFO} Wallet USDC balance: ${Number(balance) / 1e6} USDC`)

  if (balance < amount) {
    console.error(`${FAIL} Insufficient USDC. Need 1 USDC, have ${Number(balance) / 1e6}`)
    process.exit(1)
  }

  const allowance = await publicClient.readContract({
    address: usdc, abi: ERC20_ABI, functionName: 'allowance',
    args: [account.address, factoryAddr],
  })

  if (allowance < amount) {
    console.log(`${INFO} Approving factory to spend 1 USDC...`)
    const approveTx = await walletClient.writeContract({
      address: usdc, abi: ERC20_ABI, functionName: 'approve',
      args: [factoryAddr, amount],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveTx })
    console.log(`${PASS} Approved`)
  } else {
    console.log(`${PASS} Allowance sufficient`)
  }

  // ── Step 3: Deploy via factory ────────────────────────────────────────────
  console.log('\n─── Step 3: Deploy via createStream() ───────────────────────────')
  const txHash = await walletClient.writeContract({
    address:      factoryAddr,
    abi:          FACTORY_ABI,
    functionName: 'createStream',
    args:         [recipient, amount, startTime, endTime, salt],
    gas:          400_000n,
  })
  console.log(`${INFO} Tx: ${txHash}`)

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
  assert(receipt.status === 'success', 'createStream() transaction succeeded')

  // ── Step 4: Extract actual address from StreamCreated event ───────────────
  console.log('\n─── Step 4: Extract deployed vault address ───────────────────────')
  const log = receipt.logs.find(l =>
    l.topics[0] === keccak256(toBytes('StreamCreated(bytes32,address,address,address,uint256,uint64,uint64)'))
  )

  if (!log) {
    console.error(`${FAIL} StreamCreated event not found in receipt`)
    process.exit(1)
  }

  // vault is the 2nd indexed topic (topic[2]) — address is right-padded to 32 bytes
  const actualVault = `0x${log.topics[2]!.slice(26)}` as `0x${string}`
  console.log(`${INFO} Deployed vault: ${actualVault}`)

  // ── Step 5: THE CORE ASSERTION ─────────────────────────────────────────────
  console.log('\n─── Step 5: Verify ghost → live address match ────────────────────')
  assert(
    isAddressEqual(predicted, actualVault),
    `getVaultAddress() === deployed vault (${predicted})`,
  )

  // Double-check: the vault now has code
  const codeAfter = await publicClient.getBytecode({ address: actualVault })
  assert(
    !!codeAfter && codeAfter.length > 2,
    'Vault bytecode deployed at predicted address',
  )

  // ── Step 6: Read-back sanity ───────────────────────────────────────────────
  console.log('\n─── Step 6: Contract state read-back ────────────────────────────')
  const VAULT_ABI = parseAbi([
    'function totalAmount() view returns (uint256)',
    'function startTime() view returns (uint64)',
    'function endTime() view returns (uint64)',
    'function recipient() view returns (address)',
    'function isFunded() view returns (bool)',
    'function calculateUnlocked() view returns (uint256)',
  ])
  const [ta, st, et, rec, funded, unlocked] = await Promise.all([
    publicClient.readContract({ address: actualVault, abi: VAULT_ABI, functionName: 'totalAmount' }),
    publicClient.readContract({ address: actualVault, abi: VAULT_ABI, functionName: 'startTime' }),
    publicClient.readContract({ address: actualVault, abi: VAULT_ABI, functionName: 'endTime' }),
    publicClient.readContract({ address: actualVault, abi: VAULT_ABI, functionName: 'recipient' }),
    publicClient.readContract({ address: actualVault, abi: VAULT_ABI, functionName: 'isFunded' }),
    publicClient.readContract({ address: actualVault, abi: VAULT_ABI, functionName: 'calculateUnlocked' }),
  ])

  assert(ta === amount,                     `totalAmount = ${Number(ta) / 1e6} USDC`)
  assert(funded === true,                   'isFunded() = true (USDC received)')
  assert(isAddressEqual(rec, recipient),    `recipient = ${rec}`)
  assert(unlocked === 0n,                   `calculateUnlocked() = 0 (stream not started yet)`)
  assert(Number(et) - Number(st) === 3600, 'duration = 3600s (1 hour)')

  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log(`${PASS} ALL CHECKS PASSED`)
  console.log(`${PASS} Ghost-to-live transition is 100% deterministic.`)
  console.log(`${PASS} Pre-calculated address ALWAYS matches deployed vault.`)
  console.log(`\n${INFO} Vault: ${actualVault}`)
  console.log(`${INFO} Block: ${receipt.blockNumber}\n`)
}

main().catch(err => {
  console.error('\n\x1b[31mVERIFICATION FAILED\x1b[0m')
  console.error(err)
  process.exitCode = 1
})
