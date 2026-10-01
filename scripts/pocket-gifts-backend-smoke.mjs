import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {keccak256,decodeFunctionData,parseAbi} from 'viem'
import {createGiftService} from '../api/pocket/gifts/service.ts'
import {createGiftHandler} from '../api/pocket/gifts/handler.ts'
import {GiftError} from '../api/pocket/gifts/types.ts'
import {observeGift} from '../api/pocket/gifts/chain.ts'
import {giftWalletCall} from '../api/pocket/gifts/circle.ts'
import {createGiftCapability,signGiftClaim} from '../src/pocket/features/gifts/pocketGiftSigning.ts'
const addr=n=>'0x'+String(n).repeat(40),hash=n=>'0x'+String(n).repeat(64)
const deployment={network:'base',chainId:8453,escrow:addr(1),token:addr(2),treasury:addr(3),runtimeHash:keccak256('0x6000'),confirmations:2}
function setup(){
 const rows=new Map();let queue=Promise.resolve(),now=Date.now(),block=100n,state='unfunded',recipient,settlementHash,calls=[],fail=false,hold
 const store={read:async id=>structuredClone(rows.get(id)),update:(id,fn)=>{const promise=queue.then(()=>{const next=fn(structuredClone(rows.get(id)));rows.set(id,structuredClone(next));return structuredClone(next)});queue=promise.catch(()=>{});return promise}}
 const deps={store,now:()=>now,deployment:()=>deployment,wallet:async user=>({id:'wallet-'+user,address:user==='alice'?addr(4):user==='bob'?addr(5):addr(6)}),observe:async()=>({state,blockNumber:block,blockHash:hash(Number(block%9n)),timestamp:BigInt(Math.floor(now/1000)),claimRecipient:recipient,settlementHash}),challenge:async input=>{calls.push(structuredClone(input));if(hold)await hold;if(fail)throw Error('provider timeout');return {challengeId:'challenge-1',transactionId:'provider-1'}}}
 const service=createGiftService(deps),cap=createGiftCapability(),alice={userId:'alice',handle:'shy'},bob={userId:'bob',handle:'bob'},charlie={userId:'charlie',handle:'charlie'}
 const input={requestId:randomUUID(),network:'base',amount:'100',claimSigner:cap.signer,expiresAt:String(Math.floor(now/1000)+86400),message:'Hello'}
 return {store,rows,deps,service,cap,alice,bob,charlie,input,calls,setState:value=>{state=value;block++},advance:ms=>{now+=ms},setRecipient:value=>{recipient=value;settlementHash=hash(8)},fail:value=>{fail=value},hold:promise=>{hold=promise}}
}
async function claim(f,who,id){const details=await f.service.claimDetails(who,id);return {signature:await signGiftClaim(f.cap.secret,{...details,deadline:BigInt(details.deadline)}),deadline:details.deadline}}
{
 const f=setup(),a=await f.service.create(f.alice,f.input),b=await f.service.create(f.alice,f.input);assert.equal(a.gift.id,b.gift.id);assert.equal(f.rows.size,1);assert.equal(a.funding.totalDebit,'100250000')
 await assert.rejects(f.service.create(f.alice,{...f.input,amount:'101'}),e=>e.status===409)
 await assert.rejects(f.service.create(f.alice,{...f.input,network:'__proto__'}),e=>e.status===400)
 await assert.rejects(f.service.authorize(f.bob,a.gift.id,'funding','token'),e=>e.status===403)
 await f.service.authorize(f.alice,a.gift.id,'funding','token');await f.service.authorize(f.alice,a.gift.id,'funding','token');assert.equal(f.calls.length,1);assert.equal((await f.service.view(a.gift.id)).status,'funding','Challenge must not imply funding')
 const publicData=JSON.stringify(await f.service.view(a.gift.id));for(const field of ['ownerId','walletId','signature','claimSigner',f.cap.secret])assert.ok(!publicData.includes(field))
 const calldata=giftWalletCall(f.calls[0].record,'funding',f.calls[0].attempt),batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:calldata});assert.equal(batch.args[0].length,2);assert.equal(batch.args[0][0].target.toLowerCase(),deployment.token);assert.equal(batch.args[0][1].target.toLowerCase(),deployment.escrow)
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);f.setState('available');const auth=await claim(f,f.bob,gift.id)
 await assert.rejects(f.service.authorize(f.charlie,gift.id,'claim','token',auth),e=>e.status===403)
 f.fail(true);await assert.rejects(f.service.authorize(f.bob,gift.id,'claim','token',auth),e=>e.status===503);f.fail(false);await f.service.authorize(f.bob,gift.id,'claim','token',auth)
 assert.equal(f.calls.length,2);assert.equal(f.calls[0].attempt.id,f.calls[1].attempt.id);assert.equal(f.calls[0].attempt.signature,f.calls[1].attempt.signature)
 assert.equal((await f.service.claimStatus(f.bob,gift.id)).status,'available','Approval is not a completed claim')
 f.setState('claimed');f.setRecipient(addr(6));assert.equal((await f.service.claimStatus(f.bob,gift.id)).status,'claimed_elsewhere')
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);f.setState('available');const a=await claim(f,f.bob,gift.id),b=await claim(f,f.charlie,gift.id);let release;f.hold(new Promise(r=>release=r))
 const first=f.service.authorize(f.bob,gift.id,'claim','token',a);while(!f.calls.length)await new Promise(r=>setTimeout(r,1));await assert.rejects(f.service.authorize(f.charlie,gift.id,'claim','token',b),e=>e.status===409);release();await first;assert.equal(f.calls.length,1)
 f.setState('claimed');f.setRecipient(addr(5));assert.equal((await f.service.claimStatus(f.bob,gift.id)).status,'confirmed')
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);f.setState('available');await assert.rejects(f.service.authorize(f.alice,gift.id,'refund','token'),e=>e.status===409);f.advance(86401*1000);await f.service.authorize(f.alice,gift.id,'refund','token');assert.equal(f.calls[0].kind,'refund');assert.equal((await f.service.view(gift.id)).status,'expired');f.setState('refunded');assert.equal((await f.service.view(gift.id)).status,'refunded')
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);const handler=createGiftHandler({service:f.service,identity:async()=>f.alice});const send=async body=>{let status=200,data;const res={setHeader(){},status(value){status=value;return this},json(value){data=value;return this}};await handler({method:'POST',body},res);return {status,data}}
 assert.equal((await send({action:'create',...f.input,secret:f.cap.secret})).status,400)
 const result=await send({action:'authorize-funding',id:gift.id,userToken:'token'});assert.equal(result.status,200);assert.equal(result.data.approval.phase,'awaiting_approval');assert.ok(!JSON.stringify(result.data).includes('userId'))
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input),record=await f.store.read(gift.id)
 let wrong=false,reorg=false
 const rpc={getLogs:async()=>[],getChainId:async()=>8453,getBlockNumber:async()=>101n,getBlock:async()=>({hash:hash(reorg?2:1),timestamp:1n}),getCode:async()=>wrong?'0x6001':'0x6000',readContract:async input=>input.functionName==='usdc'?deployment.token:input.functionName==='treasury'?deployment.treasury:input.functionName==='PLATFORM_FEE_BPS'?25n:[record.senderAddress,record.claimSigner,100000000n,BigInt(record.expiresAt),1]}
 assert.equal((await observeGift(rpc,record)).state,'available');wrong=true;await assert.rejects(observeGift(rpc,record),/contract verification failed/);wrong=false
 const before=rpc.getBlock;let reads=0;rpc.getBlock=async()=>({hash:hash(++reads===1?1:2),timestamp:1n});await assert.rejects(observeGift(rpc,record),/confirmation changed/)
}
console.log('PASS backend gift idempotency, ownership, bound claims, timeout replay, concurrent reservation, refunds, DTO privacy, code pinning and reorg rejection.')

{
 const {preparePocketGiftClaim,readPocketGiftClaimStatus}=await import('../src/pocket/api/pocketGiftsClient.ts')
 const {giftLink}=await import('../src/pocket/features/gifts/pocketGift.ts')
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);f.setState('available');const handler=createGiftHandler({service:f.service,identity:async()=>f.bob}),sent=[]
 const fetcher=async(url,options)=>{sent.push(options.body);let status=200,data;const res={setHeader(){},status(s){status=s;return this},json(v){data=v;return this}};await handler({method:'POST',body:JSON.parse(options.body)},res);return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
 const input={accessToken:'fixture',fetcher,link:giftLink(gift.id,f.cap.secret),session:{userToken:'fixture-circle-token',encryptionKey:'fixture',chain:'base',wallet:{address:addr(5),id:'wallet-bob'}}}
 const approval=await preparePocketGiftClaim(input);assert.equal(approval.phase,'awaiting_approval')
 assert.ok(sent.every(body=>!body.includes(f.cap.secret)&&!body.includes(input.link)),'Gift capability never sent to backend')
 await assert.rejects(preparePocketGiftClaim({...input,session:{...input.session,wallet:{...input.session.wallet,address:addr(6)}}}),/Open the Pocket wallet/)
 f.setState('claimed');f.setRecipient(addr(5));assert.equal((await readPocketGiftClaimStatus({...input,id:gift.id})).status,'confirmed')
 await assert.rejects(readPocketGiftClaimStatus({...input,id:gift.id,fetcher:async()=>new Response('<html>oops</html>',{status:502})}),/temporarily unavailable/)
}
console.log('PASS wallet claim adapter: local signing, no bearer credential transmission, linked-wallet checks and verified completion only.')
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);f.setState('available');const first=await f.service.authorize(f.bob,gift.id,'claim','token',await claim(f,f.bob,gift.id));f.advance(301000);f.setState('available');const second=await f.service.authorize(f.bob,gift.id,'claim','token',await claim(f,f.bob,gift.id));assert.notEqual(first.approval.id,second.approval.id);assert.equal(f.calls.length,2)
 console.log('PASS expired claim authorization recovers only after confirmed chain time makes the previous signature unusable.')
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);await f.store.update(gift.id,r=>({...r,funding:{id:randomUUID(),startedAt:Date.now()-31000,userId:'alice',walletAddress:addr(4),phase:'authorizing'}}));const before=await f.store.read(gift.id);await f.service.authorize(f.alice,gift.id,'funding','token');assert.equal(f.calls[0].attempt.id,before.funding.id)
 console.log('PASS crashed authorization recovers with the original provider idempotency key.')
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);let count=0,resolveFirst,resolveSecond
 const gates=[new Promise(r=>resolveFirst=r),new Promise(r=>resolveSecond=r)]
 f.deps.challenge=async()=>{const call=count++;await gates[call];if(call===1)throw Error('late transport failure');return {challengeId:'valid-challenge',transactionId:'provider'}}
 const first=f.service.authorize(f.alice,gift.id,'funding','token');while(count<1)await new Promise(r=>setTimeout(r,1));f.advance(31000)
 const second=f.service.authorize(f.alice,gift.id,'funding','token');while(count<2)await new Promise(r=>setTimeout(r,1));resolveFirst();await first;resolveSecond();await second
 assert.equal((await f.store.read(gift.id)).funding.phase,'awaiting_approval');console.log('PASS late retry failure cannot overwrite an already recovered wallet approval.')
}
// Only provider-confirmed terminal failures can reopen a funding approval.
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input)
 let provider={status:'pending'},reads=0
 f.deps.readFundingAttempt=async()=>{reads++;return provider}
 await f.service.authorize(f.alice,gift.id,'funding','token')
 const first=(await f.store.read(gift.id)).funding.id
 await assert.rejects(f.service.recoverFunding(f.bob,gift.id,'token'),e=>e.status===403)
 assert.equal(reads,0)
 assert.equal((await f.service.recoverFunding(f.alice,gift.id,'token')).retryAllowed,false)
 await f.service.authorize(f.alice,gift.id,'funding','token');assert.equal(f.calls.length,1)
 provider={status:'failed',txHash:hash(7)}
 assert.equal((await f.service.recoverFunding(f.alice,gift.id,'token')).retryAllowed,false)
 provider={status:'failed'}
 assert.equal((await f.service.recoverFunding(f.alice,gift.id,'token')).retryAllowed,true)
 await Promise.all([f.service.authorize(f.alice,gift.id,'funding','token'),f.service.authorize(f.alice,gift.id,'funding','token')])
 assert.equal(f.calls.length,2)
 assert.notEqual((await f.store.read(gift.id)).funding.id,first)
 f.setState('available')
 assert.equal((await f.service.recoverFunding(f.alice,gift.id,'token')).retryAllowed,false)
}
{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input)
 await f.service.authorize(f.alice,gift.id,'funding','token')
 let release
 f.deps.readFundingAttempt=()=>new Promise(r=>release=r)
 const recovery=f.service.recoverFunding(f.alice,gift.id,'token')
 while(!release)await new Promise(r=>setTimeout(r,1))
 await f.store.update(gift.id,r=>({...r,funding:{...r.funding,id:randomUUID()}}))
 release({status:'failed'})
 assert.equal((await recovery).retryAllowed,false,'late failure must not reset a newer attempt')
}
console.log('PASS funding recovery: owner-only, provider failure plus unfunded contract, no hash-only retries, concurrent retry and stale response guards.')

{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input),record=await f.store.read(gift.id)
 let status=1,bad=false,removed=false
 const rpc={getChainId:async()=>8453,getBlockNumber:async()=>101n,getBlock:async()=>({hash:hash(1),timestamp:123n}),getCode:async()=> '0x6000',readContract:async input=>input.functionName==='usdc'?deployment.token:input.functionName==='treasury'?deployment.treasury:input.functionName==='PLATFORM_FEE_BPS'?25n:[record.senderAddress,record.claimSigner,100000000n,BigInt(record.expiresAt),status],getLogs:async({event})=>[{removed,blockNumber:100n,blockHash:hash(1),transactionHash:event.name==='GiftFunded'?hash(2):hash(3),args:{giftId:record.giftId,sender:record.senderAddress,claimSigner:record.claimSigner,amount:bad?1n:100000000n,platformFee:250000n,expiresAt:BigInt(record.expiresAt)}}]}
 let result=await observeGift(rpc,record);assert.equal(result.fundingHash,hash(2));assert.equal(result.fundingAt,123000)
 bad=true;result=await observeGift(rpc,record);assert.equal(result.fundingHash,undefined)
 bad=false;removed=true;result=await observeGift(rpc,record);assert.equal(result.fundingHash,undefined)
 removed=false;status=3;result=await observeGift(rpc,record);assert.equal(result.refundHash,hash(3));assert.equal(result.refundAt,123000)
}
console.log('PASS funding/refund receipt evidence checks exact principal/fee/expiry, canonical block and removed logs.')

{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input),initial=await f.store.read(gift.id)
 let record={...initial,deployment:{...deployment,deploymentBlock:'0'}},ranges=[]
 const rpc={getChainId:async()=>8453,getBlockNumber:async()=>7001n,getBlock:async()=>({hash:hash(1),timestamp:123n}),getCode:async()=> '0x6000',readContract:async input=>input.functionName==='usdc'?deployment.token:input.functionName==='treasury'?deployment.treasury:input.functionName==='PLATFORM_FEE_BPS'?25n:[record.senderAddress,record.claimSigner,100000000n,BigInt(record.expiresAt),1],getLogs:async({fromBlock,toBlock})=>{ranges.push([fromBlock,toBlock]);return fromBlock<=2500n&&toBlock>=2500n?[{removed:false,blockNumber:2500n,blockHash:hash(1),transactionHash:hash(2),args:{giftId:record.giftId,sender:record.senderAddress,claimSigner:record.claimSigner,amount:100000000n,platformFee:250000n,expiresAt:BigInt(record.expiresAt)}}]:[]}}
 const first=await observeGift(rpc,record);assert.equal(first.fundingHash,undefined);assert.equal(first.evidenceScanBlock,'1999')
 record={...record,evidenceScanBlock:first.evidenceScanBlock};const next=await observeGift(rpc,record)
 assert.equal(next.fundingHash,hash(2),'find funding older than the latest 2,000 blocks')
 assert.deepEqual(ranges,[[0n,1999n],[2000n,3999n]])
}
console.log('PASS persisted event scan resumes bounded historical ranges without skipping older gift funding.')

{
 const f=setup(),{gift}=await f.service.create(f.alice,f.input);f.setState('available');const auth=await claim(f,f.bob,gift.id);await f.service.authorize(f.bob,gift.id,'claim','token',auth);
 assert.equal((await f.service.claimStatus(f.bob,gift.id)).retryAllowed,false);
 f.advance(300000);assert.equal((await f.service.claimStatus(f.bob,gift.id)).retryAllowed,false,'Equal deadline remains valid on chain');
 f.advance(1000);assert.equal((await f.service.claimStatus(f.bob,gift.id)).retryAllowed,true);assert.equal((await f.service.claimStatus(f.charlie,gift.id)).retryAllowed,false,'Retry belongs to original claimant');
 const before=f.calls.length;await f.service.authorize(f.bob,gift.id,'claim','token',await claim(f,f.bob,gift.id));assert.equal(f.calls.length,before+1);assert.equal((await f.service.claimStatus(f.bob,gift.id)).retryAllowed,false);
}
console.log('PASS claim retry requires confirmed strict deadline expiry and matching claimant; renewed authorization locks retry.')
