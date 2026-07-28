import { network } from 'hardhat'
import { buildArcAgreementDeploymentManifest } from '../lib/arcAgreementDeploymentManifest'

async function main() {
  if (network.name !== 'hardhat') {
    throw new Error('Deployment plan generation is local-only. Use --network hardhat.')
  }
  const operator = String(process.env.ARC_AGREEMENT_OPERATOR_ADDRESS ?? '').trim()
  if (!operator) throw new Error('ARC_AGREEMENT_OPERATOR_ADDRESS is required.')
  const sourceCommit = String(process.env.ARC_AGREEMENT_SOURCE_COMMIT ?? 'LOCAL_UNCOMMITTED').trim()
  const manifest = buildArcAgreementDeploymentManifest({ operator, sourceCommit })
  console.log(JSON.stringify(manifest, null, 2))
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
