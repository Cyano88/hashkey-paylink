import assert from 'node:assert/strict'
import {pocketStockNoticeActivity} from '../src/pocket/lib/pocketStockNoticeActivity.ts'
const owner='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64)
const symbols=['USDC','USDT','USDT0','USDe','USDG','OKB']
let pairs=0
for(const from of symbols)for(const to of symbols){if(from===to)continue
 const notice={id:'swap',hash,at:1,title:'Swap',body:'',trade:{action:'swap',input:{symbol:from,amount:'0.95'},output:{symbol:to,amount:'0.940069'},feeAmount:'0.01'}}
 const transfer={id:'raw-transfer',hash,at:1,title:'Sent',body:'',transfer:{token:'native',symbol:'OKB',amount:'1',from:owner,to:owner,direction:'out'}}
 const rows=pocketStockNoticeActivity([notice,transfer],owner)
 assert.equal(rows.length,1);assert.equal(rows[0].source,'wallet-swap');assert.equal(rows[0].settlementType,'wallet_swap');assert.equal(rows[0].assetSymbol,from);assert.equal(rows[0].amount,'0.95');assert.equal(rows[0].feeAsset,from);assert.equal(rows[0].direction,'out');assert.equal(rows[0].contextLabel,`0.95 ${from} to 0.940069 ${to}`);pairs++
}
for(const action of ['buy','sell']){const rows=pocketStockNoticeActivity([{id:action,hash,at:1,title:action,body:'',trade:{action,input:{symbol:'USDC',amount:'1'},output:{symbol:'NVDAx',amount:'0.01'}}}],owner);assert.equal(rows[0].source,'stock-'+action)}
console.log(`PASS ${pairs} X Layer swap pairs including USDG and USDe: input amount/asset, fee currency, one swap row; stock buy/sell preserved`)
