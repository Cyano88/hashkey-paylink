import assert from 'node:assert/strict'
import { submitReviewerTransaction } from '../src/lib/xstocksAgreement/reviewerSubmission.ts'

const transaction={chainId:'0xc4',from:'0x'+'11'.repeat(20),to:'0x'+'22'.repeat(20),data:'0x1234',value:'0x0'}
const hash='0x'+'ab'.repeat(32)
function fixture({estimateError,sendError,result=hash,failStorageAt=0,balance='0x123456',chain='0xc4',accounts=[transaction.from]}={}){
 const saved=new Map(),calls=[],states=[];let writes=0
 const storage={setItem(k,v){if(++writes===failStorageAt)throw Error('Storage blocked');saved.set(k,v)},removeItem(k){saved.delete(k)}}
 const provider={async request(args){calls.push(args);if(args.method==='eth_getBalance')return balance;if(args.method==='eth_gasPrice')return '0x1';if(args.method==='eth_chainId')return chain;if(args.method==='eth_accounts')return accounts;if(args.method==='eth_estimateGas'){if(estimateError)throw estimateError;return '0x12345'}if(sendError)throw sendError;return result}}
 return {saved,calls,states,run:()=>submitReviewerTransaction({provider,transaction,storage,key:'decision',onState:s=>states.push(s)})}
}
let f=fixture({balance:'0x0'});await assert.rejects(f.run(),/Not enough OKB on X Layer/);assert.equal(f.calls.length,1);assert.equal(f.saved.size,0)
f=fixture({balance:'0x1'});await assert.rejects(f.run(),/Not enough OKB/);assert.equal(f.saved.size,0);assert.ok(!f.calls.some(c=>c.method==='eth_sendTransaction'))
f=fixture({estimateError:Error('insufficient funds')});await assert.rejects(f.run(),/No transaction was requested/);assert.equal(f.calls.length,2);assert.equal(f.saved.size,0);assert.deepEqual(f.states,[])
f=fixture({failStorageAt:1});await assert.rejects(f.run(),/No transaction was requested/);assert.ok(!f.calls.some(c=>c.method==='eth_sendTransaction'));assert.deepEqual(f.states,[])
for(const options of [{chain:'0x1'},{accounts:[]}]){f=fixture(options);await assert.rejects(f.run(),/Select the executing reviewer/);assert.equal(f.saved.size,0);assert.ok(!f.calls.some(c=>c.method==='eth_sendTransaction'))}
for(const code of [4001,4100,4200,-32601,-32602]){
 f=fixture({sendError:{cause:{code}}});await assert.rejects(f.run(),/cancelled|refused/);assert.equal(f.saved.size,0);assert.deepEqual(f.states,['pending','']);assert.equal(f.calls.filter(c=>c.method==='eth_sendTransaction').length,1)
}
for(const error of [{code:4900},{code:-32000},Error('Timeout'),{message:'User rejected? network outcome unknown'}]){
 f=fixture({sendError:error});await assert.rejects(f.run(),/Submission is unconfirmed/);assert.equal(f.saved.get('decision'),'pending');assert.deepEqual(f.states,['pending']);assert.equal(f.calls.filter(c=>c.method==='eth_sendTransaction').length,1)
}
f=fixture({result:null});await assert.rejects(f.run(),/no valid transaction hash/);assert.equal(f.saved.get('decision'),'pending')
f=fixture({failStorageAt:2});await assert.rejects(f.run(),/Transaction submitted:/);assert.equal(f.states.at(-1),hash);assert.equal(f.calls.filter(c=>c.method==='eth_sendTransaction').length,1)
f=fixture();assert.equal(await f.run(),hash);assert.equal(f.saved.get('decision'),hash);assert.deepEqual(f.states,['pending',hash]);assert.deepEqual(f.calls.at(-1).params,[transaction])
console.log('PASS: preflight failure, storage failure, explicit refusals, uncertain outcomes, invalid response and submitted hash recovery; no automatic resend.')
