import {createServer} from 'node:http'
import {readFileSync,writeFileSync,renameSync,existsSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {build} from 'vite'
import {nodePolyfills} from 'vite-plugin-node-polyfills'
import {createPublicClient,http,parseAbi,zeroAddress,keccak256,stringToHex} from 'viem'
import {verifyArcTradeReceipt} from '../api/trade-agreement/receipt.ts'
import {planArcTradeCandidate} from '../api/trade-agreement/arc-planner.ts'
import {verifyArcTradeExecution,verifyArcTradeExecutionAccount,wrapArcTradeCall} from '../api/trade-agreement/arc-execution.ts'
import {loadActivationCircleKey,readActivationCircleWallets} from './arc-circle-activation-provider.mjs'
import {selectActivationWallet} from './arc-circle-activation-selection.mjs'
import {assertCanaryIntent,CANARY_REFUND_EVIDENCE} from './arc-trade-canary-policy.mjs'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),temp=resolve(root,'.codex-temp')
const host='127.0.0.1:4391',origin='http://'+host
const read=path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''))
const record=read(resolve(temp,'arc-trade-canary.json')),pendingPath=resolve(temp,'arc-trade-canary-pending.json')
if(record.binding.contractTerms.amount!=='100000'||record.binding.chainId!==5042||record.policy.entryPointVersion!=='0.7')throw Error('Verified 0.10 USDC canary required.')
const key=await loadActivationCircleKey(),upstream='https://hashkey-paylink.onrender.com'
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
const bundle=await build({configFile:false,root,envFile:false,plugins:[nodePolyfills({globals:{Buffer:true,global:true,process:true},protocolImports:true})],define:{'import.meta.env':'{}'},logLevel:'error',build:{write:false,minify:true,lib:{entry:resolve(root,'scripts/arc-trade-canary-client.js'),name:'ArcTradeCanary',formats:['iife']},rollupOptions:{output:{inlineDynamicImports:true}}}})
const js=(Array.isArray(bundle)?bundle:[bundle]).flatMap(r=>r.output).find(f=>f.type==='chunk'&&f.isEntry).code
const css=readFileSync('C:/Users/USER/Desktop/Hash-PayLink-Arc-Mainnet-Deployment/style.css')
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hash PayLink · Arc Trade test</title><link rel="stylesheet" href="/style.css"></head><body><main><p>HASH PAYLINK · ARC MAINNET</p><h1>0.10 USDC Trade test</h1><p>Controlled test; no goods are being purchased. Seller creates the unfunded escrow and accepts the terms. Buyer approves exactly 0.10 USDC, then funds the escrow. After funding verification, the seller can approve a full 0.10 USDC refund to the original buyer. The refund amount and recipient cannot be edited.</p><p><a href="/seller/">Seller</a> · <a href="/buyer/">Buyer</a></p><dl><dt>Role</dt><dd id="role"></dd><dt>Email</dt><dd id="email"></dd><dt>Circle wallet</dt><dd id="wallet"></dd><dt>Principal</dt><dd>0.10 USDC · delivery fee 0 · review any network fees shown by Circle</dd><dt>Terms</dt><dd>No goods. Pickup test. Dispatch and delivery windows: 1 day each. Inspection: 24 hours. Return the 0.10 USDC principal to the buyer after lifecycle verification.</dd><dt>Funding deadline</dt><dd id="deadline"></dd><dt>Terms hash</dt><dd id="terms"></dd><dt>Escrow</dt><dd id="escrow"></dd></dl><button id="connect" disabled>Sign in with Circle</button><button id="action" disabled>Review next step</button><button id="refresh">Check transaction</button><pre id="status" role="status">Loading verified test details…</pre><p id="transaction"></p></main><script src="/client.js"></script></body></html>`
const fail=(message,status=409)=>{throw Object.assign(Error(message),{publicMessage:message,status})}
const walletFor=role=>{if(!['buyer','seller'].includes(role))fail('Choose buyer or seller.',400);return record.wallets.find(w=>w.role===role)}
const pending=()=>existsSync(pendingPath)?read(pendingPath):null
const save=entry=>{const path=pendingPath+'.'+randomUUID()+'.tmp';writeFileSync(path,JSON.stringify(entry,null,2)+'\n',{flag:'wx'});renameSync(path,pendingPath)}
const labels={create:'Create unfunded escrow',accept:'Accept 0.10 USDC terms',approve:'Approve exactly 0.10 USDC',fund:'Fund escrow with 0.10 USDC',refund:'Return 0.10 USDC to buyer'}
let busy=false
async function provider(path,userToken,body){
 const response=await fetch('https://api.circle.com/v1/w3s/'+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+key,'X-User-Token':userToken,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)})
 const data=await response.json();if(!response.ok||!data.data)fail('Circle request did not complete. Check the saved transaction before retrying.')
 return data.data
}
async function owned(role,userToken){
 const wallet=walletFor(role),data=await readActivationCircleWallets(key,userToken)
 if(selectActivationWallet(data,{walletId:wallet.walletId,address:wallet.address}).ok===false)fail('This Circle session does not own the linked test wallet.',403)
 return wallet
}
async function plan(role,action){
 if(action==='refund'){
  const state=await plan(role)
  if(state.pending||state.state!==2)fail('This canary refund requires the confirmed Funded state.')
 }
 return planArcTradeCandidate({binding:record.binding,account:walletFor(role).address,fundingEnabled:true,...(action?{action}:{}),...(action==='refund'?{evidence:CANARY_REFUND_EVIDENCE}:{})},client,record.release)
}
async function status(role){
 const state=await plan(role),entry=pending()
 const action=entry?(entry.role===role&&entry.challengeId?entry.action:null):state.actions.find(a=>Object.hasOwn(labels,a)&&(a!=='refund'||state.state===2))??null
 const funded=state.state===2,advanced=state.state!==undefined&&state.state>2
 return {escrow:state.escrow===zeroAddress?null:state.escrow,state:state.state,action:advanced?null:action,label:action?labels[action]:null,message:entry?('Saved '+entry.action+' request for '+entry.role+'. Sign in as that participant and check the transaction.'):state.state===7?'Escrow is Refunded on chain. Return to the chat for final receipt verification.':advanced?'The escrow has moved beyond this test. Return to the chat for review.':funded?(role==='seller'?'Return the full 0.10 USDC principal to the fixed buyer wallet '+record.binding.contractTerms.buyer+'. Review and approve with Circle.':'Funding is confirmed. The seller can now return the full 0.10 USDC principal to your wallet.'):action?'Review the terms above, then '+labels[action].toLowerCase()+'.':'Waiting for the other participant or confirmed chain state.',transactionHash:entry?.transactionHash??null}
}
async function reconcile(role,userToken){
 await owned(role,userToken)
 const entry=pending();if(!entry)return {message:'No pending request. Check the next available step.'}
 if(entry.role!==role)fail('Check this request while signed in as '+entry.role+'.')
 if(!entry.challengeId)fail('The saved request has an unknown provider outcome. Return to the chat for recovery; do not submit another request.')
 const {challenge}=await provider('user/challenges/'+encodeURIComponent(entry.challengeId),userToken)
 const ids=challenge?.correlationIds
 if(!Array.isArray(ids)||ids.length!==1||typeof ids[0]!=='string')return {message:'Circle approval is pending or needs recovery. No new request has been created.'}
 const {transaction}=await provider('transactions/'+encodeURIComponent(ids[0]),userToken)
 if(!transaction||transaction.walletId!==entry.walletId||transaction.blockchain!=='ARC'||transaction.refId!==entry.refId)fail('Provider transaction does not match the saved request.')
 if(!/^0x[a-f0-9]{64}$/i.test(transaction.txHash??''))return {message:'Waiting for Circle to publish the transaction.'}
 const result=await verifyArcTradeExecution({call:entry.call,transactionHash:transaction.txHash,policy:record.policy,preparedAfterBlock:BigInt(entry.preparedAfterBlock)},client)
 if(result.status!=='confirmed')fail('The operation reverted. Keep the saved request and return to the chat.')
 const observed=await plan(role)
 const expectedState={create:0,accept:1,approve:1,fund:2,refund:7}[entry.action]
 if(observed.pending||observed.state!==expectedState||!observed.escrow||observed.escrow===zeroAddress)fail('The expected escrow state is not confirmed yet. Keep the saved request and check again.')
 if(entry.action==='approve'||entry.action==='fund'){
  const abi=parseAbi(['function allowance(address,address) view returns(uint256)','function balanceOf(address) view returns(uint256)'])
  const amount=await client.readContract({address:record.binding.contractTerms.token,abi,functionName:entry.action==='approve'?'allowance':'balanceOf',args:entry.action==='approve'?[entry.call.account,observed.escrow]:[observed.escrow],blockNumber:BigInt(observed.observedBlock)})
  if(amount!==100000n)fail('The expected 0.10 USDC allowance or escrow balance was not confirmed.')
 }
 let settlement
 if(entry.action==='refund'){
  settlement=await verifyArcTradeReceipt({id:'tag_'+record.terms.trade.snapshotHash,partnerId:'local-arc-trade-canary',terms:record.terms,binding:record.binding},transaction.txHash,client,record.release)
  if(settlement.state!==7||settlement.buyerAmountUnits!=='100000'||settlement.sellerAmountUnits!=='0'||settlement.evidence!==keccak256(stringToHex(CANARY_REFUND_EVIDENCE)))fail('The full buyer refund was not verified.')
  const balance=await client.readContract({address:record.binding.contractTerms.token,abi:parseAbi(['function balanceOf(address) view returns(uint256)']),functionName:'balanceOf',args:[observed.escrow],blockNumber:BigInt(observed.observedBlock)})
  if(balance!==0n)fail('The escrow balance is not zero after refund.')
 }
 save({...entry,status:'confirmed',transactionHash:transaction.txHash,result,...(settlement?{settlement}:{})})
 renameSync(pendingPath,resolve(temp,'arc-trade-canary-history-'+entry.id+'.json'))
 return {message:settlement?'Full 0.10 USDC refund independently confirmed. The principal returned to the buyer.':'Transaction independently confirmed. Check the next step.',transactionHash:transaction.txHash}
}
createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY')
 const reply=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
 if(req.headers.host!==host){reply(403,{error:'Invalid host.'});return}
 const url=new URL(req.url,origin)
 try{
  if(req.method==='GET'){
   if(['/','/seller/','/buyer/'].includes(url.pathname)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
   if(url.pathname==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return}
   if(url.pathname==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(js);return}
   if(url.pathname==='/expected'){const w=walletFor(url.searchParams.get('role'));reply(200,{email:w.email,walletId:w.walletId,address:w.address,termsHash:record.binding.termsHash,fundBy:record.binding.contractTerms.fundBy});return}
   if(url.pathname==='/status'){reply(200,await status(url.searchParams.get('role')));return}
   if(url.pathname==='/api/public-config'){const r=await fetch(upstream+url.pathname,{signal:AbortSignal.timeout(20000)});reply(r.status,await r.json());return}
  }
  if(req.method!=='POST'){reply(404,{error:'Not found.'});return}
  if(req.headers.origin!==origin){reply(403,{error:'Invalid origin.'});return}
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20000)fail('Request too large.',413)}
  const body=JSON.parse(raw)
  if(url.pathname==='/api/circle-solana-email'){
   const w=walletFor(req.headers['x-canary-role'])
   if(body.chain!=='arc'||!['requestEmailOtp','listWallets','getTransaction'].includes(body.action))fail('Only Circle sign-in and transaction reads are available.',403)
   if(body.action==='requestEmailOtp'){
    if(body.email?.toLowerCase()!==w.email)fail('Use this participant email.',403)
    const r=await fetch(upstream+url.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:raw,signal:AbortSignal.timeout(25000)});reply(r.status,await r.json());return
   }
   if(body.action==='listWallets'){
    const data=selectActivationWallet(await readActivationCircleWallets(key,body.userToken),{walletId:w.walletId,address:w.address})
    reply(data.ok===false?409:200,data);return
   }
   await owned(w.role,body.userToken)
   if(!/^[a-f0-9-]{36}$/i.test(body.transactionId??''))fail('Invalid transaction reference.',400)
   const data=await provider('transactions/'+body.transactionId,body.userToken)
   if(data.transaction?.walletId!==w.walletId)fail('Transaction wallet mismatch.',403)
   reply(200,{ok:true,...data});return
  }
  if(!['/challenge','/reconcile'].includes(url.pathname))fail('Not found.',404)
  if(busy)fail('A request is being checked. Wait and refresh.')
  busy=true
  try{
   if(url.pathname==='/reconcile'){reply(200,await reconcile(body.role,body.userToken));return}
   assertCanaryIntent(body,record)
   const w=await owned(body.role,body.userToken)
   const saved=pending()
   if(saved){
    if(saved.role!==body.role||saved.action!==body.action||!saved.challengeId)fail('A saved request needs recovery. Check it before another approval.')
    const {challenge}=await provider('user/challenges/'+encodeURIComponent(saved.challengeId),body.userToken)
    if(challenge?.status!=='PENDING')fail('The saved approval has advanced. Check transaction; do not sign again.')
    reply(200,{challengeId:saved.challengeId});return
   }
   await verifyArcTradeExecutionAccount(w.address,record.policy,client)
   const planned=await plan(body.role,body.action)
   if(!planned.transaction||planned.pending)fail('The chain state is not ready.')
   if(body.action==='approve'){
    const allowance=await client.readContract({address:record.binding.contractTerms.token,abi:parseAbi(['function allowance(address,address) view returns(uint256)']),functionName:'allowance',args:[w.address,planned.escrow]})
    if(allowance!==0n)fail('A pre-existing allowance needs separate review.')
   }
   const id=randomUUID(),entry={id,role:body.role,action:body.action,walletId:w.walletId,termsHash:record.binding.termsHash,call:planned.transaction,preparedAfterBlock:String(await client.getBlockNumber({cacheTime:0})),refId:'hashpaylink-arc-trade-canary:'+id,status:'requesting',createdAt:new Date().toISOString()}
   writeFileSync(pendingPath,JSON.stringify(entry,null,2)+'\n',{flag:'wx'})
   const challenge=await provider('user/transactions/contractExecution',body.userToken,{idempotencyKey:id,walletId:w.walletId,feeLevel:'HIGH',refId:entry.refId,contractAddress:w.address,callData:wrapArcTradeCall(entry.call)})
   if(typeof challenge.challengeId!=='string')fail('Circle did not return an approval reference. Keep the saved request for recovery.')
   save({...entry,status:'challenge_issued',challengeId:challenge.challengeId})
   reply(200,{challengeId:challenge.challengeId})
  }finally{busy=false}
 }catch(error){reply(error.status??503,{error:error.publicMessage??'The canary check could not finish. Keep the page open and return to the chat; no pending request was cleared.'})}
}).listen(4391,'127.0.0.1',()=>console.log('Arc Trade canary: '+origin+'/seller/'))
