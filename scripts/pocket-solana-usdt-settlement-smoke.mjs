import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import {evmUsdtReceived,solanaUsdtReceived,reconcileSolanaUsdtSettlement} from '../api/pocket/solana-usdt-bridge-settlement.ts'
import {POCKET_USDT_ASSETS as assets} from '../src/pocket/lib/pocketUsdtAssets.ts'
const recipient='0x'+'12'.repeat(20),sender='0x'+'34'.repeat(20),hash='0x'+'ab'.repeat(32),signature='3'.repeat(88)
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const log=(from,to,value)=>({address:assets.base.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
const receipt={status:'success',transactionHash:hash,logs:[log(sender,recipient,1000000n),log(recipient,sender,10000n)]}
assert.equal(evmUsdtReceived(receipt,'base',recipient,hash),990000n)
assert.equal(evmUsdtReceived({...receipt,status:'reverted'},'base',recipient,hash),null)
assert.equal(evmUsdtReceived(receipt,'arbitrum',recipient,hash),0n)
assert.equal(evmUsdtReceived({...receipt,logs:[{...receipt.logs[0],removed:true}]},'base',recipient,hash),null)
const balance=amount=>({accountIndex:1,owner:'ownerSol',mint:assets.solana.address,uiTokenAmount:{amount,decimals:6}})
const sol={transaction:{signatures:[signature]},meta:{err:null,preTokenBalances:[balance('100')],postTokenBalances:[balance('900100')]}}
assert.equal(solanaUsdtReceived(sol,'ownerSol',signature),900000n)
assert.equal(solanaUsdtReceived({...sol,meta:{...sol.meta,err:{custom:1}}},'ownerSol',signature),null)
assert.equal(solanaUsdtReceived({...sol,meta:{...sol.meta,postTokenBalances:[balance('1'),balance('1')]}},'ownerSol',signature),null)

const seed={id:'id',ownerId:'owner',walletAddress:'ownerSol',destinationAddress:recipient,signature,phase:'source_confirmed',quote:{source:'solana',destination:'base',orderId:'0x'+'01'.repeat(32),requestId:'0x'+'02'.repeat(32),amountUnits:'1000000',minimumUnits:'980000',networkFeeUnits:'1500',providerFeeUnits:'10000'}}
const seedStatus={status:'success',originChainId:792703809,destinationChainId:8453,inTxHashes:[signature],txHashes:[hash]}
const seedRequest={id:seed.quote.requestId,status:'success',user:'ownerSol',recipient,protocol:{orderId:seed.quote.orderId,hubType:'onchain'},data:{inTxs:[{txHash:signature,chainId:792703809,status:'success'}],outTxs:[{txHash:hash,chainId:8453,status:'success'}]}}
let record,status,request,received,fetches,events,ledgerFail
function reset(){record=structuredClone(seed);status=structuredClone(seedStatus);request=structuredClone(seedRequest);received=990000n;fetches=0;events=new Map();ledgerFail=false}
const deps={apiKey:'isolated-fixture-key',now:()=>1234,store:{read:async()=>structuredClone(record),update:async(id,fn)=>(record=fn(structuredClone(record)))},fetch:async url=>{fetches++;assert.ok(url.startsWith('https://api.relay.link/'));if(url.includes('/requests/v3')){assert.ok(url.includes('orderId='+seed.quote.orderId));return {ok:true,json:async()=>({requests:[request]})}}return {ok:true,json:async()=>status}},received:async(network,h,to)=>{assert.ok(['base','solana'].includes(network));assert.equal(to,network==='solana'?'ownerSol':recipient);return received},ledger:async event=>{if(ledgerFail)throw Error('Ledger offline');events.set(event.eventKey,event);return event}}
const run=()=>reconcileSolanaUsdtSettlement('owner','id',deps)
reset();assert.equal((await run()).status,'completed');assert.equal(record.settlement.amountUnits,'990000');assert.equal(events.size,1)
await run();assert.equal(fetches,2);assert.equal(events.size,1)
assert.equal([...events.values()][0].asset,'USDT')
const mutations=[
 ()=>status.originChainId=1,()=>status.destinationChainId=42161,()=>status.inTxHashes=['wrong'],
 ()=>request.id='wrong',()=>request.protocol.orderId='wrong',()=>request.protocol.hubType='offchain',
 ()=>request.user='wrong',()=>request.recipient=sender,()=>request.status='refund',
 ()=>request.data.inTxs[0].chainId=1,()=>request.data.inTxs[0].txHash='wrong',
 ()=>request.data.outTxs[0].chainId=1,()=>request.data.outTxs[0].txHash='wrong',
 ()=>request.data.outTxs.push({...request.data.outTxs[0]}),()=>received=979999n,
 ()=>received=1000001n,()=>received=0n,()=>status.status='failure',
]
for(const mutate of mutations){reset();mutate();assert.equal((await run()).status,'needs_attention');assert.equal(record.phase,'source_confirmed');assert.equal(events.size,0)}
reset();received=null;assert.equal((await run()).status,'pending')
reset();record.phase='submitted';await run();assert.equal(fetches,0)
reset();await assert.rejects(()=>reconcileSolanaUsdtSettlement('other','id',deps),/not found/);assert.equal(fetches,0)
reset();ledgerFail=true;await assert.rejects(run,/offline/);assert.equal(record.phase,'completed');ledgerFail=false;await run();assert.equal(events.size,1);assert.equal(fetches,2)
function refund(network){reset();status.status=request.status='refund';const solana=network==='solana';const tx=solana?'4'.repeat(88):hash;status.txHashes=[tx];request.data.outTxs=[{txHash:tx,chainId:solana?792703809:8453,status:'success'}];request.data.refundCurrencyData={currency:{chainId:solana?792703809:8453,address:assets[network].address,decimals:6},amount:'900000'};received=900000n}
for(const network of ['solana','base']){refund(network);assert.equal((await run()).status,'refunded');assert.equal(record.settlement.amountUnits,'900000');assert.equal(record.settlement.network,network)}
refund('solana');received=899999n;assert.equal((await run()).status,'needs_attention')
refund('solana');request.data.refundCurrencyData.currency.address='USDC';assert.equal((await run()).status,'needs_attention')
refund('base');request.data.refundCurrencyData.amount='1000001';assert.equal((await run()).status,'needs_attention')
console.log('Solana USDT settlement checks passed: net token proof, request/order/wallet/chain/hash binding, minimum delivery, refunds on either permitted chain, partial refund amounts, duplicate outputs, ledger retry and terminal idempotency. Synthetic fixtures only; no live delivery asserted.')
