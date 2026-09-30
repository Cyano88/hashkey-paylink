import {expect} from 'chai'
import {ethers} from 'hardhat'
import {time,loadFixture} from '@nomicfoundation/hardhat-network-helpers'
const amount=100_000_000n,fee=250_000n
const types={Claim:[{name:'giftId',type:'bytes32'},{name:'recipient',type:'address'},{name:'deadline',type:'uint64'}]}
async function fixture(){
 const [sender,recipient,treasury,relayer,attacker]=await ethers.getSigners()
 const token:any=await(await ethers.getContractFactory('MockERC20')).deploy('Test USDC','USDC',6)
 const escrow:any=await(await ethers.getContractFactory('PocketGiftEscrow')).deploy(await token.getAddress(),treasury.address)
 const key=ethers.Wallet.createRandom(),salt=ethers.id('gift-one'),expiresAt=await time.latest()+86400
 const id=await escrow.giftIdFor(sender.address,salt)
 await token.mint(sender.address,amount*10n)
 await token.connect(sender).approve(await escrow.getAddress(),ethers.MaxUint256)
 const domain={name:'PocketGift',version:'1',chainId:31337,verifyingContract:await escrow.getAddress()}
 const fund=()=>escrow.connect(sender).createGift(salt,key.address,amount,expiresAt)
 const sign=(overrides:any={})=>key.signTypedData(domain,types,{giftId:id,recipient:recipient.address,deadline:expiresAt,...overrides})
 return{sender,recipient,treasury,relayer,attacker,token,escrow,key,salt,expiresAt,id,domain,fund,sign}
}
describe('PocketGiftEscrow (local only)',()=>{
 it('locks full principal and charges 0.25% exactly once',async()=>{const f=await loadFixture(fixture);await expect(f.fund()).to.emit(f.escrow,'GiftFunded').withArgs(f.id,f.sender.address,f.key.address,amount,fee,f.expiresAt);expect(await f.token.balanceOf(await f.escrow.getAddress())).eq(amount);expect(await f.token.balanceOf(f.treasury.address)).eq(fee);expect(await f.escrow.totalLocked()).eq(amount);await expect(f.fund()).revertedWithCustomError(f.escrow,'GiftExists');expect(await f.token.balanceOf(f.treasury.address)).eq(fee)})
 it('fails funding atomically when fee cannot be covered',async()=>{const f=await loadFixture(fixture);await f.token.connect(f.sender).transfer(f.attacker.address,amount*9n);await expect(f.fund()).reverted;expect((await f.escrow.gifts(f.id)).status).eq(0);expect(await f.escrow.totalLocked()).eq(0);expect(await f.token.balanceOf(f.treasury.address)).eq(0)})
 it('namespaces IDs to prevent another sender taking the gift ID',async()=>{const f=await loadFixture(fixture);await f.token.mint(f.attacker.address,amount+fee);await f.token.connect(f.attacker).approve(await f.escrow.getAddress(),amount+fee);await f.escrow.connect(f.attacker).createGift(f.salt,f.key.address,amount,f.expiresAt);await f.fund();expect(await f.escrow.totalLocked()).eq(amount*2n)})
 it('allows anyone to relay only the authorized payout',async()=>{const f=await loadFixture(fixture);await f.fund();const signature=await f.sign();await expect(f.escrow.connect(f.attacker).claim(f.id,f.attacker.address,f.expiresAt,signature)).revertedWithCustomError(f.escrow,'InvalidAuthorization');await expect(f.escrow.connect(f.relayer).claim(f.id,f.recipient.address,f.expiresAt,signature)).to.emit(f.escrow,'GiftClaimed').withArgs(f.id,f.recipient.address,amount);expect(await f.token.balanceOf(f.recipient.address)).eq(amount);expect(await f.token.balanceOf(f.relayer.address)).eq(0);expect(await f.escrow.totalLocked()).eq(0)})
 it('rejects double claims even with a fresh authorization',async()=>{const f=await loadFixture(fixture);await f.fund();await f.escrow.claim(f.id,f.recipient.address,f.expiresAt,await f.sign());await expect(f.escrow.claim(f.id,f.attacker.address,f.expiresAt,await f.sign({recipient:f.attacker.address}))).revertedWithCustomError(f.escrow,'GiftNotAvailable');expect(await f.token.balanceOf(f.recipient.address)).eq(amount)})
 it('rejects another gift ID, chain and contract domain',async()=>{const f=await loadFixture(fixture);await f.fund();for(const domain of [{...f.domain,chainId:1},{...f.domain,verifyingContract:f.attacker.address}]){const sig=await f.key.signTypedData(domain,types,{giftId:f.id,recipient:f.recipient.address,deadline:f.expiresAt});await expect(f.escrow.claim(f.id,f.recipient.address,f.expiresAt,sig)).revertedWithCustomError(f.escrow,'InvalidAuthorization')}await expect(f.escrow.claim(f.id,f.recipient.address,f.expiresAt,await f.sign({giftId:ethers.id('other')}))).revertedWithCustomError(f.escrow,'InvalidAuthorization')})
 it('rejects wrong key and malformed signatures',async()=>{const f=await loadFixture(fixture);await f.fund();await expect(f.escrow.claim(f.id,f.recipient.address,f.expiresAt,'0x')).reverted;const sig=await f.attacker.signTypedData(f.domain,types,{giftId:f.id,recipient:f.recipient.address,deadline:f.expiresAt});await expect(f.escrow.claim(f.id,f.recipient.address,f.expiresAt,sig)).revertedWithCustomError(f.escrow,'InvalidAuthorization')})
 it('rejects missing gifts, zero and escrow recipients',async()=>{const f=await loadFixture(fixture);await expect(f.escrow.claim(f.id,f.recipient.address,f.expiresAt,'0x')).revertedWithCustomError(f.escrow,'GiftNotAvailable');await f.fund();for(const address of [ethers.ZeroAddress,await f.escrow.getAddress()])await expect(f.escrow.claim(f.id,address,f.expiresAt,'0x')).revertedWithCustomError(f.escrow,'InvalidRecipient')})
 it('expires claim authorization without consuming the gift',async()=>{const f=await loadFixture(fixture);await f.fund();const deadline=await time.latest()+10;const sig=await f.sign({deadline});await time.increaseTo(deadline+1);await expect(f.escrow.claim(f.id,f.recipient.address,deadline,sig)).revertedWithCustomError(f.escrow,'InvalidAuthorization');expect((await f.escrow.gifts(f.id)).status).eq(1);await expect(f.escrow.claim(f.id,f.recipient.address,f.expiresAt+1,await f.sign({deadline:f.expiresAt+1}))).revertedWithCustomError(f.escrow,'InvalidAuthorization')})
 it('prevents early refunds, returns expired principal only to sender, once',async()=>{const f=await loadFixture(fixture);await f.fund();await expect(f.escrow.connect(f.sender).refundExpired(f.id)).revertedWithCustomError(f.escrow,'NotExpired');await time.increaseTo(f.expiresAt);await expect(f.escrow.claim(f.id,f.recipient.address,f.expiresAt,await f.sign())).revertedWithCustomError(f.escrow,'GiftExpired');const before=await f.token.balanceOf(f.sender.address);await expect(f.escrow.connect(f.attacker).refundExpired(f.id)).to.emit(f.escrow,'GiftRefunded').withArgs(f.id,f.sender.address,amount);expect(await f.token.balanceOf(f.sender.address)).eq(before+amount);expect(await f.token.balanceOf(f.attacker.address)).eq(0);expect(await f.escrow.totalLocked()).eq(0);await expect(f.escrow.refundExpired(f.id)).revertedWithCustomError(f.escrow,'GiftNotAvailable')})
 it('cannot refund a claimed gift',async()=>{const f=await loadFixture(fixture);await f.fund();await f.escrow.claim(f.id,f.recipient.address,f.expiresAt,await f.sign());await time.increaseTo(f.expiresAt);await expect(f.escrow.refundExpired(f.id)).revertedWithCustomError(f.escrow,'GiftNotAvailable')})
 it('rejects deflationary funding atomically',async()=>{const f=await loadFixture(fixture);const token:any=await(await ethers.getContractFactory('MockFeeOnTransferERC20')).deploy();const escrow:any=await(await ethers.getContractFactory('PocketGiftEscrow')).deploy(await token.getAddress(),f.treasury.address);await token.mint(f.sender.address,amount+fee);await token.approve(await escrow.getAddress(),amount+fee);await expect(escrow.createGift(f.salt,f.key.address,amount,f.expiresAt)).revertedWithCustomError(escrow,'IncorrectFunding');expect(await escrow.totalLocked()).eq(0);expect(await token.balanceOf(f.sender.address)).eq(amount+fee)})
 it('rejects invalid token, treasury and creation parameters',async()=>{const f=await loadFixture(fixture);const factory=await ethers.getContractFactory('PocketGiftEscrow');await expect(factory.deploy(f.attacker.address,f.treasury.address)).revertedWithCustomError(factory,'InvalidGift');await expect(factory.deploy(await f.token.getAddress(),ethers.ZeroAddress)).revertedWithCustomError(factory,'InvalidGift');const wrong=await(await ethers.getContractFactory('MockERC20')).deploy('Wrong','W',18);await expect(factory.deploy(await wrong.getAddress(),f.treasury.address)).revertedWithCustomError(factory,'InvalidGift');for(const args of [[ethers.ZeroHash,f.key.address,amount,f.expiresAt],[f.salt,ethers.ZeroAddress,amount,f.expiresAt],[f.salt,f.key.address,0,f.expiresAt],[f.salt,f.key.address,amount,1]])await expect(f.escrow.createGift(...args)).revertedWithCustomError(f.escrow,'InvalidGift')})
 it('matches Pocket fee rounding without altering principal',async()=>{const f=await loadFixture(fixture);expect(await f.escrow.platformFee(1)).eq(0);expect(await f.escrow.platformFee(400)).eq(1);expect(await f.escrow.platformFee(401)).eq(1)})
 it('rolls back funding if treasury transfer is blocked',async()=>{
  const f=await loadFixture(fixture);const token:any=await(await ethers.getContractFactory('GiftBlockedTokenMock')).deploy();const escrow:any=await(await ethers.getContractFactory('PocketGiftEscrow')).deploy(await token.getAddress(),f.treasury.address)
  await token.mint(f.sender.address,amount+fee);await token.approve(await escrow.getAddress(),amount+fee);await token.setBlocked(f.treasury.address,true)
  await expect(escrow.createGift(f.salt,f.key.address,amount,f.expiresAt)).revertedWith('Blocked token account');expect(await token.balanceOf(f.sender.address)).eq(amount+fee);expect(await escrow.totalLocked()).eq(0);expect((await escrow.gifts(f.id)).status).eq(0)
 })
 it('keeps failed payout available and permits the same authorized retry',async()=>{
  const f=await loadFixture(fixture);const token:any=await(await ethers.getContractFactory('GiftBlockedTokenMock')).deploy();const escrow:any=await(await ethers.getContractFactory('PocketGiftEscrow')).deploy(await token.getAddress(),f.treasury.address)
  await token.mint(f.sender.address,amount+fee);await token.approve(await escrow.getAddress(),amount+fee);await escrow.createGift(f.salt,f.key.address,amount,f.expiresAt)
  const signature=await f.key.signTypedData({...f.domain,verifyingContract:await escrow.getAddress()},types,{giftId:f.id,recipient:f.recipient.address,deadline:f.expiresAt})
  await token.setBlocked(f.recipient.address,true);await expect(escrow.claim(f.id,f.recipient.address,f.expiresAt,signature)).revertedWith('Blocked token account');expect((await escrow.gifts(f.id)).status).eq(1);expect(await escrow.totalLocked()).eq(amount)
  await token.setBlocked(f.recipient.address,false);await escrow.claim(f.id,f.recipient.address,f.expiresAt,signature);expect(await token.balanceOf(f.recipient.address)).eq(amount);expect(await escrow.totalLocked()).eq(0)
 })
 it('does not consume a refund if the token blocks the sender',async()=>{
  const f=await loadFixture(fixture);const token:any=await(await ethers.getContractFactory('GiftBlockedTokenMock')).deploy();const escrow:any=await(await ethers.getContractFactory('PocketGiftEscrow')).deploy(await token.getAddress(),f.treasury.address)
  await token.mint(f.sender.address,amount+fee);await token.approve(await escrow.getAddress(),amount+fee);await escrow.createGift(f.salt,f.key.address,amount,f.expiresAt);await time.increaseTo(f.expiresAt)
  await token.setBlocked(f.sender.address,true);await expect(escrow.refundExpired(f.id)).revertedWith('Blocked token account');expect((await escrow.gifts(f.id)).status).eq(1);expect(await escrow.totalLocked()).eq(amount)
  await token.setBlocked(f.sender.address,false);await escrow.refundExpired(f.id);expect(await token.balanceOf(f.sender.address)).eq(amount);expect(await escrow.totalLocked()).eq(0)
 })
 it('settles only one of two competing claims in the same block',async()=>{
  const f=await loadFixture(fixture);await f.fund();const sig1=await f.sign(),sig2=await f.sign({recipient:f.attacker.address});await ethers.provider.send('evm_setAutomine',[false])
  try {
   const a=await f.escrow.connect(f.relayer).claim(f.id,f.recipient.address,f.expiresAt,sig1,{gasLimit:200000})
   const b=await f.escrow.connect(f.attacker).claim(f.id,f.attacker.address,f.expiresAt,sig2,{gasLimit:200000})
   await ethers.provider.send('evm_mine',[])
   const results=await Promise.all([ethers.provider.getTransactionReceipt(a.hash),ethers.provider.getTransactionReceipt(b.hash)])
   expect(results.map(r=>r!.status).sort()).deep.eq([0,1]);expect(await f.token.balanceOf(f.recipient.address)+await f.token.balanceOf(f.attacker.address)).eq(amount);expect(await f.escrow.totalLocked()).eq(0)
  } finally {await ethers.provider.send('evm_setAutomine',[true])}
 })
 it('keeps aggregate principal equal to all outstanding gifts',async()=>{
  const f=await loadFixture(fixture);let remaining=0n;const pending:string[]=[]
  for(let i=0;i<10;i++){
   const salt=ethers.id('batch-'+i),value=BigInt(i+1)*1_000_000n,id=await f.escrow.giftIdFor(f.sender.address,salt)
   await f.escrow.createGift(salt,f.key.address,value,f.expiresAt);remaining+=value
   if(i%2===0){await f.escrow.claim(id,f.recipient.address,f.expiresAt,await f.sign({giftId:id}));remaining-=value}else pending.push(id)
   expect(await f.escrow.totalLocked()).eq(remaining);expect(await f.token.balanceOf(await f.escrow.getAddress())).eq(remaining)
  }
  await time.increaseTo(f.expiresAt);for(const id of pending)await f.escrow.refundExpired(id)
  expect(await f.escrow.totalLocked()).eq(0);expect(await f.token.balanceOf(await f.escrow.getAddress())).eq(0)
 })
})
