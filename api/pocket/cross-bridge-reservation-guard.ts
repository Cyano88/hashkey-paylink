export const walletReservationActions = new Set(['reservation.direct-cctp','reservation.solana-cctp','wallet.native-send','wallet.native-swap','wallet.swap','wallet.bridge','wallet.usdt-bridge','wallet.xlayer-bridge','wallet.bsc-bridge','wallet.bsc-send','wallet.bsc-swap','wallet.cash-conversion'])
export type CrossBridgeReservation={id:string;ownerId:string;source:string;walletAddress:string;fingerprint:string;expiresAt:number;state:string;sourceHash?:string;challengeId?:string;transactionId?:string;userOperationHash?:string;[key:string]:unknown}
export type CrossBridgeJournal={actions?:Record<string,any>;circleKit?:Record<string,any>;crossBridge?:Record<string,CrossBridgeReservation>;[key:string]:unknown}
export const crossBridgeReservationTerminal=(s:string)=>['completed','refunded','source_failed','cancelled','not_submitted'].includes(s)
const same=(network:string,a:string,b:string)=>network==='solana'?a===b:a.toLowerCase()===b.toLowerCase()
const invalid=():never=>{throw Object.assign(Error('Bridge reservation storage needs reconciliation.'),{status:503})}
const busy=():never=>{throw Object.assign(Error('Another action from this wallet is still being confirmed.'),{status:409,code:'wallet_action_pending'})}
function active(r:CrossBridgeReservation,now:number){return !crossBridgeReservationTerminal(r.state)&&!(r.state==='prepared'&&r.expiresAt<=now&&!r.sourceHash&&!r.challengeId&&!r.transactionId&&!r.userOperationHash)}
export function assertNoCrossBridgeReservation(journal:unknown,scope:{network?:string;address?:string;ownerId?:string},now=Date.now(),except?:string,manualException?:string){
 const rows=(journal as CrossBridgeJournal|undefined)?.crossBridge??{}
 for(const [id,r] of Object.entries(rows)){
  if(!r||typeof r.source!=='string'||typeof r.walletAddress!=='string'||typeof r.state!=='string'||!Number.isFinite(r.expiresAt))invalid()
  if(id===except||id===manualException||!active(r,now))continue
  if(scope.network&&scope.network!==r.source)continue
  if(scope.address&&!same(r.source,scope.address,r.walletAddress))continue
  if(!scope.address&&scope.ownerId&&scope.ownerId!==r.ownerId)continue
  busy()
 }
}
