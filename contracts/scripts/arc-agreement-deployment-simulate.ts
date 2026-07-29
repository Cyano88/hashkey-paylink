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
const USDC_READ_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const

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
  const network = await provider.getNetwork()
  const [deployerCode, deployerBalance, usdcCode, operatorCode, simulatedRuntime, feeData] = await Promise.all([
    provider.getCode(deployer),
    provider.getBalance(deployer),
    provider.getCode(manifest.network.usdc),
    provider.getCode(manifest.operator),
    provider.call({ from: deployer, data: deploymentData }),
    provider.getFeeData(),
  ])
  const usdc = new Contract(manifest.network.usdc, USDC_READ_ABI, provider)
  const [usdcDecimals, usdcSymbol] = await Promise.all([
    usdc.decimals() as Promise<bigint>,
    usdc.symbol() as Promise<string>,
  ])
  if (usdcDecimals !== 6n || usdcSymbol !== 'USDC') {
    throw new Error('Arc Testnet USDC metadata does not match the reviewed network configuration.')
  }

  let estimatedGas: bigint | null = null
  let estimateError: string | null = null
  try {
    estimatedGas = await provider.estimateGas({ from: deployer, data: deploymentData })
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
    usdcMetadata: { symbol: usdcSymbol, decimals: Number(usdcDecimals) },
    deployerBalanceDisplay: `${formatEther(deployerBalance)} native Arc USDC`,
  }, null, 2))
  if (!result.readyForBroadcastReview) process.exitCode = 2
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Arc Agreement deployment simulation failed.')
  process.exitCode = 1
})
