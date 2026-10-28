import assert from 'node:assert/strict'
import {pad} from 'viem'
import {verifyEvmUsdcTransfer} from '../api/usdc-transfer-verify.ts'
import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
const payer='0x2222222222222222222222222222222222222222',recipient='0x1111111111111111111111111111111111111111',txHash='0x'+'a'.repeat(64)
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const saved=globalThis.fetch
process.env.PRIVATE_RPC_URL='https://rpc.invalid';process.env.PRIVATE_RPC_URL_ARB='https://rpc.invalid'
try {
 for(const chain of ['base','arbitrum','ethereum','polygon']) {
  let token=POCKET_USDT_ASSETS[chain].address, amount=1000000n, actualChain=POCKET_USDT_ASSETS[chain].chainId
  globalThis.fetch=async(_url,init)=>{
   const {method}=JSON.parse(init.body)
   const result=method==='eth_chainId'?'0x'+actualChain.toString(16):method==='eth_getBlockByNumber'?{number:'0x100'}:{status:'0x1',blockNumber:'0x10',logs:[{address:token,topics:[topic,pad(payer),pad(recipient)],data:'0x'+amount.toString(16)}]}
   return {ok:true,text:async()=>JSON.stringify({result})}
  }
  const input={chain,token:'USDT',txHash,payer,recipient,minAmount:'1',exactAmount:true}
  assert.equal((await verifyEvmUsdcTransfer(input)).amount,'1')
  await assert.rejects(verifyEvmUsdcTransfer({...input,token:'USDC'}),/transfer/i)
  token=POCKET_USDT_ASSETS[chain==='base'?'polygon':'base'].address
  await assert.rejects(verifyEvmUsdcTransfer(input),/transfer/i)
  token=POCKET_USDT_ASSETS[chain].address;amount=999999n
  await assert.rejects(verifyEvmUsdcTransfer(input),/exactly/)
  amount=1000000n;actualChain=56
  await assert.rejects(verifyEvmUsdcTransfer(input),/chain/)
 }
 console.log('PASS USDT exact token, amount and chain proof across Base, Arbitrum, Ethereum and Polygon.')
} finally {globalThis.fetch=saved}
