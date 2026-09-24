import { PublicKey } from '@solana/web3.js'
import { getAssociatedTokenAddress } from '../api/solana-token.ts'
import { SOLANA_USDC_MINT } from '../api/pocket/cctp.ts'
﻿import assert from 'node:assert/strict'
import { validatePocketBridgeMessage, verifyPocketBridgeRecord } from '../api/pocket/bridge-proof.ts'
import { createPocketBridgeHandler } from '../api/pocket/bridge.ts'
const expected={source:'base',destination:'arc',sourceAddress:'0x1111111111111111111111111111111111111111',destinationAddress:'0x2222222222222222222222222222222222222222',amount:'2',txHash:'0x'+'a'.repeat(64)}
const bytes=Buffer.alloc(376)
bytes.writeUInt32BE(1,0);bytes.writeUInt32BE(6,4);bytes.writeUInt32BE(26,8);bytes.writeUInt32BE(1,148)
const addr=(value,offset)=>Buffer.from(value.slice(2).padStart(64,'0'),'hex').copy(bytes,offset)
addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',152);addr(expected.destinationAddress,184);addr(expected.sourceAddress,248)
const uint=(value,offset)=>Buffer.from(BigInt(value).toString(16).padStart(64,'0'),'hex').copy(bytes,offset)
uint(2100000,216);uint(100000,280)
const raw='0x'+bytes.toString('hex')
await validatePocketBridgeMessage(raw,expected)
for(const override of [{source:'arbitrum'},{destination:'arbitrum'},{sourceAddress:expected.destinationAddress},{destinationAddress:expected.sourceAddress},{amount:'20'}]) await assert.rejects(()=>validatePocketBridgeMessage(raw,{...expected,...override}))
await verifyPocketBridgeRecord(expected,async()=>new Response(JSON.stringify({messages:[{status:'complete',message:raw}]})))
await assert.rejects(()=>verifyPocketBridgeRecord(expected,async()=>new Response(JSON.stringify({messages:[{status:'pending',message:raw}]}))),/Waiting for Circle/)
await assert.rejects(()=>verifyPocketBridgeRecord(expected,async()=>new Response(JSON.stringify({messages:[{status:'complete',message:raw},{status:'complete',message:raw}]}))),/Waiting for Circle/)
const solWallet='4QW6qgCGxSFi1zTb1nrqdjuQFCbVuxLiCLNTZb8qovCE'
const toSol=Buffer.from(bytes);toSol.writeUInt32BE(5,8)
Buffer.from((await getAssociatedTokenAddress(SOLANA_USDC_MINT,new PublicKey(solWallet),true)).toBytes()).copy(toSol,184)
await validatePocketBridgeMessage('0x'+toSol.toString('hex'),{...expected,destination:'solana',destinationAddress:solWallet})
const fromSol=Buffer.from(bytes);fromSol.writeUInt32BE(5,4)
Buffer.from(SOLANA_USDC_MINT.toBytes()).copy(fromSol,152)
Buffer.from(new PublicKey(solWallet).toBytes()).copy(fromSol,248)
await validatePocketBridgeMessage('0x'+fromSol.toString('hex'),{...expected,source:'solana',sourceAddress:solWallet})
let records=0
const handler=createPocketBridgeHandler({verifyUser:async()=>({userId:'fixture'}),readLink:async()=>({circleWalletAddress:expected.sourceAddress}),verifyRecord:async()=>{throw Object.assign(Error('Wrong wallet'),{status:403})},record:async()=>{records++},appendLedger:async()=>{records++}})
const res={statusCode:200,status(value){this.statusCode=value;return this},json(value){this.body=value;return this}}
await handler({method:'POST',headers:{},body:{action:'record',source:'base',destination:'arc',amount:'2',txHash:expected.txHash}},res)
assert.equal(res.statusCode,403);assert.equal(records,0)
console.log('Bridge ownership proof: valid source accepted; forged owner, destination, amount and unconfirmed/multiple messages rejected before recording.')

for (const [source,domain,token] of [['ethereum',0,'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],['polygon',7,'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359']]) {
 const data=Buffer.from(bytes);data.writeUInt32BE(domain,4);Buffer.from(token.slice(2).padStart(64,'0'),'hex').copy(data,152);
 await validatePocketBridgeMessage('0x'+data.toString('hex'),{...expected,source});
 await assert.rejects(()=>validatePocketBridgeMessage(raw,{...expected,source}));
}
console.log('PASS: Ethereum and Polygon bridge proofs require their own domain and native USDC mint.');
