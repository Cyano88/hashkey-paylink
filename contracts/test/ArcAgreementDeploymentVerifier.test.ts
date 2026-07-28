import { expect } from 'chai'
import { ethers } from 'hardhat'
import { buildArcAgreementDeploymentManifest } from '../lib/arcAgreementDeploymentManifest'
import {
  fetchArcAgreementExplorerVerification,
  verifyArcAgreementExplorerResponse,
  verifyArcAgreementDeployment,
  type ArcAgreementDeploymentObservations,
} from '../lib/arcAgreementDeploymentVerifier'
import type { ArcAgreementFactory } from '../typechain-types'

describe('Arc Agreement deployment verifier', () => {
  async function fixture() {
    const [, operator] = await ethers.getSigners()
    const sourceCommit = 'ab'.repeat(20)
    const manifest = buildArcAgreementDeploymentManifest({
      operator: operator.address,
      sourceCommit,
    })
    const Factory = await ethers.getContractFactory('ArcAgreementFactory')
    const factory = await Factory.deploy(manifest.network.usdc, operator.address) as ArcAgreementFactory
    await factory.waitForDeployment()
    const deploymentTransaction = factory.deploymentTransaction()
    if (!deploymentTransaction) throw new Error('Local deployment transaction is missing.')
    const receipt = await deploymentTransaction.wait()
    if (!receipt || !receipt.contractAddress) throw new Error('Local deployment receipt is missing.')
    const factoryAddress = await factory.getAddress()
    const headBlock = await ethers.provider.getBlockNumber()
    const constructorArguments = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address'],
      [manifest.network.usdc, operator.address],
    )
    const explorerProof = (overrides: Record<string, unknown> = {}) => verifyArcAgreementExplorerResponse({
      factoryAddress,
      response: {
        is_verified: true,
        is_fully_verified: true,
        is_changed_bytecode: false,
        name: manifest.contracts.factory.contractName,
        file_path: manifest.contracts.factory.sourceName,
        compiler_version: 'v0.8.24+commit.e11b9ed9',
        optimization_enabled: true,
        optimizations_runs: 200,
        constructor_args: constructorArguments,
        ...overrides,
      },
    })
    const observations: ArcAgreementDeploymentObservations = {
      chainId: manifest.network.chainId,
      headBlock: headBlock + 4,
      factoryAddress,
      runtimeBytecode: await ethers.provider.getCode(factoryAddress),
      factoryUsdc: await factory.usdc(),
      factoryOperator: await factory.operator(),
      deploymentTransaction: {
        hash: deploymentTransaction.hash,
        to: deploymentTransaction.to,
        data: deploymentTransaction.data,
        blockNumber: receipt.blockNumber,
      },
      deploymentReceipt: {
        hash: receipt.hash,
        status: receipt.status,
        contractAddress: receipt.contractAddress,
        blockNumber: receipt.blockNumber,
      },
      explorer: explorerProof(),
    }
    return { manifest, observations, sourceCommit, operator, explorerProof, constructorArguments }
  }

  it('binds chain, deployment transaction, runtime, constructor, and explorer evidence', async () => {
    const { manifest, observations, sourceCommit } = await fixture()
    const verified = verifyArcAgreementDeployment({
      manifest,
      expectedSourceCommit: sourceCommit,
      minimumConfirmations: 5,
      observations,
    })
    expect(verified.verified).to.equal(true)
    expect(verified.technicalVerificationPassed).to.equal(true)
    expect(verified.activationAuthorized).to.equal(false)
    expect(verified.confirmations).to.equal(5)
    expect(verified.runtimeBytecodeHash).to.equal(manifest.contracts.factory.runtimeExpectedHash)
    expect(verified.remainingApprovalGates).to.include('activation-change-review')
  })

  it('rejects artifact, chain, constructor, transaction, and confirmation drift', async () => {
    const {
      manifest,
      observations,
      sourceCommit,
      operator,
      explorerProof,
      constructorArguments,
    } = await fixture()
    const verify = (overrides: Partial<ArcAgreementDeploymentObservations> = {}) => verifyArcAgreementDeployment({
      manifest,
      expectedSourceCommit: sourceCommit,
      minimumConfirmations: 5,
      observations: { ...observations, ...overrides },
    })

    expect(() => verify({ chainId: 84532 })).to.throw(/approved Arc Testnet chain/)
    expect(() => verify({ runtimeBytecode: '0x60006000' })).to.throw(/runtime bytecode/)
    expect(() => verify({ factoryUsdc: operator.address })).to.throw(/official Arc Testnet USDC/)
    expect(() => verify({ factoryOperator: observations.factoryUsdc })).to.throw(/operator/)
    expect(() => verify({
      deploymentTransaction: { ...observations.deploymentTransaction, to: operator.address },
    })).to.throw(/not contract creation/)
    expect(() => verify({
      deploymentTransaction: { ...observations.deploymentTransaction, data: '0x60006000' },
    })).to.throw(/transaction data/)
    expect(() => verify({
      deploymentReceipt: { ...observations.deploymentReceipt, status: 0 },
    })).to.throw(/did not succeed/)
    expect(() => verify({ headBlock: observations.deploymentReceipt.blockNumber + 2 })).to.throw(/3 confirmations/)
    expect(() => verify({
      explorer: explorerProof({ optimizations_runs: 1 }),
    })).to.throw(/optimizer settings/)
    const changedLastNibble = constructorArguments.endsWith('0') ? '1' : '0'
    expect(() => verify({
      explorer: explorerProof({
        constructor_args: `${constructorArguments.slice(0, -1)}${changedLastNibble}`,
      }),
    })).to.throw(/constructor arguments/)
    expect(() => verify({
      explorer: { ...observations.explorer },
    })).to.throw(/verified read boundary/)
    expect(() => explorerProof({ is_fully_verified: false })).to.throw(/fully verified/)
  })

  it('rejects an unreviewed commit or a modified manifest', async () => {
    const { manifest, observations, sourceCommit } = await fixture()
    expect(() => verifyArcAgreementDeployment({
      manifest,
      expectedSourceCommit: 'cd'.repeat(20),
      minimumConfirmations: 5,
      observations,
    })).to.throw(/reviewed source/)

    expect(() => verifyArcAgreementDeployment({
      manifest: {
        ...manifest,
        manifestCommitment: `0x${'00'.repeat(32)}`,
      },
      expectedSourceCommit: sourceCommit,
      minimumConfirmations: 5,
      observations,
    })).to.throw(/current reviewed artifacts/)
  })

  it('reads explorer verification only from the official Arcscan contract endpoint', async () => {
    const { observations, explorerProof, constructorArguments, manifest } = await fixture()
    let observedUrl = ''
    let observedInit: RequestInit | undefined
    const proof = await fetchArcAgreementExplorerVerification({
      factoryAddress: observations.factoryAddress,
      fetchImpl: async (url, init) => {
        observedUrl = String(url)
        observedInit = init
        return new Response(JSON.stringify({
          is_verified: true,
          is_fully_verified: true,
          is_changed_bytecode: false,
          name: manifest.contracts.factory.contractName,
          file_path: manifest.contracts.factory.sourceName,
          compiler_version: 'v0.8.24+commit.e11b9ed9',
          optimization_enabled: true,
          optimizations_runs: 200,
          constructor_args: constructorArguments,
        }), { status: 200 })
      },
    })
    expect(proof.verified).to.equal(true)
    expect(observedUrl).to.equal(
      `https://testnet.arcscan.app/api/v2/smart-contracts/${observations.factoryAddress}`,
    )
    expect(observedInit?.method).to.equal('GET')
    expect(observedInit?.redirect).to.equal('error')

    let notIndexedError: unknown
    try {
      await fetchArcAgreementExplorerVerification({
        factoryAddress: observations.factoryAddress,
        fetchImpl: async () => new Response('', { status: 404 }),
      })
    } catch (error) {
      notIndexedError = error
    }
    expect(String(notIndexedError)).to.match(/not indexed/)
    expect(() => explorerProof({ is_changed_bytecode: true })).to.throw(/changed or ambiguous/)
    expect(() => explorerProof({
      compiler_settings: { optimizer: { enabled: false, runs: 200 } },
    })).to.throw(/conflicting optimizer settings/)
  })
})
