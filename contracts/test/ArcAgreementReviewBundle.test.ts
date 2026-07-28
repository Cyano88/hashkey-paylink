import { expect } from 'chai'
import { ethers } from 'hardhat'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildArcAgreementDeploymentManifest } from '../lib/arcAgreementDeploymentManifest'
import {
  buildArcAgreementReviewBundle,
  validateArcAgreementReviewGitState,
} from '../lib/arcAgreementReviewBundle'

const SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567'

describe('Arc Agreement independent-review bundle', () => {
  it('builds a deterministic pending bundle that cannot authorize deployment', async () => {
    const [, operator] = await ethers.getSigners()
    const manifest = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: SOURCE_COMMIT,
    })
    const first = buildArcAgreementReviewBundle({ manifest })
    const second = buildArcAgreementReviewBundle({ manifest })

    expect(first).to.deep.equal(second)
    expect(first.status).to.equal('pending-independent-review')
    expect(first.authorization).to.deep.equal({
      deploy: false,
      broadcast: false,
      activate: false,
    })
    expect(first.reviewDecision.status).to.equal('not-recorded')
    expect(first.testEvidence.status).to.equal('not-attested')
    expect(first.evidence).to.have.length.greaterThan(8)
    expect(first.bundleCommitment).to.match(/^0x[0-9a-f]{64}$/)
  })

  it('rejects local, stale, or modified manifests', async () => {
    const [, operator] = await ethers.getSigners()
    const local = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: 'LOCAL_UNCOMMITTED',
    })
    expect(() => buildArcAgreementReviewBundle({ manifest: local })).to.throw(/full Git source commit/)

    const exact = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: SOURCE_COMMIT,
    })
    const modified = {
      ...exact,
      requiredApprovals: [...exact.requiredApprovals, 'self-approved'],
    }
    expect(() => buildArcAgreementReviewBundle({
      manifest: modified as typeof exact,
    })).to.throw(/does not exactly match/)
  })

  it('binds every evidence file and changes commitment when evidence changes', async () => {
    const [, operator] = await ethers.getSigners()
    const manifest = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: SOURCE_COMMIT,
    })
    const original = buildArcAgreementReviewBundle({ manifest })
    const changed = buildArcAgreementReviewBundle({
      manifest,
      readText(path) {
        const content = readFileSync(resolve(process.cwd(), path), 'utf8')
        return path.endsWith('arc-agreements-threat-model.md')
          ? `${content}\ntampered`
          : content
      },
    })

    expect(changed.bundleCommitment).to.not.equal(original.bundleCommitment)
    expect(changed.evidence.map(item => item.path)).to.deep.equal(original.evidence.map(item => item.path))
  })

  it('fails closed when required evidence is empty', async () => {
    const [, operator] = await ethers.getSigners()
    const manifest = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: SOURCE_COMMIT,
    })
    expect(() => buildArcAgreementReviewBundle({
      manifest,
      readText(path) {
        if (path.endsWith('arc-agreements-threat-model.md')) return ''
        return readFileSync(resolve(process.cwd(), path), 'utf8')
      },
    })).to.throw(/missing or empty/)
  })

  it('rejects dirty, invalid, or mismatched Git state before bundling', () => {
    expect(() => validateArcAgreementReviewGitState({
      porcelainStatus: ' M contracts/contracts/ArcAgreementFactory.sol',
      headCommit: SOURCE_COMMIT,
      manifestSourceCommit: SOURCE_COMMIT,
    })).to.throw(/clean working tree/)
    expect(() => validateArcAgreementReviewGitState({
      porcelainStatus: '',
      headCommit: 'main',
      manifestSourceCommit: SOURCE_COMMIT,
    })).to.throw(/full Git source commit/)
    expect(() => validateArcAgreementReviewGitState({
      porcelainStatus: '',
      headCommit: SOURCE_COMMIT,
      manifestSourceCommit: '89abcdef0123456789abcdef0123456789abcdef',
    })).to.throw(/does not match/)
  })
})
