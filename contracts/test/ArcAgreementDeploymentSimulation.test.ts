import { expect } from 'chai'
import { ethers } from 'hardhat'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildArcAgreementDeploymentManifest } from '../lib/arcAgreementDeploymentManifest'
import {
  buildArcAgreementFactoryDeploymentData,
  evaluateArcAgreementDeploymentSimulation,
} from '../lib/arcAgreementDeploymentSimulation'

const SOURCE_COMMIT = '0123456789abcdef0123456789abcdef01234567'

describe('Arc Agreement deployment simulation', () => {
  it('keeps the simulation entrypoint free of signing and broadcast capabilities', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'scripts/arc-agreement-deployment-simulate.ts'),
      'utf8',
    )
    for (const forbidden of [
      'getSigner',
      'getSigners',
      'sendTransaction',
      'broadcastTransaction',
      'deployContract',
      'CIRCLE_ENTITY_SECRET',
      'PRIVATE_KEY',
      'dotenv',
    ]) {
      expect(source).not.to.include(forbidden)
    }
  })

  it('binds a read-only constructor simulation to the reviewed manifest', async () => {
    const [deployer, operator] = await ethers.getSigners()
    const manifest = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: SOURCE_COMMIT,
    })
    const artifact = await ethers.getContractFactory('ArcAgreementFactory')
    const deploymentData = await buildArcAgreementFactoryDeploymentData({
      manifest,
      factoryAbi: artifact.interface.fragments,
      factoryBytecode: artifact.bytecode,
    })
    const deployed = await artifact.deploy(manifest.network.usdc, manifest.operator)
    await deployed.waitForDeployment()
    const runtime = await ethers.provider.getCode(await deployed.getAddress())
    const result = evaluateArcAgreementDeploymentSimulation({
      manifest,
      expectedSourceCommit: SOURCE_COMMIT,
      chainId: manifest.network.chainId,
      deployer: deployer.address,
      deployerCode: '0x',
      deployerBalance: ethers.parseEther('1'),
      usdcCode: '0x6000',
      operatorCode: '0x',
      deploymentData,
      simulatedRuntime: runtime,
      estimatedGas: 1_000_000n,
      maxFeePerGas: 1n,
    })

    expect(result.readyForBroadcastReview).to.equal(true)
    expect(result.authorization).to.deep.equal({
      sign: false,
      deploy: false,
      broadcast: false,
      activate: false,
    })
    expect(result.deploymentDataHash).to.equal(manifest.contracts.factory.deployDataHash)
    expect(result.simulatedRuntimeHash).to.equal(manifest.contracts.factory.runtimeExpectedHash)
  })

  it('reports funding and gas-estimate blockers without authorizing deployment', async () => {
    const [deployer, operator] = await ethers.getSigners()
    const manifest = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: SOURCE_COMMIT,
    })
    const artifact = await ethers.getContractFactory('ArcAgreementFactory')
    const deploymentData = await buildArcAgreementFactoryDeploymentData({
      manifest,
      factoryAbi: artifact.interface.fragments,
      factoryBytecode: artifact.bytecode,
    })
    const deployed = await artifact.deploy(manifest.network.usdc, manifest.operator)
    await deployed.waitForDeployment()
    const runtime = await ethers.provider.getCode(await deployed.getAddress())
    const result = evaluateArcAgreementDeploymentSimulation({
      manifest,
      expectedSourceCommit: SOURCE_COMMIT,
      chainId: manifest.network.chainId,
      deployer: deployer.address,
      deployerCode: '0x',
      deployerBalance: 0n,
      usdcCode: '0x6000',
      operatorCode: '0x',
      deploymentData,
      simulatedRuntime: runtime,
      estimatedGas: null,
      maxFeePerGas: 1n,
      estimateError: 'insufficient funds',
    })

    expect(result.estimateAvailable).to.equal(false)
    expect(result.fundingReady).to.equal(false)
    expect(result.readyForBroadcastReview).to.equal(false)
    expect(result.authorization.broadcast).to.equal(false)
  })

  it('fails closed on network, commit, code, and bytecode drift', async () => {
    const [deployer, operator] = await ethers.getSigners()
    const manifest = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit: SOURCE_COMMIT,
    })
    const artifact = await ethers.getContractFactory('ArcAgreementFactory')
    const deploymentData = await buildArcAgreementFactoryDeploymentData({
      manifest,
      factoryAbi: artifact.interface.fragments,
      factoryBytecode: artifact.bytecode,
    })
    const deployed = await artifact.deploy(manifest.network.usdc, manifest.operator)
    await deployed.waitForDeployment()
    const runtime = await ethers.provider.getCode(await deployed.getAddress())
    const valid = {
      manifest,
      expectedSourceCommit: SOURCE_COMMIT,
      chainId: manifest.network.chainId,
      deployer: deployer.address,
      deployerCode: '0x',
      deployerBalance: 1n,
      usdcCode: '0x6000',
      operatorCode: '0x',
      deploymentData,
      simulatedRuntime: runtime,
      estimatedGas: 1n,
      maxFeePerGas: 1n,
    }

    expect(() => evaluateArcAgreementDeploymentSimulation({
      ...valid,
      expectedSourceCommit: '89abcdef0123456789abcdef0123456789abcdef',
    })).to.throw(/source commit/)
    expect(() => evaluateArcAgreementDeploymentSimulation({
      ...valid,
      chainId: 8453,
    })).to.throw(/not Arc Testnet/)
    expect(() => evaluateArcAgreementDeploymentSimulation({
      ...valid,
      usdcCode: '0x',
    })).to.throw(/USDC code is missing/)
    expect(() => evaluateArcAgreementDeploymentSimulation({
      ...valid,
      operatorCode: '0x6000',
    })).to.throw(/operator must remain an EOA/)
    expect(() => evaluateArcAgreementDeploymentSimulation({
      ...valid,
      deploymentData: `${deploymentData.slice(0, -2)}00`,
    })).to.throw(/deployment data/)
    expect(() => evaluateArcAgreementDeploymentSimulation({
      ...valid,
      simulatedRuntime: '0x6000',
    })).to.throw(/runtime/)
  })
})
