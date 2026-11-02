import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {spawnSync} from 'node:child_process'
import path from 'node:path'

// Only fixture pause storage is replaced. Production signing still checks
// the durable emergency control before every signature.
await mkdir('.codex-temp/usdt-send-tests',{recursive:true})
const outfile=path.resolve('.codex-temp/usdt-send-tests/case.mjs')
await build({entryPoints:['scripts/fixtures/pocket-usdt-send-case.mjs'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'isolated-pause-storage',setup(b){
 b.onResolve({filter:/render-durable-store\.js$/},args=>args.importer.endsWith('emergency-pause.ts')?{path:'pause-storage',namespace:'fixture'}:undefined)
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const hasRenderDurableStore=()=>true;export const readDurableJson=async()=>{if(process.env.FIXTURE_PAUSE_MODE==='offline')throw Error('Fixture storage offline');return {revision:0,paused:process.env.FIXTURE_PAUSE_MODE==='paused',history:[]}};export const mutateDurableJson=async()=>{throw Error('Unexpected mutation')}`,loader:'js'}))
}}]})
for(const mode of ['running','paused','offline']){
 const run=spawnSync(process.execPath,[outfile],{encoding:'utf8',timeout:60000,env:{...process.env,DATABASE_URL:'',POSTGRES_URL:'',FIXTURE_PAUSE_MODE:mode}})
 process.stdout.write(run.stdout||'');process.stderr.write(run.stderr||'')
 if(run.error||run.status!==0)throw Error('USDT '+mode+' fixture failed: '+(run.error?.message||run.status))
}
