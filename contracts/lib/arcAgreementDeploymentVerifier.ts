import {
  AbiCoder,
  Contract,
  getAddress,
  isAddress,
  keccak256,
  type Provider,
  type TransactionReceipt,
  type TransactionResponse,
} from 'ethers'
import { buildArcAgreementDeploymentManifest } from './arcAgreementDeploymentManifest'

const TX_HASH = /^0x[0-9a-f]{64}$/i
const FULL_COMMIT = /^[0-9a-f]{40}$/i
const ARC_EXPLORER_API = 'https://testnet.arcscan.app/api/v2'
const verifiedExplorerProofs = new WeakSet<object>()
const FACTORY_READ_ABI = [
  'function usdc() view returns (address)',
  'function operator() view returns (address)',
] as const

export type ArcAgreementDeploymentManifest = ReturnType<typeof buildArcAgreementDeploymentManifest>

export type ArcAgreementExplorerVerification = Readonly<{
  verified: true
  fullyVerified: true
  changedBytecode: false
  factoryAddress: string
  sourceName: string
  contractName: string
  compilerVersion: string
  optimizerEnabled: boolean
  optimizerRuns: number
  constructorArguments: string
}>

export type ArcAgreementDeploymentObservations = Readonly<{
  chainId: number
  headBlock: number
  factoryAddress: string
  runtimeBytecode: string
  factoryUsdc: string
  factoryOperator: string
  deploymentTransaction: Readonly<{
    hash: string
    to: string | null
    data: string
    blockNumber: number | null
  }>
  deploymentReceipt: Readonly<{
    hash: string
    status: number | null
    contractAddress: string | null
    blockNumber: number
  }>
  explorer: ArcAgreementExplorerVerification
}>

function requiredAddress(value: unknown, label: string) {
  const address = String(value ?? '').trim()
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) throw new Error(`${label} is invalid.`)
  return getAddress(address)
}

function requiredHex(value: unknown, label: string) {
  const raw = String(value ?? '').trim()
  const hex = /^[0-9a-f]+$/i.test(raw) ? `0x${raw}` : raw
  if (!/^0x(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error(`${label} is invalid.`)
  return hex
}

function normalizedCompilerVersion(value: unknown) {
  const version = String(value ?? '').trim()
  if (!/^v?0\.8\.24(?:\+commit\.[0-9a-f]{8})?$/i.test(version)) {
    throw new Error('Explorer compiler version does not match the approved manifest.')
  }
  return version
}

function assertExactManifest(manifest: ArcAgreementDeploymentManifest, expectedSourceCommit: string) {
  if (!FULL_COMMIT.test(expectedSourceCommit)) {
    throw new Error('Expected source commit must be a full Git commit.')
  }
  if (manifest.sourceCommit.toLowerCase() !== expectedSourceCommit.toLowerCase()) {
    throw new Error('Deployment manifest source commit does not match the reviewed source.')
  }
  const rebuilt = buildArcAgreementDeploymentManifest({
    operator: manifest.operator,
    sourceCommit: manifest.sourceCommit,
  })
  if (JSON.stringify(rebuilt) !== JSON.stringify(manifest)) {
    throw new Error('Deployment manifest does not match the current reviewed artifacts.')
  }
  if (manifest.schemaVersion !== 2 || manifest.broadcastAllowed !== false) {
    throw new Error('Deployment manifest safety boundary is invalid.')
  }
  return rebuilt
}

function assertExplorerVerification(
  manifest: ArcAgreementDeploymentManifest,
  explorer: ArcAgreementExplorerVerification,
  factoryAddress: string,
) {
  if (!explorer || !verifiedExplorerProofs.has(explorer)) {
    throw new Error('Arc explorer verification was not obtained from the verified read boundary.')
  }
  if (explorer.verified !== true || explorer.fullyVerified !== true || explorer.changedBytecode !== false) {
    throw new Error('Arc explorer full source verification is required.')
  }
  if (requiredAddress(explorer.factoryAddress, 'Explorer factory address') !== factoryAddress) {
    throw new Error('Explorer verification is for a different factory.')
  }
  if (explorer.sourceName !== manifest.contracts.factory.sourceName
    || explorer.contractName !== manifest.contracts.factory.contractName) {
    throw new Error('Explorer source identity does not match the approved manifest.')
  }
  normalizedCompilerVersion(explorer.compilerVersion)
  if (explorer.optimizerEnabled !== manifest.compiler.optimizerEnabled
    || explorer.optimizerRuns !== manifest.compiler.optimizerRuns) {
    throw new Error('Explorer optimizer settings do not match the approved manifest.')
  }
  const constructorArguments = requiredHex(explorer.constructorArguments, 'Explorer constructor arguments')
  const expectedArguments = AbiCoder.defaultAbiCoder().encode(
    ['address', 'address'],
    [manifest.contracts.factory.constructor.usdc, manifest.contracts.factory.constructor.operator],
  )
  if (constructorArguments.toLowerCase() !== expectedArguments.toLowerCase()) {
    throw new Error('Explorer constructor arguments do not match the approved manifest.')
  }
}

export function verifyArcAgreementExplorerResponse(input: {
  factoryAddress: unknown
  response: unknown
}): ArcAgreementExplorerVerification {
  const factoryAddress = requiredAddress(input.factoryAddress, 'Explorer factory address')
  const body = input.response as {
    is_verified?: unknown
    is_fully_verified?: unknown
    is_changed_bytecode?: unknown
    name?: unknown
    file_path?: unknown
    compiler_version?: unknown
    optimization_enabled?: unknown
    optimizations_runs?: unknown
    constructor_args?: unknown
    compiler_settings?: {
      optimizer?: { enabled?: unknown; runs?: unknown }
    }
  }
  if (body?.is_verified !== true || body?.is_fully_verified !== true) {
    throw new Error('Arc explorer has not fully verified the factory source.')
  }
  if (body.is_changed_bytecode !== false) {
    throw new Error('Arc explorer reports changed or ambiguous deployed bytecode.')
  }
  const contractName = String(body.name ?? '').trim()
  const sourceName = String(body.file_path ?? '').trim().replace(/\\/g, '/')
  if (!contractName || !sourceName) throw new Error('Arc explorer source identity is missing.')
  const compilerVersion = normalizedCompilerVersion(body.compiler_version)
  const topOptimizerEnabled = body.optimization_enabled
  const settingsOptimizerEnabled = body.compiler_settings?.optimizer?.enabled
  if (typeof topOptimizerEnabled === 'boolean'
    && typeof settingsOptimizerEnabled === 'boolean'
    && topOptimizerEnabled !== settingsOptimizerEnabled) {
    throw new Error('Arc explorer returned conflicting optimizer settings.')
  }
  const optimizerEnabledValue = topOptimizerEnabled ?? settingsOptimizerEnabled
  if (typeof optimizerEnabledValue !== 'boolean') {
    throw new Error('Arc explorer optimizer settings are invalid.')
  }
  const topOptimizerRuns = body.optimizations_runs
  const settingsOptimizerRuns = body.compiler_settings?.optimizer?.runs
  if (topOptimizerRuns !== undefined
    && settingsOptimizerRuns !== undefined
    && Number(topOptimizerRuns) !== Number(settingsOptimizerRuns)) {
    throw new Error('Arc explorer returned conflicting optimizer runs.')
  }
  const optimizerEnabled = optimizerEnabledValue
  const optimizerRuns = Number(topOptimizerRuns ?? settingsOptimizerRuns)
  if (!Number.isSafeInteger(optimizerRuns) || optimizerRuns < 0) {
    throw new Error('Arc explorer optimizer settings are invalid.')
  }
  const constructorArguments = requiredHex(body.constructor_args, 'Explorer constructor arguments')
  const proof: ArcAgreementExplorerVerification = {
    verified: true,
    fullyVerified: true,
    changedBytecode: false,
    factoryAddress,
    sourceName,
    contractName,
    compilerVersion,
    optimizerEnabled,
    optimizerRuns,
    constructorArguments,
  }
  verifiedExplorerProofs.add(proof)
  return Object.freeze(proof)
}

export async function fetchArcAgreementExplorerVerification(input: {
  factoryAddress: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}) {
  const factoryAddress = requiredAddress(input.factoryAddress, 'Explorer factory address')
  const timeoutMs = Number(input.timeoutMs ?? 10_000)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error('Arc explorer verification timeout is invalid.')
  }
  const response = await (input.fetchImpl ?? fetch)(
    `${ARC_EXPLORER_API}/smart-contracts/${encodeURIComponent(factoryAddress)}`,
    {
      method: 'GET',
      redirect: 'error',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    },
  )
  if (!response.ok) {
    if (response.status === 404) throw new Error('Arc explorer has not indexed the factory contract.')
    throw new Error(`Arc explorer verification failed with HTTP ${response.status}.`)
  }
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new Error('Arc explorer verification returned invalid JSON.')
  }
  return verifyArcAgreementExplorerResponse({ factoryAddress, response: body })
}

export function verifyArcAgreementDeployment(input: {
  manifest: ArcAgreementDeploymentManifest
  expectedSourceCommit: string
  minimumConfirmations: number
  observations: ArcAgreementDeploymentObservations
}) {
  const manifest = assertExactManifest(input.manifest, input.expectedSourceCommit)
  if (!Number.isInteger(input.minimumConfirmations)
    || input.minimumConfirmations < 1
    || input.minimumConfirmations > 128) {
    throw new Error('Deployment confirmation requirement must be from 1 to 128 blocks.')
  }
  const observations = input.observations
  if (observations.chainId !== manifest.network.chainId) {
    throw new Error('Deployment is not on the approved Arc Testnet chain.')
  }
  const factoryAddress = requiredAddress(observations.factoryAddress, 'Deployed factory address')
  const runtimeBytecode = requiredHex(observations.runtimeBytecode, 'Deployed factory runtime bytecode')
  if (keccak256(runtimeBytecode) !== manifest.contracts.factory.runtimeExpectedHash) {
    throw new Error('Deployed factory runtime bytecode does not match the approved manifest.')
  }
  if (requiredAddress(observations.factoryUsdc, 'Deployed factory USDC') !== manifest.network.usdc) {
    throw new Error('Deployed factory does not use official Arc Testnet USDC.')
  }
  if (requiredAddress(observations.factoryOperator, 'Deployed factory operator') !== manifest.operator) {
    throw new Error('Deployed factory operator does not match the approved manifest.')
  }

  const transaction = observations.deploymentTransaction
  if (!TX_HASH.test(transaction.hash)) throw new Error('Deployment transaction hash is invalid.')
  if (transaction.to !== null) throw new Error('Deployment transaction is not contract creation.')
  if (keccak256(requiredHex(transaction.data, 'Deployment transaction data'))
    !== manifest.contracts.factory.deployDataHash) {
    throw new Error('Deployment transaction data does not match the approved manifest.')
  }
  if (!Number.isSafeInteger(transaction.blockNumber) || Number(transaction.blockNumber) < 0) {
    throw new Error('Deployment transaction is not mined.')
  }

  const receipt = observations.deploymentReceipt
  if (receipt.hash.toLowerCase() !== transaction.hash.toLowerCase()) {
    throw new Error('Deployment receipt does not match the deployment transaction.')
  }
  if (receipt.status !== 1) throw new Error('Deployment transaction did not succeed.')
  if (requiredAddress(receipt.contractAddress, 'Deployment receipt contract') !== factoryAddress) {
    throw new Error('Deployment receipt contract does not match the configured factory.')
  }
  if (receipt.blockNumber !== transaction.blockNumber) {
    throw new Error('Deployment transaction and receipt block numbers do not match.')
  }
  if (!Number.isSafeInteger(observations.headBlock) || observations.headBlock < receipt.blockNumber) {
    throw new Error('Arc head block is invalid.')
  }
  const confirmations = observations.headBlock - receipt.blockNumber + 1
  if (confirmations < input.minimumConfirmations) {
    throw new Error(`Deployment has ${confirmations} confirmations; ${input.minimumConfirmations} required.`)
  }

  assertExplorerVerification(manifest, observations.explorer, factoryAddress)

  return Object.freeze({
    verified: true,
    technicalVerificationPassed: true,
    activationAuthorized: false,
    chainId: manifest.network.chainId,
    factoryAddress,
    operator: manifest.operator,
    usdc: manifest.network.usdc,
    deploymentTransactionHash: transaction.hash,
    deploymentBlock: receipt.blockNumber,
    confirmations,
    runtimeBytecodeHash: manifest.contracts.factory.runtimeExpectedHash,
    manifestCommitment: manifest.manifestCommitment,
    sourceCommit: manifest.sourceCommit,
    explorerVerified: true,
    remainingApprovalGates: Object.freeze([
      'independent-contract-review',
      'managed-operator-wallet-ownership',
      'explicit-deployment-acceptance',
      'activation-change-review',
    ]),
  })
}

export async function readArcAgreementDeploymentObservations(input: {
  provider: Provider
  factoryAddress: string
  deploymentTransactionHash: string
  explorer: ArcAgreementExplorerVerification
}): Promise<ArcAgreementDeploymentObservations> {
  const factoryAddress = requiredAddress(input.factoryAddress, 'Deployed factory address')
  if (!TX_HASH.test(input.deploymentTransactionHash)) throw new Error('Deployment transaction hash is invalid.')
  const [network, headBlock, runtimeBytecode, transaction, receipt] = await Promise.all([
    input.provider.getNetwork(),
    input.provider.getBlockNumber(),
    input.provider.getCode(factoryAddress),
    input.provider.getTransaction(input.deploymentTransactionHash),
    input.provider.getTransactionReceipt(input.deploymentTransactionHash),
  ])
  if (!transaction || !receipt) throw new Error('Deployment transaction or receipt was not found.')
  const factory = new Contract(factoryAddress, FACTORY_READ_ABI, input.provider)
  const [factoryUsdc, factoryOperator] = await Promise.all([factory.usdc(), factory.operator()])
  return {
    chainId: Number(network.chainId),
    headBlock,
    factoryAddress,
    runtimeBytecode,
    factoryUsdc: String(factoryUsdc),
    factoryOperator: String(factoryOperator),
    deploymentTransaction: transactionObservation(transaction),
    deploymentReceipt: receiptObservation(receipt),
    explorer: input.explorer,
  }
}

function transactionObservation(transaction: TransactionResponse) {
  return {
    hash: transaction.hash,
    to: transaction.to,
    data: transaction.data,
    blockNumber: transaction.blockNumber,
  }
}

function receiptObservation(receipt: TransactionReceipt) {
  return {
    hash: receipt.hash,
    status: receipt.status,
    contractAddress: receipt.contractAddress,
    blockNumber: receipt.blockNumber,
  }
}
