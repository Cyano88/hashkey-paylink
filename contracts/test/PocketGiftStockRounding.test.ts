import {expect} from 'chai'
import {ethers} from 'hardhat'
import {time} from '@nomicfoundation/hardhat-network-helpers'

describe('XStocks gift rounding regression (local only)',()=>{
 it('reproduces the live one-atom deposit and fee receipt shortfall',async()=>{
  const [sender,escrow,treasury]=await ethers.getSigners()
  const token:any=await(await ethers.getContractFactory('GiftShareRoundingMock')).deploy()
  await token.mintShares(sender.address,10n**18n)
  const deposit=20050000000000n,fee=50000000000n
  await token.transfer(escrow.address,deposit)
  expect(await token.balanceOf(escrow.address)).eq(deposit-1n)
  await token.connect(escrow).transfer(treasury.address,fee)
  expect(await token.balanceOf(treasury.address)).eq(fee-1n)
 })
 it('keeps the deployed exact-transfer guard: failed funding creates no liability',async()=>{
  const [sender,treasury,authority]=await ethers.getSigners()
  const token:any=await(await ethers.getContractFactory('GiftShareRoundingMock')).deploy()
  const escrow:any=await(await ethers.getContractFactory('PocketMultiGiftEscrow')).deploy([token.target],treasury.address,authority.address)
  await token.mintShares(sender.address,10n**18n);await token.approve(escrow.target,20050000000000n)
  const salt=ethers.id('rounding-regression'),id=await escrow.giftIdFor(sender.address,salt),before=await token.sharesOf(sender.address)
  await expect(escrow.createGift(salt,token.target,authority.address,10000000000000n,2,await time.latest()+86400)).revertedWithCustomError(escrow,'IncorrectTransfer')
  expect(await escrow.totalLocked(token.target)).eq(0n);expect((await escrow.gifts(id)).status).eq(0n)
  expect(await token.sharesOf(sender.address)).eq(before);expect(await token.sharesOf(escrow.target)).eq(0n)
 })
 it('demonstrates exact internal shares survive multiplier changes while nominal balances do not',async()=>{
  const [sender,escrow,recipient]=await ethers.getSigners()
  const token:any=await(await ethers.getContractFactory('GiftShareRoundingMock')).deploy()
  await token.mintShares(sender.address,1000n);await token.transferShares(escrow.address,200n)
  await token.setMultiplier(500000000000000000n)
  expect(await token.sharesOf(escrow.address)).eq(200n);expect(await token.balanceOf(escrow.address)).eq(100n)
  await token.connect(escrow).transferShares(recipient.address,100n)
  expect(await token.sharesOf(recipient.address)).eq(100n);expect(await token.sharesOf(escrow.address)).eq(100n)
 })
})
