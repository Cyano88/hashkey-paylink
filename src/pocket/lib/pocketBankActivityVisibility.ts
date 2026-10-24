/** A prepared or expired payout is not a money movement. Keep funded failures and refunds. */
export function isPocketBankActivityVisible(row:{source?:string;txHash?:string;handoffVerified?:boolean}){
 return row.source!=='bank-withdraw'||Boolean(row.txHash?.trim())||row.handoffVerified===true
}
