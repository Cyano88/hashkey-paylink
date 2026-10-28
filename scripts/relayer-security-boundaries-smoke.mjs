import assert from 'node:assert/strict'
import {Keypair,Connection} from '@solana/web3.js'
import {buildSolanaTx,getSolanaVaultAddress,sweepSolanaVault} from '../api/relay-solana.ts'
import {preparePocketSolanaCctpTransaction} from '../api/pocket/solana-cctp-relay.ts'
import checkpoint from '../modules/streampay/api/relay-checkpoint.ts'
import stream from '../modules/streampay/api/relay-stream.ts'
import poa from '../modules/streampay/api/settle-poa.ts'
import builder from '../api/polymarket-relayer-builder-signer.ts'

const sponsor=Keypair.generate(),user=Keypair.generate(),recipient=Keypair.generate()
process.env.RELAYER_PRIVATE_KEY_SOLANA=JSON.stringify([...sponsor.secretKey])
process.env.SOLANA_RPC_URL='https://fixture.invalid'
let networkCalls=0
const fetchBefore=globalThis.fetch,blockBefore=Connection.prototype.getLatestBlockhash
globalThis.fetch=async()=>{networkCalls++;throw Error('No external request allowed')}
Connection.prototype.getLatestBlockhash=async()=>{networkCalls++;throw Error('No RPC allowed')}
const response=()=>({statusCode:200,body:null,status(n){this.statusCode=n;return this},json(b){this.body=b;return this}})
try {
 for(const quoteOnly of [true,false]) for(const asset of ['USDC','USDT']) {
  const res=response()
  await buildSolanaTx({method:'POST',headers:{authorization:'Bearer spoof','x-pocket-internal':'true'},body:{mode:'withdraw',quoteOnly,asset,from:user.publicKey.toBase58(),to:recipient.publicKey.toBase58(),amount:'1',authenticated:true,internal:true}},res)
  assert.equal(res.statusCode,403);assert.equal(res.body.tx,undefined)
 }
 for(const handler of [getSolanaVaultAddress,sweepSolanaVault,checkpoint,stream,poa,builder]) {
  for(const body of [undefined,{}, {linkId:'public-link',recipient:recipient.publicKey.toBase58(),action:'claim',checkpointPct:100}]) {
   const res=response();await handler({method:'POST',body,query:body||{},headers:{}},res)
   assert.equal(res.statusCode,410);assert.equal(res.body.tx,undefined);assert.equal(res.body.vaultAddress,undefined)
  }
 }
 await assert.rejects(()=>preparePocketSolanaCctpTransaction({walletAddress:sponsor.publicKey.toBase58(),relayer:sponsor,expected:{destination:'base',destinationAddress:'0x'+'11'.repeat(20),amount:'1'},buildBridge:async()=>{throw Error('Must reject before building')}}),/Relayer cannot authorize/)
 assert.equal(networkCalls,0)
 console.log('PASS public withdrawal fee bypass rejected; retired vault/sweep/Arc/builder signers cannot reach providers; CCTP sponsor cannot be customer; spoofed internal flags ignored.')
} finally {globalThis.fetch=fetchBefore;Connection.prototype.getLatestBlockhash=blockBefore}
