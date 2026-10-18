import {PublicKey,SystemProgram,TransactionInstruction} from '@solana/web3.js'
import type {SolanaSwapInstruction} from './native-solana-swap-inspection.js'

export type SolSwapSponsorship={sponsor:string;temporaryFundingLamports:string}
// Call only after the original provider envelope has passed strict inspection.
export function sponsoredSolSwapInstructions(wallet:string,instructions:SolanaSwapInstruction[],sponsorship:SolSwapSponsorship,fee:bigint){
 const sponsor=new PublicKey(sponsorship.sponsor),owner=new PublicKey(wallet)
 if(sponsor.equals(owner)||sponsor.equals(PublicKey.default)||!PublicKey.isOnCurve(sponsor.toBytes())||! /^[1-9]\d{0,9}$/.test(sponsorship.temporaryFundingLamports)||fee<=0n||fee>200000n)throw Error('Invalid swap sponsor.')
 // The router must never be granted access to the sponsor's accounts.
 if(instructions.some(i=>i.accounts.some(a=>a.pubkey===sponsorship.sponsor)))throw Error('Swap route references its sponsor.')
 let funded=false
 const result=instructions.map(i=>{
  let keys=i.accounts.map(a=>({pubkey:new PublicKey(a.pubkey),isSigner:a.isSigner,isWritable:a.isWritable}))
  const data=Buffer.from(i.data,'base64')
  if(i.programId===SystemProgram.programId.toBase58()){
   if(funded||data.length!==12||data.readUInt32LE()!==2||data.readBigUInt64LE(4)!==BigInt(sponsorship.temporaryFundingLamports)||keys.length!==2||!keys[0].pubkey.equals(owner))throw Error('Swap temporary funding changed.')
   funded=true;keys=[{pubkey:sponsor,isSigner:true,isWritable:true},keys[1]]
  }
  return new TransactionInstruction({programId:new PublicKey(i.programId),data,keys})
 })
 if(!funded)throw Error('Missing temporary swap funding.')
 return [...result,SystemProgram.transfer({fromPubkey:owner,toPubkey:sponsor,lamports:BigInt(sponsorship.temporaryFundingLamports)+fee})]
}
