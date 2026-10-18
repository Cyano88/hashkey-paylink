import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PublicKey,Keypair} from '@solana/web3.js'
import {inspectNativeSolanaSwapEffects as inspect} from '../api/pocket/native-solana-swap-effects.ts'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/native-solana-swap-instructions.json',import.meta.url)))
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111',rent=1855569,fee=50000
const acct=(owner,lamports,data=Buffer.alloc(0))=>({owner,lamports,executable:false,data:[data.toString('base64'),'base64']})
function token(wallet,mint,amount){const d=Buffer.alloc(165);new PublicKey(mint).toBuffer().copy(d);new PublicKey(wallet).toBuffer().copy(d,32);d.writeBigUInt64LE(BigInt(amount),64);d[108]=1;return acct(TOKEN,rent,d)}
for(const {input,instruction} of fixtures){
 const native=input.from==='SOL',stableIndex=native?2:1,tempIndex=native?1:2,mintIndex=native?4:3
 const beforeAmount=native?100n:2000000n,received=BigInt(input.expectedOutUnits),amount=BigInt(input.amountUnits)
 const evidence={wallet:input.wallet,snapshotSlot:100,simulationSlot:100,inspection:{amountUnits:input.amountUnits,minimumOutUnits:input.minimumOutUnits,temporaryRentLamports:String(rent)},networkFeeLamports:String(fee),accounts:[
 {address:input.wallet,before:acct(SYSTEM,100000000),after:acct(SYSTEM,Number(100000000n-BigInt(fee)+(native?-amount:received)))},
 {address:instruction.accounts[stableIndex].pubkey,before:token(input.wallet,instruction.accounts[mintIndex].pubkey,beforeAmount),after:token(input.wallet,instruction.accounts[mintIndex].pubkey,beforeAmount+(native?received:-amount))},
 {address:instruction.accounts[tempIndex].pubkey,before:null,after:null}]}
 evidence.intent={...input};evidence.writableAddresses=evidence.accounts.map(a=>a.address)
 assert.equal(inspect(input,evidence).gasPayment,'native-wallet')
 const closed=structuredClone(evidence);closed.accounts[2].after=acct(SYSTEM,0);assert.equal(inspect(input,closed).gasPayment,'native-wallet')
 const reject=mutate=>{const changed=structuredClone(evidence);mutate(changed);assert.throws(()=>inspect(input,changed))}
 reject(e=>e.simulationSlot++)
 reject(e=>e.accounts[0].after.lamports-=100000000)
 reject(e=>e.accounts[0].after.owner=TOKEN)
 reject(e=>e.accounts[2].after=acct(SYSTEM,1))
 reject(e=>e.accounts.push(e.accounts[0]))
 reject(e=>e.intent.to=input.to==='SOL'?'USDC':'SOL')
 reject(e=>e.intent.expectedOutUnits='1')
 reject(e=>e.writableAddresses.push(Keypair.generate().publicKey.toBase58()))
 reject(e=>{const d=Buffer.from(e.accounts[1].after.data[0],'base64');d.writeUInt32LE(1,72);e.accounts[1].after.data[0]=d.toString('base64')})
 reject(e=>{const d=Buffer.from(e.accounts[1].after.data[0],'base64');d.writeBigUInt64LE(native?beforeAmount:0n,64);e.accounts[1].after.data[0]=d.toString('base64')})
 const other={address:Keypair.generate().publicKey.toBase58(),before:token(input.wallet,instruction.accounts[mintIndex].pubkey,1000),after:token(input.wallet,instruction.accounts[mintIndex].pubkey,999)}
 reject(e=>{e.accounts.push(other);e.writableAddresses.push(other.address)})
 reject(e=>{e.writableAddresses.push(other.address)})
 if(native){const created=structuredClone(evidence);created.accounts[1].before=null;created.accounts[0].after.lamports-=rent;assert.equal(inspect(input,created).newAccountRentLamports,String(rent))}
 console.log('PASS',input.from+'->'+input.to,'native gas, exact debit, minimum receipt, rent and authority protections')
}
