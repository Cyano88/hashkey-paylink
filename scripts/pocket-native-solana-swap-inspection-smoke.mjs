import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {decodeSolanaSwapInstruction,inspectNativeSolanaSwap} from '../api/pocket/native-solana-swap-inspection.ts'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/native-solana-swap-instructions.json',import.meta.url)))
for(const {input,instruction} of fixtures){
 const result=inspectNativeSolanaSwap(input,instruction)
 assert.equal(result.executionAvailable,false)
 assert.equal(result.amountUnits,input.amountUnits)
 assert.equal(result.minimumOutUnits,input.minimumOutUnits)
 for(const patch of [{wallet:'11111111111111111111111111111111'},{amountUnits:'1'},{amountUnits:'18446744073709551615'},{expectedOutUnits:'1'},{minimumOutUnits:'1'},{from:'USDC',to:'USDT'}])assert.throws(()=>inspectNativeSolanaSwap({...input,...patch},instruction))
 for(const index of [0,1,2,3,4,10,11,12,13,14,15]){
  const changed=structuredClone(instruction);changed.accounts[index].pubkey='11111111111111111111111111111112';assert.throws(()=>inspectNativeSolanaSwap(input,changed))
 }
 const foreignSigner=structuredClone(instruction);foreignSigner.accounts[16].isSigner=true;assert.throws(()=>inspectNativeSolanaSwap(input,foreignSigner))
 const writableMint=structuredClone(instruction);writableMint.accounts[3].isWritable=true;assert.throws(()=>inspectNativeSolanaSwap(input,writableMint))
 for(const mutate of [b=>Buffer.concat([b,Buffer.from([0])]),b=>b.subarray(0,-1),b=>{b[0]^=1;return b},b=>{b.writeUInt16LE(51,32);return b},b=>{b.writeUInt32LE(0xffffffff,34);return b},b=>{b[38]=255;return b}]){
  const changed={...instruction,data:mutate(Buffer.from(instruction.data,'base64')).toString('base64')};assert.throws(()=>inspectNativeSolanaSwap(input,changed))
 }
 assert.throws(()=>decodeSolanaSwapInstruction({...instruction,data:instruction.data+' '}))
 console.log(input.from+'->'+input.to,JSON.stringify(result))
}
console.log('PASS four captured SOL/stable router instructions, exact wallet/mints/amount/minimum, privileges, malformed/trailing data, bounded routes; inspection cannot enable execution')
