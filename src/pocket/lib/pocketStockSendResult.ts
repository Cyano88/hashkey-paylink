import type {StockPending} from './pocketStockSubmission'

// A sponsored submission can return an attempt ID before its transaction hash.
// Follow that exact attempt through recovery, never the wallet's latest transfer.
export function matchStockSendResult(result:{attemptId?:string;hash:string}|null,attempts:StockPending[],pending:StockPending|null){
  if(!result)return null
  if(result.attemptId)return attempts.find(r=>r.id===result.attemptId)||null
  if(!result.hash)return null
  return attempts.find(r=>r.hash===result.hash)||(pending?.hash===result.hash?pending:null)
}
