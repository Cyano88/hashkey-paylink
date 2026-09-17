import assert from 'node:assert/strict'
import express from 'express'
import { createPublicClient, http, parseAbi } from 'viem'
import { createReadHandler, validateRead } from '../api/evm-read.ts'
const app=express();app.use(express.json());let methods=[]
app.post('/api/evm-read/:network', createReadHandler(async(network,method,params)=>{
 validateRead(method,params);methods.push(method)
 if(method==='eth_call') return '0x'+(9007199254740993n).toString(16).padStart(64,'0')
 if(method==='eth_blockNumber') return '0x123'
 if(method==='eth_getLogs') {assert.equal(params[0].topics.length,3);return []}
 if(method==='eth_getTransactionReceipt')return null
 throw Error('Unexpected method')
}))
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r))
const url=`http://127.0.0.1:${server.address().port}/api/evm-read/arc`
try {
 const client=createPublicClient({transport:http(url,{retryCount:0})})
 const address='0x'+'11'.repeat(20)
 const balance=await client.readContract({address,abi:parseAbi(['function balanceOf(address) view returns (uint256)']),functionName:'balanceOf',args:[address]})
 assert.equal(balance,9007199254740993n)
 await client.getContractEvents({address,abi:parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),eventName:'Transfer',args:{from:address,to:address},fromBlock:1n,toBlock:3n})
 await assert.rejects(()=>client.request({method:'eth_sendRawTransaction',params:['0xdead']}))
 for (const body of [[],{jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[],url:'https://untrusted.invalid'}]) {
  const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  assert.equal((await r.json()).error.code,-32600)
 }
 const r=await fetch(url.replace('/arc','/arc-testnet'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_blockNumber',params:[]})})
 assert.equal((await r.json()).error.code,-32602)
 console.log('Viem over backend HTTP: exact balance, indexed transfer scan, blocked writes, invalid payload and testnet rejection passed')
} finally {server.closeAllConnections();await new Promise(r=>server.close(r))}
