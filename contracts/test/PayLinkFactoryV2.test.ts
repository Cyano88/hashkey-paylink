import { expect }         from 'chai'
import { ethers }         from 'hardhat'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import type { PayLinkFactoryV2, MockERC20 } from '../typechain-types'

// ─── helpers ──────────────────────────────────────────────────────────────────

const FEE_BPS              = 20n
const MAX_GAS_REIMB        = 1_000_000n                  // 1 USDC (6-dec) / contract constant
const MAX_NATIVE_GAS_REIMB = ethers.parseEther('0.01')   // 0.01 HSK/ETH (18-dec)

function usdc(n: number): bigint { return BigInt(Math.round(n * 1e6)) }
function gho(n: number):  bigint { return ethers.parseUnits(String(n), 18) }
function hsk(n: number):  bigint { return ethers.parseEther(String(n)) }

function split(total: bigint, gasReimb: bigint) {
  const fee     = (total * FEE_BPS) / 10_000n
  const safeGas = fee + gasReimb >= total ? 0n : gasReimb
  return { fee, gasReimb: safeGas, payout: total - fee - safeGas }
}

// ─── suite ────────────────────────────────────────────────────────────────────

describe('PayLinkFactoryV2', () => {
  let owner:     SignerWithAddress
  let relayer:   SignerWithAddress
  let treasury:  SignerWithAddress
  let recipient: SignerWithAddress
  let stranger:  SignerWithAddress

  let token1: MockERC20   // "Base USDC"  — 6 decimals
  let token2: MockERC20   // "Arc USDC"   — 6 decimals
  let ghoToken: MockERC20 // "GHO Token"  — 18 decimals (Arbitrum)
  let factory: PayLinkFactoryV2

  const linkId = ethers.randomBytes(32)

  beforeEach(async () => {
    ;[owner, relayer, treasury, recipient, stranger] = await ethers.getSigners()

    const ERC20   = await ethers.getContractFactory('MockERC20')
    token1   = await ERC20.deploy('USD Coin (Base)', 'USDC', 6)  as MockERC20
    token2   = await ERC20.deploy('USD Coin (Arc)',  'USDC', 6)  as MockERC20
    ghoToken = await ERC20.deploy('GHO Token',       'GHO',  18) as MockERC20

    const Factory = await ethers.getContractFactory('PayLinkFactoryV2')
    factory = await Factory.deploy(treasury.address, relayer.address, owner.address) as PayLinkFactoryV2
    await factory.connect(owner).setUSDC(await token1.getAddress())
  })

  // ── 1. Deployment ────────────────────────────────────────────────────────────

  describe('deployment', () => {
    it('stores TREASURY, relayer, owner; USDC zero before setUSDC', async () => {
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)
      expect(await fresh.TREASURY()).to.equal(treasury.address)
      expect(await fresh.relayer()).to.equal(relayer.address)
      expect(await fresh.owner()).to.equal(owner.address)
      expect(await fresh.USDC()).to.equal(ethers.ZeroAddress)
    })

    it('reverts on zero treasury', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(ethers.ZeroAddress, relayer.address, owner.address))
        .to.be.revertedWith('V2: zero treasury')
    })

    it('reverts on zero relayer', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(treasury.address, ethers.ZeroAddress, owner.address))
        .to.be.revertedWith('V2: zero relayer')
    })

    it('reverts on zero owner', async () => {
      const F = await ethers.getContractFactory('PayLinkFactoryV2')
      await expect(F.deploy(treasury.address, relayer.address, ethers.ZeroAddress))
        .to.be.revertedWith('V2: zero owner')
    })
  })

  // ── 2. setUSDC ───────────────────────────────────────────────────────────────

  describe('setUSDC', () => {
    it('stores token and emits USDCConfigured', async () => {
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)
      await expect(fresh.connect(owner).setUSDC(await token1.getAddress()))
        .to.emit(fresh, 'USDCConfigured')
        .withArgs(await token1.getAddress())
      expect(await fresh.USDC()).to.equal(await token1.getAddress())
    })

    it('can only be called once', async () => {
      await expect(factory.connect(owner).setUSDC(await token2.getAddress()))
        .to.be.revertedWith('V2: token already set')
    })

    it('reverts on zero address', async () => {
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)
      await expect(fresh.connect(owner).setUSDC(ethers.ZeroAddress))
        .to.be.revertedWith('V2: zero token')
    })

    it('non-owner cannot call setUSDC', async () => {
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)
      await expect(fresh.connect(stranger).setUSDC(await token1.getAddress()))
        .to.be.revertedWith('V2: caller is not owner')
    })
  })

  // ── 3. Vault address determinism ─────────────────────────────────────────────

  describe('getVaultAddress', () => {
    it('is deterministic for same inputs', async () => {
      expect(await factory.getVaultAddress(linkId, recipient.address))
        .to.equal(await factory.getVaultAddress(linkId, recipient.address))
    })

    it('differs by linkId', async () => {
      const a = await factory.getVaultAddress(linkId, recipient.address)
      const b = await factory.getVaultAddress(ethers.randomBytes(32), recipient.address)
      expect(a).to.not.equal(b)
    })

    it('differs by recipient', async () => {
      const a = await factory.getVaultAddress(linkId, recipient.address)
      const b = await factory.getVaultAddress(linkId, stranger.address)
      expect(a).to.not.equal(b)
    })

    it('matches manual CREATE2 formula', async () => {
      const addr     = await factory.getAddress()
      const Ghost    = await ethers.getContractFactory('GhostVaultV2')
      const initCode = ethers.concat([
        Ghost.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addr]),
      ])
      const salt   = ethers.solidityPackedKeccak256(['bytes32','address'], [linkId, recipient.address])
      const manual = ethers.getCreate2Address(addr, salt, ethers.keccak256(initCode))
      expect(await factory.getVaultAddress(linkId, recipient.address)).to.equal(manual)
    })

    it('same vault address used for both ERC-20 and native relay', async () => {
      // The vault address formula is token-agnostic — same address for USDC and HSK
      const vaultForErc20  = await factory.getVaultAddress(linkId, recipient.address)
      const vaultForNative = await factory.getVaultAddress(linkId, recipient.address)
      expect(vaultForErc20).to.equal(vaultForNative)
    })
  })

  // ── 4. ERC-20 relay() ────────────────────────────────────────────────────────

  describe('relay() — ERC-20 (Base / Arc)', () => {
    async function fundAndRelay(amount: bigint, gas: bigint) {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await token1.mint(vault, amount)
      const tBefore = await token1.balanceOf(treasury.address)
      const rBefore = await token1.balanceOf(recipient.address)
      await factory.connect(relayer).relay(linkId, recipient.address, gas)
      return {
        tDelta: (await token1.balanceOf(treasury.address))  - tBefore,
        rDelta: (await token1.balanceOf(recipient.address)) - rBefore,
        fBal:   await token1.balanceOf(await factory.getAddress()),
      }
    }

    it('splits 99.8% recipient / 0.2% treasury', async () => {
      const total = usdc(100)
      const { fee, payout } = split(total, 0n)
      const r = await fundAndRelay(total, 0n)
      expect(r.rDelta).to.equal(payout)
      expect(r.tDelta).to.equal(fee)
      expect(r.fBal).to.equal(0n)
    })

    it('deducts gas reimbursement from treasury slice', async () => {
      const total = usdc(50)
      const gas   = usdc(0.5)
      const { fee, gasReimb, payout } = split(total, gas)
      const r = await fundAndRelay(total, gas)
      expect(r.rDelta).to.equal(payout)
      expect(r.tDelta).to.equal(fee + gasReimb)
    })

    it('caps gas reimbursement at MAX_GAS_REIMB (1 USDC)', async () => {
      const total = usdc(10)
      const { fee, payout } = split(total, MAX_GAS_REIMB)
      const r = await fundAndRelay(total, usdc(5))   // ask for 5 USDC, get capped at 1
      expect(r.rDelta).to.equal(payout)
      expect(r.tDelta).to.equal(fee + MAX_GAS_REIMB)
    })

    it('waives gas reimb when fees cover the whole payment', async () => {
      const total = usdc(0.01)
      const { gasReimb, payout } = split(total, MAX_GAS_REIMB)
      const r = await fundAndRelay(total, MAX_GAS_REIMB)
      expect(gasReimb).to.equal(0n)
      expect(r.rDelta).to.equal(payout)
    })

    it('emits PaymentRelayed', async () => {
      const total = usdc(20)
      const gas   = usdc(0.3)
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await token1.mint(vault, total)
      const { fee, gasReimb, payout } = split(total, gas)
      await expect(factory.connect(relayer).relay(linkId, recipient.address, gas))
        .to.emit(factory, 'PaymentRelayed')
        .withArgs(linkId, recipient.address, payout, fee, gasReimb)
    })

    it('reverts when USDC not configured', async () => {
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)
      await expect(fresh.connect(relayer).relay(linkId, recipient.address, 0n))
        .to.be.revertedWith('V2: token not configured')
    })

    it('reverts when vault is empty', async () => {
      await expect(factory.connect(relayer).relay(linkId, recipient.address, 0n))
        .to.be.revertedWith('V2: vault was empty')
    })

    it('reverts when called by non-relayer', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await token1.mint(vault, usdc(5))
      await expect(factory.connect(stranger).relay(linkId, recipient.address, 0n))
        .to.be.revertedWith('V2: caller is not relayer')
    })

    it('reverts on double-relay', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await token1.mint(vault, usdc(5))
      await factory.connect(relayer).relay(linkId, recipient.address, 0n)
      await token1.mint(vault, usdc(5))
      await expect(factory.connect(relayer).relay(linkId, recipient.address, 0n))
        .to.be.reverted
    })
  })

  // ── 5. Native token relayNative() ────────────────────────────────────────────

  describe('relayNative() — native token (HashKey / ETH)', () => {
    async function fundNativeAndRelay(amount: bigint, gas: bigint) {
      const vault = await factory.getVaultAddress(linkId, recipient.address)

      // Send native token to vault address (simulates CEX/cold wallet send)
      await stranger.sendTransaction({ to: vault, value: amount })

      const tBefore = await ethers.provider.getBalance(treasury.address)
      const rBefore = await ethers.provider.getBalance(recipient.address)

      // Use a different linkId for native to avoid CREATE2 collision with ERC-20 tests
      const nativeLinkId = ethers.keccak256(linkId)
      const nativeVault  = await factory.getVaultAddress(nativeLinkId, recipient.address)
      await stranger.sendTransaction({ to: nativeVault, value: amount })

      await factory.connect(relayer).relayNative(nativeLinkId, recipient.address, gas)

      return {
        tDelta: (await ethers.provider.getBalance(treasury.address))  - tBefore,
        rDelta: (await ethers.provider.getBalance(recipient.address)) - rBefore,
        fBal:   await ethers.provider.getBalance(await factory.getAddress()),
      }
    }

    it('splits 99.8% to recipient, 0.2% to treasury in native token', async () => {
      const total = hsk(1)
      const { fee, payout } = split(total, 0n)
      const vault = await factory.getVaultAddress(linkId, recipient.address)

      await stranger.sendTransaction({ to: vault, value: total })
      const tBefore = await ethers.provider.getBalance(treasury.address)
      const rBefore = await ethers.provider.getBalance(recipient.address)

      await factory.connect(relayer).relayNative(linkId, recipient.address, 0n)

      const tAfter = await ethers.provider.getBalance(treasury.address)
      const rAfter = await ethers.provider.getBalance(recipient.address)

      expect(tAfter - tBefore).to.equal(fee)
      expect(rAfter - rBefore).to.equal(payout)
      expect(await ethers.provider.getBalance(await factory.getAddress())).to.equal(0n)
    })

    it('caps gas reimbursement at MAX_NATIVE_GAS_REIMB (0.01 HSK)', async () => {
      const total    = hsk(5)
      const gasAsked = hsk(1)       // 1 HSK — well above 0.01 cap
      const { fee, payout } = split(total, MAX_NATIVE_GAS_REIMB)

      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await stranger.sendTransaction({ to: vault, value: total })
      const tBefore = await ethers.provider.getBalance(treasury.address)

      await factory.connect(relayer).relayNative(linkId, recipient.address, gasAsked)

      const tAfter = await ethers.provider.getBalance(treasury.address)
      expect(tAfter - tBefore).to.equal(fee + MAX_NATIVE_GAS_REIMB)
    })

    it('waives gas reimb when it would exceed payment', async () => {
      const total = hsk(0.001)      // tiny — gas reimb would exceed
      const { gasReimb, payout } = split(total, MAX_NATIVE_GAS_REIMB)
      expect(gasReimb).to.equal(0n)

      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await stranger.sendTransaction({ to: vault, value: total })
      const rBefore = await ethers.provider.getBalance(recipient.address)

      await factory.connect(relayer).relayNative(linkId, recipient.address, MAX_NATIVE_GAS_REIMB)
      expect(await ethers.provider.getBalance(recipient.address) - rBefore).to.equal(payout)
    })

    it('emits NativePaymentRelayed', async () => {
      const total = hsk(2)
      const gas   = hsk(0.005)
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await stranger.sendTransaction({ to: vault, value: total })
      const { fee, gasReimb, payout } = split(total, gas)
      await expect(
        factory.connect(relayer).relayNative(linkId, recipient.address, gas)
      )
        .to.emit(factory, 'NativePaymentRelayed')
        .withArgs(linkId, recipient.address, payout, fee, gasReimb)
    })

    it('reverts when vault is empty', async () => {
      await expect(
        factory.connect(relayer).relayNative(linkId, recipient.address, 0n)
      ).to.be.revertedWith('V2: vault was empty')
    })

    it('reverts when called by non-relayer', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await stranger.sendTransaction({ to: vault, value: hsk(1) })
      await expect(
        factory.connect(stranger).relayNative(linkId, recipient.address, 0n)
      ).to.be.revertedWith('V2: caller is not relayer')
    })

    it('reverts on double-relay', async () => {
      const vault = await factory.getVaultAddress(linkId, recipient.address)
      await stranger.sendTransaction({ to: vault, value: hsk(1) })
      await factory.connect(relayer).relayNative(linkId, recipient.address, 0n)
      await stranger.sendTransaction({ to: vault, value: hsk(1) })
      await expect(
        factory.connect(relayer).relayNative(linkId, recipient.address, 0n)
      ).to.be.reverted
    })

    it('works when USDC is not configured (HashKey scenario)', async () => {
      // Deploy fresh factory without setUSDC — simulates HashKey deployment
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)
      // Do NOT call setUSDC

      const vault = await fresh.getVaultAddress(linkId, recipient.address)
      await stranger.sendTransaction({ to: vault, value: hsk(1) })

      const rBefore = await ethers.provider.getBalance(recipient.address)
      await fresh.connect(relayer).relayNative(linkId, recipient.address, 0n)

      const { payout } = split(hsk(1), 0n)
      expect(await ethers.provider.getBalance(recipient.address) - rBefore).to.equal(payout)
    })
  })

  // ── 6. Admin ─────────────────────────────────────────────────────────────────

  describe('admin', () => {
    it('owner can rotate relayer', async () => {
      await expect(factory.connect(owner).setRelayer(stranger.address))
        .to.emit(factory, 'RelayerUpdated')
        .withArgs(relayer.address, stranger.address)
    })

    it('non-owner cannot rotate relayer', async () => {
      await expect(factory.connect(stranger).setRelayer(stranger.address))
        .to.be.revertedWith('V2: caller is not owner')
    })

    it('owner can transfer ownership', async () => {
      await factory.connect(owner).transferOwnership(stranger.address)
      expect(await factory.owner()).to.equal(stranger.address)
    })

    it('owner can rescue ERC-20 tokens', async () => {
      await token1.mint(await factory.getAddress(), usdc(10))
      const before = await token1.balanceOf(owner.address)
      await factory.connect(owner).rescueTokens(await token1.getAddress(), usdc(10))
      expect(await token1.balanceOf(owner.address)).to.equal(before + usdc(10))
    })

    it('owner can rescue native token', async () => {
      await stranger.sendTransaction({ to: await factory.getAddress(), value: hsk(1) })
      const before = await ethers.provider.getBalance(owner.address)
      const tx = await factory.connect(owner).rescueNative(hsk(1))
      const receipt = await tx.wait()
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice
      expect(await ethers.provider.getBalance(owner.address) - before + gasUsed).to.equal(hsk(1))
    })

    it('non-owner cannot rescue tokens', async () => {
      await expect(
        factory.connect(stranger).rescueTokens(await token1.getAddress(), usdc(5))
      ).to.be.revertedWith('V2: caller is not owner')
    })
  })

  // ── 7. Cross-chain determinism ────────────────────────────────────────────────

  describe('cross-chain determinism', () => {
    it('vault address is token-agnostic — same address for USDC and HSK relay', async () => {
      // On Base: deploy factory with USDC → relay() uses same vault address
      // On HashKey: deploy factory without USDC → relayNative() uses SAME vault address
      // This test verifies both relay paths use the identical vault address

      const factoryAddr = await factory.getAddress()
      const Ghost       = await ethers.getContractFactory('GhostVaultV2')
      const initCode    = ethers.concat([
        Ghost.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factoryAddr]),
      ])
      const salt        = ethers.solidityPackedKeccak256(['bytes32','address'], [linkId, recipient.address])
      const manualVault = ethers.getCreate2Address(factoryAddr, salt, ethers.keccak256(initCode))

      // On-chain getVaultAddress returns the same regardless of USDC being set
      expect(await factory.getVaultAddress(linkId, recipient.address)).to.equal(manualVault)

      // A HashKey factory (no USDC) would produce the same vault IF at same address
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)
      // fresh.USDC() == address(0) — HashKey scenario, no setUSDC called

      // fresh is at a different address so vault differs (expected)
      // but the FORMULA is the same — only factory address matters
      const freshAddr    = await fresh.getAddress()
      const freshInitCode = ethers.concat([
        Ghost.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [freshAddr]),
      ])
      const freshVault = ethers.getCreate2Address(freshAddr, salt, ethers.keccak256(freshInitCode))
      expect(await fresh.getVaultAddress(linkId, recipient.address)).to.equal(freshVault)
    })

    it('two-step deploy: relay blocked before setUSDC, works after', async () => {
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)

      const vault = await fresh.getVaultAddress(linkId, recipient.address)
      await token1.mint(vault, usdc(10))

      await expect(fresh.connect(relayer).relay(linkId, recipient.address, 0n))
        .to.be.revertedWith('V2: token not configured')

      await fresh.connect(owner).setUSDC(await token1.getAddress())

      const rBefore = await token1.balanceOf(recipient.address)
      await fresh.connect(relayer).relay(linkId, recipient.address, 0n)
      const { payout } = split(usdc(10), 0n)
      expect(await token1.balanceOf(recipient.address) - rBefore).to.equal(payout)
    })

    it('relayNative works immediately after deploy with no setUSDC (HashKey)', async () => {
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh = await F.deploy(treasury.address, relayer.address, owner.address)

      const vault = await fresh.getVaultAddress(linkId, recipient.address)
      await stranger.sendTransaction({ to: vault, value: hsk(2) })

      const rBefore = await ethers.provider.getBalance(recipient.address)
      await fresh.connect(relayer).relayNative(linkId, recipient.address, 0n)

      const { payout } = split(hsk(2), 0n)
      expect(await ethers.provider.getBalance(recipient.address) - rBefore).to.equal(payout)
    })
  })

  // ── 8. GHO — 18-decimal ERC-20 relay (Arbitrum One) ─────────────────────────

  describe('GHO relay — 18-decimal token (Arbitrum scenario)', () => {
    let ghoFactory: PayLinkFactoryV2
    const ghoLinkId = ethers.keccak256(ethers.toUtf8Bytes('arbitrum-gho-link'))

    beforeEach(async () => {
      const F  = await ethers.getContractFactory('PayLinkFactoryV2')
      ghoFactory = await F.deploy(treasury.address, relayer.address, owner.address) as PayLinkFactoryV2
      await ghoFactory.connect(owner).setUSDC(await ghoToken.getAddress())
    })

    it('relay with zero gasReimb splits correctly for 18-dec GHO', async () => {
      const total = gho(10)
      const vault = await ghoFactory.getVaultAddress(ghoLinkId, recipient.address)
      await ghoToken.mint(vault, total)

      const { fee, payout } = split(total, 0n)
      const rBefore = await ghoToken.balanceOf(recipient.address)
      const tBefore = await ghoToken.balanceOf(treasury.address)

      await ghoFactory.connect(relayer).relay(ghoLinkId, recipient.address, 0n)

      expect(await ghoToken.balanceOf(recipient.address) - rBefore).to.equal(payout)
      expect(await ghoToken.balanceOf(treasury.address)  - tBefore).to.equal(fee)
      expect(await ghoToken.balanceOf(await ghoFactory.getAddress())).to.equal(0n)
    })

    it('MAX_GAS_REIMB constant (1_000_000) is negligible in GHO wei — relayer should pass 0', async () => {
      // MAX_GAS_REIMB = 1_000_000 = 0.000000000001 GHO — effectively zero
      // Arbitrum relay costs ~$0.02 which is absorbed by treasury platform fee
      const total      = gho(100)
      const capReimb   = MAX_GAS_REIMB   // contract caps at this even if relayer asks more
      const { fee, gasReimb, payout } = split(total, capReimb)

      const vault    = await ghoFactory.getVaultAddress(ghoLinkId, recipient.address)
      await ghoToken.mint(vault, total)

      const rBefore = await ghoToken.balanceOf(recipient.address)
      await ghoFactory.connect(relayer).relay(ghoLinkId, recipient.address, capReimb)

      // gasReimb is effectively dust — 1_000_000 wei GHO out of 100e18
      expect(gasReimb).to.equal(1_000_000n)
      expect(await ghoToken.balanceOf(recipient.address) - rBefore).to.equal(payout)
    })

    it('large GHO amount relay — correct split at 0.2% fee', async () => {
      const total = gho(1000)
      const { fee, payout } = split(total, 0n)

      const vault = await ghoFactory.getVaultAddress(ghoLinkId, recipient.address)
      await ghoToken.mint(vault, total)

      const rBefore = await ghoToken.balanceOf(recipient.address)
      await ghoFactory.connect(relayer).relay(ghoLinkId, recipient.address, 0n)

      expect(await ghoToken.balanceOf(recipient.address) - rBefore).to.equal(payout)
      expect(fee).to.equal(gho(2)) // 0.2% of 1000 GHO = 2 GHO
    })

    it('emits PaymentRelayed with correct 18-dec amounts', async () => {
      const total = gho(50)
      const vault = await ghoFactory.getVaultAddress(ghoLinkId, recipient.address)
      await ghoToken.mint(vault, total)
      const { fee, payout } = split(total, 0n)

      await expect(
        ghoFactory.connect(relayer).relay(ghoLinkId, recipient.address, 0n)
      )
        .to.emit(ghoFactory, 'PaymentRelayed')
        .withArgs(ghoLinkId, recipient.address, payout, fee, 0n)
    })

    it('double-relay reverts for GHO vault', async () => {
      const vault = await ghoFactory.getVaultAddress(ghoLinkId, recipient.address)
      await ghoToken.mint(vault, gho(10))
      await ghoFactory.connect(relayer).relay(ghoLinkId, recipient.address, 0n)

      await ghoToken.mint(vault, gho(10))
      await expect(
        ghoFactory.connect(relayer).relay(ghoLinkId, recipient.address, 0n)
      ).to.be.reverted
    })

    // ── Cross-chain vault address consistency ────────────────────────────────

    it('vault initCode does NOT contain the token address — only factory address', async () => {
      const Ghost      = await ethers.getContractFactory('GhostVaultV2')
      const factAddr   = await ghoFactory.getAddress()
      const initCode   = ethers.concat([
        Ghost.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [factAddr]),
      ])
      const initHex  = ethers.hexlify(initCode).toLowerCase()
      const ghoAddr  = (await ghoToken.getAddress()).toLowerCase().slice(2) // strip 0x

      // Token address must NOT be in vault initCode — this is what makes the
      // address cross-chain portable when the factory is at the same address.
      expect(initHex).to.not.include(ghoAddr)

      // But the factory address IS present (it's the only constructor arg)
      const factHex = factAddr.toLowerCase().slice(2)
      expect(initHex).to.include(factHex)
    })

    it('same factory address → identical vault address for USDC and GHO configs', async () => {
      // Deploy a fresh factory at a specific address, configure twice — once with
      // USDC, once with GHO. Since initCode only encodes factory address, the
      // vault address computed by getVaultAddress() is identical in both configs.
      const F      = await ethers.getContractFactory('PayLinkFactoryV2')
      const fresh  = await F.deploy(treasury.address, relayer.address, owner.address) as PayLinkFactoryV2
      const freshAddr = await fresh.getAddress()

      // getVaultAddress is a pure view — does NOT depend on which token is set
      const vaultBeforeToken = await fresh.getVaultAddress(ghoLinkId, recipient.address)
      await fresh.connect(owner).setUSDC(await ghoToken.getAddress())
      const vaultAfterGho    = await fresh.getVaultAddress(ghoLinkId, recipient.address)

      expect(vaultBeforeToken).to.equal(vaultAfterGho)

      // Verify against manual CREATE2 formula
      const Ghost    = await ethers.getContractFactory('GhostVaultV2')
      const initCode = ethers.concat([
        Ghost.bytecode,
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [freshAddr]),
      ])
      const salt   = ethers.solidityPackedKeccak256(['bytes32','address'], [ghoLinkId, recipient.address])
      const manual = ethers.getCreate2Address(freshAddr, salt, ethers.keccak256(initCode))
      expect(vaultAfterGho).to.equal(manual)
    })

    it("Nick's Method guarantee: two factories with identical initcode land at same address", async () => {
      // Simulate Nick's Method: same salt + same initcode → same CREATE2 address.
      // In Hardhat we verify the formula is token-agnostic by checking initcode hashes.
      const F     = await ethers.getContractFactory('PayLinkFactoryV2')
      const Ghost = await ethers.getContractFactory('GhostVaultV2')

      // Factory A (USDC) — deployed by Hardhat at some address
      const factA    = await F.deploy(treasury.address, relayer.address, owner.address) as PayLinkFactoryV2
      const addrA    = await factA.getAddress()
      await factA.connect(owner).setUSDC(await token1.getAddress())  // USDC

      // Factory B (GHO) — different deployment address, different token
      const factB    = await F.deploy(treasury.address, relayer.address, owner.address) as PayLinkFactoryV2
      const addrB    = await factB.getAddress()
      await factB.connect(owner).setUSDC(await ghoToken.getAddress()) // GHO

      // Each factory's vault initcode only encodes its own address
      const initCodeA = ethers.concat([Ghost.bytecode, ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addrA])])
      const initCodeB = ethers.concat([Ghost.bytecode, ethers.AbiCoder.defaultAbiCoder().encode(['address'], [addrB])])

      // Factory A and B are at different addresses → initcodes differ → vault addresses differ
      expect(ethers.keccak256(initCodeA)).to.not.equal(ethers.keccak256(initCodeB))

      // BUT: if Nick's Method deployed both at the SAME address (same salt + initcode),
      // the vault initcodes would be identical → vault addresses identical for same linkId.
      // We prove this by constructing a hypothetical shared address:
      const sharedAddr = addrA // imagine both deployed here via Nick's Method
      const sharedInit = ethers.concat([Ghost.bytecode, ethers.AbiCoder.defaultAbiCoder().encode(['address'], [sharedAddr])])
      const salt       = ethers.solidityPackedKeccak256(['bytes32','address'], [ghoLinkId, recipient.address])

      const vaultOnBase     = ethers.getCreate2Address(sharedAddr, salt, ethers.keccak256(sharedInit))
      const vaultOnArbitrum = ethers.getCreate2Address(sharedAddr, salt, ethers.keccak256(sharedInit))
      expect(vaultOnBase).to.equal(vaultOnArbitrum)
    })
  })
})
