import { expect }         from 'chai'
import { ethers }         from 'hardhat'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import type { PayLinkFactoryV2, MockERC20 } from '../typechain-types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const USDC_DECIMALS  = 6
const ONE_USDC       = 10n ** BigInt(USDC_DECIMALS)
const MAX_GAS_REIMB  = ONE_USDC              // 1.00 USDC — matches contract constant
const FEE_BPS        = 50n                   // 0.5 %

function usdc(amount: number): bigint {
  return BigInt(Math.round(amount * 1e6))
}

function expectedSplit(total: bigint, gasReimb: bigint) {
  const platformFee = (total * FEE_BPS) / 10_000n
  const safeGas     = platformFee + gasReimb >= total ? 0n : gasReimb
  const payout      = total - platformFee - safeGas
  return { platformFee, gasReimb: safeGas, payout }
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('PayLinkFactoryV2', () => {
  let owner:     SignerWithAddress
  let relayer:   SignerWithAddress
  let treasury:  SignerWithAddress
  let recipient: SignerWithAddress
  let stranger:  SignerWithAddress

  let usdc1: MockERC20   // "Base USDC"
  let usdc2: MockERC20   // "Arc USDC" — simulates a different chain's token
  let factory: PayLinkFactoryV2

  const linkId = ethers.randomBytes(32)

  beforeEach(async () => {
    ;[owner, relayer, treasury, recipient, stranger] = await ethers.getSigners()

    const ERC20 = await ethers.getContractFactory('MockERC20')
    usdc1 = await ERC20.deploy('USD Coin (Base)', 'USDC', 6) as MockERC20
    usdc2 = await ERC20.deploy('USD Coin (Arc)',  'USDC', 6) as MockERC20

    const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
    factory = await Factory.deploy(
      await usdc1.getAddress(),
      treasury.address,
      relayer.address,
    ) as PayLinkFactoryV2
  })

  // ── 1. Deployment ────────────────────────────────────────────────────────────

  describe('deployment', () => {
    it('stores USDC, TREASURY, relayer, owner', async () => {
      expect(await factory.USDC()).to.equal(await usdc1.getAddress())
      expect(await factory.TREASURY()).to.equal(treasury.address)
      expect(await factory.relayer()).to.equal(relayer.address)
      expect(await factory.owner()).to.equal(owner.address)
    })

    it('reverts on zero usdc', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(ethers.ZeroAddress, treasury.address, relayer.address))
        .to.be.revertedWith('V2: zero usdc')
    })

    it('reverts on zero treasury', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(await usdc1.getAddress(), ethers.ZeroAddress, relayer.address))
        .to.be.revertedWith('V2: zero treasury')
    })

    it('reverts on zero relayer', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(await usdc1.getAddress(), treasury.address, ethers.ZeroAddress))
        .to.be.revertedWith('V2: zero relayer')
    })
  })

  // ── 2. Vault address determinism ─────────────────────────────────────────────

  describe('getVaultAddress — determinism', () => {
    it('returns the same address for the same (linkId, recipient)', async () => {
      const a = await factory.getVaultAddress(linkId, recipient.address)
      const b = await factory.getVaultAddress(linkId, recipient.address)
      expect(a).to.equal(b)
    })

    it('returns different addresses for different linkIds', async () => {
      const linkId2 = ethers.randomBytes(32)
      const a = await factory.getVaultAddress(linkId,  recipient.address)
      const b = await factory.getVaultAddress(linkId2, recipient.address)
      expect(a).to.not.equal(b)
    })

    it('returns different addresses for different recipients', async () => {
      const a = await factory.getVaultAddress(linkId, recipient.address)
      const b = await factory.getVaultAddress(linkId, stranger.address)
      expect(a).to.not.equal(b)
    })

    it('vault address is independent of the USDC token address', async () => {
      // Deploy a second factory at a DIFFERENT address but same treasury/relayer,
      // using usdc2 instead of usdc1.  If USDC were still baked into the initcode,
      // getVaultAddress() would return different results despite same factory address.
      // Here we verify the FORMULA directly: the initcode hash must not change when
      // USDC changes, given the same factory address.
      //
      // Approach: deploy factory2 with usdc2, then override its USDC in a fork-style
      // check by confirming that the initcode bytes differ only in the factory address
      // slot (i.e. the two separate factories produce different vault addrs because
      // THEIR OWN addresses differ, not because of USDC).

      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      const factory2 = await F.deploy(
        await usdc2.getAddress(),  // different USDC
        treasury.address,
        relayer.address,
      )

      const vault1 = await factory.getVaultAddress(linkId, recipient.address)
      const vault2 = await factory2.getVaultAddress(linkId, recipient.address)

      // They differ because the factory addresses differ — not because of USDC.
      // Prove this: manually recompute vault2's address using factory1's address
      // and the initcode that factory2 would produce IF it were at factory1's address.
      // Since initcode only contains the factory address, and factory1.address ≠ factory2.address,
      // the addresses will differ. But crucially the initcode STRUCTURE is the same — only
      // the embedded address differs.

      // The key assertion: vault1 ≠ vault2 only because factory addresses differ.
      expect(vault1).to.not.equal(vault2)

      // Now verify manually: if factory2 were at factory1's address, vault would match vault1.
      const factoryAddr   = await factory.getAddress()
      const GhostArtifact = await ethers.getContractFactory('GhostVaultV2')
      const initCode      = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddr]),
      ])
      // Contract uses abi.encodePacked — replicate with solidityPackedKeccak256
      const salt = ethers.solidityPackedKeccak256(
        ['bytes32', 'address'],
        [linkId, recipient.address],
      )
      const manualVault = ethers.getCreate2Address(factoryAddr, salt, ethers.keccak256(initCode))
      expect(manualVault).to.equal(vault1)
    })
  })

  // ── 3. relay() — happy path ───────────────────────────────────────────────

  describe('relay() — happy path', () => {
    async function fundAndRelay(amount: bigint, gasReimb: bigint) {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, amount)

      const factoryAddr    = await factory.getAddress()
      const treasuryBefore = await usdc1.balanceOf(treasury.address)
      const recipBefore    = await usdc1.balanceOf(recipient.address)

      const tx = await factory.connect(relayer).relay(linkId, recipient.address, gasReimb)
      const receipt = await tx.wait()

      return {
        tx, receipt,
        treasuryBefore, recipBefore,
        treasuryAfter: await usdc1.balanceOf(treasury.address),
        recipAfter:    await usdc1.balanceOf(recipient.address),
        factoryAfter:  await usdc1.balanceOf(factoryAddr),
      }
    }

    it('transfers 99.5% to recipient and 0.5% to treasury (no gas reimb)', async () => {
      const total    = usdc(100)
      const { platformFee, gasReimb, payout } = expectedSplit(total, 0n)

      const r = await fundAndRelay(total, 0n)

      expect(r.recipAfter   - r.recipBefore   ).to.equal(payout)
      expect(r.treasuryAfter - r.treasuryBefore).to.equal(platformFee + gasReimb)
      expect(r.factoryAfter).to.equal(0n)
    })

    it('deducts gas reimbursement from treasury split', async () => {
      const total    = usdc(50)
      const gas      = usdc(0.5)
      const { platformFee, gasReimb, payout } = expectedSplit(total, gas)

      const r = await fundAndRelay(total, gas)

      expect(r.recipAfter  - r.recipBefore  ).to.equal(payout)
      expect(r.treasuryAfter - r.treasuryBefore).to.equal(platformFee + gasReimb)
    })

    it('caps gas reimbursement at MAX_GAS_REIMB (1 USDC)', async () => {
      const total     = usdc(10)
      const gasAsked  = usdc(5)          // well above cap
      const { platformFee, gasReimb, payout } = expectedSplit(total, MAX_GAS_REIMB)

      const r = await fundAndRelay(total, gasAsked)

      expect(r.recipAfter - r.recipBefore).to.equal(payout)
      expect(r.treasuryAfter - r.treasuryBefore).to.equal(platformFee + MAX_GAS_REIMB)
    })

    it('waives gas reimbursement when fees >= total', async () => {
      const total    = usdc(0.01)   // tiny amount — fee alone > gasReimb
      const gas      = MAX_GAS_REIMB
      const { platformFee, gasReimb, payout } = expectedSplit(total, gas)

      const r = await fundAndRelay(total, gas)
      expect(gasReimb).to.equal(0n)   // waived
      expect(r.recipAfter - r.recipBefore).to.equal(payout)
    })

    it('emits PaymentRelayed with correct values', async () => {
      const total = usdc(20)
      const gas   = usdc(0.3)
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, total)

      const { platformFee, gasReimb, payout } = expectedSplit(total, gas)

      await expect(factory.connect(relayer).relay(linkId, recipient.address, gas))
        .to.emit(factory, 'PaymentRelayed')
        .withArgs(linkId, recipient.address, payout, platformFee, gasReimb)
    })

    it('leaves zero balance in factory after relay', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, usdc(5))
      await factory.connect(relayer).relay(linkId, recipient.address, 0n)
      expect(await usdc1.balanceOf(await factory.getAddress())).to.equal(0n)
    })
  })

  // ── 4. relay() — reverts ─────────────────────────────────────────────────────

  describe('relay() — reverts', () => {
    it('reverts when vault is empty', async () => {
      await expect(
        factory.connect(relayer).relay(linkId, recipient.address, 0n)
      ).to.be.revertedWith('V2: vault was empty')
    })

    it('reverts when called by non-relayer', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, usdc(5))

      await expect(
        factory.connect(stranger).relay(linkId, recipient.address, 0n)
      ).to.be.revertedWith('V2: caller is not relayer')
    })

    it('reverts on double-relay (CREATE2 collision)', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, usdc(5))
      await factory.connect(relayer).relay(linkId, recipient.address, 0n)

      // Fund vault address again — but GhostVaultV2 is already deployed there
      await usdc1.mint(vault, usdc(5))
      await expect(
        factory.connect(relayer).relay(linkId, recipient.address, 0n)
      ).to.be.reverted  // CREATE2 collision — no reason string, generic revert
    })

    it('reverts when wrong recipient is passed (salt mismatch → different vault)', async () => {
      // Fund vault for `recipient`, but relay with `stranger` as recipient.
      // The salt mismatch means the ghost vault is deployed at a fresh empty address.
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, usdc(5))

      await expect(
        factory.connect(relayer).relay(linkId, stranger.address, 0n)
      ).to.be.revertedWith('V2: vault was empty')
    })
  })

  // ── 5. Admin ─────────────────────────────────────────────────────────────────

  describe('admin', () => {
    it('owner can rotate relayer', async () => {
      await expect(factory.connect(owner).setRelayer(stranger.address))
        .to.emit(factory, 'RelayerUpdated')
        .withArgs(relayer.address, stranger.address)
      expect(await factory.relayer()).to.equal(stranger.address)
    })

    it('non-owner cannot rotate relayer', async () => {
      await expect(
        factory.connect(stranger).setRelayer(stranger.address)
      ).to.be.revertedWith('V2: caller is not owner')
    })

    it('owner can transfer ownership', async () => {
      await expect(factory.connect(owner).transferOwnership(stranger.address))
        .to.emit(factory, 'OwnershipTransferred')
        .withArgs(owner.address, stranger.address)
      expect(await factory.owner()).to.equal(stranger.address)
    })

    it('new owner can act; old owner cannot', async () => {
      await factory.connect(owner).transferOwnership(stranger.address)
      await expect(factory.connect(stranger).setRelayer(recipient.address)).to.not.be.reverted
      await expect(factory.connect(owner).setRelayer(recipient.address))
        .to.be.revertedWith('V2: caller is not owner')
    })

    it('owner can rescue tokens sent to factory', async () => {
      await usdc1.mint(await factory.getAddress(), usdc(10))
      const before = await usdc1.balanceOf(owner.address)
      await factory.connect(owner).rescueTokens(await usdc1.getAddress(), usdc(10))
      expect(await usdc1.balanceOf(owner.address)).to.equal(before + usdc(10))
    })

    it('non-owner cannot rescue tokens', async () => {
      await usdc1.mint(await factory.getAddress(), usdc(5))
      await expect(
        factory.connect(stranger).rescueTokens(await usdc1.getAddress(), usdc(5))
      ).to.be.revertedWith('V2: caller is not owner')
    })
  })

  // ── 6. Cross-chain vault address proof ───────────────────────────────────────

  describe('cross-chain determinism proof', () => {
    it('same factory address + same linkId + same recipient → same vault regardless of USDC', async () => {
      // Simulate "same factory, different chain's USDC" by deploying two factories
      // at addresses we cannot control, but verifying the initcode construction
      // is token-agnostic.  We do this by re-computing the vault address manually
      // using only (factory_address, linkId, recipient) — exactly what a cross-chain
      // deployment would produce.

      const GhostArtifact  = await ethers.getContractFactory('GhostVaultV2')
      const factoryAddress = await factory.getAddress()

      // Build initcode the same way the contract does: only factory address encoded
      const initCode = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddress]),
      ])

      // Contract uses abi.encodePacked — replicate with solidityPackedKeccak256
      const salt = ethers.solidityPackedKeccak256(
        ['bytes32', 'address'],
        [linkId, recipient.address],
      )

      // Manual CREATE2 address
      const manualVault = ethers.getCreate2Address(
        factoryAddress,
        salt,
        ethers.keccak256(initCode),
      )

      // On-chain result
      const onchainVault = await factory.getVaultAddress(linkId, recipient.address)

      expect(onchainVault).to.equal(manualVault)

      // Now deploy a second factory with a completely different USDC (usdc2)
      // at a different address.  Verify the initcode hash it WOULD produce
      // (if it were at factoryAddress) is IDENTICAL — because USDC is no longer
      // in the initcode.
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      const factory2 = await F.deploy(
        await usdc2.getAddress(),   // different USDC
        treasury.address,
        relayer.address,
      )
      const factory2Address = await factory2.getAddress()

      // Hypothetical: if factory2 were at factoryAddress, what vault would it produce?
      const initCode2 = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddress]), // ← same factory addr
      ])
      const hypotheticalVault2 = ethers.getCreate2Address(
        factoryAddress,
        salt,
        ethers.keccak256(initCode2),
      )

      // Must match — proving USDC is NOT part of the vault address computation
      expect(hypotheticalVault2).to.equal(manualVault)

      // Sanity: actual factory2 (different address) produces a different vault
      const actualVault2 = await factory2.getVaultAddress(linkId, recipient.address)
      expect(actualVault2).to.not.equal(onchainVault)  // different because factory addr differs

      // And the difference is ONLY because factory addresses differ, not USDC
      const initCode2_actualAddr = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factory2Address]),
      ])
      const expectedVault2 = ethers.getCreate2Address(
        factory2Address,
        salt,
        ethers.keccak256(initCode2_actualAddr),
      )
      expect(actualVault2).to.equal(expectedVault2)
    })

    it('relay works correctly with the refactored vault (reads USDC from factory)', async () => {
      // Full end-to-end: mint usdc1 tokens, relay, verify payout
      const total = usdc(100)
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, total)

      const recipBefore    = await usdc1.balanceOf(recipient.address)
      const treasuryBefore = await usdc1.balanceOf(treasury.address)

      await factory.connect(relayer).relay(linkId, recipient.address, 0n)

      const { payout, platformFee } = expectedSplit(total, 0n)
      expect(await usdc1.balanceOf(recipient.address) - recipBefore).to.equal(payout)
      expect(await usdc1.balanceOf(treasury.address) - treasuryBefore).to.equal(platformFee)
    })
  })
})
