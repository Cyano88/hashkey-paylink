import {expect} from 'chai'
import {ethers} from 'hardhat'
import {time} from '@nomicfoundation/hardhat-network-helpers'
import path from 'node:path'
const {buildSync}=require('esbuild')
const bundle=path.resolve(__dirname,'../cache-gifts/stock-share-integration.cjs')
buildSync({stdin:{contents:"export{observeMultiGift}from'./api/pocket/gifts/multi-chain';export{prepareStockGiftFundingCalls}from'./src/pocket/api/pocketStockGiftExecution';export{giftReceiptActions}from'./api/pocket/gifts/receipts';",resolveDir:path.resolve(__dirname,'../..'),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:bundle})
const {observeMultiGift,prepareStockGiftFundingCalls,giftReceiptActions}=require(bundle)
const {createPublicClient,custom,keccak256}=require('viem')
// Real catalogue identity, with mock bytecode in the local EVM only.
const stockAddress='0xc845b2894dbddd03858fd2d643b4ef725fe0849d'
describe('Share gift wallet / observer / receipt integration (local)',()=>{
 it('uses wallet-generated calldata, then verifies actual claim/refund receipts across a rebase',async()=>{
  const [sender,treasury,authority,recipient]=await ethers.getSigners()
  const mock:any=await(await ethers.getContractFactory('GiftShareRoundingMock')).deploy()
  await ethers.provider.send('hardhat_setCode',[stockAddress,await ethers.provider.getCode(mock.target)])
  const token:any=await ethers.getContractAt('GiftShareRoundingMock',stockAddress)
  await token.setMultiplier(1001701196801074000n);await token.mintShares(sender.address,10n**18n)
  const escrow:any=await(await ethers.getContractFactory('PocketStockGiftEscrow')).deploy([stockAddress],treasury.address,authority.address)
  const mined=await escrow.deploymentTransaction().wait(),runtimeHash=keccak256(await ethers.provider.getCode(escrow.target))
  const asset={chainId:196,token:stockAddress,symbol:'NVDAx',decimals:18,rail:'xstocks'},salt=ethers.id('share-integration'),key=ethers.Wallet.createRandom(),expiry=await time.latest()+86400
  const client=createPublicClient({transport:custom({request:({method,params}:any)=>ethers.provider.send(method,params||[])})})
  const walletClient=new Proxy(client,{get:(target:any,property)=>property==='getChainId'?async()=>196:target[property]})
  const review={accounting:'shares-v1',owner:sender.address,escrow:escrow.target,runtimeHash,treasury:treasury.address,authority:authority.address,asset,signer:key.address,salt,amountPerRecipient:'0.00001',recipients:2,expiresAt:BigInt(expiry)}
  let prepared=await prepareStockGiftFundingCalls(review,walletClient,BigInt(await time.latest()))
  expect(prepared.calls.length).eq(2)
  await sender.sendTransaction(prepared.calls[0]);prepared=await prepareStockGiftFundingCalls(review,walletClient,BigInt(await time.latest()))
  expect(prepared.calls.length).eq(1);await sender.sendTransaction(prepared.calls[0]);await ethers.provider.send('evm_mine',[])
  let record:any={version:2,id:'fixture',ownerId:'owner',deployment:{network:'xlayer',accounting:'shares-v1',protocol:2,chainId:31337,escrow:escrow.target,token:stockAddress,treasury:treasury.address,claimAuthority:authority.address,runtimeHash,deploymentBlock:String(mined.blockNumber),confirmations:2,asset},giftId:await escrow.giftIdFor(sender.address,salt),senderAddress:sender.address,claimSigner:key.address,amountPerClaim:'0.00001',amount:'0.00002',amountUnits:'20000000000000',feeUnits:'50000000000',maxClaims:2,expiresAt:String(expiry),state:'unfunded',settlements:{}}
  const refresh=async()=>{const observation=await observeMultiGift(client,record);record={...record,...observation,observedBlock:String(observation.blockNumber),observedBlockHash:observation.blockHash};return observation}
  const funded=await refresh();expect(funded.state).eq('available');expect(funded.fundingHash).to.match(/^0x/)
  expect(BigInt(funded.fundedUnits)).lessThanOrEqual(20000000000000n)
  await token.setMultiplier(2000000000000000000n);await ethers.provider.send('evm_mine',[])
  const updated=await refresh();expect(BigInt(updated.currentAmountPerClaim)).greaterThan(10000000000000n)
  const accountId=ethers.id('claimant'),value={giftId:record.giftId,accountId,recipient:recipient.address,deadline:expiry},domain={name:'PocketMultiGift',version:'1',chainId:31337,verifyingContract:escrow.target},types={Claim:[{name:'giftId',type:'bytes32'},{name:'accountId',type:'bytes32'},{name:'recipient',type:'address'},{name:'deadline',type:'uint64'}]}
  record.claims={[accountId]:{userId:'claimant',walletAddress:recipient.address}}
  await escrow.claim(record.giftId,accountId,recipient.address,expiry,await key.signTypedData(domain,types,value),await authority.signTypedData(domain,types,value));await ethers.provider.send('evm_mine',[])
  const claimed=await refresh();expect(BigInt(claimed.settlements[accountId].amountUnits)).eq(await token.balanceOf(recipient.address))
  const actions=giftReceiptActions(record);expect(actions.find((a:any)=>a.action==='gift.received').metadata.amount).eq(ethers.formatUnits(await token.balanceOf(recipient.address),18))
  await time.increaseTo(expiry);const before=await token.balanceOf(sender.address);await escrow.refundExpired(record.giftId);await ethers.provider.send('evm_mine',[])
  const refunded=await refresh();expect(refunded.state).eq('refunded');expect(BigInt(refunded.refundUnits)).eq(await token.balanceOf(sender.address)-before)
  expect(await escrow.totalLockedShares(stockAddress)).eq(0n)
 })
})
