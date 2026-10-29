import assert from 'node:assert/strict'
import {build} from 'esbuild'
import React from 'react'
import {act,create} from 'react-test-renderer'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
const mocks={PocketAssetFiatValue:`export default()=>null`,usePocketStockQuotes:`export default()=>({quotes:{},busy:false})`,
 'react-router-dom':`export const useSearchParams=()=>[new URLSearchParams('amount=1&recipient=0x2222222222222222222222222222222222222222')]`,
 PocketFundingAction:`export default ({children})=>children`,pocketFundingShortfall:`export const fundingShortfall=()=>null,amountExceedsBalance=()=>false`,
 PocketTransactionSheet:`export default props=> <div data-state={props.state} data-receipt={props.receipt?.txHash||''}/>`,
 PocketBottomSheet:`export default ({children})=>children`,PocketSlideAction:`export default ({onConfirm,status})=><button data-progress={status} onClick={onConfirm}>Confirm send</button>`,
 PocketArcTokenPicker:`export default props=><div data-picker={props.tokens.map(t=>t.symbol).join(',')}/>`,PocketConfirmationDetails:`export default ()=>null`,PocketIcons:`export const Copy=()=>null`,
 usePocketIdentity:`export default ()=>({getAccessToken:async()=>null})`,stockNotificationsRequest:`export const stockNotificationsRequest=async()=>({})`,
 pocketReceipt:`export const pocketActivityReceipt=row=>row`,pocketStockPickerTokens:`export const stockPickerTokens=()=>[{address:'0x1111111111111111111111111111111111111111',balance:'2',symbol:'USDC',decimals:6},{address:'native',symbol:'OKB',balance:'1',decimals:18},{address:'0x4444444444444444444444444444444444444444',symbol:'ZEROx',balance:'0',decimals:18},{address:'0x5555555555555555555555555555555555555555',symbol:'HELDx',balance:'0.01',decimals:18}]`,
 pocketStockDisplay:`export const formatStockQuantity=x=>x`,
 pocketXStocksWallet:`export const stockUsde={address:'usde',symbol:'USDe'},stockUsdg={address:'usdg',symbol:'USDG'};export const stockGasPriceAddress='0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';export const stockUsdc={address:'0x1111111111111111111111111111111111111111',symbol:'USDC'},stockUsdt={address:'0x3333333333333333333333333333333333333333',symbol:'USDT'},stockGasAsset={address:'native',symbol:'OKB'},stockAssets=[{address:'0x4444444444444444444444444444444444444444',symbol:'ZEROx'},{address:'0x5555555555555555555555555555555555555555',symbol:'HELDx'}],stockQuantity=x=>String(x),prepareStockTransfer=async()=>({amount:'1',asset:stockUsdc,recipient:'0x2222222222222222222222222222222222222222',sponsored:true})`,
 pocketXLayerSponsorship:`export const xLayerTransferSponsorshipEnabled=true,stockTransferGasLabel=()=> 'Covered by Pocket'`,
}
const out=resolve('.codex-temp/stock-send-sheet-fixture.mjs')
await build({entryPoints:['src/pocket/components/PocketStockWalletActions.tsx'],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path==='react-router-dom'?a.path:a.path.split('/').pop();return mocks[key]?{path:key,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:process.cwd()}))}}]})
const {default:Sheet}=await import(pathToFileURL(out).href)
let wallet={address:'0x1111111111111111111111111111111111111111',attempts:[],pending:null,displaySnapshot:{},prepareTransfer:async(asset,recipient,amount)=>({asset,recipient,amount,expiresAt:Date.now()+45000,sponsored:false}),send:async()=>{throw Object.assign(Error('accepted before hash'),{transactionPending:true,attemptId:'current'})}}
let tree;await act(async()=>{tree=create(React.createElement(Sheet,{wallet,view:'send'}))})
const click=async text=>act(async()=>{const b=tree.root.findAllByType('button').find(b=>b.props.children===text);assert.ok(b,text);await b.props.onClick()})
await click('Review send');await click('Confirm send')
assert.equal(tree.root.findAllByProps({'data-state':'pending'}).length,0)
assert.equal(tree.root.findByProps({'data-progress':'pending'}).props['data-progress'],'pending')
const hash='0x'+'a'.repeat(64)
wallet={...wallet,attempts:[{id:'current',key:'owner',hash,status:'confirmed',kind:'send'}]}
await act(async()=>tree.update(React.createElement(Sheet,{wallet,view:'send'})))
assert.equal(tree.root.findByProps({'data-state':'successful'}).props['data-receipt'],hash)
await act(async()=>tree.unmount())
for (const scenario of ['cancelled-before-submit','cancelled-unknown','cancelled-after-submit']) {
 const send=async(review,hooks)=>{
  if(scenario==='cancelled-after-submit')hooks.onSubmitted(hash);
  throw Object.assign(Error('Payment approval was cancelled.'),scenario==='cancelled-before-submit'?{pocketApprovalNotSubmitted:true}:{transactionPending:true,attemptId:'uncertain'});
 };
 await act(async()=>{tree=create(React.createElement(Sheet,{wallet:{...wallet,attempts:[],send},view:'send'}))});
 await click('Review send');await click('Confirm send');
 assert.equal(tree.root.findAllByProps({'data-state':'failed'}).length,0);
 assert.equal(tree.root.findByProps({'data-progress':scenario==='cancelled-before-submit'?'idle':'pending'}).props['data-progress'],scenario==='cancelled-before-submit'?'idle':'pending');
 await act(async()=>tree.unmount());
}
console.log('PASS cancellation: proven pre-submit returns to review; unknown and submitted remain pending.');

