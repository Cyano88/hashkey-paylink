import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const {assets}=JSON.parse(readFileSync('src/pocket/lib/pocketXStocksCatalog.json','utf8'))
const tracked=new Set(execFileSync('git',['ls-files','--','public/pocket-stocks'],{encoding:'utf8'}).trim().split(/\r?\n/))
for(const asset of assets){
 const file='public'+asset.icon
 assert.ok(/^\/pocket-stocks\/0x[0-9a-f]{40}\.(png|svg)$/.test(asset.icon),asset.symbol)
 assert.ok(tracked.has(file),'Logo missing from release: '+asset.symbol)
 const bytes=readFileSync(file)
 if(file.endsWith('.png'))assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a',asset.symbol)
 else {assert.ok(bytes.toString().startsWith('<svg'),asset.symbol);assert.ok(!/<script|<foreignObject|\bonload\s*=|\bonerror\s*=/i.test(bytes.toString()),asset.symbol)}
}
console.log(`PASS ${assets.length} contract-addressed issuer logos have valid image formats and are tracked for deployment.`)
