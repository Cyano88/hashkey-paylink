import assert from 'node:assert/strict'
import {createHmac} from 'node:crypto'
import {getAddress,decodeFunctionData,parseAbi} from 'viem'
import {PublicKey} from '@solana/web3.js'
import {EVM_PLATFORM_TREASURY,EVM_GAS_REIMBURSEMENT,SOLANA_PLATFORM_TREASURY,evmFeeTransfers,solanaFeeTransfers} from '../src/lib/platformFees.ts'
import {createPaymentFeeQuote,verifyPaymentFeeQuote} from '../api/payment-fee-quotes.ts'
import {quoteNativeSend,openNativeSend,sealNativeSend} from '../api/pocket/native-send-quote.ts'
import {quoteEvmBridgeFee,openEvmBridgeFee,sealEvmBridgeFee} from '../api/pocket/evm-bridge-reimbursement.ts'
import {encodeFunctionData} from 'viem'
const secret='fee-routing-fixture-secret-'.repeat(3);process.env.POCKET_SWAP_QUOTE_SECRET=secret
assert.equal(getAddress(EVM_GAS_REIMBURSEMENT),EVM_GAS_REIMBURSEMENT)
assert.equal(new PublicKey(SOLANA_PLATFORM_TREASURY).toBase58(),SOLANA_PLATFORM_TREASURY)
assert.deepEqual(evmFeeTransfers({},25n,7n),[{recipient:EVM_PLATFORM_TREASURY,units:32n}])
assert.deepEqual(evmFeeTransfers({feeRoutingVersion:2},25n,7n),[{recipient:EVM_PLATFORM_TREASURY,units:25n},{recipient:EVM_GAS_REIMBURSEMENT,units:7n}])
assert.throws(()=>evmFeeTransfers({feeRoutingVersion:3},25n,7n))
const solGas='Gs7RTc4iW5HE7r1s9AC2UwgEhb4uJ5vxZ9idFHh6x73J'
assert.deepEqual(solanaFeeTransfers({},25n,7n,solGas),[{recipient:solGas,units:32n}])
assert.deepEqual(solanaFeeTransfers({feeRoutingVersion:2},25n,7n,solGas),[{recipient:SOLANA_PLATFORM_TREASURY,units:25n},{recipient:solGas,units:7n}])
const binding={chain:'base',walletId:'wallet_test',walletAddress:'0x'+'11'.repeat(20),recipient:'0x'+'22'.repeat(20),amountUnits:'1000000',mode:'gross'}
const signed=createPaymentFeeQuote(binding,1000n,false,10000,secret)
assert.equal(signed.quote.feeRoutingVersion,2);assert.equal(verifyPaymentFeeQuote(signed.token,binding,11000,secret).feeRoutingVersion,2)
const legacy={...signed.quote};delete legacy.feeRoutingVersion
const body=Buffer.from(JSON.stringify(legacy)).toString('base64url');const token=body+'.'+createHmac('sha256',secret).update('hashpaylink:payment-fee:v1:').update(body).digest('base64url')
assert.equal(verifyPaymentFeeQuote(token,binding,11000,secret).feeRoutingVersion,undefined)
assert.throws(()=>verifyPaymentFeeQuote(Buffer.from(JSON.stringify(legacy)).toString('base64url')+'.'+signed.token.split('.')[1],binding,11000,secret))
const batch=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const transfer=parseAbi(['function transfer(address,uint256) returns(bool)'])
const n=await quoteNativeSend({ownerId:'owner_test',walletId:'wallet_test',walletAddress:binding.walletAddress,recipient:binding.recipient,network:'base',amount:'0.1'},async()=> '0.00001',10000)
assert.equal(decodeFunctionData({abi:batch,data:n.callData}).args[0][1].target.toLowerCase(),EVM_GAS_REIMBURSEMENT.toLowerCase())
assert.equal(openNativeSend(sealNativeSend(n),'owner_test',false,11000).callData,n.callData)
const tokenAddress='0x'+'33'.repeat(20),bridgeCallData=encodeFunctionData({abi:batch,functionName:'executeBatch',args:[[{target:tokenAddress,value:0n,data:encodeFunctionData({abi:transfer,functionName:'transfer',args:[binding.recipient,1000000n]})}]]})
const b={ownerId:'owner_test',walletId:'wallet_test',walletAddress:binding.walletAddress,source:'base',destination:'arbitrum',destinationAddress:binding.recipient,asset:'USDC',tokenAddress,amountUnits:'1000000',bridgeDebitUnits:'1000000'}
const q=await quoteEvmBridgeFee({...b,bridgeCallData,providerExpiresAt:30000},async()=> '0.000001',100000000n,10000)
const calls=decodeFunctionData({abi:batch,data:q.callData}).args[0]
assert.equal(decodeFunctionData({abi:transfer,data:calls.at(-1).data}).args[0].toLowerCase(),EVM_GAS_REIMBURSEMENT.toLowerCase())
assert.equal(openEvmBridgeFee(sealEvmBridgeFee(q),b,11000).callData,q.callData)
console.log('PASS fee routing: new EVM gas and Solana revenue addresses, unchanged platform/gas destinations, exact split totals, signed version binding, legacy quote recovery and native/bridge call destinations. No funds moved.')

const oldNative={...n};delete oldNative.feeRoutingVersion
const nativeCalls=decodeFunctionData({abi:batch,data:n.callData}).args[0].map(c=>({...c}))
nativeCalls[1].target=EVM_PLATFORM_TREASURY
oldNative.callData=encodeFunctionData({abi:batch,functionName:'executeBatch',args:[nativeCalls]})
assert.equal(openNativeSend(sealNativeSend(oldNative),'owner_test',true,999999).callData,oldNative.callData)
const oldBridge={...q};delete oldBridge.feeRoutingVersion
const oldCalls=calls.map(c=>({...c}));oldCalls.at(-1).data=encodeFunctionData({abi:transfer,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,BigInt(q.networkFeeUnits)]})
oldBridge.callData=encodeFunctionData({abi:batch,functionName:'executeBatch',args:[oldCalls]})
assert.equal(openEvmBridgeFee(sealEvmBridgeFee(oldBridge),b,11000).callData,oldBridge.callData)
assert.throws(()=>openEvmBridgeFee(sealEvmBridgeFee({...oldBridge,feeRoutingVersion:2}),b,11000),'routing cannot disagree with the actual batch')
console.log('PASS legacy native/bridge execution reconstruction and wrong-version calldata rejection.')
