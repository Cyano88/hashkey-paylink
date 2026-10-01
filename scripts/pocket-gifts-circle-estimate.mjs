// Read-only Circle estimate. Never signs, deploys, changes policies or enables gifts.
// Run on the backend host so credentials never leave the existing environment.
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
const root = new URL('../', import.meta.url)
const plan = JSON.parse(await readFile(new URL('contracts/pocket-gift-base-plan.json', root), 'utf8'))
const artifact = JSON.parse(await readFile(process.argv[2] || new URL('contracts/artifacts-gifts/contracts/gifts/PocketGiftEscrow.sol/PocketGiftEscrow.json', root), 'utf8'))
if (plan.status !== 'deployment-plan-only' || plan.chainId !== 8453 || plan.network !== 'base' || plan.platformFeeBps !== 25 || plan.token !== '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' || plan.treasury !== '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753') throw Error('Unexpected deployment plan')
const constructor = artifact.abi?.find(entry => entry.type === 'constructor')
if (artifact.contractName !== plan.contractName || !/^0x[0-9a-fA-F]+$/.test(artifact.bytecode) || constructor?.inputs?.map(input => input.type).join(',') !== 'address,address') throw Error('Unexpected contract artifact')
const bytecodeSha256 = createHash('sha256').update(Buffer.from(artifact.bytecode.slice(2), 'hex')).digest('hex')
if (bytecodeSha256 !== plan.bytecodeSha256) throw Error('Contract bytecode differs from the pinned deployment plan')
const apiKey = process.env.CIRCLE_API_KEY
const walletId = process.env.POCKET_BILLS_TREASURY_WALLET_ID
const expectedDeployer = process.env.POCKET_BILLS_TREASURY_ADDRESS
const expectedWalletSet = process.env.POCKET_BILLS_TREASURY_WALLET_SET_ID
if (!apiKey || !walletId || !expectedDeployer || !expectedWalletSet) throw Error('Circle deployment wallet configuration missing')
async function request(path, body) {
  const response = await fetch('https://api.circle.com' + path, {
    method: body ? 'POST' : 'GET',
    headers: {Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(25000),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw Error(`Circle read-only check failed: HTTP ${response.status}, code ${Number(json.code) || 'unknown'}`)
  return json.data
}
const wallet = (await request('/v1/w3s/wallets/' + encodeURIComponent(walletId)))?.wallet
if (wallet?.blockchain !== 'BASE' || wallet.accountType !== 'SCA' || wallet.state !== 'LIVE' || wallet.address?.toLowerCase() !== expectedDeployer.toLowerCase() || wallet.walletSetId !== expectedWalletSet) throw Error('Base deployment wallet did not match configured live SCA')
const estimate = await request('/v1/w3s/contracts/deploy/estimateFee', {
  walletId, bytecode: artifact.bytecode, constructorSignature: 'constructor(address,address)',
  constructorParameters: [plan.token, plan.treasury],
})
console.log(JSON.stringify({network: plan.network, treasury: plan.treasury, platformFeeBps: plan.platformFeeBps,
  bytecodeSha256,
  verifiedLiveBaseSca: true, estimate, sponsorshipConfirmed: false, transactionSubmitted: false}, null, 2))
