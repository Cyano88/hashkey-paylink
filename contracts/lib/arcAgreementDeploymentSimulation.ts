import {
  ContractFactory,
  getAddress,
  isAddress,
  keccak256,
} from 'ethers'
import {
  buildArcAgreementDeploymentManifest,
  type ArcAgreementDeploymentManifest,
} from './arcAgreementDeploymentManifest'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const EMPTY_CODE = '0x'
const FULL_COMMIT = /^[0-9a-f]{40}$/

function requiredAddress(value: unknown, label: string) {
  const address = String(value ?? '').trim()
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) {
    throw new Error(`${label} must be a non-zero EVM address.`)
  }
  return getAddress(address)
}

function requiredHex(value: unknown, label: string, allowEmpty = false) {
  const hex = String(value ?? '').trim()
  const pattern = allowEmpty ? /^0x(?:[0-9a-f]{2})*$/i : /^0x(?:[0-9a-f]{2})+$/i
  if (!pattern.test(hex)) throw new Error(`${label} is invalid.`)
  return hex
}

export function assertArcAgreementSimulationManifest(input: {
  manifest: ArcAgreementDeploymentManifest
  expectedSourceCommit: string
}) {
  const expectedSourceCommit = String(input.expectedSourceCommit ?? '').trim().toLowerCase()
  if (!FULL_COMMIT.test(expectedSourceCommit)) {
    throw new Error('Simulation requires the exact full source commit.')
  }
  if (input.manifest.sourceCommit !== expectedSourceCommit) {
    throw new Error('Deployment manifest source commit does not match the clean source tree.')
  }
  const exact = buildArcAgreementDeploymentManifest({
    operator: input.manifest.operator,
    sourceCommit: expectedSourceCommit,
  })
  if (JSON.stringify(input.manifest) !== JSON.stringify(exact)) {
    throw new Error('Deployment manifest does not match the reviewed compiler artifacts.')
  }
  if (exact.broadcastAllowed !== false || exact.status !== 'candidate-not-approved') {
    throw new Error('Deployment manifest safety boundary is invalid.')
  }
  return exact
}

export function buildArcAgreementFactoryDeploymentData(input: {
  manifest: ArcAgreementDeploymentManifest
  factoryAbi: unknown[]
  factoryBytecode: string
}) {
  const factory = new ContractFactory(input.factoryAbi, input.factoryBytecode)
  return factory.getDeployTransaction(
    input.manifest.contracts.factory.constructor.usdc,
    input.manifest.contracts.factory.constructor.operator,
  ).then(transaction => {
    const data = requiredHex(transaction.data, 'Factory deployment data')
    if (keccak256(data) !== input.manifest.contracts.factory.deployDataHash) {
      throw new Error('Factory deployment data does not match the reviewed manifest.')
    }
    return data
  })
}
export function evaluateArcAgreementDeploymentSimulation(input: {
  manifest: ArcAgreementDeploymentManifest
  expectedSourceCommit: string
  chainId: number
  deployer: unknown
  deployerCode: unknown
  deployerBalance: bigint
  usdcCode: unknown
  operatorCode: unknown
  deploymentData: unknown
  simulatedRuntime: unknown
  estimatedGas: bigint | null
  maxFeePerGas: bigint | null
  estimateError?: string | null
}) {
  const manifest = assertArcAgreementSimulationManifest({
    manifest: input.manifest,
    expectedSourceCommit: input.expectedSourceCommit,
  })
  if (input.chainId !== ARC_TESTNET_CHAIN_ID || input.chainId !== manifest.network.chainId) {
    throw new Error('Simulation provider is not Arc Testnet.')
  }
  const deployer = requiredAddress(input.deployer, 'Deployer')
  const deployerCode = requiredHex(input.deployerCode, 'Deployer code', true)
  if (deployerCode !== EMPTY_CODE) throw new Error('Deployment simulation requires an EOA deployer.')
  const usdcCode = requiredHex(input.usdcCode, 'Arc USDC code', true)
  if (usdcCode === EMPTY_CODE) throw new Error('Official Arc USDC code is missing.')
  const operatorCode = requiredHex(input.operatorCode, 'Operator code', true)
  if (operatorCode !== EMPTY_CODE) throw new Error('The reviewed Circle operator must remain an EOA.')
  const deploymentData = requiredHex(input.deploymentData, 'Factory deployment data')
  if (keccak256(deploymentData) !== manifest.contracts.factory.deployDataHash) {
    throw new Error('Factory deployment data does not match the reviewed manifest.')
  }
  const simulatedRuntime = requiredHex(input.simulatedRuntime, 'Simulated factory runtime')
  if (keccak256(simulatedRuntime) !== manifest.contracts.factory.runtimeExpectedHash) {
    throw new Error('Simulated factory runtime does not match the reviewed manifest.')
  }
  if (input.deployerBalance < 0n) throw new Error('Deployer balance is invalid.')
  if (input.estimatedGas !== null && input.estimatedGas <= 0n) {
    throw new Error('Estimated deployment gas is invalid.')
  }
  if (input.maxFeePerGas !== null && input.maxFeePerGas < 0n) {
    throw new Error('Maximum gas fee is invalid.')
  }
  const maximumEstimatedCost = input.estimatedGas !== null && input.maxFeePerGas !== null
    ? input.estimatedGas * input.maxFeePerGas
    : null
  const fundingReady = maximumEstimatedCost !== null
    && input.deployerBalance >= maximumEstimatedCost
  const estimateAvailable = input.estimatedGas !== null

  return Object.freeze({
    ok: true,
    mode: 'read-only-constructor-simulation',
    sourceCommit: manifest.sourceCommit,
    manifestCommitment: manifest.manifestCommitment,
    chainId: input.chainId,
    deployer,
    operator: manifest.operator,
    usdc: manifest.network.usdc,
    deploymentDataHash: keccak256(deploymentData),
    simulatedRuntimeHash: keccak256(simulatedRuntime),
    estimatedGas: input.estimatedGas?.toString() ?? null,
    maxFeePerGas: input.maxFeePerGas?.toString() ?? null,
    maximumEstimatedCost: maximumEstimatedCost?.toString() ?? null,
    deployerBalance: input.deployerBalance.toString(),
    estimateAvailable,
    fundingReady,
    readyForBroadcastReview: estimateAvailable && fundingReady,
    estimateError: input.estimateError?.trim().slice(0, 240) || null,
    authorization: Object.freeze({
      sign: false,
      deploy: false,
      broadcast: false,
      activate: false,
    }),
  })
}
