import {encodeFunctionData, getAddress, isAddress, parseAbi, type Hex} from 'viem'
import {POCKET_BSC} from './pocketBsc.js'
import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees.js'

export type BscPaymentQuote = {
 version:1|2; chainId:56; id:string; checkoutId:string; ownerId:string; walletId:string; walletAddress:Hex;
 asset:'USDC'|'USDT'; recipient:Hex; amountUnits:string; reimbursementUnits:string; issuedAt:number; expiresAt:number;
}
const abi=parseAbi(['function transfer(address,uint256) returns(bool)'])
const invalid=():never=>{throw Error('Payment details changed. Review the payment again.')}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const units=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,77}$/.test(v)&&BigInt(v)<2n**256n
export function validateBscPayment(q:BscPaymentQuote,now=Date.now(),recovery=false){
 if(!q||![1,2].includes(q.version)||q.chainId!==56||!['USDC','USDT'].includes(q.asset)
 ||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.id)
 ||!/^chkb_[a-f0-9]{24}$/.test(q.checkoutId)||typeof q.ownerId!=='string'||!q.ownerId||q.ownerId.length>256||! /^[a-zA-Z0-9]{10,64}$/.test(q.walletId)
 ||!isAddress(q.walletAddress)||!isAddress(q.recipient)||/^0x0{40}$/i.test(q.walletAddress)||/^0x0{40}$/i.test(q.recipient)
 ||same(q.walletAddress,q.recipient)||same(q.walletAddress,EVM_PLATFORM_TREASURY)||same(q.recipient,EVM_PLATFORM_TREASURY)
 ||!units(q.amountUnits)||!units(q.reimbursementUnits)||BigInt(q.amountUnits)+BigInt(q.reimbursementUnits)>=2n**256n
 ||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt<=q.issuedAt||q.expiresAt-q.issuedAt>30000||(!recovery&&q.expiresAt<=now))invalid()
 bscPaymentAmounts(q)
 return q
}
/** Version 1 preserves issued customer-paid quotes. Version 2 fixes the
 * customer debit to the order total, including the 25 bps merchant service fee. */
export function bscPaymentAmounts(q:Pick<BscPaymentQuote,'version'|'amountUnits'|'reimbursementUnits'>){
 const amount=BigInt(q.amountUnits),networkFee=BigInt(q.reimbursementUnits)
 if(amount<=0n||networkFee<=0n||![1,2].includes(q.version))return invalid()
 const platformFee=q.version===2?amount*25n/10000n:0n
 const treasury=platformFee+networkFee,recipient=q.version===2?amount-treasury:amount,total=q.version===2?amount:amount+treasury
 if(recipient<=0n||total>=2n**256n)return invalid()
 return {platformFee,networkFee,treasury,recipient,total}
}
/** Exact merchant payment and reimbursement in a single atomic sponsored batch. */
export function bscPaymentCalls(q:BscPaymentQuote,now=Date.now()){
 validateBscPayment(q,now)
 const to=getAddress(POCKET_BSC.assets[q.asset].address)
 const transfer=(recipient:Hex,value:string)=>({to,value:'0x0' as const,data:encodeFunctionData({abi,functionName:'transfer',args:[recipient,BigInt(value)]})})
 const amounts=bscPaymentAmounts(q)
 return [transfer(q.recipient,String(amounts.recipient)),transfer(EVM_PLATFORM_TREASURY,String(amounts.treasury))]
}
export function bscPaymentRequest(q:BscPaymentQuote,appId:string,now=Date.now()){
 validateBscPayment(q,now)
 if(!/^[a-zA-Z0-9]{1,128}$/.test(appId))invalid()
 return {version:1 as const,method:'POST' as const,url:`https://api.privy.io/v1/wallets/${q.walletId}/rpc`,
 headers:{'privy-app-id':appId,'privy-idempotency-key':q.id,'privy-request-expiry':String(q.expiresAt)},
 body:{chain_type:'ethereum',method:'wallet_sendCalls',caip2:'eip155:56',sponsor:true,params:{calls:bscPaymentCalls(q,now)}}}
}
