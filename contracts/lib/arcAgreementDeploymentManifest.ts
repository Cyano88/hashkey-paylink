import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AbiCoder, concat, getAddress, isAddress, keccak256, toUtf8Bytes } from 'ethers'

const OFFICIAL_ARC_USDC = '0x3600000000000000000000000000000000000000'

type Artifact = {
  contractName: string
  sourceName: string
  abi: unknown[]
  bytecode: string
  deployedBytecode: string
}

type ImmutableReference = { start: number; length: number }

type BuildInfo = {
  input: {
    sources: Record<string, { content: string }>
  }
  output: {
    contracts: Record<string, Record<string, {
      evm: { deployedBytecode: { immutableReferences: Record<string, ImmutableReference[]> } }
    }>>
    sources: Record<string, { ast: unknown }>
  }
}

function artifact(relativePath: string): Artifact {
  return JSON.parse(readFileSync(resolve(process.cwd(), relativePath), 'utf8')) as Artifact
}

function buildInfo(relativeArtifactPath: string): BuildInfo {
  const artifactPath = resolve(process.cwd(), relativeArtifactPath)
  const debugPath = artifactPath.replace(/\.json$/i, '.dbg.json')
  const debug = JSON.parse(readFileSync(debugPath, 'utf8')) as { buildInfo?: unknown }
  const relativeBuildInfo = String(debug.buildInfo ?? '').trim()
  if (!relativeBuildInfo) throw new Error('Contract debug artifact does not reference compiler build info.')
  const info = JSON.parse(readFileSync(resolve(debugPath, '..', relativeBuildInfo), 'utf8')) as BuildInfo
  for (const [sourceName, source] of Object.entries(info.input.sources)) {
    const sourcePath = sourceName.startsWith('@')
      ? resolve(process.cwd(), 'node_modules', sourceName)
      : resolve(process.cwd(), sourceName)
    let currentSource: string
    try {
      currentSource = readFileSync(sourcePath, 'utf8')
    } catch {
      throw new Error(`Compiler build source is missing: ${sourceName}.`)
    }
    if (currentSource !== source.content) {
      throw new Error(`Compiler artifact is stale for source: ${sourceName}.`)
    }
  }
  return info
}

function astVariableNames(ast: unknown) {
  const names = new Map<string, string>()
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return
    const node = value as { id?: unknown; nodeType?: unknown; name?: unknown }
    if (node.nodeType === 'VariableDeclaration' && Number.isInteger(node.id) && typeof node.name === 'string') {
      names.set(String(node.id), node.name)
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(ast)
  return names
}

function addressWord(value: string) {
  return getAddress(value).slice(2).toLowerCase().padStart(64, '0')
}

function expectedRuntimeBytecode(input: {
  relativeArtifactPath: string
  artifact: Artifact
  immutableValues: Record<string, string>
}) {
  const info = buildInfo(input.relativeArtifactPath)
  const compiled = info.output.contracts[input.artifact.sourceName]?.[input.artifact.contractName]
  const source = info.output.sources[input.artifact.sourceName]
  if (!compiled || !source) throw new Error('Compiler build info does not match the contract artifact.')
  const variableNames = astVariableNames(source.ast)
  let runtime = input.artifact.deployedBytecode
  for (const [astId, references] of Object.entries(compiled.evm.deployedBytecode.immutableReferences)) {
    const name = variableNames.get(astId)
    const immutableValue = name ? input.immutableValues[name] : undefined
    if (!name || !immutableValue) throw new Error(`Unsupported immutable runtime reference ${astId}.`)
    const encoded = addressWord(immutableValue)
    for (const reference of references) {
      if (reference.length !== 32 || !Number.isInteger(reference.start) || reference.start < 0) {
        throw new Error(`Invalid immutable runtime reference for ${name}.`)
      }
      const start = 2 + reference.start * 2
      const end = start + reference.length * 2
      if (end > runtime.length) throw new Error(`Immutable runtime reference for ${name} exceeds bytecode.`)
      runtime = `${runtime.slice(0, start)}${encoded}${runtime.slice(end)}`
    }
  }
  return runtime
}

function byteLength(bytecode: string) {
  if (!/^0x(?:[0-9a-f]{2})*$/i.test(bytecode)) throw new Error('Contract artifact contains invalid bytecode.')
  return (bytecode.length - 2) / 2
}

export function buildArcAgreementDeploymentManifest(input: {
  operator: string
  sourceCommit: string
}) {
  if (!isAddress(input.operator) || /^0x0{40}$/i.test(input.operator)) throw new Error('Operator must be a non-zero EVM address.')
  const operator = getAddress(input.operator)
  const usdc = getAddress(OFFICIAL_ARC_USDC)
  if (operator === usdc) throw new Error('Operator cannot be the Arc USDC contract.')
  const sourceCommit = String(input.sourceCommit ?? '').trim()
  if (!/^(?:[0-9a-f]{40}|LOCAL_UNCOMMITTED)$/i.test(sourceCommit)) {
    throw new Error('sourceCommit must be a full Git commit or LOCAL_UNCOMMITTED.')
  }

  const escrow = artifact('artifacts/contracts/ArcAgreementEscrow.sol/ArcAgreementEscrow.json')
  const factoryArtifactPath = 'artifacts/contracts/ArcAgreementFactory.sol/ArcAgreementFactory.json'
  const factory = artifact(factoryArtifactPath)
  const constructorArgs = AbiCoder.defaultAbiCoder().encode(['address', 'address'], [usdc, operator])
  const factoryDeployData = concat([factory.bytecode, constructorArgs])
  const factoryRuntime = expectedRuntimeBytecode({
    relativeArtifactPath: factoryArtifactPath,
    artifact: factory,
    immutableValues: { usdc, operator },
  })
  const canonical = JSON.stringify([
    2,
    5_042_002,
    usdc,
    operator,
    sourceCommit,
    keccak256(escrow.bytecode),
    keccak256(escrow.deployedBytecode),
    keccak256(factory.bytecode),
    keccak256(factory.deployedBytecode),
    keccak256(factoryRuntime),
    keccak256(factoryDeployData),
  ])

  return {
    schemaVersion: 2,
    status: 'candidate-not-approved',
    broadcastAllowed: false,
    network: {
      name: 'Arc Testnet',
      chainId: 5_042_002,
      circleDomain: 26,
      rpcUrl: 'https://rpc.testnet.arc.network',
      explorerUrl: 'https://testnet.arcscan.app',
      usdc,
    },
    operator,
    sourceCommit,
    compiler: { solc: '0.8.24', optimizerEnabled: true, optimizerRuns: 200 },
    contracts: {
      escrow: {
        sourceName: escrow.sourceName,
        contractName: escrow.contractName,
        creationBytecodeHash: keccak256(escrow.bytecode),
        runtimeTemplateHash: keccak256(escrow.deployedBytecode),
        creationBytes: byteLength(escrow.bytecode),
        runtimeTemplateBytes: byteLength(escrow.deployedBytecode),
      },
      factory: {
        sourceName: factory.sourceName,
        contractName: factory.contractName,
        creationBytecodeHash: keccak256(factory.bytecode),
        runtimeTemplateHash: keccak256(factory.deployedBytecode),
        runtimeExpectedHash: keccak256(factoryRuntime),
        creationBytes: byteLength(factory.bytecode),
        runtimeTemplateBytes: byteLength(factory.deployedBytecode),
        constructor: { usdc, operator },
        deployDataHash: keccak256(factoryDeployData),
      },
    },
    manifestCommitment: keccak256(toUtf8Bytes(canonical)),
    requiredApprovals: [
      'independent-contract-review',
      'managed-operator-wallet-ownership',
      'source-commit-clean',
      'arc-explorer-verification',
    ],
  }
}

export type ArcAgreementDeploymentManifest = ReturnType<typeof buildArcAgreementDeploymentManifest>
