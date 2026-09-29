import {getAddress,encodeFunctionData,parseAbi,parseAbiItem,type Hex} from 'viem'
import type {Request} from 'express'
import type {VerifiedLinkUser} from '../privy-circle-link.js'
import {createCircleGasStationEvmChallenge,readCircleEvmChallenge} from '../circle-solana-email.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {createXPayBankStore} from './xpay-bank-store.js'
import {createXPayBridgeService} from './xpay-bridge-service.js'
import {prepareXPayBankPayout,validateXPayBankChoice,checkXPayPayout,confirmXPayPayout,readXPayPayoutDelivery,xpayPayoutCall} from './xpay-bank-payout.js'
import {quoteXPayStockFunding,verifyXPayStockSwap} from './xpay-stock-funding.js'
import {quoteStockSwap} from './xstocks-swap-provider.js'
import {verifyStockWalletOwner} from './xstocks-wallet-owner.js'
import {stockNoticeClient} from './xstocks-notifications-store.js'
import {stockAssets,stockUsdc} from '../../src/pocket/lib/pocketXStocksWallet.js'
import {validateStockSwap} from '../../src/pocket/lib/pocketXStocksSwap.js'
import type {XPayBankPayment} from './xpay-bank-store.js'
const abi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'])
const transfer=parseAbiItem('event Transfer(address indexed from,address indexed to,uint256 value)')
function fail(message:string,status=409):never {throw Object.assign(new Error(message),{status})}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const defaults={store:createXPayBankStore(),bridge:createXPayBridgeService(),source:stockNoticeClient,owns:verifyStockWalletOwner,preparePayout:prepareXPayBankPayout,choice:validateXPayBankChoice,checkPayout:checkXPayPayout,confirmPayout:confirmXPayPayout,delivery:readXPayPayoutDelivery,funding:quoteXPayStockFunding,swapQuote:quoteStockSwap,validateSwap:validateStockSwap,consumeApproval:consumePocketPaymentApproval,challenge:createCircleGasStationEvmChallenge,challengeStatus:readCircleEvmChallenge}
// Internal, owner-scoped coordinator. The HTTP layer must verify the Privy identity.
// No public route should expose this until client recovery and receipt wiring pass.
export function createXPayBankService(overrides:Partial<typeof defaults>={}){
 const d={...defaults,...overrides}
 async function record(owner:string,id:string){const r=await d.store.find(owner,id);if(!r)fail('XPay payment not found.',404);return r}
 async function gasFor(source:string,call:{to:Hex;data:Hex;value:bigint}){
  const [gas,gasPrice,balance]=await Promise.all([d.source.estimateGas({account:getAddress(source),...call}),d.source.getGasPrice(),d.source.getBalance({address:getAddress(source)})])
  if(balance<(gas*gasPrice*120n+99n)/100n)throw Object.assign(new Error('Not enough OKB for the network fee. Add OKB in Pocket, then retry.'),{status:409,code:'INSUFFICIENT_OKB'})
  return {gas,gasPrice}
 }
 async function canonicalSwap(r:XPayBankPayment){
  if(!r.swapHash||!r.swap||!r.swapStartBlock)return r
  let receipt
  try{receipt=await d.source.getTransactionReceipt({hash:r.swapHash as Hex})}catch(e){if((e as Error).name==='TransactionReceiptNotFoundError')return r;throw e}
  const [block,head,tx]=await Promise.all([d.source.getBlock({blockNumber:receipt.blockNumber}),d.source.getBlock(),d.source.getTransaction({hash:r.swapHash as Hex})])
  if(receipt.blockNumber<BigInt(r.swapStartBlock))fail('This transaction predates the approved conversion.')
  if(block.hash!==receipt.blockHash||head.number<receipt.blockNumber+2n||Date.now()-Number(head.timestamp)*1000>60000)return r
  const proof=verifyXPayStockSwap(r.swap,tx,receipt,BigInt(r.bridgeUnits))
  if(proof.state==='failed')return d.store.verifiedFailure(r.owner,r.id,'swap',r.swapHash,'The stock conversion reverted. No stock payment was completed.')
  if(proof.state==='confirmed')return d.store.swapConfirmed(r.owner,r.id,proof.receivedUnits)
  return r
 }
 async function delivery(r:XPayBankPayment){
  if(!['successful','refunded'].includes(r.state)||!r.payoutHash)return r
  const latest=await d.delivery(r.payout)
  if(!latest?.hash||latest.hash.toLowerCase()!==r.payoutHash.toLowerCase()||latest.status===r.bankDelivery)return r
  return d.store.delivery(r.owner,r.id,r.payoutHash,latest.status)
 }
 return {
  list:async(owner:string)=>Promise.all((await d.store.list(owner)).slice(-100).map(r=>delivery(r).catch(()=>r))),
  async snapshot(owner:string,id:string){const payment=await record(owner,id);return {payment,bridge:await d.bridge.get(owner,payment.bridgeId)}},
  async refreshAttestation(owner:string,id:string){const r=await record(owner,id);if(r.state!=='bridging')fail('This payment is not waiting for a bridge.');return d.bridge.refreshAttestation(owner,r.bridgeId)},
  async prepare(req:Request,identity:VerifiedLinkUser,input:{key:string;checkoutId:string;merchantId:string;source:string;token:string;fiatAmount:string}){
   if(!/^[a-zA-Z0-9-]{16,80}$/.test(input.key)||!/^xp_[0-9a-f-]{36}$/.test(input.checkoutId)||!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/.test(input.fiatAmount)||Number(input.fiatAmount)<=0)fail('Invalid payment details.',400)
   const source=getAddress(input.source),asset=[stockUsdc,...stockAssets].find(a=>same(a.address,input.token))
   if(!asset)fail('Choose an accepted stock asset.',400)
   const existing=await d.store.byKey(identity.userId,input.key)
   if(existing){if(existing.checkoutId!==input.checkoutId||existing.merchantId!==input.merchantId||!same(existing.source,source)||!same(existing.token,asset.address)||Number(existing.fiatAmount)!==Number(input.fiatAmount))fail('This payment reference already has different details.');return existing}
   await d.owns(identity.userId,source)
   const payout=await d.preparePayout(req,identity,{...input,symbol:asset.symbol})
   const bridge=await d.bridge.prepare(identity.userId,input.key,input.checkoutId,source,BigInt(payout.fundingUnits))
   if(!same(bridge.plan.destination,payout.wallet)||bridge.plan.destinationWalletId!==payout.walletId||bridge.plan.minimumReceiveUnits!==payout.fundingUnits)fail('The linked Base wallet changed. Review the payment again.')
   const funding=await d.funding(source,asset.address,BigInt(bridge.plan.burnUnits))
   return d.store.create({...input,owner:identity.userId,source,token:asset.address,symbol:asset.symbol,amount:funding.amount,amountUnits:funding.amountUnits,fiatAmount:payout.fiatAmount,payout,bridgeId:bridge.id,bridgeUnits:bridge.plan.burnUnits,swap:funding.swap})
  },
  async approve(owner:string,id:string,approval:string){
   const r=await record(owner,id)
   if(r.state!=='quoted')fail('This payment already started. Check its status.')
   await d.choice(r.checkoutId,r.merchantId,r.symbol);await d.checkPayout(r.payout,owner)
   if(!await d.consumeApproval(approval,owner))fail('Confirm with your Pocket PIN or fingerprint.',403)
   return d.store.approve(owner,id)
  },
  async authorizeSwap(owner:string,id:string){
   const r=await record(owner,id)
   if(r.state!=='approved'||!r.swap)fail('Check the existing conversion before retrying.')
   await d.owns(owner,r.source);await d.choice(r.checkoutId,r.merchantId,r.symbol);await d.checkPayout(r.payout,owner)
   if(await d.source.getChainId()!==196)fail('X Layer could not be verified.',503)
   const fresh=await d.swapQuote({owner:getAddress(r.source),tokenIn:r.token,tokenOut:stockUsdc.address,amount:r.amount})
   d.validateSwap(fresh,getAddress(r.source))
   if(fresh.amountUnits!==r.amountUnits||!same(fresh.tokenIn.address,r.token)||!same(fresh.tokenOut.address,stockUsdc.address)||BigInt(fresh.minimumOutUnits)<BigInt(r.bridgeUnits)||BigInt(fresh.minimumOutUnits)<BigInt(r.swap.minimumOutUnits)||JSON.stringify(fresh.positiveSlippageFee)!==JSON.stringify(r.swap.positiveSlippageFee)||Number(fresh.gasFee)>Number(r.swap.gasFee)*1.2)fail('The stock quote changed. Review it before paying.')
   const [balance,allowance]=await Promise.all([d.source.readContract({address:getAddress(r.token),abi,functionName:'balanceOf',args:[getAddress(r.source)]}),d.source.readContract({address:getAddress(r.token),abi,functionName:'allowance',args:[getAddress(r.source),fresh.spender]})])
   if(balance<BigInt(r.amountUnits))fail('Not enough stock balance for this payment.')
   if(allowance<BigInt(r.amountUnits)){
    const approval={to:getAddress(r.token),data:encodeFunctionData({abi,functionName:'approve',args:[fresh.spender,allowance>0n?0n:BigInt(r.amountUnits)]}),value:0n}
    return {record:r,quote:fresh,approval,...await gasFor(r.source,approval)}
   }
   const swap={to:fresh.tx.to,data:fresh.tx.data,value:BigInt(fresh.tx.value)},gas=await gasFor(r.source,swap)
   const head=await d.source.getBlock();if(Date.now()-Number(head.timestamp)*1000>60000)fail('X Layer status is temporarily unavailable.',503)
   return {record:await d.store.startSwap(owner,id,fresh,String(head.number+1n)),quote:fresh,swap,...gas}
  },
  submittedSwap:(owner:string,id:string,hash:string)=>d.store.swapSubmitted(owner,id,hash),
  async status(owner:string,id:string,circleUserToken?:string){
   let r=await record(owner,id)
   if(['successful','refunded','failed','quoted'].includes(r.state))return delivery(r)
   if(['swap_authorized','swap_submitted'].includes(r.state)){
    if(await d.source.getChainId()!==196)fail('X Layer could not be verified.',503)
    if(r.state==='swap_authorized'&&r.swap&&r.swapScanBlock){
     const head=await d.source.getBlock(),start=BigInt(r.swapScanBlock)
     if(Date.now()-Number(head.timestamp)*1000>60000||head.number<start+2n)return r
     const end=head.number-2n<start+499n?head.number-2n:start+499n
     const logs=await d.source.getLogs({address:getAddress(stockUsdc.address),event:transfer,args:{to:getAddress(r.source)},fromBlock:start,toBlock:end})
     for(const hash of new Set(logs.map(l=>l.transactionHash).filter(Boolean))){
      const tx=await d.source.getTransaction({hash:hash!})
      try{verifyXPayStockSwap(r.swap,tx,{status:'pending',logs:[]},BigInt(r.bridgeUnits))}catch{continue}
      r=await d.store.swapSubmitted(owner,id,hash!);break
     }
     if(!r.swapHash){await d.store.scanSwap(owner,id,String(end+1n));return r}
    }
    if(r.state==='swap_submitted')r=await canonicalSwap(r)
   }
   if(r.state==='bridging'){
    const bridge=await d.bridge.status(owner,r.bridgeId,circleUserToken)
    r=await d.store.bridgeEvidence(owner,id,r.bridgeId,bridge.burnHash,bridge.mintHash,['attested','mint_requested','mint_submitted','mint_failed','completed','burn_failed'].includes(bridge.state))
    if(bridge.state==='completed')r=await d.store.bridgeConfirmed(owner,id)
    else if(bridge.state==='burn_failed')r=await d.store.verifiedFailure(owner,id,'bridge',r.bridgeId,'The bridge transaction reverted. Your USDC remains on X Layer.')
   }
   if(r.state==='payout_submitted'){
    const observed=await d.delivery(r.payout)
    const hash=r.payoutHash||observed?.hash
    if(hash){r=await d.store.payoutBroadcast(owner,id,r.payoutKey!,hash);await d.confirmPayout(r.payout,hash);return d.store.complete(owner,id,hash)}
   }
   if(r.state==='payout_submitted'&&r.challengeId&&circleUserToken){
    const status=await d.challengeStatus({chain:'base',userToken:circleUserToken,walletId:r.payout.walletId,walletAddress:r.payout.wallet,challengeId:r.challengeId})
    // Hash takes precedence: independently verify it even if a provider status lags.
    if(status.txHash){r=await d.store.payoutBroadcast(owner,id,r.payoutKey!,status.txHash);await d.confirmPayout(r.payout,status.txHash);r=await d.store.complete(owner,id,status.txHash)}
    else if(status.status==='failed'&&!r.payoutHash)r=await d.store.verifiedFailure(owner,id,'payment',r.challengeId,'The bank funding approval failed. Your USDC remains on Base.')
   }
   return r
  },
  async authorizeBridge(owner:string,id:string){
   let r=await record(owner,id)
   if(!['approved','swap_confirmed','bridging'].includes(r.state))fail('Confirm the stock conversion before bridging.')
   if(r.replacementPayout)fail('Confirm the updated bank quote before bridging.')
   // Never start a burn for a known-expired payout; preserve converted USDC.
   await d.checkPayout(r.payout,owner)
   if(r.state!=='bridging')r=await d.store.startBridge(owner,id)
   const action=await d.bridge.authorizeBurn(owner,r.bridgeId)
   return {...action,payment:r}
  },
  async submittedBridge(owner:string,id:string,hash:Hex){const r=await record(owner,id);if(r.state!=='bridging')fail('Bridge is not authorized.');return d.bridge.submitted(owner,r.bridgeId,hash)},
  async mint(owner:string,id:string,session:string){const r=await record(owner,id);if(r.state!=='bridging')fail('Bridge mint is not ready.');return d.bridge.mint(owner,r.bridgeId,session)},
  async payout(owner:string,id:string,session:string){
   let r=await record(owner,id)
   if(!session||session.length>8000)fail('Reconnect your Base wallet.',400)
   if(r.state==='successful')return {record:r}
   if(r.state==='payout_submitted'&&r.challengeId)return {record:r,challengeId:r.challengeId}
   if(!['payout_ready','payout_requested'].includes(r.state))fail('Wait for your verified Base balance.')
   // A lost response must recover the same request even after quote expiration.
   if(r.state==='payout_ready')await d.checkPayout(r.payout,owner)
   r=await d.store.claimPayout(owner,id)
   const c=await d.challenge({chain:'base',userToken:session,walletId:r.payout.walletId,walletAddress:r.payout.wallet,callData:xpayPayoutCall(r.payout),idempotencyKey:r.payoutKey!,refId:'pocket:xpay:payout:'+r.id})
   if(!c.challengeId)fail('Payment approval is awaiting confirmation. Retry to recover the same request.',503)
   return {record:await d.store.payoutChallenge(owner,id,r.payoutKey!,c.challengeId),challengeId:c.challengeId}
  },
  async reviewPayout(req:Request,identity:VerifiedLinkUser,id:string){
   const r=await record(identity.userId,id)
   if(!['approved','swap_confirmed','bridging','payout_ready'].includes(r.state)||r.payoutKey||r.challengeId)fail('Check the existing payment before changing its quote.')
   const quote=await d.preparePayout(req,identity,{checkoutId:r.checkoutId,merchantId:r.merchantId,symbol:r.symbol,fiatAmount:r.fiatAmount})
   return d.store.offerPayout(identity.userId,id,quote)
  },
  async acceptPayout(owner:string,id:string,intentId:string,approval:string){
   const r=await record(owner,id)
   if(!r.replacementPayout||r.replacementPayout.intentId!==intentId)fail('Review the updated bank quote first.')
   await d.choice(r.checkoutId,r.merchantId,r.symbol);await d.checkPayout(r.replacementPayout,owner)
   if(!await d.consumeApproval(approval,owner))fail('Confirm the updated quote with your Pocket PIN or fingerprint.',403)
   return d.store.acceptPayout(owner,id,intentId)
  },
  async retry(owner:string,id:string){
   const r=await record(owner,id)
   if(r.state!=='failed')fail('Check the existing submission before retrying.')
   await d.checkPayout(r.payout,owner)
   if(r.failureStage==='swap')return d.store.retrySwap(owner,id)
   if(r.failureStage==='payment')return d.store.retryPayment(owner,id)
   if(r.failureStage==='bridge'){
    const old=await d.bridge.status(owner,r.bridgeId)
    if(old.state!=='burn_failed')fail('Check the existing bridge before retrying.')
    const next=await d.bridge.prepare(owner,'retry-'+r.id+'-'+r.bridgeId,r.checkoutId,r.source,BigInt(r.payout.fundingUnits))
    if(!same(next.plan.destination,r.payout.wallet)||next.plan.destinationWalletId!==r.payout.walletId||BigInt(next.plan.burnUnits)>BigInt(r.bridgeUnits))fail('Bridge fees changed. Review before paying.')
    return d.store.retryBridge(owner,id,next.id)
   }
   fail('This payment needs review.')
  },
 }
}
