import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

for (const enabled of [false, true]) {
  const outfile = resolve('.codex-temp/sponsorship-' + enabled + '.mjs')
  await build({entryPoints:['src/pocket/lib/pocketXStocksWallet.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':JSON.stringify({VITE_XLAYER_TRANSFER_SPONSORSHIP:String(enabled)})}})
  const { stockClient: client, prepareStockTransfer: prepare, stockUsdc, stockGasAsset } = await import(pathToFileURL(outfile).href)
  let tokenBalance=1_000_000n, nativeBalance=0n, simulated=true, estimates=0
  Object.assign(client, {
    getChainId:async()=>196,
    readContract:async({functionName})=>functionName==='decimals'?6:tokenBalance,
    simulateContract:async()=>({result:simulated}),
    getBalance:async()=>nativeBalance,
    estimateGas:async()=>{estimates++;return 21000n},
    getGasPrice:async()=>1n,
  })
  const owner='0x1111111111111111111111111111111111111111'
  const recipient='0x2222222222222222222222222222222222222222'
  if(enabled){
    const r=await prepare(owner,stockUsdc,recipient,'1')
    assert.equal(r.sponsored,true);assert.equal(r.fee,0n);assert.equal(estimates,0)
    assert.equal(r.units,1_000_000n);assert.equal(r.recipient,recipient)
  }else await assert.rejects(prepare(owner,stockUsdc,recipient,'1'),/Add OKB/)
  tokenBalance=0n
  await assert.rejects(prepare(owner,stockUsdc,recipient,'1'),/Insufficient/)
  tokenBalance=1_000_000n;simulated=false
  await assert.rejects(prepare(owner,stockUsdc,recipient,'1'),/did not accept/)
  simulated=true
  await assert.rejects(prepare(owner,stockUsdc,owner,'1'),/other than your own/)
  await assert.rejects(prepare(owner,{...stockUsdc,address:recipient},recipient,'1'),/Unsupported/)
  nativeBalance=1_000_000_000_000_000_000n
  const native=await prepare(owner,stockGasAsset,recipient,'0.1')
  assert.equal(native.sponsored,undefined);assert.ok(native.fee>0n)
  client.getChainId=async()=>1
  await assert.rejects(prepare(owner,stockUsdc,recipient,'1'),/could not be verified/)
}
console.log('PASS: sponsored zero-OKB token preparation; disabled and native gas checks; amount, simulation, recipient, token and chain validation retained.')
