import assert from 'node:assert/strict';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {hashTypedData,decodeFunctionData,parseAbi,zeroAddress} from 'viem';
import {createReviewerHandler,reviewerAmount,safeTypes} from '../api/xstocks-agreement/reviewer.ts';
const a=privateKeyToAccount(generatePrivateKey()),b=privateKeyToAccount(generatePrivateKey()),outsider=privateKeyToAccount(generatePrivateKey());
const safe='0x'+'33'.repeat(20),escrow='0x'+'44'.repeat(20),id='xag_'+'ab'.repeat(32),store=new Map();
store.set('hashpaylink:xstocks-agreement:v1:'+id,{id,terms:{kind:'trade',title:'Fixture dispute'},evidence:[],binding:{custody:'xstocks-shares-v2',contractTerms:{buyer:a.address,seller:b.address,arbiter:safe,amount:'2220000000000000',decimals:18}}});
let state=5,nonce=0n,authorized=true,simulation=true,threshold=2n,hashMismatch=false,latestNonce=false,readCount=0;
const handler=createReviewerHandler({verifyAdmin:async()=>{if(!authorized)throw Object.assign(Error('Restricted'),{status:403});return {userId:'fixture-admin',email:'fixture@example.invalid'}},hasStore:()=>true,read:async key=>{readCount++;return structuredClone(store.get(key))},mutate:async(key,fn)=>{const next=await fn(structuredClone(store.get(key)));store.set(key,next);return structuredClone(next)},plan:async()=>({enabled:true,observedBlock:'100',state,escrow,actions:[]}),client:()=>({readContract:async ({functionName,args,blockNumber})=>{
 if(functionName==='getOwners')return [a.address,b.address];if(functionName==='getThreshold')return threshold;if(functionName==='nonce')return nonce+(!blockNumber&&latestNonce?1n:0n);if(functionName==='VERSION')return '1.5.0';
 if(functionName==='getTransactionHash'){const [to,value,data,operation,safeTxGas,baseGas,gasPrice,gasToken,refundReceiver,n]=args;return hashMismatch?'0x'+'00'.repeat(32):hashTypedData({domain:{chainId:196,verifyingContract:safe},types:safeTypes,primaryType:'SafeTx',message:{to,value,data,operation,safeTxGas,baseGas,gasPrice,gasToken,refundReceiver,nonce:n}})}throw Error(functionName)
 },call:async()=>({data:'0x'}),simulateContract:async()=>({result:simulation})})});
async function call(action,extra={}){const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this},json(body){this.body=body;return this}};await handler({method:'POST',headers:{},body:{agreementId:id,action,...extra}},res);return res}
assert.throws(()=>reviewerAmount('0.0000000000000000001',18,3n));assert.throws(()=>reviewerAmount('-1',18,3n));assert.throws(()=>reviewerAmount('1e3',18,3n));assert.throws(()=>reviewerAmount('0.003',18,2220000000000000n));
authorized=false;assert.equal((await call('read')).statusCode,403);assert.equal(readCount,0);authorized=true;
assert.equal((await call('execution')).statusCode,409);
for(const s of [0,1,2,3,4,6,7,8,9]){state=s;assert.equal((await call('prepare',{buyerAmount:'0.00222',reason:'Controlled fixture decision'})).statusCode,409)}state=5;
threshold=1n;assert.equal((await call('read')).statusCode,409);threshold=2n;
latestNonce=true;assert.equal((await call('read')).statusCode,409);latestNonce=false;
hashMismatch=true;assert.equal((await call('prepare',{buyerAmount:'0.00222',reason:'Controlled fixture decision'})).statusCode,409);hashMismatch=false;
const prepared=await call('prepare',{buyerAmount:'0.00222',reason:'Controlled fixture decision'});assert.equal(prepared.statusCode,200);const decisionId=prepared.body.decision.id,typed=prepared.body.typedData;
assert.equal((await call('prepare',{buyerAmount:'0',reason:'Different decision attempted'})).statusCode,409);
assert.equal((await call('sign',{decisionId,signature:await outsider.signTypedData(typed)})).statusCode,403);
assert.equal((await call('sign',{decisionId,signature:await a.signTypedData({...typed,domain:{...typed.domain,chainId:1}})})).statusCode,403);
assert.equal((await call('sign',{decisionId,signature:await a.signTypedData(typed)})).statusCode,200);
assert.equal((await call('execution',{decisionId,executor:a.address})).statusCode,409);
assert.equal((await call('sign',{decisionId,signature:await b.signTypedData(typed)})).statusCode,200);
assert.equal((await call('execution',{decisionId,executor:outsider.address})).statusCode,403);
simulation=false;assert.equal((await call('execution',{decisionId,executor:a.address})).statusCode,409);simulation=true;
const execution=await call('execution',{decisionId,executor:a.address});assert.equal(execution.statusCode,200);assert.equal(execution.body.transaction.to,safe);
const decoded=decodeFunctionData({abi:parseAbi(['function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns(bool)']),data:execution.body.transaction.data});assert.equal(decoded.args[0],escrow);assert.equal(decoded.args[1],0n);assert.equal(decoded.args[3],0);assert.equal(decoded.args[7],zeroAddress);assert.equal(decoded.args[9].length,262);
const refund=decodeFunctionData({abi:parseAbi(['function resolveDispute(uint256 buyerAmount,bytes32 evidence)']),data:decoded.args[2]});assert.equal(refund.args[0],2220000000000000n);
nonce=1n;assert.equal((await call('read')).body.decision.stale,true);assert.equal((await call('execution',{decisionId,executor:a.address})).statusCode,409);
nonce=0n;state=8;assert.equal((await call('read')).body.typedData,undefined);assert.equal((await call('execution',{decisionId,executor:a.address})).statusCode,409);
console.log('PASS: reviewer authorization, exact allocations, dispute-only signing, two distinct owners, chain binding, nonce drift, terminal states and execution simulation.');
