import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildArcAgreementDeploymentManifest,
  type ArcAgreementDeploymentManifest,
} from '../lib/arcAgreementDeploymentManifest'
import {
  buildArcAgreementReviewBundle,
  validateArcAgreementReviewGitState,
} from '../lib/arcAgreementReviewBundle'

function git(...args: string[]) {
  return execFileSync('git', args, {
    cwd: resolve(process.cwd(), '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function main() {
  const manifestPath = String(process.env.ARC_AGREEMENT_MANIFEST_PATH ?? '').trim()
  if (!manifestPath) throw new Error('ARC_AGREEMENT_MANIFEST_PATH is required.')
  const parsed = JSON.parse(readFileSync(resolve(manifestPath), 'utf8')) as ArcAgreementDeploymentManifest
  const sourceCommit = validateArcAgreementReviewGitState({
    porcelainStatus: git('status', '--porcelain', '--untracked-files=all'),
    headCommit: git('rev-parse', 'HEAD'),
    manifestSourceCommit: parsed.sourceCommit,
  })
  const exact = buildArcAgreementDeploymentManifest({
    operator: parsed.operator,
    sourceCommit,
  })
  if (JSON.stringify(parsed) !== JSON.stringify(exact)) {
    throw new Error('Deployment manifest does not match the current compiler artifacts.')
  }

  console.log(JSON.stringify(buildArcAgreementReviewBundle({ manifest: exact }), null, 2))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
