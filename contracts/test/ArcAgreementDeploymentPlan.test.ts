import { expect } from 'chai'
import { ethers } from 'hardhat'
import { buildArcAgreementDeploymentManifest } from '../lib/arcAgreementDeploymentManifest'
import type { ArcAgreementFactory } from '../typechain-types'

describe('Arc Agreement deployment plan', () => {
  it('builds a deterministic non-broadcast manifest and simulates the constructor locally', async () => {
    const [, operator] = await ethers.getSigners()
    const first = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: 'LOCAL_UNCOMMITTED',
    })
    const second = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: 'LOCAL_UNCOMMITTED',
    })

    expect(first).to.deep.equal(second)
    expect(first.broadcastAllowed).to.equal(false)
    expect(first.schemaVersion).to.equal(2)
    expect(first.network.chainId).to.equal(5_042_002)
    expect(first.network.usdc).to.equal('0x3600000000000000000000000000000000000000')
    expect(first.contracts.escrow.runtimeTemplateBytes).to.be.lessThan(24_576)
    expect(first.contracts.factory.runtimeTemplateBytes).to.be.lessThan(24_576)
    expect(first.manifestCommitment).to.match(/^0x[0-9a-f]{64}$/)

    const Factory = await ethers.getContractFactory('ArcAgreementFactory')
    const deployed = await Factory.deploy(first.network.usdc, operator.address) as ArcAgreementFactory
    await deployed.waitForDeployment()
    expect(await deployed.usdc()).to.equal(first.network.usdc)
    expect(await deployed.operator()).to.equal(operator.address)
    const deployedCode = await ethers.provider.getCode(await deployed.getAddress())
    expect(deployedCode.length).to.be.greaterThan(2)
    expect(ethers.keccak256(deployedCode)).to.equal(first.contracts.factory.runtimeExpectedHash)
    expect(first.contracts.factory.runtimeExpectedHash).to.not.equal(first.contracts.factory.runtimeTemplateHash)
  })

  it('rejects unsafe or ambiguous manifest inputs', async () => {
    const [, operator] = await ethers.getSigners()
    expect(() => buildArcAgreementDeploymentManifest({
      operator: ethers.ZeroAddress,
      sourceCommit: 'LOCAL_UNCOMMITTED',
    })).to.throw(/non-zero/)
    expect(() => buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: 'main',
    })).to.throw(/full Git commit/)
  })
})
