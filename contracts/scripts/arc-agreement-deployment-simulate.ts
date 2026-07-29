import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  Contract,
  JsonRpcProvider,
  formatEther,
  type FeeData,
} from 'ethers'
import type { ArcAgreementDeploymentManifest } from '../lib/arcAgreementDeploymentManifest'
import {
  assertArcAgreementSimulationManifest,
  buildArcAgreementFactoryDeploymentData,
  evaluateArcAgreementDeploymentSimulation,
} from '../lib/arcAgreementDeploymentSimulation'

const ARC_RPC_URL = 'https://rpc.testnet.arc.network'
const ARC_CHAIN_ID = 5_042_002
const USDC_READ_ABI = ['function decimals() view returns (uint8)'] as const

function required(value: unknown, name: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

function currentSourceCommit() {
  const root = resolve(process.cwd(), '..')
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  if (dirty) throw new Error('Deployment simulation requires a clean source working tree.')
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim().toLowerCase()
}

function safeEstimateError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return message.replace(/\s+/g, ' ').slice(0, 240)
}

function maximumFee(feeData: FeeData) {
  return feeData.maxFeePerGas ?? feeData.gasPrice ?? null
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /-32011|request limit reached|rate limit/i.test(message)
}

async function readWithBoundedRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isRateLimitError(error) || attempt === 2) throw error
      await new Promise(resolveDelay => setTimeout(resolveDelay, 300 * (attempt + 1)))
    }
  }
  throw new Error('Arc RPC read retry exhausted.')
}

async function main() {
  const manifestPath = resolve(
    required(process.env.ARC_AGREEMENT_MANIFEST_PATH, 'ARC_AGREEMENT_MANIFEST_PATH'),
  )
  const deployer = required(
    process.env.ARC_AGREEMENT_DEPLOYER_ADDRESS,
    'ARC_AGREEMENT_DEPLOYER_ADDRESS',
  )
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ArcAgreementDeploymentManifest
  const sourceCommit = currentSourceCommit()
  assertArcAgreementSimulationManifest({
    manifest,
    expectedSourceCommit: sourceCommit,
  })

  const artifact = JSON.parse(readFileSync(resolve(
    process.cwd(),
    'artifacts/contracts/ArcAgreementFactory.sol/ArcAgreementFactory.json',
  ), 'utf8')) as { abi: unknown[]; bytecode: string }
  const deploymentData = await buildArcAgreementFactoryDeploymentData({
    manifest,
    factoryAbi: artifact.abi,
    factoryBytecode: artifact.bytecode,
  })
  const provider = new JsonRpcProvider(ARC_RPC_URL, ARC_CHAIN_ID, {
    staticNetwork: true,
  })
  const network = await readWithBoundedRetry(() => provider.getNetwork())
  const deployerCode = await readWithBoundedRetry(() => provider.getCode(deployer))
  const deployerBalance = await readWithBoundedRetry(() => provider.getBalance(deployer))
  const usdcCode = await readWithBoundedRetry(() => provider.getCode(manifest.network.usdc))
  const operatorCode = deployer.toLowerCase() === manifest.operator.toLowerCase()
    ? deployerCode
    : await readWithBoundedRetry(() => provider.getCode(manifest.operator))
  const simulatedRuntime = await readWithBoundedRetry(
    () => provider.call({ from: deployer, data: deploymentData }),
  )
  const feeData = await readWithBoundedRetry(() => provider.getFeeData())
  const usdc = new Contract(manifest.network.usdc, USDC_READ_ABI, provider)
  const usdcDecimals = await readWithBoundedRetry(() => usdc.decimals() as Promise<bigint>)
  if (usdcDecimals !== 6n) {
    throw new Error('Arc Testnet USDC precision does not match the reviewed network configuration.')
  }

  let estimatedGas: bigint | null = null
  let estimateError: string | null = null
  try {
    estimatedGas = await readWithBoundedRetry(
      () => provider.estimateGas({ from: deployer, data: deploymentData }),
    )
  } catch (error) {
    estimateError = safeEstimateError(error)
  }
  const result = evaluateArcAgreementDeploymentSimulation({
    manifest,
    expectedSourceCommit: sourceCommit,
    chainId: Number(network.chainId),
    deployer,
    deployerCode,
    deployerBalance,
    usdcCode,
    operatorCode,
    deploymentData,
    simulatedRuntime,
    estimatedGas,
    maxFeePerGas: maximumFee(feeData),
    estimateError,
  })
  console.log(JSON.stringify({
    ...result,
    rpcUrl: ARC_RPC_URL,
    usdcMetadata: { decimals: Number(usdcDecimals) },
    deployerBalanceDisplay: `${formatEther(deployerBalance)} native Arc USDC`,
  }, null, 2))
  if (!result.readyForBroadcastReview) process.exitCode = 2
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Arc Agreement deployment simulation failed.')
  process.exitCode = 1
})
