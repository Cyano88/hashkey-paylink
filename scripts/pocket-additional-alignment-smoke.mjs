import assert from 'node:assert/strict'
import {additionalAlignmentPlan} from '../api/pocket/wallet-additional-alignment.ts'
import {buildAdditionalMigration} from '../api/pocket/wallet-additional-migration.ts'
import {migrationTransfersConfirmed} from '../api/pocket/wallet-migration-execution.ts'
import {migrationCallData} from '../api/pocket/wallet-migration-provider.ts'
import {inspectMigrationReceipt} from '../api/pocket/wallet-migration-receipt.ts'
import {decodeFunctionData,parseAbi} from 'viem'
const a='0x1111111111111111111111111111111111111111',b='0x2222222222222222222222222222222222222222'
const old={id:'base-old',blockchain:'BASE',address:b,accountType:'SCA',state:'LIVE',scaCore:'circle_6900_singleowner_v3',createDate:'2026-09-01T00:00:00Z'}
const anchor={...old,id:'base-active',address:a,scaCore:'circle_6900_singleowner_v4',createDate:'2026-09-20T00:00:00Z'}
for(const [network,blockchain,token] of [['ethereum','ETH','0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],['polygon','MATIC','0x3c499c542cef5e3811e1192ce70d8cc03d5c3359']]) {
 const source={...anchor,id:network+'-old',blockchain,address:b}
 const inventory=[old,anchor,source],result=additionalAlignmentPlan(anchor,inventory,network)
 assert.deepEqual(result.request.blockchains,[blockchain]);assert.equal(result.request.scaConfiguration.scaCore,anchor.scaCore)
 assert.deepEqual(result,additionalAlignmentPlan(anchor,inventory,network));assert.match(result.request.idempotencyKey,/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-a[\da-f]{3}-[\da-f]{12}$/)
 const target={...source,id:network+'-new',address:a,refId:result.request.metadata[0].refId}
 assert.equal(additionalAlignmentPlan(anchor,[...inventory,target],network).wallet.id,target.id)
 assert.throws(()=>additionalAlignmentPlan(anchor,[...inventory,{...target,address:b}],network),/needs review/)
 assert.throws(()=>additionalAlignmentPlan(anchor,[...inventory,target,{...target,id:'duplicate'}],network),/duplicate/)
 assert.throws(()=>additionalAlignmentPlan(anchor,Array.from({length:50},(_,i)=>({...old,id:String(i)})),network))
 const link={privyUserId:'user',chain:network,circleWalletId:source.id,circleWalletAddress:b,purpose:'payment'}
 const empty=buildAdditionalMigration('user',network,link,target,anchor,0n)
 assert.equal(migrationTransfersConfirmed(empty),true)
 const funded=buildAdditionalMigration('user',network,link,target,anchor,1000000n)
 assert.equal(migrationTransfersConfirmed(funded),false)
 assert.throws(()=>buildAdditionalMigration('other',network,link,target,anchor,0n))
 assert.throws(()=>buildAdditionalMigration('user',network,link,{...target,address:b},anchor,0n))
 const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:migrationCallData(funded.rows[0])})
 assert.equal(batch.args[0][0].target.toLowerCase(),token)
 const transfer=decodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),data:batch.args[0][0].data})
 assert.equal(transfer.args[0].toLowerCase(),a);assert.equal(transfer.args[1],1000000n)
 const tx='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
 const receipt={status:'0x1',transactionHash:tx,blockHash,blockNumber:'0x10',logs:[{address:token,topics:[topic,'0x'+'0'.repeat(24)+b.slice(2),'0x'+'0'.repeat(24)+a.slice(2)],data:'0x'+(1000000n).toString(16).padStart(64,'0')}]}
 const block={number:'0x10',hash:blockHash,timestamp:'0x100'}
 assert.ok(inspectMigrationReceipt(funded.rows[0],tx,receipt,block,block))
 assert.equal(inspectMigrationReceipt(funded.rows[0],tx,{...receipt,logs:receipt.logs.map(l=>({...l,address:a}))},block,block),null)
 assert.equal(inspectMigrationReceipt(funded.rows[0],tx,receipt,block,{...block,number:'0xf'}),null)
}
assert.equal(migrationTransfersConfirmed({rows:[{network:'ethereum',units:'0'}],transfers:{}}),false)
console.log('PASS additional alignment: bounded slots, version, exact address, ownership, idempotency, funded/empty separation, native USDC calldata and finalized receipt proof.')
