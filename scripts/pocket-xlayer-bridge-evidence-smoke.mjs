import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiParameters} from 'viem'
import {evmStablecoinDelta,solanaStablecoinDelta,xlayerBridgeSourceProven,xlayerBridgeDeliveryCandidate,xlayerBridgeDeliveryProven} from '../api/pocket/xlayer-bridge-evidence.ts'
import {RELAY_STABLECOIN_CHAINS as chains,stablecoinAddress} from '../api/pocket/xlayer-bridge-provider.ts'
import {EVM_PLATFORM_TREASURY as treasury} from '../src/lib/platformFees.ts'
const sender='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222'
const hash='0x'+'a'.repeat(64),outHash='0x'+'b'.repeat(64),orderId='0x'+'c'.repeat(64),requestId='0x'+'d'.repeat(64)
const q={asset:'USDC',source:'xlayer',destination:'base',sender,recipient,amountUnits:'10000000',minimumUnits:'9900000',orderId,requestId}
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const deposit=parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)'])
const transferLog=(network,asset,from,to,value)=>({address:stablecoinAddress(network,asset),data:encodeAbiParameters(parseAbiParameters('uint256'),[value]),topics:encodeEventTopics({abi:transfer,eventName:'Transfer',args:{from,to}})})
const depositLog={address:chains.xlayer.depository,data:encodeAbiParameters(parseAbiParameters('address,address,uint256,bytes32'),[sender,stablecoinAddress('xlayer','USDC'),10000000n,orderId]),topics:encodeEventTopics({abi:deposit,eventName:'RelayErc20Deposit'})}
const receipt={status:'success',transactionHash:hash,logs:[transferLog('xlayer','USDC',sender,chains.xlayer.depository,10000000n),depositLog]}
assert.equal(xlayerBridgeSourceProven(q,receipt,hash),true)
const priced={...q,networkFeeUnits:'3000',reimbursementTreasury:treasury}
const paid={...receipt,logs:[...receipt.logs,transferLog('xlayer','USDC',sender,treasury,3000n)]}
assert.equal(xlayerBridgeSourceProven(priced,paid,hash),true)
assert.equal(xlayerBridgeSourceProven(priced,receipt,hash),false,'deposit alone does not prove reimbursement')
assert.equal(xlayerBridgeSourceProven(q,paid,hash),false,'an unapproved fee is not accepted')
for(const update of [{networkFeeUnits:'2999'},{networkFeeUnits:'3001'},{networkFeeUnits:'0'},{networkFeeUnits:undefined},{reimbursementTreasury:undefined},{reimbursementTreasury:recipient}]){
 assert.equal(xlayerBridgeSourceProven({...priced,...update},paid,hash),false)
}
for(const log of [transferLog('xlayer','USDC',sender,recipient,3000n),transferLog('xlayer','USDT',sender,treasury,3000n)]){
 assert.equal(xlayerBridgeSourceProven(priced,{...receipt,logs:[...receipt.logs,log]},hash),false)
}
const splitFees={...receipt,logs:[...receipt.logs,transferLog('xlayer','USDC',sender,treasury,1500n),transferLog('xlayer','USDC',sender,treasury,1500n)]}
assert.equal(xlayerBridgeSourceProven(priced,splitFees,hash),false,'only the exact quoted fee transfer is accepted')
// Circle-funded inbound bridge: same deposit and fee evidence on Base.
const inbound={...priced,source:'base',destination:'xlayer'}
const inboundReceipt={...paid,logs:paid.logs.map(log=>({...log,address:log.address===stablecoinAddress('xlayer','USDC')?stablecoinAddress('base','USDC'):log.address}))}
inboundReceipt.logs[1]={...depositLog,data:encodeAbiParameters(parseAbiParameters('address,address,uint256,bytes32'),[sender,stablecoinAddress('base','USDC'),10000000n,orderId])}
assert.equal(xlayerBridgeSourceProven(inbound,inboundReceipt,hash),true)
for(const mutate of [r=>r.status='reverted',r=>r.transactionHash=outHash,r=>r.logs.pop(),r=>r.logs.push(depositLog),r=>r.logs[0].removed=true,r=>r.logs[0].address=stablecoinAddress('xlayer','USDT'),r=>r.logs.push(transferLog('xlayer','USDC',recipient,sender,1n))]){
 const r=structuredClone(receipt);mutate(r);assert.equal(xlayerBridgeSourceProven(q,r,hash),false)
}
const status={status:'success',originChainId:196,destinationChainId:8453,inTxHashes:[hash],txHashes:[outHash]}
const requests={requests:[{id:requestId,protocol:{orderId,hubType:'onchain'},status:'success',user:sender,recipient,data:{inTxs:[{txHash:hash,chainId:196,status:'success'}],outTxs:[{txHash:outHash,chainId:8453,status:'success'}]}}]}
const candidate=xlayerBridgeDeliveryCandidate(q,hash,status,requests)
assert.equal(candidate.status,'verify_delivery')
assert.equal(xlayerBridgeDeliveryProven(candidate,null),false)
assert.equal(xlayerBridgeDeliveryProven(candidate,9899999n),false)
assert.equal(xlayerBridgeDeliveryProven(candidate,10000001n),false)
assert.equal(xlayerBridgeDeliveryProven(candidate,9900000n),true)
for(const mutate of [r=>r.requests[0].id=hash,r=>r.requests[0].protocol.orderId=hash,r=>r.requests[0].user=recipient,r=>r.requests[0].recipient=sender,r=>r.requests[0].data.inTxs[0].chainId=1,r=>r.requests[0].data.outTxs.push(r.requests[0].data.outTxs[0])]){
 const r=structuredClone(requests);mutate(r);assert.equal(xlayerBridgeDeliveryCandidate(q,hash,status,r).status,'needs_attention')
}
assert.equal(xlayerBridgeDeliveryCandidate(q,hash,{status:'pending'},requests).status,'pending')
assert.equal(xlayerBridgeDeliveryCandidate(q,hash,{status:'failure'},requests).status,'needs_attention')
const refunds=structuredClone(requests);refunds.requests[0].status='refund'
refunds.requests[0].data.refundCurrencyData={currency:{chainId:196,address:stablecoinAddress('xlayer','USDC'),decimals:6},amount:'9800000'}
refunds.requests[0].data.outTxs[0].chainId=196
const refund=xlayerBridgeDeliveryCandidate(q,hash,{...status,status:'refund'},refunds)
assert.equal(refund.status,'verify_delivery');assert.equal(refund.outcome,'refunded');assert.equal(refund.recipient,sender)
assert.equal(xlayerBridgeDeliveryProven(refund,9800000n),true)
assert.equal(xlayerBridgeDeliveryProven(refund,9800001n),false)
refunds.requests[0].data.refundCurrencyData.currency.address=stablecoinAddress('xlayer','USDT')
assert.equal(xlayerBridgeDeliveryCandidate(q,hash,{...status,status:'refund'},refunds).status,'needs_attention')
const delivery={status:'success',transactionHash:outHash,logs:[transferLog('base','USDC',sender,recipient,9900000n),transferLog('base','USDT',sender,recipient,5000000n)]}
assert.equal(evmStablecoinDelta(delivery,'base','USDC',recipient,outHash),9900000n)
delivery.logs.push(transferLog('base','USDC',recipient,sender,100000n))
assert.equal(evmStablecoinDelta(delivery,'base','USDC',recipient,outHash),9800000n)
const signature='2'.repeat(88),owner='TestSolanaOwner'
const row=(asset,amount)=>({owner,mint:stablecoinAddress('solana',asset),accountIndex:1,uiTokenAmount:{decimals:6,amount}})
const sol={transaction:{signatures:[signature]},meta:{err:null,preTokenBalances:[row('USDC','100')],postTokenBalances:[row('USDC','9900100'),{...row('USDT','2000000'),accountIndex:2}]}}
assert.equal(solanaStablecoinDelta(sol,'USDC',owner,signature),9900000n)
assert.equal(solanaStablecoinDelta(sol,'USDT',owner,signature),2000000n)
sol.meta.postTokenBalances[0].uiTokenAmount.decimals=9
assert.equal(solanaStablecoinDelta(sol,'USDC',owner,signature),null)
console.log('PASS exact source debit and deposit; destination net receipt; asset isolation; wrong wallet/order/hash rejection; refund evidence; provider success alone never completes a bridge. No funds moved.')
