import {Connection} from '@solana/web3.js'
import {requestAsset,requestAmountUnits} from '../../src/pocket/lib/pocketRequestAssets.js'
export type RequestProof={network:string;asset?:string;amount:string;payer:string;recipient:string;txHash:string;notBefore:number}
const ids:Record<string,number>={base:8453,arc:5042,arbitrum:42161,ethereum:1,polygon:137,xlayer:196}
const transfer='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const equal=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const mismatch=()=>Object.assign(Error('The confirmed transfer does not match this request.'),{status:409})
export function requestEvmUnits(p:RequestProof,receipt:any,trace?:any):bigint{
 const token=requestAsset(p.network,p.asset);if(!token)throw mismatch()
 if(token.address==='native'){
  const walk=(node:any):bigint=>!node||node.error||node.revertReason?0n:(node.type==='CALL'&&equal(node.from,p.payer)&&equal(node.to,p.recipient)?BigInt(node.value||'0x0'):0n)+(node.calls||[]).reduce((sum:bigint,c:any)=>sum+walk(c),0n)
  return walk(trace)
 }
 const emitter=p.network==='arc'&&p.asset!=='USDT'?'0xfffffffffffffffffffffffffffffffffffffffe':token.address
 return(receipt.logs||[]).reduce((sum:bigint,l:any)=>!l.removed&&equal(l.address,emitter)&&l.topics?.length===3&&equal(l.topics[0],transfer)&&equal('0x'+l.topics[1].slice(-40),p.payer)&&equal('0x'+l.topics[2].slice(-40),p.recipient)?sum+BigInt(l.data):sum,0n)
}
export function requestSolanaUnits(p:RequestProof,tx:any):bigint{
 const token=requestAsset(p.network,p.asset);if(!token)throw mismatch()
 const keys=tx.transaction.message.accountKeys.map((k:any)=>String(k.pubkey??k))
 const balances=[...(tx.meta?.preTokenBalances||[]),...(tx.meta?.postTokenBalances||[])]
 const owner=(address:string)=>balances.find((b:any)=>keys[b.accountIndex]===address&&b.mint===token.address)?.owner
 const instructions=[...tx.transaction.message.instructions,...(tx.meta?.innerInstructions||[]).flatMap((i:any)=>i.instructions)]
 return instructions.reduce((sum:bigint,i:any)=>{
  const v=i.parsed?.info,type=i.parsed?.type,program=String(i.programId)
  if(!v||!['transfer','transferChecked'].includes(type))return sum
  if(token.address==='native')return program==='11111111111111111111111111111111'&&v.source===p.payer&&v.destination===p.recipient&&Number.isSafeInteger(v.lamports)?sum+BigInt(v.lamports):sum
  if(program!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'||owner(v.source)!==p.payer||owner(v.destination)!==p.recipient||v.authority!==p.payer||type==='transferChecked'&&(v.mint!==token.address||v.tokenAmount?.decimals!==token.decimals))return sum
  const amount=type==='transferChecked'?v.tokenAmount?.amount:v.amount
  return /^\d+$/.test(String(amount))?sum+BigInt(amount):sum
 },0n)
}
async function rpc(network:string,method:string,params:unknown[]):Promise<any>{
 const urls:Record<string,string|undefined>={base:process.env.PRIVATE_RPC_URL,arbitrum:process.env.PRIVATE_RPC_URL_ARB,arc:process.env.PRIVATE_RPC_URL_ARC_MAINNET,ethereum:process.env.PRIVATE_RPC_URL_ETHEREUM,polygon:process.env.PRIVATE_RPC_URL_POLYGON,xlayer:process.env.XLAYER_RPC_URL||'https://rpc.xlayer.tech'}
 if(!urls[network])throw Error('Payment verification is temporarily unavailable.')
 const response=await fetch(urls[network]!,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000),redirect:'error'})
 const data=await response.json();if(!response.ok||data.error)throw Error('Payment verification is temporarily unavailable.');return data.result
}
export async function verifyRequestTransfer(p:RequestProof,deps={rpc,solana:()=>new Connection(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com','confirmed')}){
 const asset=p.asset||'USDC',token=requestAsset(p.network,asset);if(!token)throw mismatch()
 const units=requestAmountUnits(p.amount,p.network,asset)
 if(p.network==='solana'){
  if(!/^[1-9A-HJ-NP-Za-km-z]{64,120}$/.test(p.txHash))throw mismatch()
  const connection=deps.solana();if(await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw mismatch()
  const tx=await connection.getParsedTransaction(p.txHash,{commitment:'confirmed',maxSupportedTransactionVersion:0})
  if(!tx)throw Object.assign(Error('Payment is still confirming.'),{status:409})
  if(!tx.meta||tx.meta.err||!tx.blockTime||tx.blockTime*1000+1000<p.notBefore||requestSolanaUnits(p,tx)!==units)throw mismatch()
 }else{
  if(!/^0x[a-fA-F0-9]{64}$/.test(p.txHash)||Number(BigInt(await deps.rpc(p.network,'eth_chainId',[])))!==ids[p.network])throw mismatch()
  const receipt=await deps.rpc(p.network,'eth_getTransactionReceipt',[p.txHash])
  if(!receipt)throw Object.assign(Error('Payment is still confirming.'),{status:409})
  const block=await deps.rpc(p.network,'eth_getBlockByNumber',[receipt.blockNumber,false])
  if(receipt.status!=='0x1'||!equal(receipt.transactionHash,p.txHash)||!block||!equal(block.hash,receipt.blockHash)||Number(BigInt(block.timestamp))*1000+1000<p.notBefore)throw mismatch()
  const trace=token.address==='native'?await deps.rpc(p.network,'debug_traceTransaction',[p.txHash,{tracer:'callTracer'}]):undefined
  if(requestEvmUnits({...p,asset},receipt,trace)!==units*(p.network==='arc'&&asset==='USDC'?10n**12n:1n))throw mismatch()
 }
 return true
}
