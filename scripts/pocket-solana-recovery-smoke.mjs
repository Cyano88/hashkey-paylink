import assert from 'node:assert/strict'
import { build } from 'esbuild'
const result=await build({entryPoints:['src/pocket/lib/pocketSolanaBridge.ts'],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'stubs',setup(b){b.onResolve({filter:/circleSolanaEmailWallet|pocketSchemas/},args=>({path:args.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:args.path.includes('circleSolanaEmailWallet')?'export const signCircleSolanaTransaction = async()=>"signed-fixture"':'export const POCKET_API={solanaCctpPrepare:"/prepare",solanaCctpSubmit:"/submit"}',loader:'js'}))}}]})
const module={exports:{}}
new Function('module','exports',result.outputFiles[0].text)(module,module.exports)
const original=globalThis.fetch
try {
 const calls=[]
 globalThis.fetch=async url=>{calls.push(url);return new Response(JSON.stringify(url==='/prepare'?{ok:true,transaction:'fixture',lastValidBlockHeight:123}:{ok:true,txHash:'fixture-hash'}))}
 const input={session:{},destination:'arc',destinationAddress:'fixture-address',amount:'1',accessToken:'fixture'}
 await assert.rejects(()=>module.exports.bridgeCircleSolanaWallet({...input,onBeforeSubmit:()=>{throw Error('storage unavailable')}}),/storage unavailable/)
 assert.deepEqual(calls,['/prepare'],'must not broadcast if recovery persistence fails')
 calls.length=0
 let persisted=false
 const hash=await module.exports.bridgeCircleSolanaWallet({...input,onBeforeSubmit:()=>{assert.deepEqual(calls,['/prepare']);persisted=true}})
 assert.equal(persisted,true)
 assert.equal(hash,'fixture-hash')
 assert.deepEqual(calls,['/prepare','/submit'])
 console.log('Pocket Solana recovery-before-submit tests passed.')
} finally {globalThis.fetch=original}
