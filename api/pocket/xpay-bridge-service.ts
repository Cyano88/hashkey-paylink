import {createPublicClient,getAddress,http,parseAbi,parseAbiItem,type Hex} from 'viem'
import {base} from 'viem/chains'
import {circleLinkKey,readCircleLink} from '../privy-circle-link.js'
import {createCircleGasStationEvmChallenge,readCircleEvmChallenge} from '../circle-solana-email.js'
import {stockNoticeClient} from './xstocks-notifications-store.js'
import {verifyStockWalletOwner} from './xstocks-wallet-owner.js'
import {createXPayBridgeJournal} from './xpay-bridge-journal.js'
import {requestXPayReattestation,quoteXPayBridge,readXPayAttestation,validateXPayAttestation,verifyXPayBurnTransaction,verifyXPayMintReceipt,assertXPayMintWindow,xpayMintBatch,xpayBurnCalls,XPAY_CCTP} from './xpay-cctp-provider.js'

const baseClient=createPublicClient({chain:base,transport:http(process.env.PRIVATE_RPC_URL||'https://mainnet.base.org',{timeout:15000,retryCount:0})})
const fail=(message:string,status=409):never=>{throw Object.assign(new Error(message),{status})}
const messageSent=parseAbiItem('event MessageSent(bytes message)')
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)'])
const defaults={journal:createXPayBridgeJournal(),source:stockNoticeClient,destination:baseClient,readLink:readCircleLink,ownsStock:verifyStockWalletOwner,quote:quoteXPayBridge,reattest:requestXPayReattestation,attest:readXPayAttestation,challenge:createCircleGasStationEvmChallenge,challengeStatus:readCircleEvmChallenge}
// Internal coordinator. No public route is enabled before the complete XPay
// swap/payout orchestrator binds checkout, amount, fees and user approval.
export function createXPayBridgeService(overrides:Partial<typeof defaults>={}) {
 const d={...defaults,...overrides}
 async function record(owner:string,id:string){const r=await d.journal.find(owner,id);if(!r)fail('Bridge payment not found.',404);return r}
 async function canonical(client:typeof baseClient|typeof stockNoticeClient,chainId:number,hash:Hex){
  if(await client.getChainId()!==chainId)fail('Bridge network could not be verified.',503)
  let receipt
  try{receipt=await client.getTransactionReceipt({hash})}catch(e){if((e as Error).name==='TransactionReceiptNotFoundError')return null;throw e}
  const [block,head]=await Promise.all([client.getBlock({blockNumber:receipt.blockNumber}),client.getBlock()])
  if(block.hash!==receipt.blockHash||head.number<receipt.blockNumber+2n||Date.now()-Number(head.timestamp)*1000>60000)return null
  return receipt
 }
 return {
  async prepare(owner:string,key:string,checkoutId:string,source:string,receiveUnits:bigint){
   if(!/^[a-zA-Z0-9-]{16,80}$/.test(key)||!/^xp_[0-9a-f-]{36}$/.test(checkoutId))fail('Invalid payment reference.',400)
   await d.ownsStock(owner,source)
   const link=await d.readLink(circleLinkKey(owner,'base'))
   if(!link||link.circleBlockchain!=='BASE')fail('Open your Base wallet in Pocket before paying.')
   const plan=await d.quote(source,link.circleWalletAddress,receiveUnits)
   plan.destinationWalletId=link.circleWalletId
   return d.journal.create(owner,key,checkoutId,plan)
  },
  async authorizeBurn(owner:string,id:string){
   const r=await record(owner,id)
   if(r.state!=='quoted')fail('This bridge already started. Check its status.')
   await d.ownsStock(owner,r.plan.source)
   if(await d.source.getChainId()!==196)fail('X Layer could not be verified.',503)
   const calls=xpayBurnCalls(r.plan)
   const [balance,allowance]=await Promise.all([
    d.source.readContract({address:XPAY_CCTP.sourceToken,abi:tokenAbi,functionName:'balanceOf',args:[r.plan.source]}),
    d.source.readContract({address:XPAY_CCTP.sourceToken,abi:tokenAbi,functionName:'allowance',args:[r.plan.source,XPAY_CCTP.messenger]}),
   ])
   if(balance<BigInt(r.plan.burnUnits))fail('Not enough USDC on X Layer for this bridge.')
   if(allowance<BigInt(r.plan.burnUnits))return {record:r,approval:calls.approval}
   const [gas,gasPrice,gasBalance]=await Promise.all([d.source.estimateGas({account:r.plan.source,...calls.burn}),d.source.getGasPrice(),d.source.getBalance({address:r.plan.source})])
   if(gasBalance<gas*gasPrice*120n/100n)throw Object.assign(new Error('Not enough OKB for the network fee. Add OKB in Pocket, then retry.'),{status:409,code:'INSUFFICIENT_OKB'})
   // Persist before handing out executable burn data. Lost responses cannot
   // authorize a second burn; recovery must reconcile the original submission.
   return {record:await d.journal.claimBurn(owner,id,String((await d.source.getBlockNumber())+1n)),burn:calls.burn,gas,gasPrice}
  },
  async submitted(owner:string,id:string,hash:Hex){return d.journal.recordBurnHash(owner,id,hash)},
  async status(owner:string,id:string,circleUserToken?:string){
   let r=await record(owner,id)
   if(r.state==='completed'||r.state==='burn_failed')return r
   if(r.state==='burn_authorized'&&!r.burnHash&&r.burnScanBlock){
    if(await d.source.getChainId()!==196)fail('X Layer could not be verified.',503)
    const head=await d.source.getBlock(),start=BigInt(r.burnScanBlock)
    if(Date.now()-Number(head.timestamp)*1000>60000||head.number<start+2n)return r
    const end=head.number-2n<start+499n?head.number-2n:start+499n
    const logs=await d.source.getLogs({address:XPAY_CCTP.transmitter,event:messageSent,fromBlock:start,toBlock:end})
    const candidates=logs.filter(log=>{const raw=log.args.message?.slice(2);return raw?.length===752&&raw.slice(496,560).endsWith(r.plan.source.slice(2).toLowerCase())})
    for(const log of candidates){if(!log.transactionHash)continue;const tx=await d.source.getTransaction({hash:log.transactionHash});try{verifyXPayBurnTransaction(r.plan,tx,{status:'success'})}catch{continue}r=await d.journal.recordBurnHash(owner,id,log.transactionHash);break}
    if(!r.burnHash){await d.journal.advanceBurnScan(owner,id,String(end+1n));return r}
   }
   if(!r.burnHash)return r
   if(r.state==='burn_submitted'){
    const receipt=await canonical(d.source,196,r.burnHash as Hex);if(!receipt)return r
    if(!r.burnStartBlock||receipt.blockNumber<BigInt(r.burnStartBlock))fail('This transaction predates the approved bridge.')
    const tx=await d.source.getTransaction({hash:r.burnHash as Hex})
    if(verifyXPayBurnTransaction(r.plan,tx,receipt)==='reverted')return d.journal.markBurnReverted(owner,id)
    const proof=await d.attest(r.burnHash as Hex,r.plan)
    if(!proof)return r
    r=await d.journal.recordAttestation(owner,id,{message:proof.message,attestation:proof.attestation,nonce:proof.nonce})
   }
   if(r.state==='mint_submitted'&&r.challengeId&&circleUserToken){
    const status=await d.challengeStatus({chain:'base',userToken:circleUserToken,walletId:r.plan.destinationWalletId!,walletAddress:r.plan.destination,challengeId:r.challengeId})
    if(status.status==='failed')return d.journal.markMintFailed(owner,id,r.mintKey!)
    if(status.txHash){
     const receipt=await canonical(d.destination,8453,status.txHash as Hex);if(!receipt)return r
     const proof=validateXPayAttestation(r.message,r.plan)
     if(verifyXPayMintReceipt(r.plan,proof,receipt))return d.journal.complete(owner,id,status.txHash)
     if(receipt.status==='reverted')return d.journal.markMintFailed(owner,id,r.mintKey!)
     fail('Base receipt does not match this bridge. Your payment needs review.')
    }
   }
   return r
  },
  async refreshAttestation(owner:string,id:string){
   const r=await record(owner,id)
   if(!['attested','mint_failed'].includes(r.state))fail('Check the existing bridge approval before refreshing it.')
   const proof=validateXPayAttestation(r.message,r.plan)
   if(await d.destination.getChainId()!==8453)fail('Base could not be verified.',503)
   const block=await d.destination.getBlockNumber()
   if(proof.expirationBlock===0n||block<proof.expirationBlock)return r
   await d.reattest(proof.nonce)
   return r
  },
  async mint(owner:string,id:string,circleUserToken:string){
   let r=await record(owner,id)
   if(!circleUserToken||circleUserToken.length>8000||!r.plan.destinationWalletId)fail('Reconnect your Base wallet.',400)
   if(r.state==='completed')return {record:r}
   if(r.state==='mint_submitted'&&r.challengeId)return {record:r,challengeId:r.challengeId}
   if(!['attested','mint_requested','mint_failed'].includes(r.state)||!r.burnHash)fail('Wait for the verified bridge burn.')
   if(await d.destination.getChainId()!==8453)fail('Base could not be verified.',503)
   if(r.state==='mint_failed'||r.state==='attested'){
    const proof=await d.attest(r.burnHash as Hex,r.plan);if(!proof)fail('Bridge confirmation is not ready.')
    r=await d.journal.recordAttestation(owner,id,{message:proof.message,attestation:proof.attestation,nonce:proof.nonce})
   }
   const proof=validateXPayAttestation(r.message,r.plan)
   const callData=xpayMintBatch({...proof,attestation:r.attestation as Hex})
   // Simulation checks Circle signatures and destination caller restriction.
   // Do not reinterpret simulation/network errors as a reverted transaction.
   if(r.state!=='mint_requested'){
    assertXPayMintWindow(proof,await d.destination.getBlockNumber())
    await d.destination.call({account:r.plan.destination,to:r.plan.destination,data:callData})
   }
   r=await d.journal.claimMint(owner,id)
   const challenge=await d.challenge({chain:'base',userToken:circleUserToken,walletId:r.plan.destinationWalletId!,walletAddress:r.plan.destination,callData,idempotencyKey:r.mintKey!,refId:'pocket:xpay:mint:'+r.id})
   if(!challenge.challengeId)fail('Base approval is awaiting confirmation. Retry to recover the same request.',503)
   const saved=await d.journal.recordChallenge(owner,id,r.mintKey!,challenge.challengeId)
   return {record:saved,challengeId:challenge.challengeId}
  },
 }
}
