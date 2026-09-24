import assert from 'node:assert/strict'
import { build } from 'esbuild'
const built = await build({entryPoints:['src/pocket/lib/pocketBalanceCache.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'no-network',setup(b){b.onResolve({filter:/pocketReadClient$/},()=>({path:'read',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const readPocketBalances = () => {throw Error("unexpected network")}; export const readPocketLinkedWallets = readPocketBalances'}))}}]})
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)}
const {readCachedPocketBalance}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'))
const keys=['base','arbitrum','arc','solana','ethereum','polygon']
function seed(owner,count){const value={wallets:{base:{walletId:'fixture',address:'0x'+'1'.repeat(40)}},savedAt:Date.now(),displayRows:keys.slice(0,count).map(key=>({key,label:key,balance:2,known:true,status:'ok',observedAt:Date.now(),walletRevision:'a'.repeat(64)}))};store.set('pocket:balances:v1:'+encodeURIComponent(owner),JSON.stringify(value));return value}
seed('six',6);const six=readCachedPocketBalance('six');assert.equal(six.displayTotal,12);assert.equal(six.displayComplete,true);assert.equal(six.totalComplete,false);assert.equal(six.total,0);assert.ok(six.rows.every(r=>r.balance===0));assert.ok(six.displayRows.every(r=>r.stale));
seed('old',4);const old=readCachedPocketBalance('old');assert.equal(old.displayRows.length,6);assert.equal(old.displayTotal,8);assert.equal(old.displayComplete,false);assert.equal(old.displayRows[4].known,false);
assert.equal(readCachedPocketBalance('different-owner'),undefined);
const corrupt=seed('corrupt',6);corrupt.displayRows[5].key='base';store.set('pocket:balances:v1:corrupt',JSON.stringify(corrupt));assert.equal(readCachedPocketBalance('corrupt'),undefined);
console.log('PASS: six-network restoration, four-network upgrade, display-only stale amounts, owner isolation and malformed network rejection')
