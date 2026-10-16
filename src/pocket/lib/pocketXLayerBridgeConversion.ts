import {encodeFunctionData,getAddress,parseAbi,type Address} from 'viem'
import {validateXLayerBridgeSwap,OKX_XLAYER_SPENDER,type StockSwapQuote} from './pocketXStocksSwap'
export type XLayerBridgeConversion={swap:StockSwapQuote;depositUnits:string}
const usdc='0xb6ceceab302e2e4948951ee7843fc24e92933061',usdt='0x779ded0c9e1022225f8e0630b35a9b54be713736',depository='0x4cd00e387622c35bddb9b4c962c136462338bc31'
const abi=parseAbi(['function approve(address,uint256) returns(bool)','function depositErc20(address,address,uint256,bytes32)'])
// Reconstructed identically in the server and signer. The swap and deposit are
// atomic; deposit <= guaranteed swap output, never an existing USDC balance.
export function xlayerConversionCalls(plan:XLayerBridgeConversion,owner:Address,amountUnits:string,orderId:`0x${string}`,now=Date.now()){
 validateXLayerBridgeSwap(plan.swap,owner,now)
 if(plan.swap.amountUnits!==amountUnits||plan.swap.decimalsIn!==6||plan.swap.decimalsOut!==6||plan.depositUnits!==plan.swap.minimumOutUnits||!/^0x[0-9a-f]{64}$/i.test(orderId)||BigInt(plan.depositUnits)<=0n||BigInt(plan.depositUnits)>BigInt(amountUnits))throw Error('Bridge conversion changed.')
 const approval=(token:Address,spender:Address,amount:bigint)=>({to:getAddress(token),value:'0x0' as const,data:encodeFunctionData({abi,functionName:'approve',args:[getAddress(spender),amount]})})
 return [approval(usdt,OKX_XLAYER_SPENDER,0n),approval(usdt,OKX_XLAYER_SPENDER,BigInt(amountUnits)),{to:plan.swap.tx.to,value:'0x0' as const,data:plan.swap.tx.data},approval(usdt,OKX_XLAYER_SPENDER,0n),approval(usdc,depository,0n),approval(usdc,depository,BigInt(plan.depositUnits)),{to:getAddress(depository),value:'0x0' as const,data:encodeFunctionData({abi,functionName:'depositErc20',args:[owner,usdc,BigInt(plan.depositUnits),orderId]})},approval(usdc,depository,0n)]
}
