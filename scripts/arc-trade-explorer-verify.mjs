import assert from 'node:assert/strict'
import {readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname} from 'node:path'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {encodeAbiParameters,keccak256} from 'viem'

const sha=value=>createHash('sha256').update(value.replace(/\r\n/g,'\n')).digest('hex')
async function main(){
 const [contractsRoot,...extra]=process.argv.slice(2);assert(contractsRoot&&!extra.length,'Supply the verified Stream contracts directory.')
 const evidence=JSON.parse(await readFile(new URL('../docs/audits/arc-trade-factory-deployment-2026-10-03.json',import.meta.url),'utf8'))
 assert.equal(evidence.verified,true);assert.equal(evidence.chainId,5042)
 const artifactFile=resolve(contractsRoot,'artifacts-arc-trade/src/TradeEscrowFactory.sol/TradeEscrowFactory.json')
 const artifact=JSON.parse(await readFile(artifactFile,'utf8'))
 const debug=JSON.parse(await readFile(artifactFile.replace('.json','.dbg.json'),'utf8'))
 const build=JSON.parse(await readFile(resolve(dirname(artifactFile),debug.buildInfo),'utf8'))
 assert.equal(artifact.contractName,'TradeEscrowFactory');assert.equal(artifact.sourceName,'src/TradeEscrowFactory.sol')
 assert.equal(build.solcLongVersion,evidence.compiler.version)
 assert.deepEqual(build.input.settings,evidence.compiler.settings)
 const args=encodeAbiParameters([{type:'address'},{type:'address'}],[evidence.token,evidence.arbiter])
 assert.equal(keccak256(artifact.bytecode+args.slice(2)),evidence.calldataHash)
 const sources={}
 for(const [name,hash] of Object.entries(evidence.sourceSha256)){
  const input=build.input.sources[name];assert(input&&typeof input.content==='string');assert.equal(sha(input.content),hash)
  sources[name]=input
 }
 // Publish only the factory's recorded dependency closure, never unrelated
 // contracts or local configuration from the complete Hardhat build input.
 const standardInput={...build.input,sources}
 const base=`https://explorer.arc.io/api/v2/smart-contracts/${evidence.factory}`
 const requestFile=fileURLToPath(new URL('../.codex-temp/arc-trade-explorer-request.json',import.meta.url))
 await writeFile(requestFile,JSON.stringify({base,compiler_version:'v'+build.solcLongVersion,contract_name:artifact.contractName,constructor_args:args.slice(2),standardInput:JSON.stringify(standardInput)}))
 // Use the existing Windows HTTPS client; this explorer returns HTTP 403 to
 // Node/curl on this machine but accepts Invoke-RestMethod.
 const request=operation=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./arc-trade-explorer-request.ps1',import.meta.url)),'-RequestFile',requestFile,'-Operation',operation],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:4*1024*1024}))
 async function inspect(){return request('inspect')}
 let info=await inspect(),submitted=false
 if(!info.is_fully_verified){
  const result=request('submit')
  assert(!result?.message||!/not found|error|invalid|failed/i.test(result.message),`Explorer rejected submission: ${result?.message}`)
  submitted=true
  console.log(JSON.stringify({submitted:true,factory:evidence.factory,sourceFiles:Object.keys(sources).length}))
  for(let i=0;i<20;i++){info=await inspect();if(info.is_fully_verified)break;await new Promise(r=>setTimeout(r,2000))}
 }
 assert.equal(info.is_fully_verified,true,'Explorer verification is pending or did not produce a full match.')
 assert.equal(info.name,'TradeEscrowFactory');assert.equal(info.compiler_version.replace(/^v/,''),build.solcLongVersion)
 assert.equal(info.optimization_enabled,true);assert.equal(info.optimization_runs,200)
 assert.equal(keccak256(info.deployed_bytecode),evidence.expectedRuntimeHash)
 const published={[info.file_path]:info.source_code}
 for(const source of info.additional_sources??[])published[source.file_path]=source.source_code
 for(const [name,hash] of Object.entries(evidence.sourceSha256))assert.equal(sha(published[name]),hash,'Published source mismatch: '+name)
 const report={verified:true,fullyVerified:true,checkedAt:new Date().toISOString(),chainId:5042,factory:evidence.factory,url:`https://explorer.arc.io/address/${evidence.factory}?tab=contract`,compilerVersion:build.solcLongVersion,sourceFiles:Object.keys(sources).length,runtimeHash:evidence.expectedRuntimeHash,submitted,fundingEnabled:false,productionReady:false}
 await writeFile(new URL('../docs/audits/arc-trade-explorer-verification-2026-10-03.json',import.meta.url),JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report,null,2))
}
main().catch(error=>{console.error(error instanceof assert.AssertionError?error.message:'Explorer verification failed; release policy was not changed.');process.exitCode=1})
