import {expect} from 'chai'
import {ethers} from 'hardhat'
import {time} from '@nomicfoundation/hardhat-network-helpers'
import {randomUUID} from 'node:crypto'
import path from 'node:path'
const {buildSync}=require('esbuild')
const bundle=path.resolve(__dirname,'../cache-gifts/multi-service.cjs')
buildSync({stdin:{contents:"export{createGiftService}from'./api/pocket/gifts/service';export{observeGift}from'./api/pocket/gifts/chain';export{giftWalletCall}from'./api/pocket/gifts/circle';export{giftReceiptActions}from'./api/pocket/gifts/receipts';export{multiGiftAccountId}from'./api/pocket/gifts/multi-authorization';export{createGiftCapability,signMultiGiftClaim}from'./src/pocket/features/gifts/pocketGiftSigning';",resolveDir:path.resolve(__dirname,'../..'),loader:'ts'},bundle:true,platform:'node',format:'cjs',packages:'external',outfile:bundle})
const {createGiftService,observeGift,giftWalletCall,giftReceiptActions,multiGiftAccountId,createGiftCapability,signMultiGiftClaim}=require(bundle)
const {createPublicClient,custom,keccak256}=require('viem')
describe('Multi-gift local service-to-chain integration',()=>{
 it('persists a funded gift, confirms ten separate claims and publishes exact receipts',async()=>{
 const [sender,treasury,authority,...recipients]=await ethers.getSigners(),token:any=await(await ethers.getContractFactory('MockERC20')).deploy('USDC','USDC',6)
 const escrow:any=await(await ethers.getContractFactory('PocketMultiGiftEscrow')).deploy([token.target],treasury.address,authority.address)
 const mined=await escrow.deploymentTransaction().wait(),code=await ethers.provider.getCode(escrow.target)
 const deployment={network:'base',chainId:31337,escrow:escrow.target,token:token.target,treasury:treasury.address,claimAuthority:authority.address,protocol:2,runtimeHash:keccak256(code),confirmations:2,deploymentBlock:String(mined.blockNumber)}
 const client=createPublicClient({transport:custom({request:({method,params}:any)=>ethers.provider.send(method,params||[])})})
 const rows=new Map<string,any>(),calls=new Map<string,any>();let queue=Promise.resolve(),now=await time.latest()
 const store={read:async(id:string)=>structuredClone(rows.get(id)),update:(id:string,fn:any)=>{const p=queue.then(()=>{const r=fn(structuredClone(rows.get(id)));rows.set(id,structuredClone(r));return structuredClone(r)});queue=p.then(()=>{},()=>{});return p}}
 const wallet=(id:string)=>id==='sender'?sender:recipients[Number(id)]
 const service=createGiftService({store,now:()=>now*1000,deployment:()=>deployment,accountId:(id:string,user:string)=>multiGiftAccountId('a'.repeat(64),id,user),signAccountClaim:(data:any)=>authority.signTypedData(data.domain,data.types,data.message),wallet:async(user:string)=>({id:'wallet-'+user,address:wallet(user).address}),observe:(r:any)=>observeGift(client,r),challenge:async(input:any)=>{calls.set(input.attempt.id,{input,data:giftWalletCall(input.record,input.kind,input.attempt)});return {challengeId:input.attempt.id,transactionId:input.attempt.id}}})
 const batch=new ethers.Interface(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
 async function approve(approval:any){const call=calls.get(approval.id);for(const c of batch.decodeFunctionData('executeBatch',call.data)[0])await(await wallet(call.input.attempt.userId).sendTransaction({to:c.target,data:c.data,value:c.value})).wait();await ethers.provider.send('evm_mine',[]);now=await time.latest()}
 await token.mint(sender.address,100250000n);await ethers.provider.send('evm_mine',[]);now=await time.latest()
 const cap=createGiftCapability(),identity={userId:'sender',handle:'sender'}
 const created=await service.create(identity,{requestId:randomUUID(),network:'base',amount:'100',claims:'10',claimSigner:cap.signer,expiresAt:String(now+86400),message:'Ten gifts'})
 expect(created.funding.totalDebit).eq('100250000');const id=created.gift.id
 await approve((await service.authorize(identity,id,'funding','fixture')).approval)
 expect((await service.view(id)).remainingClaims).eq(10)
 for(let i=0;i<10;i++){
  const who={userId:String(i),handle:'recipient'},details=await service.claimDetails(who,id),signature=await signMultiGiftClaim(cap.secret,{...details,deadline:BigInt(details.deadline)})
  const approval=(await service.authorize(who,id,'claim','fixture',{signature,deadline:details.deadline})).approval
  await approve(approval);expect((await service.claimStatus(who,id)).status).eq('confirmed');expect((await service.view(id)).remainingClaims).eq(9-i)
 }
 expect((await service.view(id)).status).eq('claimed');const actions=giftReceiptActions(rows.get(id));expect(actions.filter((a:any)=>a.action==='gift.received')).length(10);expect(new Set(actions.map((a:any)=>a.ownerId)).size).eq(11);expect(actions.filter((a:any)=>a.action==='gift.received').every((a:any)=>a.metadata.amount==='10')).eq(true)
 expect(await token.balanceOf(escrow.target)).eq(0n)
 await token.mint(sender.address,100250000n);await ethers.provider.send('evm_mine',[]);now=await time.latest()
 const expiry=now+100,partial=await service.create(identity,{requestId:randomUUID(),network:'base',amount:'100',claims:'10',claimSigner:cap.signer,expiresAt:String(expiry),message:'Partial refund'})
 await approve((await service.authorize(identity,partial.gift.id,'funding','fixture')).approval)
 const who={userId:'0',handle:'recipient'},details=await service.claimDetails(who,partial.gift.id),signature=await signMultiGiftClaim(cap.secret,{...details,deadline:BigInt(details.deadline)})
 await approve((await service.authorize(who,partial.gift.id,'claim','fixture',{signature,deadline:details.deadline})).approval)
 await time.increaseTo(expiry);await ethers.provider.send('evm_mine',[]);now=await time.latest()
 const before=await token.balanceOf(sender.address);await approve((await service.authorize(identity,partial.gift.id,'refund','fixture')).approval)
 expect((await service.view(partial.gift.id)).status).eq('refunded');expect(await token.balanceOf(sender.address)).eq(before+90000000n)
 const receipt=giftReceiptActions(rows.get(partial.gift.id)).find((a:any)=>a.action==='gift.sent');expect(receipt.metadata.refundAmount).eq('90');expect((await service.claimStatus(who,partial.gift.id)).status).eq('confirmed')
 })
})
