/** A prepared or expired payout is not a money movement. Keep funded failures and refunds. */
export function isPocketBankActivityVisible(row:{source?:string;txHash?:string;handoffVerified?:boolean}){
 return row.source!=='bank-withdraw'||/^0x[0-9a-f]{64}$/i.test(row.txHash||'')||row.handoffVerified===true
}
