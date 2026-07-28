import { expect } from 'chai'
import { ethers } from 'hardhat'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import type { ArcAgreementEscrow, ArcAgreementFactory, MockERC20 } from '../typechain-types'

const FIXED_UNLOCK = 0
const PROGRESSIVE_RELEASE = 1
const MILESTONE = 2
const ACTIVE = 1n
const COMPLETED = 2n
const CANCELLED = 3n
const REFUNDED = 4n

function usdc(value: number): bigint {
  return BigInt(Math.round(value * 1e6))
}

describe('ArcAgreementEscrow', () => {
  let payer: SignerWithAddress
  let secondPayer: SignerWithAddress
  let recipient: SignerWithAddress
  let operator: SignerWithAddress
  let outsider: SignerWithAddress
  let token: MockERC20
  let factory: ArcAgreementFactory

  const amount = usdc(100)
  const reference = ethers.id('agreement-order-0001')
  const termsHash = ethers.id('agreement-terms-v1')
  const evidence = ethers.id('verified-delivery-proof')
  const cancellationReason = ethers.id('fulfillment-cancelled')

  beforeEach(async () => {
    ;[payer, secondPayer, recipient, operator, outsider] = await ethers.getSigners()

    const Token = await ethers.getContractFactory('MockERC20')
    token = await Token.deploy('Arc USDC', 'USDC', 6) as MockERC20

    const Factory = await ethers.getContractFactory('ArcAgreementFactory')
    factory = await Factory.deploy(await token.getAddress(), operator.address) as ArcAgreementFactory

    await token.mint(payer.address, amount * 10n)
    await token.mint(secondPayer.address, amount * 10n)
    await token.connect(payer).approve(await factory.getAddress(), amount * 10n)
    await token.connect(secondPayer).approve(await factory.getAddress(), amount * 10n)
  })

  async function params(overrides: Partial<{
    clientReference: string
    termsHash: string
    recipient: string
    template: number
    totalAmount: bigint
    cancelUntil: bigint
    expiresAt: bigint
    cumulativeReleaseBps: number[]
  }> = {}) {
    const now = BigInt(await time.latest())
    return {
      clientReference: overrides.clientReference ?? reference,
      termsHash: overrides.termsHash ?? termsHash,
      recipient: overrides.recipient ?? recipient.address,
      template: overrides.template ?? FIXED_UNLOCK,
      totalAmount: overrides.totalAmount ?? amount,
      cancelUntil: overrides.cancelUntil ?? now + 3_600n,
      expiresAt: overrides.expiresAt ?? now + 86_400n,
      cumulativeReleaseBps: overrides.cumulativeReleaseBps ?? [10_000],
    }
  }

  async function create(
    overrides: Parameters<typeof params>[0] = {},
    signer: SignerWithAddress = payer,
  ): Promise<ArcAgreementEscrow> {
    const input = await params(overrides)
    await factory.connect(signer).createAndFund(input)
    const agreementId = await factory.agreementIdFor(signer.address, input.clientReference)
    const escrowAddress = await factory.agreementEscrow(agreementId)
    return ethers.getContractAt('ArcAgreementEscrow', escrowAddress) as Promise<ArcAgreementEscrow>
  }

  it('deploys and pulls exact USDC funding atomically', async () => {
    const input = await params()
    const agreementId = await factory.agreementIdFor(payer.address, reference)
    const payerBefore = await token.balanceOf(payer.address)

    await expect(factory.connect(payer).createAndFund(input))
      .to.emit(factory, 'AgreementCreated')

    const escrowAddress = await factory.agreementEscrow(agreementId)
    const escrow = await ethers.getContractAt('ArcAgreementEscrow', escrowAddress) as ArcAgreementEscrow
    expect(await token.balanceOf(payer.address)).to.equal(payerBefore - amount)
    expect(await token.balanceOf(escrowAddress)).to.equal(amount)
    expect(await escrow.status()).to.equal(ACTIVE)
    expect(await escrow.payer()).to.equal(payer.address)
    expect(await escrow.recipient()).to.equal(recipient.address)
    expect(await escrow.termsHash()).to.equal(termsHash)
    expect(await escrow.releaseSchedule()).to.deep.equal([10_000n])
  })

  it('reverts the whole creation when the factory has no allowance', async () => {
    const input = await params()
    await token.connect(payer).approve(await factory.getAddress(), 0)
    const agreementId = await factory.agreementIdFor(payer.address, reference)

    await expect(factory.connect(payer).createAndFund(input)).to.be.reverted
    expect(await factory.agreementEscrow(agreementId)).to.equal(ethers.ZeroAddress)
  })

  it('does not let a transfer to the future contract address block creation', async () => {
    const futureEscrow = ethers.getCreateAddress({
      from: await factory.getAddress(),
      nonce: 1,
    })
    const unsolicited = usdc(3)
    await token.mint(outsider.address, unsolicited)
    await token.connect(outsider).transfer(futureEscrow, unsolicited)
    expect(await token.balanceOf(futureEscrow)).to.equal(unsolicited)

    const escrow = await create()
    expect(await escrow.getAddress()).to.equal(futureEscrow)
    expect(await token.balanceOf(futureEscrow)).to.equal(amount + unsolicited)

    const payerBefore = await token.balanceOf(payer.address)
    await escrow.connect(payer).recoverExcess()
    expect(await token.balanceOf(payer.address) - payerBefore).to.equal(unsolicited)
    expect(await token.balanceOf(futureEscrow)).to.equal(amount)
  })

  it('scopes references to the payer and rejects a duplicate for the same payer', async () => {
    const input = await params()
    await factory.connect(payer).createAndFund(input)
    await expect(factory.connect(payer).createAndFund(input))
      .to.be.revertedWithCustomError(factory, 'AgreementAlreadyExists')

    await expect(factory.connect(secondPayer).createAndFund(input))
      .to.emit(factory, 'AgreementCreated')

    const firstId = await factory.agreementIdFor(payer.address, reference)
    const secondId = await factory.agreementIdFor(secondPayer.address, reference)
    expect(firstId).to.not.equal(secondId)
  })

  it('rejects invalid schedules, recipients, and deadlines before funding', async () => {
    const Escrow = await ethers.getContractFactory('ArcAgreementEscrow')
    await expect(factory.connect(payer).createAndFund(await params({ cumulativeReleaseBps: [5_000, 4_000, 10_000] })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidSchedule')
    await expect(factory.connect(payer).createAndFund(await params({ template: FIXED_UNLOCK, cumulativeReleaseBps: [5_000, 10_000] })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidSchedule')
    await expect(factory.connect(payer).createAndFund(await params({ template: PROGRESSIVE_RELEASE, cumulativeReleaseBps: [10_000] })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidSchedule')
    await expect(factory.connect(payer).createAndFund(await params({ recipient: payer.address })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidParameters')
    await expect(factory.connect(payer).createAndFund(await params({ recipient: operator.address })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidParameters')
    await expect(factory.connect(operator).createAndFund(await params()))
      .to.be.revertedWithCustomError(Escrow, 'InvalidParameters')
    await expect(factory.connect(payer).createAndFund(await params({ recipient: await token.getAddress() })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidParameters')
    await expect(factory.connect(payer).createAndFund(await params({ totalAmount: usdc(1_000_001) })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidParameters')

    const now = BigInt(await time.latest())
    await expect(factory.connect(payer).createAndFund(await params({ cancelUntil: now + 100n, expiresAt: now + 100n })))
      .to.be.revertedWithCustomError(Escrow, 'InvalidParameters')
  })

  it('rejects a factory whose operator is the token contract', async () => {
    const Factory = await ethers.getContractFactory('ArcAgreementFactory')
    const tokenAddress = await token.getAddress()
    await expect(Factory.deploy(tokenAddress, tokenAddress))
      .to.be.revertedWithCustomError(Factory, 'InvalidParameters')
  })

  it('allows only the operator to release the next fixed step with evidence', async () => {
    const escrow = await create()
    const recipientBefore = await token.balanceOf(recipient.address)

    await expect(escrow.connect(outsider).releaseStep(0, evidence))
      .to.be.revertedWithCustomError(escrow, 'OnlyOperator')
    await expect(escrow.connect(operator).releaseStep(0, ethers.ZeroHash))
      .to.be.revertedWithCustomError(escrow, 'InvalidEvidence')

    await expect(escrow.connect(operator).releaseStep(0, evidence))
      .to.emit(escrow, 'StepReleased')
      .withArgs(await escrow.agreementId(), 0, amount, amount, evidence)

    expect(await token.balanceOf(recipient.address) - recipientBefore).to.equal(amount)
    expect(await escrow.status()).to.equal(COMPLETED)
    expect(await escrow.releasedAmount()).to.equal(amount)
    expect(await escrow.remainingAmount()).to.equal(0)
    await expect(escrow.connect(operator).releaseStep(0, evidence))
      .to.be.revertedWithCustomError(escrow, 'InvalidStatus')
  })

  it('enforces ordered progressive releases and preserves principal', async () => {
    const escrow = await create({
      template: PROGRESSIVE_RELEASE,
      cumulativeReleaseBps: [2_500, 5_000, 7_500, 10_000],
    })

    await expect(escrow.connect(operator).releaseStep(1, evidence))
      .to.be.revertedWithCustomError(escrow, 'WrongStep')

    const recipientBefore = await token.balanceOf(recipient.address)
    for (let step = 0; step < 4; step++) {
      await escrow.connect(operator).releaseStep(step, ethers.id(`evidence-${step}`))
    }

    expect(await token.balanceOf(recipient.address) - recipientBefore).to.equal(amount)
    expect(await escrow.status()).to.equal(COMPLETED)
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(0)
  })

  it('supports milestone schedules with final-step rounding conservation', async () => {
    const unevenAmount = 1_000_001n
    const escrow = await create({
      template: MILESTONE,
      totalAmount: unevenAmount,
      cumulativeReleaseBps: [3_333, 6_666, 10_000],
    })
    const recipientBefore = await token.balanceOf(recipient.address)

    await escrow.connect(operator).releaseStep(0, ethers.id('milestone-1'))
    await escrow.connect(operator).releaseStep(1, ethers.id('milestone-2'))
    await escrow.connect(operator).releaseStep(2, ethers.id('milestone-3'))

    expect(await token.balanceOf(recipient.address) - recipientBefore).to.equal(unevenAmount)
    expect(await escrow.releasedAmount()).to.equal(unevenAmount)
  })

  it('allows payer cancellation only before release and inside the cancellation window', async () => {
    const escrow = await create()
    const payerBefore = await token.balanceOf(payer.address)

    await expect(escrow.connect(outsider).cancelByPayer())
      .to.be.revertedWithCustomError(escrow, 'OnlyPayer')
    await expect(escrow.connect(payer).cancelByPayer())
      .to.emit(escrow, 'AgreementCancelled')

    expect(await token.balanceOf(payer.address) - payerBefore).to.equal(amount)
    expect(await escrow.status()).to.equal(CANCELLED)

    const afterRelease = await create({
      clientReference: ethers.id('agreement-after-release'),
      template: PROGRESSIVE_RELEASE,
      cumulativeReleaseBps: [5_000, 10_000],
    })
    await afterRelease.connect(operator).releaseStep(0, evidence)
    await expect(afterRelease.connect(payer).cancelByPayer())
      .to.be.revertedWithCustomError(afterRelease, 'CancellationUnavailable')
  })

  it('allows operator cancellation but refunds only unreleased principal', async () => {
    const escrow = await create({
      template: PROGRESSIVE_RELEASE,
      cumulativeReleaseBps: [2_500, 10_000],
    })
    await escrow.connect(operator).releaseStep(0, evidence)
    const payerBefore = await token.balanceOf(payer.address)

    await expect(escrow.connect(operator).cancelByOperator(cancellationReason))
      .to.emit(escrow, 'AgreementCancelled')
      .withArgs(await escrow.agreementId(), operator.address, amount * 3n / 4n, cancellationReason)

    expect(await token.balanceOf(payer.address) - payerBefore).to.equal(amount * 3n / 4n)
    expect(await escrow.status()).to.equal(CANCELLED)
  })

  it('refunds the payer after expiry without clawing back released value', async () => {
    const now = BigInt(await time.latest())
    const expiresAt = now + 3_600n
    const escrow = await create({
      template: PROGRESSIVE_RELEASE,
      cancelUntil: 0n,
      expiresAt,
      cumulativeReleaseBps: [4_000, 10_000],
    })
    await escrow.connect(operator).releaseStep(0, evidence)

    await expect(escrow.connect(payer).refundExpired())
      .to.be.revertedWithCustomError(escrow, 'NotExpired')
    await time.increaseTo(expiresAt)

    const payerBefore = await token.balanceOf(payer.address)
    await expect(escrow.connect(payer).refundExpired())
      .to.emit(escrow, 'AgreementRefunded')
      .withArgs(await escrow.agreementId(), amount * 6n / 10n)

    expect(await token.balanceOf(payer.address) - payerBefore).to.equal(amount * 6n / 10n)
    expect(await escrow.status()).to.equal(REFUNDED)
  })

  it('blocks operator releases once the agreement reaches expiry', async () => {
    const now = BigInt(await time.latest())
    const expiresAt = now + 3_600n
    const escrow = await create({ cancelUntil: 0n, expiresAt })
    await time.increaseTo(expiresAt)

    await expect(escrow.connect(operator).releaseStep(0, evidence))
      .to.be.revertedWithCustomError(escrow, 'AgreementExpired')
    expect(await escrow.releasedAmount()).to.equal(0)
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount)
  })

  it('rejects fee-on-transfer tokens instead of creating an underfunded escrow', async () => {
    const FeeToken = await ethers.getContractFactory('MockFeeOnTransferERC20')
    const feeToken = await FeeToken.deploy()
    const Factory = await ethers.getContractFactory('ArcAgreementFactory')
    const feeFactory = await Factory.deploy(await feeToken.getAddress(), operator.address) as ArcAgreementFactory
    const payerBefore = amount
    await feeToken.mint(payer.address, payerBefore)
    await feeToken.connect(payer).approve(await feeFactory.getAddress(), payerBefore)
    const input = await params()
    const agreementId = await feeFactory.agreementIdFor(payer.address, input.clientReference)

    await expect(feeFactory.connect(payer).createAndFund(input))
      .to.be.revertedWithCustomError(feeFactory, 'IncorrectFunding')

    expect(await feeToken.balanceOf(payer.address)).to.equal(payerBefore)
    expect(await feeFactory.agreementEscrow(agreementId)).to.equal(ethers.ZeroAddress)
  })

  it('recovers only accidental excess without reducing active principal', async () => {
    const escrow = await create()
    const excess = usdc(7)
    await token.mint(outsider.address, excess)
    await token.connect(outsider).transfer(await escrow.getAddress(), excess)
    const payerBefore = await token.balanceOf(payer.address)

    await expect(escrow.connect(payer).recoverExcess())
      .to.emit(escrow, 'ExcessRecovered')
      .withArgs(await escrow.agreementId(), payer.address, excess)

    expect(await token.balanceOf(payer.address) - payerBefore).to.equal(excess)
    expect(await token.balanceOf(await escrow.getAddress())).to.equal(amount)
    expect(await escrow.remainingAmount()).to.equal(amount)
  })
})
