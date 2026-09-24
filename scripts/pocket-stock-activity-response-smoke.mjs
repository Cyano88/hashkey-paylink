import assert from 'node:assert/strict'
import {build} from 'esbuild'
const mocks={
 '@privy-io/server-auth':'export class PrivyClient{}',
 'viem':'export const isAddress=()=>true;export const getAddress=x=>x',
 'local-currency-profile.js':"export const verifiedPrivyUser=async()=>({userId:'fixture-owner'});export const localCurrencyProfileRepository={}",
 'pocketXStocksWallet.js':'export const stockAmountUnits=()=>1n',
 'xstocks-notifications-store.js':`export const hydrateStockActivity=()=>new Promise(()=>{});export const readStockNotices=async()=>({notices:{a:{id:'saved',owner:'fixture-owner',at:1},b:{id:'other',owner:'other',at:1}},requests:{},reads:{}});export const mutateStockNotices=()=>{};export const stockNoticeAsset=()=>{};export const stockNoticeClient={};export const addStockRequest=()=>{};export const decideStockRequest=()=>{}`,
}
const out=await build({stdin:{contents:"export {default} from './api/pocket/xstocks-notifications.ts'",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=mocks[a.path]?a.path:a.path.split('/').at(-1);if(mocks[key])return{path:key,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]})
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(out.outputFiles[0].text).toString('base64'))
let result;const res={setHeader(){},json(data){result=data},status(){return this}}
let timer;try{await Promise.race([handler({method:'GET',query:{activity:'1'}},res),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Activity blocked on RPC')),500)})]);assert.equal(result.ok,true);assert.deepEqual(result.notices.map(n=>n.id),['saved']);console.log('PASS: persisted owner-only activity returns even when historical RPC hydration never completes')}finally{clearTimeout(timer)}
