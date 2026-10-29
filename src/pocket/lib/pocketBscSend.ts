import {encodeFunctionData, getAddress, isAddress, parseAbi, type Hex} from 'viem'
import {POCKET_BSC} from './pocketBsc.js'
import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees.js'

export type BscSendQuote = {
 version:1; chainId:56; id:string; transferId:string; ownerId:string; walletId:string; walletAddress:Hex;
 asset:'USDC'|'USDT'; recipient:Hex; amountUnits:string; reimbursementUnits:string; issuedAt:number; expiresAt:number;
}
const abi=parseAbi(['function transfer(address,uint256) returns(bool)'])
const invalid=():never=>{throw Error('Transfer details changed. Review the transfer again.')}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const units=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,77}$/.test(v)&&BigInt(v)<2n**256n
export function validateBscSend(q:BscSendQuote,now=Date.now(),recovery=false){
 if(!q||q.version!==1||q.chainId!==56||!['USDC','USDT'].includes(q.asset)
 ||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.id)
 ||!/^sendb_[a-f0-9]{24}$/.test(q.transferId)||typeof q.ownerId!=='string'||!q.ownerId||q.ownerId.length>256||! /^[a-zA-Z0-9]{10,64}$/.test(q.walletId)
 ||!isAddress(q.walletAddress)||!isAddress(q.recipient)||/^0x0{40}$/i.test(q.walletAddress)||/^0x0{40}$/i.test(q.recipient)
 ||same(q.walletAddress,q.recipient)||same(q.walletAddress,EVM_PLATFORM_TREASURY)||same(q.recipient,EVM_PLATFORM_TREASURY)
 ||!units(q.amountUnits)||!units(q.reimbursementUnits)||BigInt(q.amountUnits)+BigInt(q.reimbursementUnits)>=2n**256n
 ||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt<=q.issuedAt||q.expiresAt-q.issuedAt>30000||(!recovery&&q.expiresAt<=now))invalid()
 return q
}
/** Exact recipient transfer and reimbursement in a single atomic sponsored batch. */
export function bscSendCalls(q:BscSendQuote,now=Date.now()){
 validateBscSend(q,now)
 const to=getAddress(POCKET_BSC.assets[q.asset].address)
 const transfer=(recipient:Hex,value:string)=>({to,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'transfer',args:[recipient,BigInt(value)]})})
 return [transfer(q.recipient,q.amountUnits),transfer(EVM_PLATFORM_TREASURY,q.reimbursementUnits)]
}
export function bscSendRequest(q:BscSendQuote,appId:string,now=Date.now()){
 validateBscSend(q,now)
 if(!/^[a-zA-Z0-9]{1,128}$/.test(appId))invalid()
 return {version:1 as const,method:'POST' as const,url:`https://api.privy.io/v1/wallets/${q.walletId}/rpc`,
 headers:{'privy-app-id':appId,'privy-idempotency-key':q.id,'privy-request-expiry':String(q.expiresAt)},
 body:{chain_type:'ethereum',method:'wallet_sendCalls',caip2:'eip155:56',sponsor:true,params:{calls:bscSendCalls(q,now)}}}
}
