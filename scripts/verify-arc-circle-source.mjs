import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {createPublicClient,http,keccak256} from 'viem'
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
assert.equal(await client.getChainId(),5042)
const blockNumber=await client.getBlockNumber(),block=await client.getBlock({blockNumber})
const records=[]
for(const [name,address,expectedName] of [
 ['circle-wallet-source','0x9C6E09bc32d1E012dCaA2623E66d2Cc9860C1AeD','SingleOwnerMSCA'],
 ['circle-entrypoint-v07-source','0x0000000071727de22e5e9d8baf0edac6f37da032','EntryPoint'],
]){
 const data=JSON.parse(readFileSync('.codex-temp/'+name+'.json','utf8').replace(/^\uFEFF/,''))
 assert.equal(data.is_fully_verified,true);assert.equal(data.is_verified,true);assert.equal(data.name,expectedName)
 const code=await client.getCode({address,blockNumber});assert(code&&code!=='0x')
 assert.equal(data.deployed_bytecode.toLowerCase(),code.toLowerCase(),'Explorer source bytecode does not match RPC.')
 const sources=[{file_path:data.file_path,source_code:data.source_code},...(data.additional_sources??[])]
 records.push({address,name:data.name,compiler:data.compiler_version,explorerFullyVerified:true,runtimeHash:keccak256(code),sources:sources.map(file=>({path:file.file_path,sha256:createHash('sha256').update(file.source_code).digest('hex')}))})
}
assert.equal((await client.getBlock({blockNumber})).hash,block.hash);assert.equal(await client.getChainId(),5042)
const evidence={checkedAt:new Date().toISOString(),chainId:5042,blockNumber:String(blockNumber),blockHash:block.hash,sourceBinding:'Explorer fully verified source plus exact deployed-bytecode comparison with Arc RPC; no independent compiler reproduction',records}
writeFileSync('.codex-temp/arc-circle-source-binding.json',JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify({chainId:5042,records:records.map(({address,name,runtimeHash,sources})=>({address,name,runtimeHash,sourceFiles:sources.length}))}))
