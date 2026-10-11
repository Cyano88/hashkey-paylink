import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {decodeFunctionData,parseAbi} from 'viem'
const payer='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222'
const mocks={
 './evm-read.js':`export const readEvmRpc=async()=> '0x'+BigInt(globalThis.bridgeBalance??1000000000n).toString(16).padStart(64,'0')`,
 './privy-circle-link.js':`export const circleLinkKey=()=>'';export const readCircleLink=async()=>null;export const findPaymentCircleLinkByWallet=async()=>({privyUserId:'owner'});export const verifiedPrivyUser=async()=>({userId:globalThis.bridgeOwner??'owner'})`,
 './pocket/payment-security.js':`export const requiresPocketPaymentApproval=async()=>false;export const consumePocketPaymentApproval=async()=>true`,
 './pocket/wallet-migration-guard.js':`export const withOrdinaryWalletMutation=async(id,run)=>run()`
}
await build({entryPoints:['api/circle-solana-email.ts'],outfile:'.codex-temp/evm-bridge-integration.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
process.env.CIRCLE_API_KEY='fixture';process.env.POCKET_SWAP_QUOTE_SECRET='fixture-evm-bridge-integration-secret-12345678'
const {default:handler,quoteCircleEvmBridge,quoteCircleEvmBatchRecovery}=await import('../.codex-temp/evm-bridge-integration.mjs')
let network='BASE',destinationNetwork='ARB',executions=[]
globalThis.fetch=async(url,init)=>{
 const u=new URL(url)
 if(u.hostname==='iris-api.circle.com')return Response.json([{finalityThreshold:2000,minimumFee:'0',forwardFee:{med:'1000'}}])
 if(u.hostname==='api.coingecko.com')return Response.json({ethereum:{usd:3000,last_updated_at:Date.now()/1000},'polygon-ecosystem-token':{usd:0.5,last_updated_at:Date.now()/1000},'usd-coin':{usd:1,last_updated_at:Date.now()/1000},tether:{usd:1,last_updated_at:Date.now()/1000}})
 if(u.pathname==='/v1/w3s/wallets/wallet')return Response.json({data:{wallet:{id:'wallet',address:payer,blockchain:network,accountType:'SCA',state:'LIVE'}}})
 if(u.pathname==='/v1/w3s/wallets')return Response.json({data:{wallets:[{id:'destination',address:recipient,blockchain:destinationNetwork}]}})
 if(u.pathname.endsWith('/estimateFee')){assert.equal(init.headers['X-User-Token'],'session');const calls=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:JSON.parse(init.body).callData}).args[0];assert.equal(calls.length,3);return Response.json({data:{high:{networkFeeRaw:'0.000001'}}})}
 assert.equal(u.pathname,'/v1/w3s/user/transactions/contractExecution');executions.push(JSON.parse(init.body));return Response.json({data:{challengeId:'challenge'}})
}
async function execute(body){let status=200,result;await handler({method:'POST',headers:{},body},{status(s){status=s;return this},json(r){result=r}});return {status,result}}
for(const [source,chain]of Object.entries({base:'BASE',arbitrum:'ARB',ethereum:'ETH',polygon:'MATIC',arc:'ARC'})){
 network=chain;const destination=source==='base'?'arbitrum':'base';destinationNetwork=destination==='base'?'BASE':'ARB'
 const input={ownerId:'owner',userToken:'session',walletId:'wallet',walletAddress:payer,chain:source,destination,destinationAddress:recipient,amountUnits:'1000000'}
 const q=await quoteCircleEvmBridge(input);assert.equal(q.receive,'1');assert.ok(Number(q.total)>1.001)
 const body={...input,action:'executeEvmBridge',quoteToken:q.quoteToken,idempotencyKey:'11111111-1111-4111-8111-111111111111'}
 const result=await execute(body);assert.equal(result.status,200,JSON.stringify(result));const first=executions.at(-1)
 await execute(body);assert.deepEqual(executions.at(-1),first,'Retry keeps exact call data and key')
 const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:first.callData}).args[0]
 const burn=decodeFunctionData({abi:parseAbi(['function depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes) returns(uint64)']),data:batch[1].data}).args
 assert.equal(burn[0],1001000n);assert.equal(burn[5],1000n)
 const reimbursement=decodeFunctionData({abi:parseAbi(['function transfer(address,uint256) returns(bool)']),data:batch[2].data}).args[1]
 assert.equal(reimbursement,source==='polygon'||source==='arc'?1n:3000n)
 const count=executions.length
 for(const altered of [{quoteToken:''},{quoteToken:q.quoteToken+'x'},{amountUnits:'2000000'}])assert.notEqual((await execute({...body,...altered})).status,200)
 globalThis.bridgeBalance=1000000n;assert.equal((await execute(body)).status,409);delete globalThis.bridgeBalance
 globalThis.bridgeOwner='other';assert.equal((await execute(body)).status,403);delete globalThis.bridgeOwner
 assert.equal(executions.length,count)
}
console.log('PASS: five EVM USDC bridge quote/execution routes: session estimated, provider principal unchanged, atomic reimbursement, exact retries, tamper/identity/insufficient-balance rejection. No real provider calls.')

for(const [source,chain]of Object.entries({base:'BASE',arbitrum:'ARB',ethereum:'ETH',polygon:'MATIC'})){
 network=chain
 const {encodeFunctionData}=await import('viem')
 const {POCKET_USDT_ASSETS}=await import('../src/pocket/lib/pocketUsdtAssets.ts')
 const abi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
 const providerBatch=encodeFunctionData({abi,functionName:'executeBatch',args:[[{target:recipient,value:0n,data:'0x'},{target:recipient,value:0n,data:'0x'}]]})
 const priced=await quoteCircleEvmBatchRecovery({ownerId:'owner',userToken:'session',walletId:'wallet',walletAddress:payer,source,destination:source==='base'?'arbitrum':'base',destinationAddress:recipient,asset:'USDT',tokenAddress:POCKET_USDT_ASSETS[source].address,amountUnits:'1000000',bridgeDebitUnits:'1000000',bridgeCallData:providerBatch,providerExpiresAt:Date.now()+45000})
 assert.equal(BigInt(priced.totalUnits),1000000n+BigInt(priced.networkFeeUnits))
 const calls=decodeFunctionData({abi,data:priced.callData}).args[0]
 assert.equal(calls[2].target.toLowerCase(),POCKET_USDT_ASSETS[source].address.toLowerCase())
 assert.equal(priced.bridgeCallData,providerBatch)
}
console.log('PASS four USDT Circle session fee estimates; source token and full debit bound, provider batch unchanged.')
