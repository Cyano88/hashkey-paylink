import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import type { ArenaRoomEscrow, ArenaRoomEscrowFactory, MockERC20 } from '../typechain-types'

const PLATFORM_FEE_BPS = 50n
const RISK_LINEAR = 0
const RISK_CLIMB = 1
const RISK_FINALE = 2

function usdc(value: number): bigint {
  return BigInt(Math.round(value * 1e6))
}

function climbStreamed(entry: bigint, round: bigint, rounds: bigint) {
  return entry * round * (round + 1n) / (rounds * (rounds + 1n))
}

describe('ArenaRoomEscrow', () => {
  let host: SignerWithAddress
  let relayer: SignerWithAddress
  let treasury: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let carol: SignerWithAddress
  let token: MockERC20
  let factory: ArenaRoomEscrowFactory

  const roomId = ethers.id('SP-ARENA-ROOM-1')
  const salt = ethers.id('arena-salt-1')
  const entry = usdc(10)
  const rounds = 10

  beforeEach(async () => {
    ;[host, relayer, treasury, alice, bob, carol] = await ethers.getSigners()

    const ERC20 = await ethers.getContractFactory('MockERC20')
    token = await ERC20.deploy('Arc USDC', 'USDC', 6) as MockERC20

    const Factory = await ethers.getContractFactory('ArenaRoomEscrowFactory')
    factory = await Factory.deploy(await token.getAddress(), treasury.address, relayer.address) as ArenaRoomEscrowFactory
  })

  async function deployRoom(maxPlayers = 3): Promise<ArenaRoomEscrow> {
    await factory.connect(host).createRoom(roomId, entry, maxPlayers, rounds, RISK_CLIMB, salt)
    const escrowAddress = await factory.getEscrowAddress(roomId, host.address, entry, maxPlayers, rounds, RISK_CLIMB, salt)
    return ethers.getContractAt('ArenaRoomEscrow', escrowAddress) as Promise<ArenaRoomEscrow>
  }

  async function fundAndJoin(room: ArenaRoomEscrow, player: SignerWithAddress) {
    await token.mint(player.address, entry)
    await token.connect(player).transfer(await room.getAddress(), entry)
    await room.connect(player).join()
  }

  it('predicts the CREATE2 escrow address before deployment', async () => {
    const predicted = await factory.getEscrowAddress(roomId, host.address, entry, 3, rounds, RISK_CLIMB, salt)

    await expect(factory.connect(host).createRoom(roomId, entry, 3, rounds, RISK_CLIMB, salt))
      .to.emit(factory, 'ArenaRoomCreated')
      .withArgs(roomId, predicted, host.address, entry, 3, rounds, RISK_CLIMB, PLATFORM_FEE_BPS)

    expect(await ethers.provider.getCode(predicted)).to.not.equal('0x')
  })

  it('requires direct USDC funding before join', async () => {
    const room = await deployRoom()

    await expect(room.connect(alice).join())
      .to.be.revertedWithCustomError(room, 'InsufficientFunding')

    await fundAndJoin(room, alice)

    expect(await room.playerCount()).to.equal(1)
    expect(await room.activeCount()).to.equal(1)
    expect(await room.accountedDeposits()).to.equal(entry)
  })

  it('halts eliminated player risk and lets them refund the unstreamed balance', async () => {
    const room = await deployRoom()
    await fundAndJoin(room, alice)
    await fundAndJoin(room, bob)
    await room.connect(host).startRoom()

    const streamed = climbStreamed(entry, 2n, BigInt(rounds))
    const refund = entry - streamed

    await expect(room.connect(relayer).eliminate(alice.address, 2))
      .to.emit(room, 'PlayerEliminated')
      .withArgs(alice.address, 2, streamed, refund)

    const before = await token.balanceOf(alice.address)
    await expect(room.connect(alice).refund())
      .to.emit(room, 'PlayerRefunded')
      .withArgs(alice.address, refund)
    expect(await token.balanceOf(alice.address) - before).to.equal(refund)
  })

  it('settles to the last active winner and charges the 0.5% platform fee', async () => {
    const room = await deployRoom(3)
    await fundAndJoin(room, alice)
    await fundAndJoin(room, bob)
    await fundAndJoin(room, carol)
    await room.connect(host).startRoom()

    await room.connect(relayer).eliminate(alice.address, 2)
    await room.connect(relayer).eliminate(bob.address, 5)

    const fee = (entry * 3n * PLATFORM_FEE_BPS) / 10_000n
    const reservedRefunds = await room.reservedRefunds()
    const balance = await token.balanceOf(await room.getAddress())
    const expectedWinner = balance - reservedRefunds - fee + entry

    const treasuryBefore = await token.balanceOf(treasury.address)
    const carolBefore = await token.balanceOf(carol.address)

    await expect(room.connect(relayer).settleWinner(carol.address))
      .to.emit(room, 'RoomSettled')

    expect(await token.balanceOf(treasury.address) - treasuryBefore).to.equal(fee)
    expect(await token.balanceOf(carol.address) - carolBefore).to.equal(expectedWinner)
    expect(await room.platformFeePaid()).to.equal(true)
  })

  it('does not settle while more than one player is active', async () => {
    const room = await deployRoom()
    await fundAndJoin(room, alice)
    await fundAndJoin(room, bob)
    await room.connect(host).startRoom()

    await expect(room.connect(relayer).settleWinner(alice.address))
      .to.be.revertedWithCustomError(room, 'RoomStillContested')
  })

  it('matches the selected risk curve math on-chain', async () => {
    const linearSalt = ethers.id('arena-linear')
    const finaleSalt = ethers.id('arena-finale')

    await factory.connect(host).createRoom(ethers.id('linear-room'), entry, 2, rounds, RISK_LINEAR, linearSalt)
    await factory.connect(host).createRoom(ethers.id('finale-room'), entry, 2, rounds, RISK_FINALE, finaleSalt)

    const linearAddress = await factory.getEscrowAddress(ethers.id('linear-room'), host.address, entry, 2, rounds, RISK_LINEAR, linearSalt)
    const finaleAddress = await factory.getEscrowAddress(ethers.id('finale-room'), host.address, entry, 2, rounds, RISK_FINALE, finaleSalt)
    const linear = await ethers.getContractAt('ArenaRoomEscrow', linearAddress) as ArenaRoomEscrow
    const finale = await ethers.getContractAt('ArenaRoomEscrow', finaleAddress) as ArenaRoomEscrow

    expect(await linear.streamedThrough(5)).to.equal(entry / 2n)
    expect(await finale.streamedThrough(5)).to.equal(entry / 4n)
    expect(await linear.streamedThrough(rounds)).to.equal(entry)
    expect(await finale.streamedThrough(rounds)).to.equal(entry)
  })
})
