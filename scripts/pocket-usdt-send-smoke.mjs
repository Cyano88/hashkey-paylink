import assert from 'node:assert/strict'
import {Connection,Keypair,PublicKey,Transaction} from '@solana/web3.js'
import {buildSolanaTx} from '../api/relay-solana.ts'
import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
import {SOLANA_TOKEN_PROGRAM_ID,getAssociatedTokenAddress} from '../api/solana-token.ts'
import {validatePocketWithdrawal} from '../src/pocket/controllers/pocketWithdrawalValidation.ts'
import {evmActivity,solanaUsdcTransferParties} from '../api/pocket/wallet-chain-activity.ts'

// Synthetic keys and intercepted RPC only. This test cannot broadcast a transfer.
const sender=Keypair.generate(),recipient=Keypair.generate(),relayer=Keypair.generate()
process.env.RELAYER_PRIVATE_KEY_SOLANA=JSON.stringify([...relayer.secretKey])
process.env.SOLANA_TREASURY=Keypair.generate().publicKey.toBase58()
process.env.SOLANA_RPC_URL='https://synthetic.invalid'
process.env.POCKET_SWAP_QUOTE_SECRET='synthetic-usdt-send-test-secret-no-production'
const mint=new PublicKey(POCKET_USDT_ASSETS.solana.address)
const senderAta=await getAssociatedTokenAddress(mint,sender.publicKey)
const methods={
 getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),
 getAccountInfo:async()=>({owner:SOLANA_TOKEN_PROGRAM_ID}),
 getTokenAccountBalance:async()=>({value:{amount:'100000000',decimals:6}}),
 getFeeForMessage:async()=>({value:5000}),
 getMinimumBalanceForRentExemption:async()=>2039280,
}
const originals=Object.fromEntries(Object.keys(methods).map(k=>[k,Connection.prototype[k]]))
Object.assign(Connection.prototype,methods)
const originalFetch=globalThis.fetch
globalThis.fetch=async url=>{assert.equal(new URL(url).hostname,'api.coingecko.com');return Response.json({solana:{usd:150,last_updated_at:Math.floor(Date.now()/1000)},tether:{usd:1,last_updated_at:Math.floor(Date.now()/1000)},'usd-coin':{usd:1,last_updated_at:Math.floor(Date.now()/1000)}})}
async function call(body,expected=200){let status=200,result;await buildSolanaTx({body},{status(s){status=s;return this},json(r){result=r;return this}});assert.equal(status,expected,JSON.stringify(result));return result}
try {
 const body={from:sender.publicKey.toBase58(),to:recipient.publicKey.toBase58(),amount:'1',asset:'USDT'}
 const quote=await call({...body,quoteOnly:true})
 assert.equal(quote.quote.asset,'USDT')
 assert.equal(quote.quote.platformFeeUnits,'2500')
 const built=await call({...body,feeQuoteToken:quote.token})
 assert.equal(built.asset,'USDT')
 const tx=Transaction.from(Buffer.from(built.tx,'base64'))
 assert.equal(tx.instructions.length,2)
 assert(tx.instructions.every(ix=>ix.keys[1].pubkey.equals(mint)))
 assert(tx.instructions.every(ix=>ix.keys[0].pubkey.equals(senderAta)))
 assert.equal(tx.instructions[0].data.readBigUInt64LE(1),1000000n)
 assert.equal(tx.instructions[1].data.readBigUInt64LE(1),BigInt(quote.quote.treasuryUnits))
 assert(tx.instructions.every(ix=>ix.data[9]===6))
 await call({...body,asset:'USDC',feeQuoteToken:quote.token},409)
 await call({...body,mode:'withdraw'},500)
 Connection.prototype.getTokenAccountBalance=async()=>({value:{amount:'1',decimals:6}})
 await call({...body,feeQuoteToken:quote.token},500)
} finally {Object.assign(Connection.prototype,originals);globalThis.fetch=originalFetch}

const evm='0x'+'11'.repeat(20),other='0x'+'22'.repeat(20)
assert.throws(()=>validatePocketWithdrawal({network:'arc',asset:'USDT',address:other,amount:'1',balance:10}),/not supported/)
assert.throws(()=>validatePocketWithdrawal({network:'base',asset:'USDT',address:other,amount:'1',balance:0}),/balance/)
assert.throws(()=>validatePocketWithdrawal({network:'base',asset:'USDT',address:other,amount:'0.0000001',balance:10}),/six decimal/)
const topic=x=>'0x'+x.slice(2).padStart(64,'0')
const rows=await evmActivity('arbitrum',evm,new AbortController().signal,async(_network,method,params)=>{
 if(method==='eth_blockNumber')return '0x100'
 if(method==='eth_getBlockByNumber')return {timestamp:'0x64'}
 assert.equal(params[0].address.length,2,'both assets share one log query per direction')
 return [{address:POCKET_USDT_ASSETS.arbitrum.address,transactionHash:'0x'+'a'.repeat(64),logIndex:'0x0',blockNumber:'0x100',topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(other),topic(evm)],data:'0xf4240'}]
})
assert.equal(rows.length,1);assert.equal(rows[0].assetSymbol,'USDT');assert.equal(rows[0].memo,'USDT deposit');assert.equal(rows[0].amount,'1')
const balances=[{mint:mint.toBase58(),owner:evm,uiTokenAmount:{uiAmountString:'2'}}]
assert.equal(solanaUsdcTransferParties(evm,[],balances,mint.toBase58()).ownerDelta,2)
assert.equal(solanaUsdcTransferParties(evm,[],balances).ownerDelta,0)
console.log('PASS USDT Solana mint, recipient, fee and decimals; quote replay and low balance rejection; EVM/Solana activity asset isolation; unsupported-network and precision guards. No funds moved.')
