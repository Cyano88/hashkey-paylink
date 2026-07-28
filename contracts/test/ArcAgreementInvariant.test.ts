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
const MAX_TOTAL_AMOUNT = 1_000_000n * 1_000_000n

function deterministicValues(seed: number, count: number): number[] {
  let value = seed >>> 0
  const values: number[] = []
  for (let index = 0; index < count; index++) {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0
    values.push(value)
  }
  return values
}

function increasingSchedule(values: number[], length: number): number[] {
  const points = new Set<number>()
  for (const value of values) {
    if (points.size >= length - 1) break
    points.add(1 + (value % 9_998))
  }
  while (points.size < length - 1) {
    points.add(points.size + 1)
  }
  return [...points].sort((left, right) => left - right).concat(10_000)
}

describe('ArcAgreementEscrow invariants', () => {
  let payer: SignerWithAddress
  let recipient: SignerWithAddress
  let operator: SignerWithAddress
  let outsider: SignerWithAddress
  let token: MockERC20
  let factory: ArcAgreementFactory
  let caseNumber: number

  beforeEach(async () => {
    ;[payer, recipient, operator, outsider] = await ethers.getSigners()
    const Token = await ethers.getContractFactory('MockERC20')
    token = await Token.deploy('Arc USDC', 'USDC', 6) as MockERC20
    const Factory = await ethers.getContractFactory('ArcAgreementFactory')
    factory = await Factory.deploy(await token.getAddress(), operator.address) as ArcAgreementFactory
    await token.mint(payer.address, MAX_TOTAL_AMOUNT * 30n)
    await token.connect(payer).approve(await factory.getAddress(), ethers.MaxUint256)
    caseNumber = 0
  })

  async function create(
    totalAmount: bigint,
    template: number,
    schedule: number[],
    options: { cancelUntil?: bigint; expiresAt?: bigint } = {},
  ): Promise<ArcAgreementEscrow> {
    caseNumber += 1
    const now = BigInt(await time.latest())
    const clientReference = ethers.id(`invariant-reference-${caseNumber}`)
    await factory.connect(payer).createAndFund({
      clientReference,
      termsHash: ethers.id(`invariant-terms-${caseNumber}`),
      recipient: recipient.address,
      template,
      totalAmount,
      cancelUntil: options.cancelUntil ?? now + 600n,
      expiresAt: options.expiresAt ?? now + 86_400n,
      cumulativeReleaseBps: schedule,
    })
    const agreementId = await factory.agreementIdFor(payer.address, clientReference)
    const escrowAddress = await factory.agreementEscrow(agreementId)
    return ethers.getContractAt('ArcAgreementEscrow', escrowAddress) as Promise<ArcAgreementEscrow>
  }

  async function expectActiveConservation(escrow: ArcAgreementEscrow, totalAmount: bigint) {
    const released = await escrow.releasedAmount()
    const balance = await token.balanceOf(await escrow.getAddress())
    expect(released).to.be.at.most(totalAmount)
    expect(balance).to.equal(totalAmount - released)
    expect(await escrow.remainingAmount()).to.equal(totalAmount - released)
    expect(released + balance).to.equal(totalAmount)
  }

  it('conserves every unit across varied schedules, amounts, and rounding boundaries', async () => {
    const values = deterministicValues(0x48415348, 120)

    for (let scenario = 0; scenario < 20; scenario++) {
      const scheduleLength = 2 + (values[scenario] % 9)
      const schedule = increasingSchedule(values.slice(scenario * 5, scenario * 5 + 10), scheduleLength)
      const template = scheduleLength <= 10 && scenario % 2 === 0 ? MILESTONE : PROGRESSIVE_RELEASE
      const totalAmount = 10_000n + BigInt(values[scenario + 20] % 1_000_000_000)
      const escrow = await create(totalAmount, template, schedule)
      const recipientBefore = await token.balanceOf(recipient.address)

      expect(await escrow.status()).to.equal(ACTIVE)
      await expectActiveConservation(escrow, totalAmount)

      for (let step = 0; step < schedule.length; step++) {
        const releasedBefore = await escrow.releasedAmount()
        const expectedCumulative = step === schedule.length - 1
          ? totalAmount
          : totalAmount * BigInt(schedule[step]) / 10_000n
        const expectedPayout = expectedCumulative - releasedBefore

        expect(expectedPayout).to.be.greaterThan(0n)
        await escrow.connect(operator).releaseStep(step, ethers.id(`proof-${scenario}-${step}`))
        if (step < schedule.length - 1) {
          await expectActiveConservation(escrow, totalAmount)
        }
      }

      const released = await escrow.releasedAmount()
      const escrowBalance = await token.balanceOf(await escrow.getAddress())
      expect(released + escrowBalance).to.equal(totalAmount)
      expect(await token.balanceOf(recipient.address) - recipientBefore).to.equal(released)

      if (released === totalAmount) {
        expect(await escrow.status()).to.equal(COMPLETED)
        expect(escrowBalance).to.equal(0n)
        expect(await escrow.nextStep()).to.equal(BigInt(schedule.length))
      }
    }
  })

  it('preserves principal through randomized partial release and terminal paths', async () => {
    const values = deterministicValues(0x41524332, 96)

    for (let scenario = 0; scenario < 18; scenario++) {
      const scheduleLength = 2 + (values[scenario] % 6)
      const schedule = increasingSchedule(values.slice(scenario * 4, scenario * 4 + 8), scheduleLength)
      const totalAmount = 10_001n + BigInt(values[scenario + 18] % 5_000_000_000)
      const now = BigInt(await time.latest())
      const expiresAt = now + 3_600n
      const escrow = await create(totalAmount, PROGRESSIVE_RELEASE, schedule, {
        cancelUntil: now + 300n,
        expiresAt,
      })
      const payerBeforeTerminal = await token.balanceOf(payer.address)
      const recipientBefore = await token.balanceOf(recipient.address)

      const releaseCount = scenario % scheduleLength
      for (let step = 0; step < releaseCount; step++) {
        const releasedBefore = await escrow.releasedAmount()
        const expectedCumulative = totalAmount * BigInt(schedule[step]) / 10_000n
        if (expectedCumulative === releasedBefore) break
        await escrow.connect(operator).releaseStep(step, ethers.id(`partial-proof-${scenario}-${step}`))
      }

      const released = await escrow.releasedAmount()
      const unreleased = totalAmount - released
      if (scenario % 2 === 0) {
        await escrow.connect(operator).cancelByOperator(ethers.id(`cancel-${scenario}`))
        expect(await escrow.status()).to.equal(CANCELLED)
      } else {
        await time.increaseTo(await escrow.expiresAt())
        await escrow.connect(payer).refundExpired()
        expect(await escrow.status()).to.equal(REFUNDED)
      }

      expect(await token.balanceOf(payer.address) - payerBeforeTerminal).to.equal(unreleased)
      expect(await token.balanceOf(recipient.address) - recipientBefore).to.equal(released)
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(0n)
      expect(await escrow.remainingAmount()).to.equal(0n)
      expect(released + unreleased).to.equal(totalAmount)
    }
  })

  it('never lets excess recovery reduce the active obligation', async () => {
    const values = deterministicValues(0x5041594c, 48)

    for (let scenario = 0; scenario < 12; scenario++) {
      const totalAmount = 100_000n + BigInt(values[scenario] % 50_000_000)
      const excess = 1n + BigInt(values[scenario + 12] % 5_000_000)
      const escrow = await create(totalAmount, PROGRESSIVE_RELEASE, [2_500, 5_000, 10_000])

      if (scenario % 3 > 0) {
        await escrow.connect(operator).releaseStep(0, ethers.id(`excess-proof-${scenario}`))
      }
      if (scenario % 3 > 1) {
        await escrow.connect(operator).releaseStep(1, ethers.id(`excess-proof-two-${scenario}`))
      }

      await token.mint(outsider.address, excess)
      await token.connect(outsider).transfer(await escrow.getAddress(), excess)
      const obligationBefore = await escrow.remainingAmount()
      const payerBefore = await token.balanceOf(payer.address)

      await escrow.connect(payer).recoverExcess()

      expect(await token.balanceOf(payer.address) - payerBefore).to.equal(excess)
      expect(await token.balanceOf(await escrow.getAddress())).to.equal(obligationBefore)
      expect(await escrow.remainingAmount()).to.equal(obligationBefore)
      await expect(escrow.connect(payer).recoverExcess())
        .to.be.revertedWithCustomError(escrow, 'NothingToRecover')
    }
  })

  it('keeps completed, cancelled, and refunded states terminal', async () => {
    const completed = await create(999_999n, FIXED_UNLOCK, [10_000])
    await completed.connect(operator).releaseStep(0, ethers.id('complete-proof'))

    const cancelled = await create(999_998n, PROGRESSIVE_RELEASE, [5_000, 10_000])
    await cancelled.connect(operator).cancelByOperator(ethers.id('cancel-proof'))

    const now = BigInt(await time.latest())
    const refunded = await create(999_997n, PROGRESSIVE_RELEASE, [5_000, 10_000], {
      cancelUntil: 0n,
      expiresAt: now + 3_600n,
    })
    await time.increaseTo(await refunded.expiresAt())
    await refunded.connect(payer).refundExpired()

    for (const escrow of [completed, cancelled, refunded]) {
      await expect(escrow.connect(operator).releaseStep(0, ethers.id('late-release')))
        .to.be.revertedWithCustomError(escrow, 'InvalidStatus')
      await expect(escrow.connect(operator).cancelByOperator(ethers.id('late-cancel')))
        .to.be.revertedWithCustomError(escrow, 'InvalidStatus')
      await expect(escrow.connect(payer).cancelByPayer())
        .to.be.revertedWithCustomError(escrow, 'InvalidStatus')
      await expect(escrow.connect(payer).refundExpired())
        .to.be.revertedWithCustomError(escrow, 'InvalidStatus')
    }
  })

  it('rejects generated malformed schedules before any payer funds move', async () => {
    const Escrow = await ethers.getContractFactory('ArcAgreementEscrow')
    const payerBefore = await token.balanceOf(payer.address)
    const malformedSchedules = [
      [],
      [0, 10_000],
      [5_000, 5_000, 10_000],
      [7_500, 5_000, 10_000],
      [5_000, 9_999],
      [10_001],
      Array.from({ length: 21 }, (_, index) => 500 + index * 475),
    ]

    for (let index = 0; index < malformedSchedules.length; index++) {
      const now = BigInt(await time.latest())
      await expect(factory.connect(payer).createAndFund({
        clientReference: ethers.id(`malformed-reference-${index}`),
        termsHash: ethers.id(`malformed-terms-${index}`),
        recipient: recipient.address,
        template: PROGRESSIVE_RELEASE,
        totalAmount: 1_000_000n,
        cancelUntil: now + 600n,
        expiresAt: now + 3_600n,
        cumulativeReleaseBps: malformedSchedules[index],
      })).to.be.revertedWithCustomError(Escrow, 'InvalidSchedule')
    }

    expect(await token.balanceOf(payer.address)).to.equal(payerBefore)
  })

  it('rejects schedules whose USDC rounding would create a zero-value release', async () => {
    const Escrow = await ethers.getContractFactory('ArcAgreementEscrow')
    const payerBefore = await token.balanceOf(payer.address)
    const now = BigInt(await time.latest())

    await expect(factory.connect(payer).createAndFund({
      clientReference: ethers.id('rounding-lock-reference'),
      termsHash: ethers.id('rounding-lock-terms'),
      recipient: recipient.address,
      template: PROGRESSIVE_RELEASE,
      totalAmount: 1n,
      cancelUntil: now + 600n,
      expiresAt: now + 3_600n,
      cumulativeReleaseBps: [5_000, 10_000],
    })).to.be.revertedWithCustomError(Escrow, 'InvalidSchedule')

    expect(await token.balanceOf(payer.address)).to.equal(payerBefore)
  })
})
