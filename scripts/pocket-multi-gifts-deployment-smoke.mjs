import assert from 'node:assert/strict'
import {keccak256} from 'viem'
import catalogue from '../src/pocket/lib/pocketXStocksCatalog.json' with {type:'json'}
import {verifyMultiGiftDeployment} from '../api/pocket/gifts/multi-preflight.ts'
import {observeMultiGift} from '../api/pocket/gifts/multi-chain.ts'
const address=n=>'0x'+String(n).repeat(40),hash=n=>'0x'+String(n).repeat(64),asset={chainId:196,rail:'xstocks',token:catalogue.assets[0].address,symbol:catalogue.assets[0].symbol,decimals:18}
const d={protocol:2,network:'xlayer',chainId:196,token:asset.token,asset,escrow:address(1),treasury:address(2),claimAuthority:address(3),runtimeHash:keccak256('0x6000'),deploymentBlock:'1',confirmations:2}
const rpc={getChainId:async()=>196,getBlockNumber:async()=>10n,getBlock:async()=>({hash:hash(4),timestamp:100n}),getCode:async({address:a})=>a===d.claimAuthority?'0x':'0x6000',readContract:async({functionName})=>({treasury:d.treasury,claimAuthority:d.claimAuthority,supportedToken:true,PLATFORM_FEE_BPS:25n,MAX_CLAIMS:1000,decimals:18}[functionName])}
assert.equal((await verifyMultiGiftDeployment(rpc,d)).verified,true)
for(const patch of [{chainId:1},{runtimeHash:hash(5)},{asset:{...asset,decimals:6}},{asset:{...asset,symbol:'FAKE'}},{confirmations:1}])await assert.rejects(()=>verifyMultiGiftDeployment(rpc,{...d,...patch}))
await assert.rejects(()=>verifyMultiGiftDeployment({...rpc,getCode:async()=> '0x6000'},d))
let contractReads=0
const record={version:2,deployment:d,evidenceScanBlock:'7',evidenceScanHash:hash(5)}
await assert.rejects(()=>observeMultiGift({...rpc,readContract:async()=>{contractReads++;throw Error('Unexpected read')}},record),/evidence changed/)
assert.equal(contractReads,0,'orphaned cached receipts must be rejected before processing current state')
await assert.rejects(()=>observeMultiGift(rpc,{...record,evidenceScanHash:undefined}),/evidence changed/)
console.log('PASS multi-gift release preflight and cached evidence reorg guard: chain, code, treasury, EOA authority, catalogue, precision, fee, limits, confirmation depth and fail-closed cursor ancestry.')
let giftStatus=0,logCalls=0
const funded={version:2,deployment:d,giftId:hash(8),senderAddress:address(4),claimSigner:address(5),amountPerClaim:'1',maxClaims:2,expiresAt:'1000',feeUnits:'5000000000000000'}
const observerRpc={...rpc,getBlockNumber:async()=>5001n,readContract:async input=>input.functionName==='gifts'?[funded.senderAddress,d.token,funded.claimSigner,1000000000000000000n,2,0,1000n,giftStatus]:rpc.readContract(input),getLogs:async({fromBlock,toBlock})=>{logCalls++;assert.ok(toBlock-fromBlock<100n,'X Layer log windows must contain at most 100 blocks');return []}}
const absent=await observeMultiGift(observerRpc,funded)
assert.equal(absent.state,'unfunded');assert.equal(absent.evidenceScanBlock,'5000');assert.equal(logCalls,0)
giftStatus=1
const active=await observeMultiGift(observerRpc,funded)
assert.equal(active.state,'available');assert.equal(active.evidenceScanBlock,'100');assert.equal(logCalls,3)
await assert.rejects(()=>observeMultiGift({...observerRpc,getBlock:async()=>({hash:hash(5),timestamp:100n})},{...funded,evidenceScanBlock:'5000',evidenceScanHash:hash(4)}),/evidence changed/)
console.log('PASS unfunded cursor uses confirmed state without log scans; funded X Layer scans respect 100-block RPC limit.')
