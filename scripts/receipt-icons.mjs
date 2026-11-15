import {mkdirSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {receiptIconPaths} from '../src/lib/receiptIdentity.ts'
mkdirSync('output/receipt-preview/icons',{recursive:true})
for(const [kind,path] of Object.entries(receiptIconPaths)){
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24"><path d="'+path+'" fill="'+(kind==='wallet'?'#475467':'none')+'" stroke="'+(kind==='wallet'?'none':'#475467')+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
 const file='output/receipt-preview/icons/'+kind+'.svg';writeFileSync(file,svg)
 execFileSync('python',['-c','import fitz,sys; d=fitz.open(sys.argv[1]); d[0].get_pixmap(alpha=True).save(sys.argv[2])',file,'public/brand/receipt-'+kind+'.png'])
}
console.log('Rendered receipt icons from shared Pocket paths.')
