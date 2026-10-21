import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbiItem} from 'viem'
import {bscTransferRows} from '../api/pocket/bsc-wallet-activity.ts'
import {bscLinkedWallet} from '../api/pocket/bsc-wallet.ts'
import {POCKET_BSC} from '../src/pocket/lib/pocketBsc.ts'
import {pocketMoneyNotification} from '../src/pocket/lib/pocketMoneyNotification.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {collapsePocketAssetMoves} from '../src/pocket/lib/pocketAssetMoveActivity.ts'
import {bscSwapActivity} from '../src/pocket/lib/pocketBscActivity.ts'
import {isPocketActivityRow} from '../src/pocket/lib/pocketSchemas.ts'
const wallet='0x1111111111111111111111111111111111111111',sender='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64)
const event=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
const log=(asset,from,to,units,index)=>({address:POCKET_BSC.assets[asset].address,transactionHash:hash,blockHash,logIndex:'0x'+index.toString(16),topics:encodeEventTopics({abi:[event],eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[units])})
let tx,receipt,head,chain,block
const reset=()=>{tx={hash,chainId:'0x38',blockNumber:'0x64',blockHash,from:sender,to:wallet,value:'0x0'};receipt={transactionHash:hash,blockHash,blockNumber:'0x64',status:'0x1',logs:[log('USDC',sender,wallet,2800121000000000000n,0)]};head='0x80';chain='0x38';block={number:'0x64',hash:blockHash,timestamp:'0x'+Math.floor(Date.now()/1000-60).toString(16)}}
const rpc=async method=>({'eth_chainId':chain,'eth_getTransactionByHash':tx,'eth_getTransactionReceipt':receipt,'eth_blockNumber':head,'eth_getBlockByNumber':block})[method]
reset();let rows=await bscTransferRows(wallet,hash,rpc)
assert.equal(rows.length,1);assert.equal(rows[0].amount,'2.800121');assert.equal(rows[0].assetSymbol,'USDC');assert(isPocketActivityRow(rows[0]));assert.equal(rows[0].direction,'in')
const notice=pocketMoneyNotification(rows[0]);assert.equal(notice.title,'USDC received');assert.match(notice.body,/BNB Chain/);assert.equal(notice.path,'/activity?receipt='+encodeURIComponent(rows[0].eventId));assert.equal(mergePocketActivityRows(rows,rows).length,1)
receipt.logs.push(log('USDT',sender,wallet,1234567890123456789n,1));rows=await bscTransferRows(wallet,hash,rpc);assert.equal(rows[1].amount,'1.234567890123456789')
reset();receipt.logs=[log('USDC',sender,sender,1n,0),log('USDT',wallet,sender,5n*10n**18n,1)];rows=await bscTransferRows(wallet,hash,rpc);assert.equal(rows.length,1);assert.equal(rows[0].direction,'out');assert.equal(pocketMoneyNotification(rows[0]).title,'USDT sent')
reset();receipt.logs[0].address=sender;assert.deepEqual(await bscTransferRows(wallet,hash,rpc),[])
reset();receipt.status='0x0';assert.deepEqual(await bscTransferRows(wallet,hash,rpc),[])
reset();head='0x65';await assert.rejects(()=>bscTransferRows(wallet,hash,rpc),/pending/)
reset();block.hash=hash;await assert.rejects(()=>bscTransferRows(wallet,hash,rpc),/changed/)
reset();chain='0xc4';await assert.rejects(()=>bscTransferRows(wallet,hash,rpc),/chain/)
reset();tx.value='0xde0b6b3a7640000';receipt.logs=[];rows=await bscTransferRows(wallet,hash,rpc);assert.equal(rows[0].amount,'1');assert.equal(rows[0].assetSymbol,'BNB')
const pending=bscSwapActivity({id:'same',wallet,from:'USDC',to:'BNB',amount:'1',status:'pending',createdAt:1})
const done=bscSwapActivity({id:'same',wallet,from:'USDC',to:'BNB',amount:'1',amountOut:'0.001',txHash:hash,status:'completed',createdAt:1})
assert.equal(mergePocketActivityRows([pending],[done]).length,1);assert.equal(mergePocketActivityRows([done],[pending])[0].paycrestStatus,'completed');assert.equal(collapsePocketAssetMoves([...rows,done]).length,1)
assert.equal(bscLinkedWallet({linkedAccounts:[]}),null)
const account={id:'fixturewallet123',type:'wallet',chainType:'ethereum',walletClientType:'privy',address:wallet}
assert.equal(bscLinkedWallet({linkedAccounts:[account]}).address,wallet);assert.throws(()=>bscLinkedWallet({linkedAccounts:[account,account]}),/binding/)
console.log('PASS BNB deposits: exact 18-decimal USDC/USDT, native BNB, canonical finality, unrelated/failed log rejection, shared receipt/push identity, duplicate and pending swap protection, wallet binding')

reset();tx.to=sender;receipt.logs=[]
const traceRpc=async(method,params)=>method==='debug_traceTransaction'?{from:sender,to:sender,value:'0x0',type:'CALL',calls:[{type:'CALL',from:sender,to:wallet,value:'0xde0b6b3a7640000'},{type:'CALL',from:sender,to:wallet,value:'0xde0b6b3a7640000',error:'reverted'}]}:rpc(method,params)
rows=await bscTransferRows(wallet,hash,traceRpc,true);assert.equal(rows.length,1);assert.equal(rows[0].amount,'1');assert.match(rows[0].eventId,/trace:0$/)
const {readBscAccount}=await import('../api/pocket/bsc-account.ts')
const accountData=await readBscAccount('owner',{wallet:async()=>({address:wallet,id:'fixture'}),runtime:()=>({balance:async symbol=>symbol==='USDC'?2800121000000000000n:0n,readPrices:async()=>({BNB:{scaled8:60000000000n},USDC:{scaled8:100000000n},USDT:{scaled8:100000000n}})})})
assert.equal(accountData.rows.find(r=>r.symbol==='USDC').quantity,2.800121);assert.equal(accountData.rows.find(r=>r.symbol==='USDC').valueUsd,2.800121)
await assert.rejects(()=>readBscAccount('owner',{wallet:async()=>({address:wallet,id:'fixture'}),runtime:()=>({balance:async()=>{throw Error('offline')}})}),/offline/)
const zero=await readBscAccount('none',{wallet:async()=>null,runtime:()=>{throw Error('must not read')}});assert(zero.rows.every(r=>r.valueUsd===0));assert.equal(zero.address,null)
const {runPocketMoneyPushWorker}=await import('../api/pocket/money-push-worker.ts')
reset();rows=await bscTransferRows(wallet,hash,rpc);const pushes=[]
await runPocketMoneyPushWorker({configured:()=>true,listOwners:async()=>['owner'],readActivity:async()=>[{...rows[0],ts:Date.now()-3600000}],readWallets:async()=>[{network:'bsc',walletAddress:wallet}],listActions:async()=>[],listRequests:async()=>[],readContext:async()=>[],sendPush:async(owner,id,notice)=>{pushes.push({id,...notice});return true}})
assert.equal(pushes.length,1);assert.match(pushes[0].body,/BNB Chain/)
console.log('PASS BNB internal transfer trace, reverted-call exclusion, display totals, unknown balance failure, and missed deposit push recovery')
