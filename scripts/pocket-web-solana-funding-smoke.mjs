import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {Keypair,SystemProgram,Transaction} from '@solana/web3.js'
import bs58 from 'bs58'
import {readFundingAttempt} from '../src/pocket/lib/pocketFundingAttempt.ts'
const fee=Keypair.generate(),payer=Keypair.generate()
const tx=new Transaction({feePayer:fee.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:fee.publicKey,lamports:1}))
tx.sign(fee,payer);globalThis.signedFixture=tx.serialize().toString('base64');const signature=bs58.encode(tx.signature)
await mkdir('.codex-temp',{recursive:true});const output='.codex-temp/web-solana-funding-fixture.mjs'
const bundle=await build({entryPoints:['src/pocket/lib/pocketSolanaFunding.ts'],bundle:true,packages:'external',platform:'node',format:'esm',write:false,define:{'import.meta.env':'{}'},plugins:[{name:'signing-fixture',setup(b){b.onResolve({filter:/circleSolanaEmailWallet$/},()=>({path:'signer',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function signCircleSolanaTransaction(){return globalThis.signedFixture}'}))}}]})
await writeFile(output,bundle.outputFiles[0].text);const {movePocketSolanaFunding}=await import(pathToFileURL(process.cwd()+'/'+output))
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)}
const input={owner:'owner@example.com',fundingKey:'bills:solana',session:{wallet:{address:payer.publicKey.toBase58()}},destination:'base',destinationAddress:'0x'+'1'.repeat(40),amount:'1',quoteToken:'fixture',accessToken:'fixture'}
let prepares=0,submits=0,mode='lost'
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body)
 if(body.action==='recover')return Response.json({ok:true,managed:false})
 if(!body.transaction){prepares++;assert(readFundingAttempt(input.owner,input.fundingKey,localStorage),'Attempt saved before prepare');return Response.json({ok:true,transaction:signedFixture,lastValidBlockHeight:123})}
 submits++;assert.equal(readFundingAttempt(input.owner,input.fundingKey,localStorage).txHash,signature,'Signed reference saved before broadcast')
 if(mode==='lost')throw Error('Submit response lost')
 return Response.json({ok:true,txHash:'5'.repeat(88)})
}
await assert.rejects(movePocketSolanaFunding(input),/saved/);assert.equal(prepares,1);assert.equal(submits,1)
assert.equal(readFundingAttempt(input.owner,input.fundingKey,localStorage).progress,'needs_attention','Signature alone does not prove submission or settlement')
assert.equal(await movePocketSolanaFunding(input),signature);assert.equal(prepares,1);assert.equal(submits,1)
const wrongCase=input.session.wallet.address.toLowerCase();if(wrongCase!==input.session.wallet.address)await assert.rejects(movePocketSolanaFunding({...input,session:{wallet:{address:wrongCase}}}),/saved/)
memory.clear();mode='mismatch';await assert.rejects(movePocketSolanaFunding(input),/saved/);assert.equal(readFundingAttempt(input.owner,input.fundingKey,localStorage).txHash,signature)
memory.clear();let writes=0;localStorage.setItem=(k,v)=>{if(++writes===2)throw Error('Storage unavailable');memory.set(k,v)}
const before=submits;await assert.rejects(movePocketSolanaFunding(input),/saved/);assert.equal(submits,before,'Cannot broadcast if signed reference cannot be persisted')
assert.equal(await movePocketSolanaFunding(input).then(()=>false,()=>true),true);assert.equal(submits,before)
console.log('PASS Solana funding: saved signed reference before submit, lost-response recovery without prepare/broadcast retry, case-sensitive wallet binding, mismatched response rejection and storage failure before broadcast. Ephemeral fixture signatures only; no network.')

localStorage.setItem=(k,v)=>memory.set(k,v)
let state={managed:true,status:'started',reservationReleased:false},losePrepare=false,signs=0,recoveries=0
globalThis.fetch=async(url,options)=>{
 const body=JSON.parse(options.body),saved=readFundingAttempt(input.owner,input.fundingKey,localStorage)
 assert.equal(body.idempotencyKey,saved.id);assert.equal(body.reservationVersion,1)
 if(body.action==='recover'){recoveries++;return Response.json({ok:true,...state})}
 if(!body.transaction){prepares++;if(losePrepare)throw Error('Prepare response lost');return Response.json({ok:true,...state,transaction:signedFixture,lastValidBlockHeight:123})}
 submits++;assert.equal(saved.managedReservation,true);assert.equal(saved.txHash,signature)
 state={managed:true,status:'submitted',txHash:signature,reservationReleased:false};throw Error('Submit response lost')
}
memory.clear();losePrepare=true;const beforePrepare=prepares
await assert.rejects(movePocketSolanaFunding(input),/saved/)
await assert.rejects(movePocketSolanaFunding(input),/saved/)
assert.equal(prepares,beforePrepare+1);assert.equal(readFundingAttempt(input.owner,input.fundingKey,localStorage).managedReservation,true)
memory.clear();losePrepare=false;const beforeSubmit=submits
await assert.rejects(movePocketSolanaFunding(input),/saved/)
assert.equal(await movePocketSolanaFunding(input),signature);assert.equal(submits,beforeSubmit+1)
state={managed:false};await assert.rejects(movePocketSolanaFunding(input),/unavailable/);assert.equal(submits,beforeSubmit+1)
state={managed:true,status:'completed',sourceOutcome:'source_confirmed',txHash:signature,reservationReleased:true}
assert.equal(await movePocketSolanaFunding(input),signature)
assert.equal(readFundingAttempt(input.owner,input.fundingKey,localStorage).progress,'submitted','Source completion is not destination completion')
const {applyPocketBridgeReservation}=await import('../src/pocket/lib/pocketBridgeReservation.ts')
const record=readFundingAttempt(input.owner,input.fundingKey,localStorage)
const changed=signature.split('').map(c=>c==='A'?'B':c==='a'?'b':c).join('')
if(changed!==signature)assert.throws(()=>applyPocketBridgeReservation(record,{...state,txHash:changed}),/changed/)
assert.throws(()=>applyPocketBridgeReservation(record,{...state,txHash:'0x'+'a'.repeat(64)}),/Invalid/)
console.log('PASS managed web Solana funding: UUID/version persistence, lost prepare and submit, server recovery without redispatch, downgrade rejection, source/destination distinction and Solana reference validation.')
