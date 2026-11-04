import assert from 'node:assert/strict'
import {Keypair} from '@solana/web3.js'
import {readSolanaBridgeDelivery} from '../api/pocket/bridge-solana-delivery.ts'
const hash='2'.repeat(88),wallet=Keypair.generate().publicKey.toBase58(),blockhash=Keypair.generate().publicKey.toBase58()
const row=amount=>({accountIndex:0,owner:wallet,mint:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',uiTokenAmount:{decimals:6,amount}})
const tx={slot:100,transaction:{signatures:[hash],message:{fixture:true}},meta:{err:null,preTokenBalances:[row('100')],postTokenBalances:[row('1100')]}}
function fixture(fault){let reads=0,blocks=0,genesis=0,calls=0;return {count:()=>calls,rpc:{
 getGenesisHash:async()=>{calls++;genesis++;return fault==='network'||fault==='network-change'&&genesis>1?'wrong':'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'},
 getParsedTransaction:async(h,options)=>{calls++;reads++;assert.equal(h,hash);assert.equal(options.commitment,'finalized');if(fault==='missing')return null;const copy=structuredClone(tx);if(fault==='failed')copy.meta.err={InstructionError:[0,'failed']};if(fault==='signature')copy.transaction.signatures=['wrong'];if(fault==='changed'&&reads>1)copy.meta.postTokenBalances=[row('1200')];if(fault==='slot-change'&&reads>1)copy.slot=101;return copy},
 getSlot:async c=>{calls++;assert.equal(c,'finalized');return fault==='unfinalized'?99:fault==='invalid-finality'?NaN:102},
 getBlockSignatures:async(slot,c)=>{calls++;blocks++;assert.equal(slot,100);assert.equal(c,'finalized');return {blockhash:fault==='reorg'&&blocks>1?Keypair.generate().publicKey.toBase58():blockhash,signatures:fault==='membership'?[]:fault==='duplicate'?[hash,hash]:[hash]}}
 }}}
const good=fixture();assert.equal(await readSolanaBridgeDelivery('USDC',wallet,hash,good.rpc),1000n);assert.equal(good.count(),7)
for(const fault of ['missing','failed','signature','changed','slot-change','unfinalized','invalid-finality','membership','duplicate','reorg'])assert.equal(await readSolanaBridgeDelivery('USDC',wallet,hash,fixture(fault).rpc),null,fault)
for(const fault of ['network','network-change'])await assert.rejects(readSolanaBridgeDelivery('USDC',wallet,hash,fixture(fault).rpc),/network/)
console.log('PASS canonical Solana delivery/refund reader: bounded seven reads, exact signature/token delta, mainnet identity, finalized slot, unique block membership and fresh transaction/block rechecks. Simulated RPC only.')
