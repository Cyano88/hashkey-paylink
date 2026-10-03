import assert from 'node:assert/strict'
import {generateKeyPairSync,sign} from 'node:crypto'
import {encodeEventTopics,encodeAbiParameters,parseAbiItem,keccak256} from 'viem'
import {verifiedHintLogs,cachedDiscovery,discoverGiftTransactions} from '../api/pocket/gifts/event-discovery.ts'
import {createGiftEventWebhook} from '../api/pocket/gifts/event-webhook.ts'
import {observeMultiGift} from '../api/pocket/gifts/multi-chain.ts'
import {singleGiftObservation} from '../api/pocket/gifts/read-sharing.ts'
const a=n=>'0x'+String(n).repeat(40),h=n=>'0x'+String(n).repeat(64)
const event=parseAbiItem('event GiftFunded(bytes32 indexed giftId,address indexed sender,address indexed token,address claimSigner,uint128 amountPerClaim,uint32 maxClaims,uint256 platformFee,uint64 expiresAt)')
const d={network:'xlayer',chainId:196,protocol:2,escrow:a(1),token:a(2),treasury:a(3),claimAuthority:a(4),runtimeHash:keccak256('0x6000'),deploymentBlock:'1',confirmations:2,asset:{rail:'xstocks',chainId:196,token:a(2),symbol:'TEST',decimals:18}}
const r={version:2,deployment:d,giftId:h(1),senderAddress:a(5),claimSigner:a(6),amountPerClaim:'1',maxClaims:2,feeUnits:'5000000000000000',expiresAt:'1000'}
const log={address:d.escrow,topics:encodeEventTopics({abi:[event],eventName:'GiftFunded',args:{giftId:r.giftId,sender:r.senderAddress,token:d.token}}),data:encodeAbiParameters([{type:'address'},{type:'uint128'},{type:'uint32'},{type:'uint256'},{type:'uint64'}],[r.claimSigner,10n**18n,2,5000000000000000n,1000n]),logIndex:0,removed:false}
let scanCalls=0,receiptCalls=0
const rpc={getChainId:async()=>196,getBlockNumber:async()=>501n,getBlock:async()=>({hash:h(3),timestamp:100n}),getCode:async()=> '0x6000',readContract:async({functionName})=>({treasury:d.treasury,claimAuthority:d.claimAuthority,supportedToken:true,PLATFORM_FEE_BPS:25n,gifts:[r.senderAddress,d.token,r.claimSigner,10n**18n,2,0,1000n,1]}[functionName]),getLogs:async()=>{scanCalls++;return []},getTransactionReceipt:async()=>{receiptCalls++;return {status:'success',transactionHash:h(2),blockNumber:400n,blockHash:h(3),logs:[log]}}}
const result=await observeMultiGift(rpc,r,async()=>[h(2)])
assert.equal(result.fundingHash,h(2));assert.equal(result.evidenceScanBlock,'500');assert.equal(scanCalls,0);assert.equal(receiptCalls,1)
await observeMultiGift(rpc,{...r,...{fundingHash:result.fundingHash,fundingAt:result.fundingAt,observedBlock:'500',observedBlockHash:h(3),evidenceScanBlock:'500',evidenceScanHash:h(3)}},async()=>{throw Error('Should reuse verified proof')})
assert.equal(scanCalls,0);assert.equal(receiptCalls,1)
for(const patch of [{status:'reverted'},{blockNumber:999n},{blockHash:h(4)},{transactionHash:h(4)},{logs:[{...log,address:a(9)}]},{logs:[{...log,topics:[log.topics[0],h(9),...log.topics.slice(2)]}]}]){
 const bad={...rpc,getTransactionReceipt:async()=>({...await rpc.getTransactionReceipt(),...patch})}
 assert.equal((await verifiedHintLogs(bad,r,500n,[event],[h(2)])).length,0)
 scanCalls=0;const fallback=await observeMultiGift(bad,r,async()=>[h(2)]);assert.equal(fallback.fundingHash,undefined);assert.equal(scanCalls,3);assert.equal(fallback.evidenceScanBlock,'100')
}
let calls=0;await Promise.all([cachedDiscovery('test',async()=>{calls++;return []}),cachedDiscovery('test',async()=>{calls++;return []})]);assert.equal(calls,1)
let release;const hold=new Promise(resolve=>release=resolve);let reads=0;const one=singleGiftObservation('same',async()=>{reads++;await hold;return 1});const two=singleGiftObservation('same',async()=>{reads++;return 2});release();assert.deepEqual(await Promise.all([one,two]),[1,1]);assert.equal(reads,1);assert.equal(await singleGiftObservation('same',async()=>3),3)
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),id='12345678-1234-1234-1234-123456789012';let saved=0
const webhook=createGiftEventWebhook({key:async()=>publicKey,contracts:()=>[d.escrow],save:async()=>{saved++}})
const body=Buffer.from(JSON.stringify({notificationType:'contracts.eventLog',notification:{blockchain:'BASE',contractAddress:d.escrow,txHash:h(2),topics:[log.topics[0],r.giftId]}}))
const signature=sign('sha256',body,privateKey).toString('base64')
async function deliver(bytes=body,sig=signature,method='POST'){let status;const res={setHeader(){},status(v){status=v;return this},json(){},end(){}};await webhook({method,body:bytes,headers:{'x-circle-key-id':id,'x-circle-signature':sig}},res);return status}
assert.equal(await deliver(),200);assert.equal(saved,1);assert.equal(await deliver(Buffer.concat([body,Buffer.from(' ')])),401);assert.equal(saved,1);assert.equal(await deliver(body,'invalid'),401);assert.equal(await deliver(undefined,undefined,'HEAD'),200)
console.log('PASS provider hints: canonical receipts only, confirmation depth, exact contract/gift, failure fallback, no scans with complete proofs, concurrent sharing, raw-body signature verification and tamper rejection.')
process.env.OKX_DEX_API_KEY='fixture';process.env.OKX_DEX_SECRET_KEY='fixture';process.env.OKX_DEX_PASSPHRASE='fixture'
let requested='';const providerRecord={...r,giftId:h(7)}
const provider=await discoverGiftTransactions(providerRecord,500n,async(url,options)=>{requested=String(url);assert.ok(options.headers['OK-ACCESS-SIGN']);return {ok:true,json:async()=>({code:'0',data:[{address:d.escrow,topics:[h(0),h(7)],txId:h(8)},{address:a(9),topics:[h(0),h(7)],txId:h(9)},{address:d.escrow,topics:[h(0),h(6)],txId:h(6)}]})}})
assert.deepEqual(provider,[h(8)]);assert.match(requested,/by-block-and-address/)
assert.deepEqual(await discoverGiftTransactions({...providerRecord,giftId:h(6)},500n,async()=>{throw Error('Provider unavailable')}),[])
console.log('PASS OKX discovery authenticates requests, filters contract/gift identity and tolerates outage without supplying evidence.')
