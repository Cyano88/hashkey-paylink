import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomUUID} from 'node:crypto'
import {createPublicClient,createWalletClient,http,defineChain,keccak256} from 'viem'
import {createGiftService} from '../api/pocket/gifts/service.ts'
import {observeGift} from '../api/pocket/gifts/chain.ts'
import {giftWalletCall} from '../api/pocket/gifts/circle.ts'
import {createGiftCapability,signGiftClaim} from '../src/pocket/features/gifts/pocketGiftSigning.ts'
const chain=defineChain({id:31337,name:'Local gift tests',nativeCurrency:{name:'Test ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1:8547']}}})
const client=createPublicClient({chain,transport:http('http://127.0.0.1:8547')})
assert.equal(await client.getChainId(),31337,'Refuse any non-local chain')
const accounts=await client.request({method:'eth_accounts'})
const wallet=account=>createWalletClient({chain,account,transport:http('http://127.0.0.1:8547')})
const artifact=async path=>JSON.parse(await readFile(new URL('../contracts/artifacts-gifts/contracts/'+path,import.meta.url),'utf8'))
const tokenArtifact=await artifact('test/MockERC20.sol/MockERC20.json'),escrowArtifact=await artifact('gifts/PocketGiftEscrow.sol/PocketGiftEscrow.json'),walletArtifact=await artifact('gifts/GiftWalletMock.sol/GiftWalletMock.json')
async function deploy(art,args){const hash=await wallet(accounts[0]).deployContract({abi:art.abi,bytecode:art.bytecode,args});const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');return receipt.contractAddress}
const token=await deploy(tokenArtifact,['Test USDC','USDC',6]),escrow=await deploy(escrowArtifact,[token,accounts[3]]),aliceWallet=await deploy(walletArtifact,[accounts[0]]),bobWallet=await deploy(walletArtifact,[accounts[1]])
async function write(account,address,abi,functionName,args){const hash=await wallet(account).writeContract({address,abi,functionName,args});const receipt=await client.waitForTransactionReceipt({hash});assert.equal(receipt.status,'success');return hash}
await write(accounts[0],token,tokenArtifact.abi,'mint',[aliceWallet,500000000n])
const deployment={network:'base',chainId:31337,escrow,token,treasury:accounts[3],runtimeHash:keccak256(await client.getCode({address:escrow})),confirmations:1}
const records=new Map(),challenges=new Map();let queue=Promise.resolve(),now=Number((await client.getBlock()).timestamp)*1000
const store={read:async id=>structuredClone(records.get(id)),update:(id,fn)=>{const promise=queue.then(()=>{const value=fn(structuredClone(records.get(id)));records.set(id,structuredClone(value));return structuredClone(value)});queue=promise.catch(()=>{});return promise}}
const service=createGiftService({store,now:()=>now,deployment:()=>deployment,wallet:async user=>({id:'mock-'+user,address:user==='alice'?aliceWallet:bobWallet}),observe:r=>observeGift(client,r),challenge:async input=>{challenges.set(input.attempt.id,{owner:input.attempt.userId,data:giftWalletCall(input.record,input.kind,input.attempt)});return {challengeId:input.attempt.id,transactionId:''}}})
const alice={userId:'alice',handle:'shy'},bob={userId:'bob',handle:'bob'}
async function approve(result){const challenge=challenges.get(result.approval.challengeId);const hash=await wallet(challenge.owner==='alice'?accounts[0]:accounts[1]).sendTransaction({to:challenge.owner==='alice'?aliceWallet:bobWallet,data:challenge.data});assert.equal((await client.waitForTransactionReceipt({hash})).status,'success');return hash}
async function makeGift(amount){const capability=createGiftCapability(),expiresAt=String(Math.floor(now/1000)+86400);const {gift}=await service.create(alice,{requestId:randomUUID(),network:'base',amount,claimSigner:capability.signer,expiresAt,message:'Local test only'});const request=await service.authorize(alice,gift.id,'funding','mock-user-token');assert.equal((await service.view(gift.id)).status,'funding','Preparing a Circle challenge cannot mark funded');await approve(request);assert.equal((await service.view(gift.id)).status,'available');return {gift,capability,expiresAt}}
const first=await makeGift('100'),details=await service.claimDetails(bob,first.gift.id),signature=await signGiftClaim(first.capability.secret,{...details,deadline:BigInt(details.deadline)})
const claim=await service.authorize(bob,first.gift.id,'claim','mock-user-token',{signature,deadline:details.deadline})
assert.equal((await service.claimStatus(bob,first.gift.id)).status,'available','Wallet approval pending is not payout success')
const hash=await approve(claim),status=await service.claimStatus(bob,first.gift.id)
assert.equal(status.status,'confirmed');assert.equal(status.transactionHash,hash)
assert.equal(await client.readContract({address:token,abi:tokenArtifact.abi,functionName:'balanceOf',args:[bobWallet]}),100000000n)
assert.equal(await client.readContract({address:token,abi:tokenArtifact.abi,functionName:'balanceOf',args:[accounts[3]]}),250000n)
await assert.rejects(service.authorize(bob,first.gift.id,'claim','mock-user-token',{signature,deadline:details.deadline}),e=>e.status===409)
const second=await makeGift('25')
await client.request({method:'evm_setNextBlockTimestamp',params:[Number(second.expiresAt)]});await client.request({method:'evm_mine',params:[]});now=Number((await client.getBlock()).timestamp)*1000
assert.equal((await service.view(second.gift.id)).status,'expired');await approve(await service.authorize(alice,second.gift.id,'refund','mock-user-token'));assert.equal((await service.view(second.gift.id)).status,'refunded')
assert.equal(await client.readContract({address:escrow,abi:escrowArtifact.abi,functionName:'totalLocked'}),0n)
assert.equal(await client.readContract({address:token,abi:tokenArtifact.abi,functionName:'balanceOf',args:[aliceWallet]}),399687500n)
console.log('PASS local end-to-end: smart-wallet batch funding -> confirmed gift -> bound claim -> exact recipient credit; separate expiry -> sender refund. Circle approval simulated, no production funds.')
