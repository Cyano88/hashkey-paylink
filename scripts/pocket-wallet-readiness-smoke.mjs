import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const stubs = {
  pocketBalanceCache: 'export const balanceOwner=x=>x; export const readCachedPocketBalance=()=>null; export const replacePocketBalanceWallets=async()=>{}',
  authMode: 'export const PRIVY_AUTH_ENABLED = true',
  circleEvmEmailWallet: 'export const canUseCircleEvmEmailWallet=()=>true; export const connectCircleEvmEmailWallet=()=>{}; export const resumeCircleAdditionalEvmWallet=()=>{}; export const resumeCircleArcMainnetWallet=()=>{}; export const resumeCircleProductionEvmWallet=()=>{}; export const restoreActivatedCircleEvmSession=()=>{}',
  circleSolanaEmailWallet: 'export const canUseCircleSolanaEmailWallet=()=>true; export const connectCircleSolanaEmailWallet=()=>{}; export const resumeCircleSolanaEmailWallet=()=>{}',
  chains: 'export const CHAIN_META={base:{label:"Base"},arbitrum:{label:"Arbitrum"},arc:{label:"Arc"}}',
  pocketWalletLinkClient: 'export const linkPocketWallet=()=>{}; export const readPocketWallet=()=>{}; export const readPocketWallets=()=>{}',
  pocketSecureWalletSession: 'export const readPocketSecureWalletSession=async()=>globalThis.fixtureSession??null; export const savePocketSecureWalletSession=async()=>{}; export const deletePocketSecureWalletSession=async()=>{}; export const secureSessionForNetwork=()=>null; export class PocketWalletSessionRecoveryRequiredError extends Error {}',
  pocketQuickApproval: 'export const pocketQuickApprovalCredentialSaved=async()=>false; export const readPocketEvmQuickSession=async()=>null',
}
const output = await build({ entryPoints: ['src/pocket/controllers/usePocketWalletController.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react'], plugins: [{name:'wallet-dependencies',setup(b){b.onResolve({filter:/.*/}, args=>{const name=args.path.split('/').pop();if(name in stubs)return {path:name,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'js'}))}}] })
const module = { exports: {} }
new Function('require','module','exports',output.outputFiles[0].text)(require,module,module.exports)
const { ensurePocketWallet } = module.exports
for (const network of ['base','solana']) {
 const wallet={id:'wallet-1',address:'test-wallet',blockchain:network==='base'?'BASE':'SOL'}
 let connections=0
 let rejectLink=true
 const dependencies={privyEnabled:true,canUseEvm:()=>true,canUseSolana:()=>true,readWallet:async()=>null,connectEvm:async()=>{connections++;return {wallet,chain:network,userToken:'fixture'}},connectSolana:async()=>{connections++;return {wallet,userToken:'fixture'}},linkWallet:async()=>{if(rejectLink)throw Error('link service unavailable');return {link:{updatedAt:123}}}}
 const input={network,authenticated:true,email:'fixture@example.com',getAccessToken:async()=>'fixture-access'}
 await assert.rejects(()=>ensurePocketWallet(input,dependencies),/link service unavailable/)
 rejectLink=false
 const ready=await ensurePocketWallet(input,dependencies)
 assert.equal(ready.walletId,'wallet-1')
 assert.equal(ready.updatedAt,123)
 assert.equal(connections,2)
}
globalThis.fixtureSession={chain:'base',userToken:'fixture',wallet:{id:'base',address:'0xbase',blockchain:'BASE'},arcMainnetWallet:{id:'arc',address:'0xarc',blockchain:'ARC'}}
await module.exports.restorePocketWalletSession('restore@fixture.invalid')
assert.equal(module.exports.activePocketEvmSession('restore@fixture.invalid','arc','0xarc')?.wallet.id,'arc')
assert.equal(module.exports.activePocketEvmSession('other@fixture.invalid','arc','0xarc'),null)
assert.equal(module.exports.activePocketEvmSession('restore@fixture.invalid','arc','0xwrong'),null)
delete globalThis.fixtureSession
console.log('PASS wallet readiness and restored Arc session: correct owner/address, no interactive approval required.')
