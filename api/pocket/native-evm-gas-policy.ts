/** Native sends/swaps use Circle Gas Station and collect the quoted native-token
 * reimbursement in the same atomic wallet batch. This is explicitly sponsored,
 * not wallet-funded gas. Production gates stay opt-in; recovery remains available
 * while disabled. Only the exact server configuration value enables new requests.
 */
export function nativeEvmExecutionEnabled(flag:string|undefined):boolean{
 return flag==='true'
}
