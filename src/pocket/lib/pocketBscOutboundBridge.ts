import {validBridgeDestination,isPocketBridgeDestination,type PocketCircleBridgeNetwork} from './pocketBridgeDestination.js'
import {encodeFunctionData,decodeFunctionData,parseAbi,isAddress,type Address,type Hex} from 'viem'
import {POCKET_BSC} from './pocketBsc'
import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees'
export type BscBridgeDestination=PocketCircleBridgeNetwork|'xlayer'
export const isBscBridgeDestination=(n:unknown):n is BscBridgeDestination=>n==='xlayer'||isPocketBridgeDestination(n)
export const validBscBridgeDestination=(n:unknown,a:unknown):a is string=>n==='xlayer'?typeof a==='string'&&isAddress(a)&&!/^0x0{40}$/i.test(a):validBridgeDestination(n,a)
export type BscOutboundQuote={refundOptions?:Array<{network:BscBridgeDestination|'bsc';asset:'USDC'|'USDT';recipient:string}>;purpose?:'cash';version:1;id:string;ownerId:string;walletId:string;walletAddress:Hex;destinationAddress:string;source:'bsc';destination:BscBridgeDestination;asset:'USDC'|'USDT';from:'USDC'|'USDT';amountUnits:string;minimumOutUnits:string;receiveUnits:string;reimbursementUnits:string;totalInputUnits:string;orderId:Hex;requestId:Hex;issuedAt:number;expiresAt:number}
export const BSC_BRIDGE_DEPOSITORY='0x4cd00e387622c35bddb9b4c962c136462338bc31' as const
const abi=parseAbi(['function approve(address,uint256) returns(bool)','function depositErc20(address,address,uint256,bytes32)','function transfer(address,uint256) returns(bool)'])
export function validateBscOutbound(q:BscOutboundQuote,now=Date.now()){
 const uint=(n:unknown)=>typeof n==='string'&&/^[1-9]\d{0,30}$/.test(n)
 if(q.purpose!==undefined&&q.purpose!=='cash'||q.version!==1||q.source!=='bsc'||!validBscBridgeDestination(q.destination,q.destinationAddress)||q.destination==='arc'&&q.asset==='USDT'||q.purpose==='cash'&&q.destination!=='base'||!['USDC','USDT'].includes(q.asset)||q.from!==q.asset||!q.ownerId||!/^[a-zA-Z0-9]{10,64}$/.test(q.walletId)||!isAddress(q.walletAddress)||/^0x0{40}$/i.test(q.walletAddress)||/^0x0{40}$/i.test(q.destinationAddress)||!/^[0-9a-f-]{36}$/.test(q.id)||![q.orderId,q.requestId].every(h=>/^0x[0-9a-f]{64}$/i.test(h))||![q.amountUnits,q.minimumOutUnits,q.receiveUnits,q.reimbursementUnits,q.totalInputUnits].every(uint)||BigInt(q.totalInputUnits)!==BigInt(q.amountUnits)+BigInt(q.reimbursementUnits)||BigInt(q.receiveUnits)*10n**12n>BigInt(q.amountUnits)||BigInt(q.minimumOutUnits)>BigInt(q.receiveUnits)||BigInt(q.minimumOutUnits)*10000n<BigInt(q.receiveUnits)*9950n-10000n||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt>q.issuedAt+45000||q.expiresAt<=now)throw Error('Bridge details changed. Review the bridge again.')
 if(q.refundOptions!==undefined||q.destination==='xlayer'&&q.asset==='USDT'){
  const plan=q.refundOptions
  if(!Array.isArray(plan)||plan.length!==2||new Set(plan.map(r=>r.network)).size!==2)throw Error('Bridge refund details changed.')
  for(const r of plan){const origin=r.network==='bsc',recipient=origin?q.walletAddress:q.destinationAddress,alternate=!origin&&q.destination==='xlayer'&&q.asset==='USDT'&&r.asset==='USDC';if(!origin&&r.network!==q.destination||r.asset!==q.asset&&!alternate||typeof r.recipient!=='string'||(r.network==='solana'?r.recipient!==recipient:r.recipient.toLowerCase()!==recipient.toLowerCase()))throw Error('Bridge refund details changed.')}
 }
 return q
}
export function bscOutboundCalls(q:BscOutboundQuote,now=Date.now()){
 validateBscOutbound(q,now);const token=POCKET_BSC.assets[q.asset].address as Address
 const approve=(n:bigint)=>({to:token,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'approve',args:[BSC_BRIDGE_DEPOSITORY,n]})})
 return [approve(0n),approve(BigInt(q.amountUnits)),{to:BSC_BRIDGE_DEPOSITORY,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'depositErc20',args:[q.walletAddress,token,BigInt(q.amountUnits),q.orderId]})},approve(0n),{to:token,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,BigInt(q.reimbursementUnits)]})}]
}
export function bscOutboundRequest(q:BscOutboundQuote,appId:string,now=Date.now()){
 validateBscOutbound(q,now);if(!/^[a-zA-Z0-9]{1,128}$/.test(appId))throw Error('Reconnect your Pocket wallet.')
 return {version:1 as const,method:'POST' as const,url:`https://api.privy.io/v1/wallets/${q.walletId}/rpc`,headers:{'privy-app-id':appId,'privy-idempotency-key':q.id,'privy-request-expiry':String(q.expiresAt)},body:{chain_type:'ethereum',method:'wallet_sendCalls',caip2:'eip155:56',sponsor:true,params:{calls:bscOutboundCalls(q,now)}}}
}
