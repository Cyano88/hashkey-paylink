import { readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { keccak256, toUtf8Bytes } from 'ethers'
import {
  buildArcAgreementDeploymentManifest,
  type ArcAgreementDeploymentManifest,
} from './arcAgreementDeploymentManifest'

type EvidenceDefinition = {
  id: string
  path: string
}

export type ArcAgreementReviewEvidence = EvidenceDefinition & {
  contentHash: string
}

export type ArcAgreementReviewBundle = ReturnType<typeof buildArcAgreementReviewBundle>

const EVIDENCE: readonly EvidenceDefinition[] = [
  { id: 'escrow-source', path: 'contracts/ArcAgreementEscrow.sol' },
  { id: 'factory-source', path: 'contracts/ArcAgreementFactory.sol' },
  { id: 'fee-on-transfer-test-token', path: 'contracts/test/MockFeeOnTransferERC20.sol' },
  { id: 'hardhat-config', path: 'hardhat.config.ts' },
  { id: 'deployment-manifest-code', path: 'lib/arcAgreementDeploymentManifest.ts' },
  { id: 'deployment-verifier-code', path: 'lib/arcAgreementDeploymentVerifier.ts' },
  { id: 'review-bundle-code', path: 'lib/arcAgreementReviewBundle.ts' },
  { id: 'escrow-tests', path: 'test/ArcAgreementEscrow.test.ts' },
  { id: 'invariant-tests', path: 'test/ArcAgreementInvariant.test.ts' },
  { id: 'deployment-plan-tests', path: 'test/ArcAgreementDeploymentPlan.test.ts' },
  { id: 'deployment-verifier-tests', path: 'test/ArcAgreementDeploymentVerifier.test.ts' },
  { id: 'review-bundle-tests', path: 'test/ArcAgreementReviewBundle.test.ts' },
  { id: 'escrow-artifact', path: 'artifacts/contracts/ArcAgreementEscrow.sol/ArcAgreementEscrow.json' },
  { id: 'factory-artifact', path: 'artifacts/contracts/ArcAgreementFactory.sol/ArcAgreementFactory.json' },
  { id: 'factory-debug', path: 'artifacts/contracts/ArcAgreementFactory.sol/ArcAgreementFactory.dbg.json' },
  { id: 'contracts-dependency-lock', path: 'package-lock.json' },
  { id: 'application-dependency-lock', path: '../package-lock.json' },
  { id: 'architecture', path: '../docs/arc-agreements-architecture.md' },
  { id: 'threat-model', path: '../docs/arc-agreements-threat-model.md' },
  { id: 'operator-policy', path: '../docs/arc-agreement-operator-policy.md' },
  { id: 'deployment-runbook', path: '../docs/arc-agreement-deployment-runbook.md' },
] as const

function readEvidence(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

export function validateArcAgreementReviewGitState(input: {
  porcelainStatus: string
  headCommit: string
  manifestSourceCommit: string
}) {
  if (input.porcelainStatus.trim().length > 0) {
    throw new Error('Review bundle requires a clean working tree.')
  }
  const headCommit = input.headCommit.trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(headCommit)) {
    throw new Error('Unable to resolve the full Git source commit.')
  }
  if (input.manifestSourceCommit !== headCommit) {
    throw new Error('Deployment manifest source commit does not match the clean working tree.')
  }
  return headCommit
}

function exactManifest(input: ArcAgreementDeploymentManifest) {
  if (input.schemaVersion !== 2) throw new Error('Review requires a schema-v2 deployment manifest.')
  if (!/^[0-9a-f]{40}$/.test(input.sourceCommit)) {
    throw new Error('Review requires the exact lowercase full Git source commit.')
  }
  const rebuilt = buildArcAgreementDeploymentManifest({
    operator: input.operator,
    sourceCommit: input.sourceCommit,
  })
  if (JSON.stringify(input) !== JSON.stringify(rebuilt)) {
    throw new Error('Deployment manifest does not exactly match the current compiler artifacts and source commit.')
  }
  return rebuilt
}

function evidenceDefinitions(reader: (path: string) => string) {
  const debugPath = 'artifacts/contracts/ArcAgreementFactory.sol/ArcAgreementFactory.dbg.json'
  let buildInfoReference: unknown
  try {
    buildInfoReference = (JSON.parse(reader(debugPath)) as { buildInfo?: unknown }).buildInfo
  } catch {
    throw new Error('Factory compiler debug artifact is invalid.')
  }
  if (typeof buildInfoReference !== 'string' || buildInfoReference.trim().length === 0) {
    throw new Error('Factory compiler debug artifact does not reference build info.')
  }
  const root = resolve(process.cwd())
  const buildInfoAbsolute = resolve(root, dirname(debugPath), buildInfoReference)
  const allowedBuildInfoRoot = resolve(root, 'artifacts/build-info')
  if (
    buildInfoAbsolute !== allowedBuildInfoRoot
    && !buildInfoAbsolute.startsWith(`${allowedBuildInfoRoot}\\`)
    && !buildInfoAbsolute.startsWith(`${allowedBuildInfoRoot}/`)
  ) {
    throw new Error('Factory compiler build info must remain inside artifacts/build-info.')
  }
  const buildInfoPath = relative(root, buildInfoAbsolute).replace(/\\/g, '/')
  return [...EVIDENCE, { id: 'factory-build-info', path: buildInfoPath }]
}

export function buildArcAgreementReviewBundle(input: {
  manifest: ArcAgreementDeploymentManifest
  readText?: (path: string) => string
}) {
  const manifest = exactManifest(input.manifest)
  const reader = input.readText ?? readEvidence
  const evidence: ArcAgreementReviewEvidence[] = evidenceDefinitions(reader).map(item => {
    const content = reader(item.path)
    if (typeof content !== 'string' || content.length === 0) {
      throw new Error(`Review evidence is missing or empty: ${item.path}.`)
    }
    return {
      ...item,
      contentHash: keccak256(toUtf8Bytes(content)),
    }
  })
  const requiredChecks = [
    'independent-contract-security-review',
    'fund-conservation-and-terminal-state-tests',
    'official-arc-usdc-and-network-verification',
    'managed-operator-wallet-ownership',
    'clean-source-commit-and-reproducible-build',
    'deployment-simulation-and-constructor-review',
    'confirmed-chain-and-explorer-reconciliation',
    'webhook-idempotency-retry-and-dead-letter-test',
  ] as const
  const requiredCommands = [
    'npm run test:arc-agreement-contracts',
    'npm run test:checkout',
    'npm run build',
    'git diff --check',
  ] as const
  const canonical = JSON.stringify([
    1,
    'pending-independent-review',
    manifest.sourceCommit,
    manifest.manifestCommitment,
    evidence.map(item => [item.id, item.path, item.contentHash]),
    requiredChecks,
    requiredCommands,
    false,
    false,
    false,
  ])

  return {
    schemaVersion: 1,
    status: 'pending-independent-review',
    sourceCommit: manifest.sourceCommit,
    network: {
      name: manifest.network.name,
      chainId: manifest.network.chainId,
      usdc: manifest.network.usdc,
    },
    manifestCommitment: manifest.manifestCommitment,
    compiler: manifest.compiler,
    evidence,
    requiredChecks,
    requiredCommands,
    testEvidence: {
      status: 'not-attested',
      note: 'Command names are review requirements, not proof that they ran. Attach independently captured results.',
    },
    reviewDecision: {
      status: 'not-recorded',
      reviewerIdentity: null,
      completedAt: null,
      findings: [],
    },
    authorization: {
      deploy: false,
      broadcast: false,
      activate: false,
    },
    bundleCommitment: keccak256(toUtf8Bytes(canonical)),
  } as const
}
