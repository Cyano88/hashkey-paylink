import {crossBridgeSolanaNativeDeposit} from '../../api/pocket/cross-bridge-solana-native.ts'
import {readFileSync} from 'node:fs'
import {getOrderId} from '@relay-protocol/settlement-sdk'
import {encodeFunctionData} from 'viem'
import {crossBridgePair,crossBridgeAssets} from '../../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {crossBridgeDepositAbi} from '../../api/pocket/cross-bridge-provider.ts'
import {RELAY_BSC_CHAINS,bscRelaySolanaDeposit} from '../../api/pocket/bsc-bridge-provider.ts'
const template=JSON.parse(readFileSync(new URL('./bsc-bridge/usdc-out.json',import.meta.url),'utf8'))
const solFixture=JSON.parse(readFileSync(new URL('./inbound-bridge/USDC-solana-bsc.json',import.meta.url),'utf8'))
const evm='0xd7579fa0784288ef6eab335bc97d3c8ebc7ec435',sol=solFixture.input.sender
const vmTypes={bnb:'ethereum-vm',xlayer:'ethereum-vm',ethereum:'ethereum-vm',polygon:'ethereum-vm',arc:'ethereum-vm',base:'ethereum-vm',arbitrum:'ethereum-vm',solana:'solana-vm'}
const protocolChain=n=>n==='bsc'?'bnb':n,now=1790000000000
function fixture(source,destination,from,to,alternateRefund=false,senderOverride){
 const {tokenIn,tokenOut}=crossBridgePair(source,destination,from,to)
 const i={source,destination,from,to,sender:senderOverride??(source==='solana'?sol:evm),recipient:destination==='solana'?sol:evm,amountUnits:(10n**BigInt(tokenIn.decimals)).toString()}
 const q=structuredClone(template),order=q.protocol.v2.orderData
 order.output.deadline=Math.floor(now/1000)+7*86400
 const receive=10n**BigInt(tokenOut.decimals)*2n,minimum=receive*9951n/10000n
 order.inputs[0].payment={chainId:protocolChain(source),currency:tokenIn.address,amount:i.amountUnits,weight:'1'}
 order.output.chainId=protocolChain(destination);order.output.payments=[{recipient:i.recipient,currency:tokenOut.address,expectedAmount:String(receive),minimumAmount:String(minimum)}]
 const refundToken=alternateRefund?crossBridgeAssets(destination).find(t=>t.symbol===(alternateRefund===true?'USDC':alternateRefund)):tokenOut
 order.inputs[0].refunds=[{...order.inputs[0].refunds[0],chainId:protocolChain(source),recipient:i.sender,currency:tokenIn.address,deadline:order.output.deadline},{...order.inputs[0].refunds[1],chainId:protocolChain(destination),recipient:i.recipient,currency:refundToken.address,deadline:order.output.deadline}]
 const orderId=getOrderId(order,vmTypes);q.protocol.v2.orderId=orderId;q.protocol.v2.paymentDetails={chainId:protocolChain(source),depository:RELAY_BSC_CHAINS[source].depository,currency:tokenIn.address,amount:i.amountUnits}
 q.details.currencyIn={amount:i.amountUnits,currency:{chainId:RELAY_BSC_CHAINS[source].id,address:tokenIn.address,decimals:tokenIn.decimals}}
 q.details.currencyOut={amount:String(receive),currency:{chainId:RELAY_BSC_CHAINS[destination].id,address:tokenOut.address,decimals:tokenOut.decimals}}
 const step=structuredClone(q.steps.find(s=>s.id==='deposit'));step.depositAddress=''
 if(source==='solana'){
  const ix=from==='SOL'?crossBridgeSolanaNativeDeposit(i.sender,BigInt(i.amountUnits),orderId):bscRelaySolanaDeposit(i.sender,BigInt(i.amountUnits),orderId,from)
  step.items[0].data={instructions:[{programId:ix.programId.toBase58(),data:ix.data.toString('hex'),keys:ix.keys.map(k=>({pubkey:k.pubkey.toBase58(),isSigner:k.isSigner,isWritable:k.isWritable}))}]}
 }else step.items[0].data={from:i.sender,to:RELAY_BSC_CHAINS[source].depository,value:tokenIn.native?i.amountUnits:'0',chainId:RELAY_BSC_CHAINS[source].id,data:encodeFunctionData({abi:crossBridgeDepositAbi,functionName:tokenIn.native?'depositNative':'depositErc20',args:tokenIn.native?[i.sender,orderId]:[i.sender,tokenIn.address,BigInt(i.amountUnits),orderId]})}
 q.steps=[step]
 return {q,i}
}

export {fixture,now,evm,sol}
