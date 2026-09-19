import assert from 'node:assert/strict'
import http from 'node:http'
import { ethers } from 'ethers'
const address='0x79a804C49e1E5EBC279A228Ab73a7570A0D0819a'
const abi=new ethers.Interface(['event PaymentArchived(string indexed eventId, bytes32 indexed rootHash, string chain, string payer, string amount, uint256 ts)'])
const encoded=abi.encodeEventLog(abi.getEvent('PaymentArchived'),['synthetic-event','0x'+'11'.repeat(32),'Base','Synthetic Payer','5',123])
let logReads=0,fail=false
const server=http.createServer(async(req,res)=>{
 let body='';for await(const part of req) body+=part
 const input=JSON.parse(body)
 const answer=q=>{
  let result
  if(q.method==='eth_chainId')result='0x4119'
  else if(q.method==='eth_blockNumber')result='0x2a8f000'
  else if(q.method==='eth_getLogs'){
   logReads++
   if(fail)return {jsonrpc:'2.0',id:q.id,error:{code:-32000,message:'secret-provider-token-must-not-leak'}}
   result=[{address,topics:encoded.topics,data:encoded.data,blockNumber:'0x2a8efff',blockHash:'0x'+'22'.repeat(32),transactionHash:'0x'+'33'.repeat(32),transactionIndex:'0x0',logIndex:'0x0',removed:false}]
  } else throw Error('Unexpected RPC '+q.method)
  return {jsonrpc:'2.0',id:q.id,result}
 }
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify(Array.isArray(input)?input.map(answer):answer(input)))
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
process.env.OG_RPC_URL='http://127.0.0.1:'+server.address().port
const {default:handler}=await import('../api/agent-verify.ts')
const {lookupLegacyArchive}=await import('../api/legacy-archive-lookup.ts')
const captured=[];const oldError=console.error;console.error=(...args)=>captured.push(args.join(' '))
async function request(eventId='synthetic-event'){
 const res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}
 await handler({query:{eventId,payer:'Synthetic Payer'}},res);return res
}
try{
 const rows=await Promise.all([request(),request(),lookupLegacyArchive('synthetic-event','synthetic payer')])
 assert.equal(logReads,1);assert.equal(rows[0].body.verified,true)
 assert.equal(rows[0].body.verificationScope,'archive_event_only');assert.equal(rows[0].body.settlementVerified,false);assert.equal(rows[0].body.payloadVerified,false)
 assert.equal(rows[0].body.proof.ogTxHash,'0x'+'33'.repeat(32));assert.equal(rows[2].payment.amount,'5')
 fail=true;const failure=await request('different-event');assert.equal(failure.statusCode,500)
 assert.ok(!JSON.stringify(failure.body).includes('secret-provider-token'));assert.ok(!captured.join(' ').includes('secret-provider-token'))
 fail=false;const retry=await request('different-event');assert.equal(retry.statusCode,200);assert.equal(logReads,3)
 oldError('Archive handler integration passed: shared consumers, legacy response, explicit scope, error redaction and retry')
}finally{console.error=oldError;server.closeAllConnections();await new Promise(r=>server.close(r))}
