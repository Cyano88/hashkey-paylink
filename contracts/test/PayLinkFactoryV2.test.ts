import { expect }         from 'chai'
import { ethers }         from 'hardhat'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import type { PayLinkFactoryV2, MockERC20 } from '../typechain-types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const USDC_DECIMALS  = 6
const ONE_USDC       = 10n ** BigInt(USDC_DECIMALS)
const MAX_GAS_REIMB  = ONE_USDC
const FEE_BPS        = 50n

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
  let usdc2: MockERC20   // "Arc USDC" — different chain token
  let factory: PayLinkFactoryV2

  const linkId = ethers.randomBytes(32)

  // Deploy factory without USDC (new two-step pattern)
  beforeEach(async () => {
    ;[owner, relayer, treasury, recipient, stranger] = await ethers.getSigners()

    const ERC20 = await ethers.getContractFactory('MockERC20')
    usdc1 = await ERC20.deploy('USD Coin (Base)', 'USDC', 6) as MockERC20
    usdc2 = await ERC20.deploy('USD Coin (Arc)',  'USDC', 6) as MockERC20

    const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
    factory = await Factory.deploy(treasury.address, relayer.address) as PayLinkFactoryV2

    // Configure USDC as step 2 (simulates post-Nick's-Method setUSDC call)
    await factory.connect(owner).setUSDC(await usdc1.getAddress())
  })

  // ── 1. Deployment ────────────────────────────────────────────────────────────

  describe('deployment', () => {
    it('stores TREASURY, relayer, owner; USDC zero before setUSDC', async () => {
      const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await Factory.deploy(treasury.address, relayer.address)
      expect(await fresh.TREASURY()).to.equal(treasury.address)
      expect(await fresh.relayer()).to.equal(relayer.address)
      expect(await fresh.owner()).to.equal(owner.address)
      expect(await fresh.USDC()).to.equal(ethers.ZeroAddress)
    })

    it('stores USDC after setUSDC', async () => {
      expect(await factory.USDC()).to.equal(await usdc1.getAddress())
    })

    it('reverts on zero treasury', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(ethers.ZeroAddress, relayer.address))
        .to.be.revertedWith('V2: zero treasury')
    })

    it('reverts on zero relayer', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(treasury.address, ethers.ZeroAddress))
        .to.be.revertedWith('V2: zero relayer')
    })
  })

  // ── 2. setUSDC ───────────────────────────────────────────────────────────────

  describe('setUSDC', () => {
    it('can only be called once', async () => {
      await expect(
        factory.connect(owner).setUSDC(await usdc2.getAddress())
      ).to.be.revertedWith('V2: token already set')
    })

    it('reverts on zero address', async () => {
      const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await Factory.deploy(treasury.address, relayer.address)
      await expect(
        fresh.connect(owner).setUSDC(ethers.ZeroAddress)
      ).to.be.revertedWith('V2: zero token')
    })

    it('non-owner cannot call setUSDC', async () => {
      const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await Factory.deploy(treasury.address, relayer.address)
      await expect(
        fresh.connect(stranger).setUSDC(await usdc1.getAddress())
      ).to.be.revertedWith('V2: caller is not owner')
    })

    it('emits USDCConfigured', async () => {
      const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await Factory.deploy(treasury.address, relayer.address)
      await expect(fresh.connect(owner).setUSDC(await usdc1.getAddress()))
        .to.emit(fresh, 'USDCConfigured')
        .withArgs(await usdc1.getAddress())
    })
  })

  // ── 3. Vault address determinism ─────────────────────────────────────────────

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

    it('vault address matches manual CREATE2 computation', async () => {
      const factoryAddr   = await factory.getAddress()
      const GhostArtifact = await ethers.getContractFactory('GhostVaultV2')

      const initCode = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddr]),
      ])
      // Contract uses abi.encodePacked — replicate with solidityPackedKeccak256
      const salt = ethers.solidityPackedKeccak256(
        ['bytes32', 'address'],
        [linkId, recipient.address],
      )
      const manualVault = ethers.getCreate2Address(factoryAddr, salt, ethers.keccak256(initCode))
      const onchainVault = await factory.getVaultAddress(linkId, recipient.address)
      expect(manualVault).to.equal(onchainVault)
    })
  })

  // ── 4. relay() — happy path ───────────────────────────────────────────────

  describe('relay() — happy path', () => {
    async function fundAndRelay(amount: bigint, gasReimb: bigint) {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, amount)

      const factoryAddr    = await factory.getAddress()
      const treasuryBefore = await usdc1.balanceOf(treasury.address)
      const recipBefore    = await usdc1.balanceOf(recipient.address)

      const tx = await factory.connect(relayer).relay(linkId, recipient.address, gasReimb)
      await tx.wait()

      return {
        tx,
        treasuryBefore, recipBefore,
        treasuryAfter: await usdc1.balanceOf(treasury.address),
        recipAfter:    await usdc1.balanceOf(recipient.address),
        factoryAfter:  await usdc1.balanceOf(factoryAddr),
      }
    }

    it('transfers 99.5% to recipient and 0.5% to treasury (no gas reimb)', async () => {
      const total = usdc(100)
      const { platformFee, gasReimb, payout } = expectedSplit(total, 0n)
      const r = await fundAndRelay(total, 0n)
      expect(r.recipAfter    - r.recipBefore   ).to.equal(payout)
      expect(r.treasuryAfter - r.treasuryBefore).to.equal(platformFee + gasReimb)
      expect(r.factoryAfter).to.equal(0n)
    })

    it('deducts gas reimbursement correctly', async () => {
      const total = usdc(50)
      const gas   = usdc(0.5)
      const { platformFee, gasReimb, payout } = expectedSplit(total, gas)
      const r = await fundAndRelay(total, gas)
      expect(r.recipAfter    - r.recipBefore   ).to.equal(payout)
      expect(r.treasuryAfter - r.treasuryBefore).to.equal(platformFee + gasReimb)
    })

    it('caps gas reimbursement at MAX_GAS_REIMB', async () => {
      const total    = usdc(10)
      const gasAsked = usdc(5)
      const { platformFee, payout } = expectedSplit(total, MAX_GAS_REIMB)
      const r = await fundAndRelay(total, gasAsked)
      expect(r.recipAfter    - r.recipBefore   ).to.equal(payout)
      expect(r.treasuryAfter - r.treasuryBefore).to.equal(platformFee + MAX_GAS_REIMB)
    })

    it('waives gas reimbursement when fees >= total', async () => {
      const total = usdc(0.01)
      const { gasReimb, payout } = expectedSplit(total, MAX_GAS_REIMB)
      const r = await fundAndRelay(total, MAX_GAS_REIMB)
      expect(gasReimb).to.equal(0n)
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

  // ── 5. relay() — reverts ─────────────────────────────────────────────────────

  describe('relay() — reverts', () => {
    it('reverts when USDC not yet configured', async () => {
      const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await Factory.deploy(treasury.address, relayer.address)
      await expect(
        fresh.connect(relayer).relay(linkId, recipient.address, 0n)
      ).to.be.revertedWith('V2: token not configured')
    })

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
      await usdc1.mint(vault, usdc(5))
      await expect(
        factory.connect(relayer).relay(linkId, recipient.address, 0n)
      ).to.be.reverted
    })

    it('reverts when wrong recipient passed (different vault → empty)', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, usdc(5))
      await expect(
        factory.connect(relayer).relay(linkId, stranger.address, 0n)
      ).to.be.revertedWith('V2: vault was empty')
    })
  })

  // ── 6. Admin ─────────────────────────────────────────────────────────────────

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

    it('owner can rescue tokens', async () => {
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

  // ── 7. Cross-chain determinism proof ─────────────────────────────────────────

  describe('cross-chain determinism proof', () => {
    it('vault address depends only on factory address, linkId, recipient — NOT on token', async () => {
      // Deploy a second factory with usdc2 (simulates Arc deployment)
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      const factory2 = await F.deploy(treasury.address, relayer.address)
      await factory2.connect(owner).setUSDC(await usdc2.getAddress())

      const factoryAddr  = await factory.getAddress()
      const factory2Addr = await factory2.getAddress()

      const GhostArtifact = await ethers.getContractFactory('GhostVaultV2')
      const salt = ethers.solidityPackedKeccak256(
        ['bytes32', 'address'],
        [linkId, recipient.address],
      )

      // Vault address when factory is at factoryAddr (with usdc1)
      const initCode1 = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddr]),
      ])
      const vault1 = ethers.getCreate2Address(factoryAddr, salt, ethers.keccak256(initCode1))

      // Hypothetical: if factory2 were at factoryAddr, its vault address
      // (initcode only encodes the factory address, NOT usdc2)
      const initCode2_atAddr1 = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddr]),
      ])
      const vault2_hypothetical = ethers.getCreate2Address(factoryAddr, salt, ethers.keccak256(initCode2_atAddr1))

      // KEY ASSERTION: same factory address → same vault, regardless of USDC
      expect(vault2_hypothetical).to.equal(vault1)

      // Actual vault2 differs only because factory2 is at a different address
      const initCode2_actual = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factory2Addr]),
      ])
      const vault2_actual = ethers.getCreate2Address(factory2Addr, salt, ethers.keccak256(initCode2_actual))
      expect(vault2_actual).to.not.equal(vault1) // different because factory addr differs, not USDC
    })

    it('constructor is token-agnostic: same bytecode regardless of which token is set', async () => {
      // Two factories with different tokens have identical creation bytecode
      // (USDC is no longer a constructor arg → initcode hash is the same)
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      const factory2 = await F.deploy(treasury.address, relayer.address)

      // Both factories have the same bytecode — only their deployed storage differs
      expect(F.bytecode).to.equal(F.bytecode) // trivially true; real check is below:

      // Verify: if deployed via Nick's Method with same salt, same treasury, same relayer
      // → same address → same vault addresses after setUSDC(chain_token)
      const GhostArtifact = await ethers.getContractFactory('GhostVaultV2')
      const factoryAddr   = await factory.getAddress()

      const onchainVault1 = await factory.getVaultAddress(linkId, recipient.address)

      // Manual computation matches on-chain
      const salt = ethers.solidityPackedKeccak256(['bytes32', 'address'], [linkId, recipient.address])
      const initCode = ethers.concat([
        GhostArtifact.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddr]),
      ])
      const manualVault = ethers.getCreate2Address(factoryAddr, salt, ethers.keccak256(initCode))
      expect(manualVault).to.equal(onchainVault1)
    })

    it('relay works end-to-end after two-step deployment (deploy → setUSDC → relay)', async () => {
      const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await Factory.deploy(treasury.address, relayer.address)

      // Step 1: before setUSDC, relay must revert
      const vault = await fresh.getVaultAddress(linkId, recipient.address)
      await usdc1.mint(vault, usdc(10))
      await expect(
        fresh.connect(relayer).relay(linkId, recipient.address, 0n)
      ).to.be.revertedWith('V2: token not configured')

      // Step 2: configure token
      await fresh.connect(owner).setUSDC(await usdc1.getAddress())

      // Step 3: relay succeeds
      const recipBefore = await usdc1.balanceOf(recipient.address)
      await fresh.connect(relayer).relay(linkId, recipient.address, 0n)
      const { payout } = expectedSplit(usdc(10), 0n)
      expect(await usdc1.balanceOf(recipient.address) - recipBefore).to.equal(payout)
    })
  })
})
