import {build} from 'esbuild'
import {mkdir,cp} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'
await mkdir('.codex-temp/emergency-tests',{recursive:true})
await cp('scripts/fixtures','.codex-temp/emergency-tests/fixtures',{recursive:true})
const cases=['solana-relay-authorization-smoke','pocket-solana-cctp-relay-smoke','pocket-solana-usdt-relay-transaction-smoke']
for(const name of cases){
 const outfile=path.resolve('.codex-temp/emergency-tests/'+name+'.mjs')
 await build({entryPoints:['scripts/'+name+'.mjs'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'isolated-pause-storage',setup(b){
 b.onResolve({filter:/render-durable-store\.js$/},args=>args.importer.endsWith('emergency-pause.ts')?{path:'fixture-store',namespace:'fixture'}:undefined)
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const hasRenderDurableStore=()=>true;export const readDurableJson=async()=>({revision:0,paused:process.env.FIXTURE_PAUSED==='true',history:[]});export const mutateDurableJson=async()=>{throw Error('Unexpected mutation')}`,loader:'js'}))
 }}]})
 const run=spawnSync(process.execPath,[outfile],{encoding:'utf8',timeout:60000});process.stdout.write(run.stdout);process.stderr.write(run.stderr);if(run.status!==0)throw Error(name+' failed')
 // The existing success fixtures must fail closed when the durable control is paused.
 const paused=spawnSync(process.execPath,[outfile],{encoding:'utf8',timeout:60000,env:{...process.env,FIXTURE_PAUSED:'true'}})
 if(paused.status===0)throw Error(name+' did not stop while paused')
 if(!/paused|503/.test(paused.stderr+paused.stdout))throw Error(name+' failed for an unrelated reason: '+paused.stderr)
 console.log('PASS '+name+' running and paused integration boundaries')
}
