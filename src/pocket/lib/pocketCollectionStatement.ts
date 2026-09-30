import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketStatementCsv, downloadPocketStatement, type StatementOptions } from './pocketStatement'
export type CollectionRecord = {eventId:string; title:string; kind:'bank'|'usdc'; paymentUrl:string; createdAt:number; updatedAt:number; deletedAt?:number}
export function collectionPayments(collection:CollectionRecord,rows:PocketActivityRow[]) {return rows.filter(row=>collection.kind==='bank'?row.merchantId===collection.eventId||row.eventId==='ngpos-'+collection.eventId:row.eventId===collection.eventId).sort((a,b)=>b.ts-a.ts)}
const options=(collection:CollectionRecord,period:StatementOptions={})=>({...period,title:'Collection statement',scope:collection.title+' / '+collection.eventId,includeBusiness:true})
export function collectionStatementCsv(collection:CollectionRecord,rows:PocketActivityRow[],period:StatementOptions={}) {return pocketStatementCsv(collectionPayments(collection,rows),options(collection,period))}
export async function downloadCollectionStatement(collection:CollectionRecord,rows:PocketActivityRow[],format:'csv'|'pdf',period:StatementOptions={}) {await downloadPocketStatement(collectionPayments(collection,rows),format,options(collection,period))}
