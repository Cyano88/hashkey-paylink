import {expect} from 'chai'
import {ethers} from 'hardhat'
import {time,loadFixture} from '@nomicfoundation/hardhat-network-helpers'
const types={Claim:[{name:'giftId',type:'bytes32'},{name:'accountId',type:'bytes32'},{name:'recipient',type:'address'},{name:'deadline',type:'uint64'}]}
async function fixture(){
 const [sender,treasury,authority,...recipients]=await ethers.getSigners()
 const token:any=await(await ethers.getContractFactory('GiftShareRoundingMock')).deploy()
 const escrow:any=await(await ethers.getContractFactory('PocketStockGiftEscrow')).deploy([token.target],treasury.address,authority.address)
 await token.mintShares(sender.address,10n**18n);await token.approve(escrow.target,ethers.MaxUint256)
 const key=ethers.Wallet.createRandom(),salt=ethers.id('share-gift'),id=await escrow.giftIdFor(sender.address,salt),expiry=await time.latest()+86400,per=10000000000000n
 const q=await escrow.quote(token.target,per,2)
 const request={salt,token:token.target,signer:key.address,requestedPerClaim:per,count:2,expiresAt:expiry,expectedMultiplier:q.multiplier,maxDebitUnits:20050000000000n}
 const domain={name:'PocketMultiGift',version:'1',chainId:31337,verifyingContract:escrow.target}
 async function claim(i:number,recipient=recipients[i].address,accountId=ethers.id('account:'+i)){
  const value={giftId:id,accountId,recipient,deadline:expiry}
  return escrow.claim(id,accountId,recipient,expiry,await key.signTypedData(domain,types,value),await authority.signTypedData(domain,types,value))
 }
 return {sender,treasury,authority,recipients,token,escrow,key,id,expiry,per,q,request,domain,claim}
}
describe('PocketStockGiftEscrow (local only)',()=>{
 it('funds the previously failing amount and pays exact equal shares',async()=>{
  const f=await loadFixture(fixture),before=await f.token.sharesOf(f.sender.address)
  await f.escrow.createGift(f.request)
  expect(await f.token.sharesOf(f.treasury.address)).eq(f.q.feeShares)
  expect(await f.token.sharesOf(f.escrow.target)).eq(f.q.perShares*2n)
  expect(before-await f.token.sharesOf(f.sender.address)).eq(f.q.perShares*2n+f.q.feeShares)
  await f.claim(0);await f.claim(1)
  for(const r of f.recipients.slice(0,2))expect(await f.token.sharesOf(r.address)).eq(f.q.perShares)
  expect(await f.escrow.totalLockedShares(f.token.target)).eq(0n);expect(await f.token.sharesOf(f.escrow.target)).eq(0n)
 })
 for(const multiplier of [2000000000000000000n,500000000000000000n])it('keeps claims/refunds solvent after multiplier '+multiplier,async()=>{
  const f=await loadFixture(fixture);await f.escrow.createGift(f.request);await f.token.setMultiplier(multiplier)
  expect(await f.escrow.currentAmountPerClaim(f.id)).eq(f.q.perShares*multiplier/10n**18n)
  await f.claim(0);await time.increaseTo(f.expiry)
  const before=await f.token.sharesOf(f.sender.address);await f.escrow.connect(f.recipients[2]).refundExpired(f.id)
  expect(await f.token.sharesOf(f.sender.address)-before).eq(f.q.perShares)
  expect(await f.token.sharesOf(f.recipients[0].address)).eq(f.q.perShares)
  expect(await f.token.sharesOf(f.treasury.address)).eq(f.q.feeShares)
  expect(await f.escrow.totalLockedShares(f.token.target)).eq(0n)
 })
 it('rejects stale multipliers and insufficient debit limits',async()=>{
  const f=await loadFixture(fixture);await f.token.setMultiplier(2n*10n**18n)
  await expect(f.escrow.createGift(f.request)).revertedWithCustomError(f.escrow,'QuoteChanged')
  await f.token.setMultiplier(f.q.multiplier)
  await expect(f.escrow.createGift({...f.request,maxDebitUnits:1n})).revertedWithCustomError(f.escrow,'QuoteChanged')
  expect(await f.escrow.totalLockedShares(f.token.target)).eq(0n)
 })
 it('blocks duplicate accounts, wallets and funding',async()=>{
  const f=await loadFixture(fixture);await f.escrow.createGift(f.request);await f.claim(0)
  await expect(f.claim(1,f.recipients[1].address,ethers.id('account:0'))).revertedWithCustomError(f.escrow,'AlreadyClaimed')
  await expect(f.claim(1,f.recipients[0].address)).revertedWithCustomError(f.escrow,'AlreadyClaimed')
  await expect(f.escrow.createGift(f.request)).revertedWithCustomError(f.escrow,'GiftExists')
 })
 it('keeps overlapping gifts separately backed and supports 1000 recipients',async()=>{
  const f=await loadFixture(fixture);await f.escrow.createGift(f.request)
  const q=await f.escrow.quote(f.token.target,f.per,1000)
  await f.escrow.createGift({...f.request,salt:ethers.id('other'),count:1000,maxDebitUnits:f.per*1000n*10025n/10000n})
  await f.claim(0);await f.claim(1)
  expect(await f.escrow.totalLockedShares(f.token.target)).eq(q.perShares*1000n)
  expect(await f.token.sharesOf(f.escrow.target)).eq(q.perShares*1000n)
 })
 it('rejects zero-share dust and invalid counts',async()=>{
  const f=await loadFixture(fixture)
  for(const [amount,count]of [[1n,2],[f.per,1001],[f.per,0]] as const)await expect(f.escrow.quote(f.token.target,amount,count)).revertedWithCustomError(f.escrow,'InvalidGift')
 })
 it('cannot refund early or claim after expiry',async()=>{
  const f=await loadFixture(fixture);await f.escrow.createGift(f.request)
  await expect(f.escrow.refundExpired(f.id)).revertedWithCustomError(f.escrow,'NotExpired')
  await time.increaseTo(f.expiry);await expect(f.claim(0)).revertedWithCustomError(f.escrow,'Expired')
  await f.escrow.refundExpired(f.id);await expect(f.escrow.refundExpired(f.id)).revertedWithCustomError(f.escrow,'GiftUnavailable')
 })
 it('rolls back short-share funding and payout without consuming a claim',async()=>{
  const f=await loadFixture(fixture);await f.token.setShortShares(true)
  await expect(f.escrow.createGift(f.request)).revertedWithCustomError(f.escrow,'IncorrectTransfer')
  expect(await f.escrow.totalLockedShares(f.token.target)).eq(0n)
  await f.token.setShortShares(false);await f.escrow.createGift(f.request);await f.token.setShortShares(true)
  await expect(f.claim(0)).revertedWithCustomError(f.escrow,'IncorrectTransfer')
  expect((await f.escrow.gifts(f.id)).claimed).eq(0n);expect(await f.escrow.claimedAccount(f.id,ethers.id('account:0'))).eq(false)
  expect(await f.token.sharesOf(f.escrow.target)).eq(f.q.perShares*2n)
 })
 it('keeps a blocked claim recoverable and requires both signatures',async()=>{
  const f=await loadFixture(fixture);await f.escrow.createGift(f.request);await f.token.setBlocked(f.recipients[0].address)
  await expect(f.claim(0)).revertedWith('Blocked');expect((await f.escrow.gifts(f.id)).claimed).eq(0n)
  await f.token.setBlocked(ethers.ZeroAddress)
  const accountId=ethers.id('bad-authority'),value={giftId:f.id,accountId,recipient:f.recipients[0].address,deadline:f.expiry},signature=await f.key.signTypedData(f.domain,types,value)
  await expect(f.escrow.claim(f.id,accountId,value.recipient,f.expiry,signature,signature)).revertedWithCustomError(f.escrow,'Unauthorized')
  await f.claim(0)
 })

})
