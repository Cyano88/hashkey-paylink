import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ethers, network } from 'hardhat'
import {
  fetchArcAgreementExplorerVerification,
  readArcAgreementDeploymentObservations,
  verifyArcAgreementDeployment,
  type ArcAgreementDeploymentManifest,
} from '../lib/arcAgreementDeploymentVerifier'

function required(value: unknown, name: string) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

function currentSourceCommit() {
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    encoding: 'utf8',
  }).trim()
  if (dirty) throw new Error('Deployment verification requires a clean source working tree.')
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

async function main() {
  if (network.name !== 'arc') {
    throw new Error('Deployment verification is restricted to the configured Arc Testnet network.')
  }
  const manifestPath = resolve(
    process.cwd(),
    required(process.env.ARC_AGREEMENT_MANIFEST_PATH, 'ARC_AGREEMENT_MANIFEST_PATH'),
  )
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ArcAgreementDeploymentManifest
  const factoryAddress = required(
    process.env.ARC_AGREEMENT_FACTORY_ADDRESS,
    'ARC_AGREEMENT_FACTORY_ADDRESS',
  )
  const deploymentTransactionHash = required(
    process.env.ARC_AGREEMENT_DEPLOYMENT_TX_HASH,
    'ARC_AGREEMENT_DEPLOYMENT_TX_HASH',
  )
  const minimumConfirmations = Number(process.env.ARC_AGREEMENT_CONFIRMATION_BLOCKS || 5)
  const sourceCommit = currentSourceCommit()
  const explorer = await fetchArcAgreementExplorerVerification({ factoryAddress })
  const observations = await readArcAgreementDeploymentObservations({
    provider: ethers.provider,
    factoryAddress,
    deploymentTransactionHash,
    explorer,
  })
  const result = verifyArcAgreementDeployment({
    manifest,
    expectedSourceCommit: sourceCommit,
    minimumConfirmations,
    observations,
  })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Arc Agreement deployment verification failed.')
  process.exitCode = 1
})
