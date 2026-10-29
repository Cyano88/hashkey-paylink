/** Presentation only: cancellation never proves that a transaction was not sent. */
export function isPocketApprovalCancelled(reason:unknown):boolean{
 const e=reason as {code?:unknown;message?:unknown}|null
 return e?.code===4001||e?.code==='ACTION_REJECTED'||/\b(?:cancelled|canceled|user rejected|user denied|approval closed)\b/i.test(typeof reason==='string'?reason:typeof e?.message==='string'?e.message:'')
}
